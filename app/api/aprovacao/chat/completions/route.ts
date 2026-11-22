// LLM do agente que volta ao produtor com as ofertas (mesmo contrato OpenAI com SSE das outras rotas).
// A recomendação já foi falada pela Agora como saudação, montada por lib/compra.ts. Aqui o produtor
// decide: aprovar_oferta(oferta_id) ou cancelar_tarefa(). Quem valida é o código, e quem fala o
// resultado da tool também (sem 2ª chamada ao LLM).
//
// Regra 3 (nunca fecha sem aprovação explícita): além do modelo, o código exige uma palavra de
// aprovação na última fala do produtor para aprovar_oferta passar.
import { isStepCount, streamText, tool, type ModelMessage } from "ai";
import { NextRequest } from "next/server";
import { z } from "zod";
import { aprovarOferta, cancelarTarefa, compra, contextoAprovacao, fornecedorNomeado } from "@/lib/compra";
import { feita, feitaModelId, feitaReasoning } from "@/lib/feita";

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

const PROMPT_APROVACAO = `Você é o assistente de inteligência artificial do Desenrola Agro. Você ligou para dois fornecedores em nome do produtor e acabou de dizer a ele qual oferta recomenda. Agora ele decide.
Como falar: português do Brasil, jeito simples do interior, frases curtas, sem listas nem símbolos. Valores por extenso.
Regras:
- Se ele aprovar ("fecha", "pode fechar", "sim", "fecha com o A"), chame aprovar_oferta com o oferta_id que ele escolheu (sem dizer qual, é a recomendada). Não escreva nada: o sistema fala a resposta.
- Se ele desistir ("cancela", "deixa pra lá", "não quero nenhuma"), chame cancelar_tarefa. Não escreva nada.
- Se ele quiser pensar ou não decidiu, NÃO chame ferramenta: diga que tudo bem, que é só falar "fecha" quando decidir.
- Se ele perguntar algo das ofertas (frete, pagamento, prazo), responda só com os dados abaixo, em uma ou duas frases, e pergunte de novo se fecha.
- Nunca invente dado. Nunca diga que fechou sem a ferramenta.`;

const APROVA = /\b(fech|pode|sim|aprov|isso|manda|beleza|bora|ok|quero|confirm|vamos|t[aá] bom|positivo|claro)/i;
const CANCELA = /\b(cancel|desist|deixa pra l[aá]|esquece|n[aã]o quero|nenhum|n[aã]o vou comprar)/i;

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

  const messages: ModelMessage[] = [];
  for (const m of (body.messages ?? []) as OpenAIMessage[]) {
    const content = texto(m.content);
    if (content && (m.role === "user" || m.role === "assistant")) messages.push({ role: m.role, content });
  }
  const ultima = messages.at(-1)?.role === "user" ? String(messages.at(-1)!.content) : "";
  const decidindo = compra().estado === "AGUARDANDO_APROVACAO" || compra().estado === "OFERTAS_COLETADAS";

  const tools = {
    aprovar_oferta: tool({
      description: 'Fecha a compra com a oferta que o produtor aprovou. oferta_id é "a" ou "b".',
      inputSchema: z.object({ oferta_id: z.string().describe('"a" ou "b"') }),
      execute: async ({ oferta_id }) => {
        if (!APROVA.test(ultima)) {
          const rec = compra().comparacao?.recomendada;
          return { ok: false, erro: "Sem aprovação explícita.", fala: `Só fecho se o senhor mandar.${rec ? ` Fecho com o ${rec.toUpperCase()}?` : ""}` };
        }
        // Gemini já trocou "fecha com o B" por aprovar_oferta("a") (TESTES.md, seção 14).
        return aprovarOferta(fornecedorNomeado(ultima) ?? oferta_id);
      },
    }),
    cancelar_tarefa: tool({
      description: "Cancela a compra sem fechar com ninguém.",
      inputSchema: z.object({}),
      // Cancelar também só com pedido explícito: "deixa eu pensar" não cancela.
      execute: async () =>
        CANCELA.test(ultima)
          ? cancelarTarefa()
          : { ok: false, erro: "Sem pedido explícito de cancelar.", fala: 'Tudo bem, sem pressa. Quando decidir, é só falar "fecha".' },
    }),
  };

  const passos: string[] = [];
  const result = streamText({
    model: feita.chatModel(modelo),
    instructions: `${PROMPT_APROVACAO}\n\n${contextoAprovacao()}`,
    messages,
    tools: decidindo ? tools : {},
    toolChoice: "auto",
    stopWhen: isStepCount(1),
    maxOutputTokens: body.max_tokens ?? 300,
    abortSignal: req.signal,
    providerOptions: { feita: { reasoning: feitaReasoning(modelo) } } as never,
    onError: ({ error }) => console.error("[aprovacao] erro", error),
  });

  const enc = new TextEncoder();
  const chunk = (delta: Record<string, string>, finish: string | null) =>
    enc.encode(
      `data: ${JSON.stringify({ id, object: "chat.completion.chunk", created, model: modelo, choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`,
    );

  const stream = new ReadableStream({
    async start(controller) {
      let primeiro = 0;
      let resposta = "";
      let falaTool = "";
      let usouTool = false;
      const falar = (t: string) => {
        if (!t) return;
        if (!primeiro) primeiro = performance.now();
        resposta += t;
        controller.enqueue(chunk({ content: t }, null));
      };
      try {
        controller.enqueue(chunk({ role: "assistant" }, null));
        for await (const part of result.fullStream) {
          const ms = Math.round(performance.now() - t0);
          if (part.type === "tool-call") {
            usouTool = true;
            passos.push(`tool@${ms} ${part.toolName} ${JSON.stringify(part.input)}`);
          }
          if (part.type === "tool-result") {
            passos.push(`resultado ${JSON.stringify(part.output)}`);
            falaTool = (part.output as { fala?: string }).fala ?? falaTool;
          }
          if (part.type === "error") console.error("[aprovacao] erro no stream", part.error);
          // Com tool, o texto do modelo seria narração ("vou fechar…"): quem fala é o código.
          if (part.type !== "text-delta" || !part.text || usouTool) continue;
          falar(part.text);
        }
        if (falaTool) falar(resposta ? ` ${falaTool}` : falaTool);
        else if (!resposta) {
          const c = compra();
          falar(
            c.estado === "FECHADA"
              ? `A compra já está fechada com o ${c.fechada_com?.toUpperCase()}.`
              : c.estado === "CANCELADA"
                ? "A compra foi cancelada."
                : (c.frase ?? "Pode repetir, por favor?"),
          );
        }
        controller.enqueue(chunk({}, "stop"));
        controller.enqueue(enc.encode("data: [DONE]\n\n"));
      } catch (err) {
        console.error("[aprovacao] stream", err);
      } finally {
        controller.close();
        const ttft = primeiro ? Math.round(primeiro - t0) : -1;
        console.log(
          `[aprovacao] turno=${turno} modelo=${modelo} estado=${compra().estado} ttft_ms=${ttft} total_ms=${Math.round(performance.now() - t0)} resposta=${JSON.stringify(resposta)} passos=${JSON.stringify(passos)}`,
        );
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}
