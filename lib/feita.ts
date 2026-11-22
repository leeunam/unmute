// LLM pelo gateway da feita.ai (compatível com OpenAI e Anthropic).
// Descoberto no próprio app: feita.ai/ai-gateway, base https://api.feita.ai/gateway/v1.
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export const FEITA_GATEWAY = "https://api.feita.ai/gateway/v1";

export function feitaModelId() {
  // Fase 2 (TESTES.md, seção 9): com a tool criar_tarefa, o Gemini Flash Lite acerta a
  // tarefa em todas as rodadas. O Nemotron é mais rápido, mas pula a tool, inventa o
  // produto e ignora tool_choice "required" no gateway da feita.
  return process.env.FEITA_MODEL || "google/gemini-3.5-flash-lite";
}

export const feita = createOpenAICompatible({
  name: "feita",
  baseURL: FEITA_GATEWAY,
  apiKey: process.env.FEITA_API_KEY,
});

// Raciocínio custa latência na voz. Haiku 5.5 e Nemotron aceitam desligar;
// Sonnet/Opus/Fable 5.x e Gemini exigem raciocínio, então vai o mínimo.
// FEITA_REASONING (JSON) sobrescreve. Medições em TESTES.md.
export function feitaReasoning(modelo: string): Record<string, unknown> {
  if (process.env.FEITA_REASONING) return JSON.parse(process.env.FEITA_REASONING);
  const obrigatorio = /^google\/|claude-(sonnet|opus|fable)/.test(modelo);
  return obrigatorio ? { effort: "minimal" } : { enabled: false };
}

/** Modelo da 2ª tentativa, quando o gateway dá erro na 1ª: outro provedor, rápido e sem raciocínio. */
export function feitaModeloReserva() {
  return process.env.FEITA_MODELO_RESERVA || "nvidia/nemotron-3-super-120b-a12b";
}

/**
 * Rede de segurança das rotas de LLM: repassa as partes do stream da 1ª tentativa. Se ela der erro (ex.: 400 do
 * gateway, ou "Internal error" depois de texto degenerado) antes de a rota falar qualquer coisa e antes de
 * qualquer tool, tenta uma vez de novo com `segunda` (outro modelo). `recomecar` limpa o que a rota juntou da 1ª.
 * Se a 2ª também falhar, a rota cai na fala de reserva dela. Interrupção (abort) não tenta de novo.
 */
export async function* comReserva<P extends { type: string }>(
  primeira: () => AsyncIterable<P>,
  segunda: () => AsyncIterable<P>,
  rotulo: string,
  op: { signal?: AbortSignal; falou: () => boolean; recomecar?: () => void },
): AsyncGenerator<P> {
  let usouTool = false;
  let erro: unknown = undefined;
  const podeRepetir = () => !usouTool && !op.falou();
  try {
    for await (const p of primeira()) {
      if (p.type === "error" && podeRepetir()) {
        erro = (p as unknown as { error: unknown }).error;
        break;
      }
      if (p.type === "tool-call") usouTool = true;
      yield p;
    }
  } catch (e) {
    if (!podeRepetir()) throw e;
    erro = e;
  }
  if (erro === undefined || op.signal?.aborted) return;
  const motivo = erro instanceof Error ? erro.message : String(erro);
  console.error(`[${rotulo}] 1ª tentativa falhou (${motivo}); 2ª com ${feitaModeloReserva()}`);
  op.recomecar?.();
  yield* segunda();
}
