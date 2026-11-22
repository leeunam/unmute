// Simula a Agora: manda o histórico crescente para a rota e mede cada turno.
// Uso (com npm start rodando): node --env-file=.env.local scripts/conversa-texto.mjs <modelo> [rodadas=3] [falas JSON]
const [modelo, n = "3", falasJson] = process.argv.slice(2);
const URL = "http://localhost:3000";
const SYSTEM = `Você é o assistente de voz do Desenrola Agro, que ajuda produtores rurais do Brasil.
Fale sempre em português do Brasil, de um jeito simples, educado e direto, como se fala no interior.
Suas respostas viram áudio: use frases curtas, no máximo duas ou três por vez, e faça uma pergunta por vez.
Não use listas, markdown, emojis nem símbolos. Escreva números e valores por extenso quando forem curtos.
Se não entender o que a pessoa disse, peça para ela repetir.`;
const falas = falasJson ? JSON.parse(falasJson) : [
  "Oi, preciso falar com meu fornecedor de combustível, pra reabastecer até quinta. Desenrola um preço de até 15 mil.",
  "Dois mil litros.",
  "Isso, pode seguir.",
];
for (let r = 0; r < Number(n); r++) {
  await fetch(`${URL}/api/tarefa`, { method: "POST" });
  const messages = [{ role: "system", content: SYSTEM }, { role: "assistant", content: "Oi! Aqui é o Desenrola Agro. Em que posso te ajudar hoje?" }];
  console.log(`=== rodada ${r + 1} (${modelo})`);
  for (const f of falas) {
    messages.push({ role: "user", content: f });
    const t0 = performance.now();
    const res = await fetch(`${URL}/api/llm/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.LLM_PROXY_SECRET}` },
      body: JSON.stringify({ model: modelo, messages, stream: true, max_tokens: 300 }),
    });
    let texto = "", primeiro = 0;
    const dec = new TextDecoder();
    for await (const c of res.body) {
      for (const linha of dec.decode(c).split("\n")) {
        if (!linha.startsWith("data: {")) continue;
        const d = JSON.parse(linha.slice(6)).choices[0].delta.content;
        if (d) { if (!primeiro) primeiro = performance.now() - t0; texto += d; }
      }
    }
    messages.push({ role: "assistant", content: texto });
    console.log(`  P: ${f}\n  A (${Math.round(primeiro)} ms): ${texto.trim()}`);
  }
  const e = await fetch(`${URL}/api/tarefa`).then((r) => r.json());
  console.log(`  tarefa: completa=${e.completa} ${JSON.stringify(e.tarefa)}`);
}
