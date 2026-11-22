// Saneia o histórico que a Agora manda antes de chamar o modelo (as 3 rotas de LLM usam).
//
// Bug de 22/11/2026: depois de uma interrupção, a fala do usuário chegava vazia. A rota a descartava e o
// histórico terminava numa fala do agente. O Gemini recusa histórico que termina em assistant (e fala só
// com espaço): o gateway da feita devolve 400 "Provider returned error" e a agente falava o FAILURE.
// Reproduzido em scripts/historico-interrompido.mjs.
import type { ModelMessage } from "ai";

export type MensagemOpenAI = { role: string; content: unknown };

export function textoDe(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((p) => (typeof p === "string" ? p : p && typeof p === "object" && "text" in p ? String(p.text) : ""))
      .join("");
  }
  return "";
}

/** O failure_message da Agora e a última fala de reserva das rotas, quando as duas tentativas do LLM falham. */
export const FALHA = "Desculpa, tive um probleminha aqui. Pode repetir, por favor?";

/** Fala do código quando o usuário falou e não veio nada (ex.: logo depois de uma interrupção). */
export const SEM_FALA = "Desculpa, não peguei. Pode repetir, por favor?";

/**
 * - `sistema`: os textos de system, na ordem.
 * - `conversa`: só user e assistant, sem conteúdo vazio ou só com espaço, e as seguidas do mesmo papel juntas
 *   numa só.
 * - `semFala`: a conversa não termina numa fala do usuário (ele não disse nada que deu para usar). A rota
 *   responde SEM_FALA sem chamar o modelo, porque o Gemini recusa histórico que termina em assistant.
 * - `ajustes`: o que foi mudado, para o log.
 */
export function sanear(messages: MensagemOpenAI[]) {
  const sistema: string[] = [];
  const conversa: { role: "user" | "assistant"; content: string }[] = [];
  const ajustes: string[] = [];
  for (const [i, m] of messages.entries()) {
    const content = textoDe(m.content).trim();
    if (m.role === "system") {
      if (content) sistema.push(content);
      continue;
    }
    if (m.role !== "user" && m.role !== "assistant") continue;
    if (!content) {
      ajustes.push(`vazia#${i}:${m.role}`);
      continue;
    }
    const anterior = conversa.at(-1);
    if (anterior?.role === m.role) {
      anterior.content += ` ${content}`;
      ajustes.push(`juntou#${i}:${m.role}`);
    } else conversa.push({ role: m.role, content });
  }
  const semFala = conversa.at(-1)?.role !== "user";
  if (semFala) ajustes.push("sem_fala_do_usuario_no_fim");
  return { sistema, conversa: conversa as ModelMessage[], semFala, ajustes };
}
