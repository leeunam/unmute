// LLM customizado que a Agora chama (contrato OpenAI Chat Completions com SSE):
// https://docs.agora.io/en/ai/build/custom-model-integration/custom-llm
// Por dentro usa o AI SDK (streamText) com a feita.ai. A tool criar_tarefa
// roda aqui, em vários passos; a Agora só recebe o texto em streaming.
import { isStepCount, streamText, tool, type ModelMessage } from "ai";
import { NextRequest } from "next/server";
import { feita, feitaModelId, feitaReasoning } from "@/lib/feita";
import {
  aplicarCriarTarefa,
  criarTarefaSchema,
  estadoParaPrompt,
  estado,
  PROMPT_PRODUTOR,
  registrarConversa,
} from "@/lib/tarefa";

type OpenAIMessage = { role: string; content: unknown };

function texto(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((p) => (typeof p === "string" ? p : p && typeof p === "object" && "text" in p ? String(p.text) : ""))
      .join("");
  }
  return "";
}

// O AI SDK 7 quer o prompt de sistema em `instructions`, fora de `messages`.
function paraAiSdk(messages: OpenAIMessage[]) {
  const sistema: string[] = [];
  const conversa: ModelMessage[] = [];
  for (const m of messages) {
    const content = texto(m.content);
    if (!content) continue;
    if (m.role === "system") sistema.push(content);
    else if (m.role === "user" || m.role === "assistant") conversa.push({ role: m.role, content });
  }
  // Prompt da Agora + regras do pedido + estado da tarefa (o modelo não vê as tool calls antigas).
  sistema.push(PROMPT_PRODUTOR, estadoParaPrompt());
  return { instructions: sistema.join("\n\n"), messages: conversa };
}

const criarTarefa = tool({
  description:
    "Anota ou atualiza o pedido de compra do produtor. Mande só os campos que ele disse agora. O sistema diz o que falta ou devolve a confirmação pronta.",
  inputSchema: criarTarefaSchema,
  execute: async (entrada) => aplicarCriarTarefa(entrada),
});

export async function POST(req: NextRequest) {
  const t0 = performance.now();
  const segredo = process.env.LLM_PROXY_SECRET;
  if (segredo && req.headers.get("authorization") !== `Bearer ${segredo}`) {
    return new Response("não autorizado", { status: 401 });
  }

  const body = await req.json();
  const modelo: string = body.model ?? feitaModelId();
  const id = `chatcmpl-${Date.now()}`;
  const created = Math.floor(Date.now() / 1000);
  const turno = body.turn_id ?? "?";

  const entrada = paraAiSdk(body.messages ?? []);
  registrarConversa(
    entrada.messages.map((m) => ({ quem: m.role === "user" ? "produtor" : "agente", texto: String(m.content) })),
  );
  const passos: string[] = [];
  const result = streamText({
    model: feita.chatModel(modelo),
    ...entrada,
    tools: { criar_tarefa: criarTarefa },
    // O código decide, não o modelo: enquanto a tarefa estiver incompleta, o 1º passo
    // é obrigado a chamar criar_tarefa (sem isso o Nemotron pulava a tool e inventava
    // o produto quando a fala vinha cortada em dois turnos). O 2º passo só fala.
    prepareStep: ({ stepNumber }) =>
      stepNumber === 0 ? (estado().completa ? {} : { toolChoice: "required" }) : { toolChoice: "none" },
    stopWhen: isStepCount(2),
    maxOutputTokens: body.max_tokens ?? 300,
    abortSignal: req.signal,
    providerOptions: { feita: { reasoning: feitaReasoning(modelo) } } as never,
    onError: ({ error }) => console.error("[llm] erro", error),
  });

  const enc = new TextEncoder();
  const chunk = (delta: Record<string, string>, finish: string | null) =>
    enc.encode(
      `data: ${JSON.stringify({
        id,
        object: "chat.completion.chunk",
        created,
        model: modelo,
        choices: [{ index: 0, delta, finish_reason: finish }],
      })}\n\n`,
    );

  const stream = new ReadableStream({
    async start(controller) {
      let primeiro = 0;
      let resposta = "";
      try {
        controller.enqueue(chunk({ role: "assistant" }, null));
        for await (const part of result.fullStream) {
          const ms = Math.round(performance.now() - t0);
          if (part.type === "finish-step") passos.push(`fim_passo@${ms}`);
          if (part.type === "tool-call") passos.push(`tool@${ms} ${JSON.stringify(part.input)}`);
          if (part.type === "tool-result") passos.push(`resultado ${JSON.stringify(part.output)}`);
          if (part.type === "error") console.error("[llm] erro no stream", part.error);
          if (part.type !== "text-delta" || !part.text) continue;
          if (!primeiro) primeiro = performance.now();
          resposta += part.text;
          controller.enqueue(chunk({ content: part.text }, null));
        }
        registrarConversa([
          ...entrada.messages.map((m) => ({
            quem: m.role === "user" ? ("produtor" as const) : ("agente" as const),
            texto: String(m.content),
          })),
          { quem: "agente", texto: resposta },
        ]);
        controller.enqueue(chunk({}, "stop"));
        controller.enqueue(enc.encode("data: [DONE]\n\n"));
      } catch (err) {
        console.error("[llm] stream", err);
      } finally {
        controller.close();
        const ttft = primeiro ? Math.round(primeiro - t0) : -1;
        console.log(
          `[llm] turno=${turno} modelo=${modelo} ttft_ms=${ttft} total_ms=${Math.round(performance.now() - t0)} resposta=${JSON.stringify(resposta)} passos=${JSON.stringify(passos)}`,
        );
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}
