// LLM customizado que a Agora chama (contrato OpenAI Chat Completions com SSE):
// https://docs.agora.io/en/ai/build/custom-model-integration/custom-llm
// Por dentro usa o AI SDK (streamText) com a feita.ai. A tool criar_tarefa
// roda aqui, em vários passos; a Agora só recebe o texto em streaming.
import { isStepCount, streamText, tool } from "ai";
import { NextRequest } from "next/server";
import { z } from "zod";
import { compra, iniciarLigacoes } from "@/lib/compra";
import { comReserva, feita, feitaModelId, feitaModeloReserva, feitaReasoning } from "@/lib/feita";
import { FALHA, sanear, SEM_FALA, type MensagemOpenAI } from "@/lib/historico";
import {
  aplicarCriarTarefa,
  criarTarefaSchema,
  estadoParaPrompt,
  estado,
  PROMPT_PRODUTOR,
  proximaPergunta,
  registrarConversa,
} from "@/lib/tarefa";

// O AI SDK 7 quer o prompt de sistema em `instructions`, fora de `messages`.
// O histórico vem saneado (lib/historico.ts): sem vazias e com as seguidas do mesmo papel juntas.
function paraAiSdk(messages: MensagemOpenAI[]) {
  const { sistema, conversa, semFala, ajustes } = sanear(messages);
  // Prompt da Agora + regras do pedido + estado da tarefa (o modelo não vê as tool calls antigas).
  sistema.push(PROMPT_PRODUTOR, estadoParaPrompt());
  return { instructions: sistema.join("\n\n"), messages: conversa, semFala, ajustes };
}

const criarTarefa = tool({
  description:
    "Anota ou atualiza o pedido de compra do produtor. Mande só os campos que ele disse agora. O sistema diz o que falta ou devolve a confirmação pronta.",
  inputSchema: criarTarefaSchema,
  execute: async (entrada) => aplicarCriarTarefa(entrada),
});

// Tarefa completa e o produtor disse "pode": o código começa a compra e fala a resposta.
const ligarFornecedores = tool({
  description: 'Começa as ligações para os fornecedores. Chame quando a tarefa está completa e o produtor concordou ("pode", "isso", "pode ligar").',
  inputSchema: z.object({}),
  execute: async () => {
    const r = iniciarLigacoes();
    return r.ok
      ? { ok: true, fala: "Beleza! Vou ligar pros fornecedores e já volto com a melhor proposta." }
      : { ok: false, fala: "Já estou cuidando das ligações. Assim que tiver as propostas eu volto." };
  },
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

  const { semFala, ajustes, ...entrada } = paraAiSdk(body.messages ?? []);
  registrarConversa(
    entrada.messages.map((m) => ({ quem: m.role === "user" ? "produtor" : "agente", texto: String(m.content) })),
  );
  const passos: string[] = [];
  const forcarTool = !estado().completa;
  // Depois de a compra começar, o pedido não muda mais: só conversa.
  const emCompra = compra().estado !== "CRIADA";
  if (emCompra) entrada.instructions += `\n\nAs ligações já começaram (${compra().estado}). Diga em uma frase que está ligando pros fornecedores e volta com a melhor proposta.`;
  const criar = (m: string, reserva = false) => streamText({
    model: feita.chatModel(m),
    ...entrada,
    tools: forcarTool ? { criar_tarefa: criarTarefa } : emCompra ? {} : { criar_tarefa: criarTarefa, ligar_fornecedores: ligarFornecedores },
    // O código decide, não o modelo: enquanto a tarefa estiver incompleta, o modelo é
    // obrigado a chamar criar_tarefa (sem isso o Nemotron pulava a tool e inventava o
    // produto). Um passo só: quem fala depois da tool é o código (resultado.fala), sem
    // a segunda chamada ao LLM. Economiza ~0,5–0,7 s por turno com tool.
    // Na 2ª tentativa (outro modelo), sem "required": com ele o Nemotron levou ~20 s. Se ele não chamar a
    // tool, quem fala é o código (proximaPergunta).
    toolChoice: forcarTool && !reserva ? "required" : "auto",
    stopWhen: isStepCount(1),
    maxOutputTokens: body.max_tokens ?? 300,
    abortSignal: req.signal,
    providerOptions: { feita: { reasoning: feitaReasoning(m) } } as never,
    onError: ({ error }) => console.error("[llm] erro", m, error instanceof Error ? error.message : error),
  });
  // Se o gateway der erro, uma 2ª tentativa com outro modelo (lib/feita.ts).
  const partes = (falou: () => boolean) =>
    comReserva(() => criar(modelo).fullStream, () => criar(feitaModeloReserva(), true).fullStream, "llm", {
      signal: req.signal,
      falou,
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
      let falaTool = "";
      const falar = (texto: string) => {
        if (!primeiro) primeiro = performance.now();
        resposta += texto;
        controller.enqueue(chunk({ content: texto }, null));
      };
      try {
        controller.enqueue(chunk({ role: "assistant" }, null));
        // O usuário não disse nada que deu para usar (ex.: logo depois de uma interrupção): pede para repetir.
        for await (const part of semFala ? [] : partes(() => !!resposta)) {
          const ms = Math.round(performance.now() - t0);
          if (part.type === "finish-step") passos.push(`fim_passo@${ms}`);
          if (part.type === "tool-call") passos.push(`tool@${ms} ${JSON.stringify(part.input)}`);
          if (part.type === "error") console.error("[llm] erro no stream", part.error);
          if (part.type === "tool-result") {
            passos.push(`resultado ${JSON.stringify(part.output)}`);
            falaTool = (part.output as { fala?: string }).fala ?? falaTool;
          }
          // Com a tool obrigatória, texto do modelo seria narração: não vai para a voz.
          if (part.type !== "text-delta" || !part.text || forcarTool) continue;
          falar(part.text);
        }
        if (semFala) falar(SEM_FALA);
        else if (falaTool) falar(resposta ? ` ${falaTool}` : falaTool);
        else if (forcarTool) falar(proximaPergunta());
        else if (!resposta) falar(FALHA); // as duas tentativas falharam
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
          `[llm] turno=${turno} modelo=${modelo} ttft_ms=${ttft} total_ms=${Math.round(performance.now() - t0)} resposta=${JSON.stringify(resposta)} passos=${JSON.stringify(passos)}${ajustes.length ? ` historico=${JSON.stringify(ajustes)}` : ""}`,
        );
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}
