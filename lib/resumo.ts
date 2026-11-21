export type Resumo = { n: number; media_ms: number; p50_ms: number; p90_ms: number; max_ms: number } | null;

/** Média e percentis simples de uma lista de latências em ms. */
export function resumir(valores: number[]): Resumo {
  if (valores.length === 0) return null;
  const s = [...valores].sort((a, b) => a - b);
  const pct = (p: number) => s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
  return {
    n: s.length,
    media_ms: Math.round(s.reduce((a, b) => a + b, 0) / s.length),
    p50_ms: pct(50),
    p90_ms: pct(90),
    max_ms: s[s.length - 1],
  };
}
