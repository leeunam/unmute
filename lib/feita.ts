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
