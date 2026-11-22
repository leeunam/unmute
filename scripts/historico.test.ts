// O saneamento do histórico da Agora (lib/historico.ts), sem LLM.
// Uso: npx --yes tsx --test scripts/historico.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { sanear } from "../lib/historico";

const S = { role: "system", content: "sistema" };

test("histórico normal passa igual", () => {
  const r = sanear([S, { role: "assistant", content: "Oi!" }, { role: "user", content: "Preciso de diesel." }]);
  assert.deepEqual(r.sistema, ["sistema"]);
  assert.deepEqual(r.conversa, [
    { role: "assistant", content: "Oi!" },
    { role: "user", content: "Preciso de diesel." },
  ]);
  assert.equal(r.semFala, false);
  assert.deepEqual(r.ajustes, []);
});

test("tira conteúdo vazio, só espaço e null, e junta as seguidas do mesmo papel", () => {
  const r = sanear([
    S,
    { role: "assistant", content: "Oi!" },
    { role: "user", content: "Dois" },
    { role: "assistant", content: "" },
    { role: "assistant", content: null },
    { role: "user", content: "  " },
    { role: "user", content: [{ type: "text", text: "mil reais." }] },
  ]);
  assert.deepEqual(r.conversa, [
    { role: "assistant", content: "Oi!" },
    { role: "user", content: "Dois mil reais." },
  ]);
  assert.equal(r.semFala, false);
});

test("depois de interrupção sem fala do usuário: semFala (o Gemini recusa assistant no fim)", () => {
  for (const fim of [[], [{ role: "user", content: "" }], [{ role: "user", content: " " }]]) {
    const r = sanear([S, { role: "assistant", content: "Oi!" }, { role: "user", content: "Diesel." }, { role: "assistant", content: "Quantos litros?" }, ...fim]);
    assert.equal(r.semFala, true);
    assert.equal(r.conversa.at(-1)?.role, "assistant");
  }
});

test("ignora papéis que não são user, assistant ou system", () => {
  const r = sanear([{ role: "tool", content: "x" }, { role: "user", content: "oi" }]);
  assert.deepEqual(r.conversa, [{ role: "user", content: "oi" }]);
});
