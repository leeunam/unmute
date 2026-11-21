// LLM customizado que a Agora chama (contrato OpenAI Chat Completions com SSE):
// https://docs.agora.io/en/ai/build/custom-model-integration/custom-llm
// Por dentro usa o AI SDK (streamText) com a feita.ai. Aqui entram tools,
// estado e logs nas próximas fases.
import { streamText, type ModelMessage } from "ai";
import { NextRequest } from "next/server";
import { feita, feitaModelId } from "@/lib/feita";

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
  return { instructions: sistema.join("\n\n") || undefined, messages: conversa };
}

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

  const result = streamText({
    model: feita.chatModel(modelo),
    ...paraAiSdk(body.messages ?? []),
    maxOutputTokens: body.max_tokens ?? 300,
    abortSignal: req.signal,
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
        for await (const delta of result.textStream) {
          if (!primeiro) primeiro = performance.now();
          resposta += delta;
          controller.enqueue(chunk({ content: delta }, null));
        }
        controller.enqueue(chunk({}, "stop"));
        controller.enqueue(enc.encode("data: [DONE]\n\n"));
      } catch (err) {
        console.error("[llm] stream", err);
      } finally {
        controller.close();
        const ttft = primeiro ? Math.round(primeiro - t0) : -1;
        console.log(
          `[llm] turno=${turno} modelo=${modelo} ttft_ms=${ttft} total_ms=${Math.round(performance.now() - t0)} resposta=${JSON.stringify(resposta)}`,
        );
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}
