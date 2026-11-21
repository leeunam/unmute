// LLM pelo gateway da feita.ai (compatível com OpenAI e Anthropic).
// Descoberto no próprio app: feita.ai/ai-gateway, base https://api.feita.ai/gateway/v1.
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export const FEITA_GATEWAY = "https://api.feita.ai/gateway/v1";

export function feitaModelId() {
  // Medido em 21/11/2026 (TESTES.md): o mais rápido até o primeiro token.
  return process.env.FEITA_MODEL || "google/gemini-3.5-flash-lite";
}

export const feita = createOpenAICompatible({
  name: "feita",
  baseURL: FEITA_GATEWAY,
  apiKey: process.env.FEITA_API_KEY,
});
