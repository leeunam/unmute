// Reproduz o histórico que a Agora manda depois de uma interrupção e confere que as 3 rotas respondem.
// Bug de 22/11/2026: depois de um turno interrompido, o gateway da feita devolvia 400 "Provider returned error"
// e a agente repetia o FAILURE ("Desculpa, tive um probleminha aqui").
// Uso (com npm start rodando): node --env-file=.env.local scripts/historico-interrompido.mjs [http://localhost:3000] [repeticoes=1]
// MODELO=google/nao-existe força a 1ª tentativa a falhar, para testar a 2ª (outro modelo).
const base = process.argv[2] || "http://localhost:3000";
const vezes = Number(process.argv[3] || 1);
const segredo = process.env.LLM_PROXY_SECRET;

const sistema = { role: "system", content: "Você é o assistente de voz do Desenrola Agro." };

// Formas de histórico depois de uma interrupção, a partir de uma conversa de cada rota.
// semFala: a última fala útil é do agente; a rota tem de pedir para repetir sem chamar o modelo.
function formas(inicio, agente, usuario) {
  return {
    normal: [...inicio, { role: "assistant", content: agente }, { role: "user", content: usuario }],
    assistant_vazio: [...inicio, { role: "assistant", content: "" }, { role: "user", content: usuario }],
    assistant_null: [...inicio, { role: "assistant", content: null }, { role: "user", content: usuario }],
    dois_user: [...inicio, { role: "user", content: usuario.split(" ")[0] }, { role: "user", content: usuario }],
    dois_assistant: [...inicio, { role: "assistant", content: agente.split(" ")[0] }, { role: "assistant", content: agente }, { role: "user", content: usuario }],
    user_vazio_no_fim: { semFala: true, m: [...inicio, { role: "assistant", content: agente }, { role: "user", content: "" }] },
    user_espaco_no_fim: { semFala: true, m: [...inicio, { role: "assistant", content: agente }, { role: "user", content: " " }] },
    termina_em_assistant: { semFala: true, m: [...inicio, { role: "assistant", content: agente }] },
  };
}

const rotas = {
  produtor: {
    url: "/api/llm/chat/completions",
    preparar: () => fetch(`${base}/api/tarefa`, { method: "POST" }),
    casos: formas(
      [
        sistema,
        { role: "assistant", content: "Oi! Aqui é o Desenrola Agro. Em que posso te ajudar hoje?" },
        { role: "user", content: "Preciso de duzentos litros de combustível." },
        { role: "assistant", content: "Pra quando o senhor precisa?" },
        { role: "user", content: "Segunda-feira da semana que vem." },
      ],
      "Até quanto o senhor topa pagar no total?",
      "Dois mil reais.",
    ),
  },
  negociador: {
    url: "/api/negociador/chat/completions?fornecedor=a",
    // Ligação em texto, sem Agora (a mesma de scripts/negociacao-texto.mjs).
    preparar: async () => {
      await fetch(`${base}/api/tarefa`, { method: "POST" });
      const r = await fetch(`${base}/api/chamada`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "texto", fornecedor: "a" }),
      }).then((x) => x.json());
      return r.saudacao;
    },
    casos: (saudacao) =>
      formas(
        [sistema, { role: "assistant", content: saudacao }, { role: "user", content: "Faço a sete e trinta o litro." }],
        "Sete reais e trinta o litro, anotado. Pra esse volume o senhor não melhora um pouquinho?",
        "Faço sete e dez.",
      ),
  },
  aprovacao: {
    url: "/api/aprovacao/chat/completions",
    preparar: () => fetch(`${base}/api/tarefa`, { method: "POST" }),
    casos: formas(
      [sistema, { role: "assistant", content: "O A sai por catorze mil e duzentos reais, com entrega na quarta. Fecho com o A?" }],
      "Fecho com o A?",
      "Deixa eu pensar um pouco.",
    ),
  },
};

const FAILURE = /probleminha/i;
async function chamar(rota, messages) {
  const t0 = Date.now();
  const res = await fetch(base + rota, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${segredo}` },
    body: JSON.stringify({ model: process.env.MODELO || "google/gemini-3.5-flash-lite", messages, stream: true, turn_id: 99 }),
  });
  const corpo = await res.text();
  const fala = corpo
    .split("\n")
    .filter((l) => l.startsWith("data: {"))
    .map((l) => JSON.parse(l.slice(6)).choices?.[0]?.delta?.content ?? "")
    .join("");
  return { status: res.status, fala, ms: Date.now() - t0 };
}

let falhas = 0;
for (const [nomeRota, rota] of Object.entries(rotas)) {
  const nomes = Object.keys(typeof rota.casos === "function" ? rota.casos("") : rota.casos);
  for (const nome of nomes) {
    for (let i = 0; i < vezes; i++) {
      const prep = await rota.preparar();
      const casos = typeof rota.casos === "function" ? rota.casos(prep) : rota.casos;
      const caso = casos[nome];
      const messages = Array.isArray(caso) ? caso : caso.m;
      const r = await chamar(rota.url, messages);
      const pedeRepetir = /não peguei/i.test(r.fala);
      const ok =
        r.status === 200 && r.fala.trim() && !FAILURE.test(r.fala) && (caso.semFala ? pedeRepetir : !pedeRepetir);
      if (!ok) falhas++;
      console.log(`${ok ? "ok   " : "FALHA"} ${nomeRota.padEnd(10)} ${nome.padEnd(20)} ${r.status} ${String(r.ms).padStart(5)}ms ${JSON.stringify(r.fala.slice(0, 80))}`);
    }
  }
}
console.log(falhas ? `${falhas} falha(s)` : "tudo ok");
process.exit(falhas ? 1 : 0);
