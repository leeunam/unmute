// Mede o tempo até o primeiro token de conteúdo (TTFT) num endpoint
// /chat/completions com streaming, imitando a chamada que a Agora faz.
// Uso: node --env-file=.env.local scripts/medir-llm.mjs <url> <bearer> [n] [modelo] [json-extra]
// json-extra entra no corpo do pedido, ex.: '{"reasoning":{"enabled":false}}'
const [url, bearer, n = "5", modelo = process.env.FEITA_MODEL ?? "google/gemini-3.5-flash-lite", extra = "{}"] =
  process.argv.slice(2);
const DEBUG = process.env.DEBUG === "1";
const perguntas = [
  "Oi, preciso comprar diesel para a fazenda.",
  "Uns cinco mil litros. Dá para entregar até quinta?",
  "Quanto fica mais ou menos o litro hoje?",
  "E se eu pagar à vista, melhora?",
  "Tá bom, obrigado.",
];
const ttfts = [];
for (let i = 0; i < Number(n); i++) {
  const t0 = performance.now();
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: modelo,
      stream: true,
      ...JSON.parse(extra),
      max_tokens: 300,
      messages: [
        { role: "system", content: "Você é um assistente de voz para produtores rurais. Responda em português do Brasil, em frases curtas." },
        { role: "user", content: perguntas[i % perguntas.length] },
      ],
    }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "", ttft = 0, texto = "", primeiroChunk = 0, raciocinio = 0, fim = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n\n")) !== -1) {
      const linha = buf.slice(0, i).trim(); buf = buf.slice(i + 2);
      if (!linha.startsWith("data:") || linha.includes("[DONE]")) continue;
      const j = JSON.parse(linha.slice(5));
      if (!primeiroChunk) primeiroChunk = performance.now() - t0;
      const d = j.choices?.[0]?.delta ?? {};
      if (d.reasoning || d.reasoning_content) raciocinio += (d.reasoning || d.reasoning_content).length;
      if (j.choices?.[0]?.finish_reason) fim = j.choices[0].finish_reason + "/" + (j.choices[0].native_finish_reason ?? "");
      if (DEBUG && !d.content) console.log("   chunk sem texto:", linha.slice(0, 200));
      const c = d.content;
      if (c) { if (!ttft) ttft = performance.now() - t0; texto += c; }
    }
  }
  ttfts.push(Math.round(ttft));
  console.log(
    `ttft ${Math.round(ttft)} ms · 1º chunk ${Math.round(primeiroChunk)} ms · total ${Math.round(performance.now() - t0)} ms · raciocínio ${raciocinio} chars · fim ${fim} · ${JSON.stringify(texto.slice(0, 70))}`,
  );
}
const s = [...ttfts].filter((x) => x > 0).sort((a, b) => a - b);
console.log(`vazias: ${ttfts.length - s.length}/${ttfts.length}`);
console.log(`RESUMO n=${s.length} média=${Math.round(s.reduce((a, b) => a + b, 0) / s.length)} ms mediana=${s[Math.floor(s.length / 2)]} ms máx=${s.at(-1)} ms`);
