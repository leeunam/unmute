// O fluxo inteiro da demo em texto, sem Agora: pedido → liga para A → B toca sozinho → compara →
// volta ao produtor → "fecha". Manda às rotas o mesmo histórico que a Agora mandaria e confere:
// - "pode ligar" faz o celular de A tocar (LIGANDO_A);
// - quando A termina, B toca sem ninguém clicar (LIGANDO_B);
// - A sai R$ 14.200 na quarta, B mais barato na sexta, e a recomendação é A, com B "fora do prazo";
// - a frase da recomendação sai do código, com números por extenso;
// - "fecha" deixa a compra FECHADA com A.
// Uso (com npm start rodando): node --env-file=.env.local scripts/fluxo-texto.mjs [rodadas=1] [aprovacao="Fecha."]
// aprovacao pode ser uma lista JSON de falas do produtor na volta, ex.: '["E o frete?", "Fecha com o B.", "Fecha."]'.
const [n = "1", aprovacao = "Fecha."] = process.argv.slice(2);
const URL = "http://localhost:3000";
const AUTH = { "Content-Type": "application/json", Authorization: `Bearer ${process.env.LLM_PROXY_SECRET}` };

const PRODUTOR = [
  "Oi, preciso falar com meu fornecedor de combustível, pra reabastecer até quinta. Desenrola um preço de até 15 mil.",
  "Dois mil litros.",
  "Pode ligar.",
];
const A = [
  "Antes de te passar o preço, qual é o máximo que ele paga?",
  "Faço a sete e trinta o litro.",
  "Pra dois mil litros eu faço sete e dez, mais que isso não dá.",
  "Entrego na quarta, pode contar. O frete é por minha conta.",
  "Pix à vista.",
  "Isso, tá certo.",
];
const B = [
  "Faço a seis e cinquenta o litro.",
  "Não baixo não, esse é o preço.",
  "Só consigo entregar na sexta, pode contar. Frete por minha conta.",
  "Boleto pra trinta dias.",
  "Isso.",
];

async function turno(rota, messages) {
  const t0 = performance.now();
  const res = await fetch(`${URL}${rota}`, { method: "POST", headers: AUTH, body: JSON.stringify({ messages, stream: true, max_tokens: 300 }) });
  let texto = "", primeiro = 0;
  const dec = new TextDecoder();
  for await (const c of res.body) {
    for (const linha of dec.decode(c).split("\n")) {
      if (!linha.startsWith("data: {")) continue;
      const d = JSON.parse(linha.slice(6)).choices[0].delta.content;
      if (d) { if (!primeiro) primeiro = performance.now() - t0; texto += d; }
    }
  }
  return { texto: texto.trim(), ms: Math.round(primeiro) };
}
const estado = () => fetch(`${URL}/api/tarefa`).then((r) => r.json());
const post = (url, body) => fetch(`${URL}${url}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());

async function conversa(rota, saudacao, falas, quem, ate) {
  const messages = [{ role: "assistant", content: saudacao }];
  console.log(`  Agente: ${saudacao}`);
  for (const f of falas) {
    messages.push({ role: "user", content: f });
    const r = await turno(rota, messages);
    messages.push({ role: "assistant", content: r.texto });
    console.log(`  ${quem}: ${f}\n  Agente (${r.ms} ms): ${r.texto}`);
    if (ate && (await ate())) break;
  }
}

let ok = 0;
for (let r = 1; r <= Number(n); r++) {
  const falhas = [];
  const confere = (cond, msg) => { if (!cond) falhas.push(msg); };
  console.log(`=== rodada ${r}`);
  await fetch(`${URL}/api/tarefa`, { method: "POST" });

  console.log("-- produtor");
  await conversa("/api/llm/chat/completions", "Oi! Aqui é o Desenrola Agro. Em que posso te ajudar hoje?", PRODUTOR, "Produtor");
  let e = await estado();
  confere(e.completa, "tarefa incompleta");
  confere(e.compra.estado === "LIGANDO_A", `depois do "pode ligar": ${e.compra.estado}, esperava LIGANDO_A`);

  for (const [id, falas] of [["a", A], ["b", B]]) {
    console.log(`-- fornecedor ${id.toUpperCase()}`);
    e = await estado();
    const tocando = e.compra.ligacoes.find((l) => l.fornecedor.id === id)?.status === "tocando";
    confere(tocando, `o celular de ${id} não tocou sozinho (${e.compra.estado})`);
    if (!tocando) break;
    const { saudacao } = await post("/api/chamada", { acao: "texto", fornecedor: id });
    await conversa(`/api/negociador/chat/completions?fornecedor=${id}`, saudacao, falas, `Fornecedor ${id.toUpperCase()}`, async () =>
      (await estado()).compra.ligacoes.find((l) => l.fornecedor.id === id)?.status === "encerrada",
    );
  }

  e = await estado();
  const oferta = (id) => e.compra.ligacoes.find((l) => l.fornecedor.id === id)?.oferta ?? {};
  const marcas = (id) => e.compra.comparacao?.avaliadas.find((a) => a.id === id)?.marcas ?? [];
  confere(e.compra.estado === "OFERTAS_COLETADAS", `depois de B: ${e.compra.estado}`);
  confere(oferta("a").total_com_frete === 14200, `A total ${oferta("a").total_com_frete}, esperava 14200`);
  confere(oferta("a").prazo_entrega === "2026-11-25", `A prazo ${oferta("a").prazo_entrega}`);
  confere(oferta("b").total_com_frete < 14200, `B total ${oferta("b").total_com_frete}, esperava < 14200`);
  confere(oferta("b").prazo_entrega === "2026-11-27", `B prazo ${oferta("b").prazo_entrega}`);
  confere(e.compra.comparacao?.recomendada === "a", `recomendada ${e.compra.comparacao?.recomendada}`);
  confere(marcas("b").includes("fora_do_prazo"), `B marcas ${marcas("b")}`);

  console.log("-- volta ao produtor");
  const { frase } = await post("/api/compra", { acao: "retorno" });
  confere(
    frase === "O A sai por catorze mil e duzentos reais, com entrega na quarta. O B é mais barato, mas só entrega na sexta. Fecho com o A?",
    `frase: ${frase}`,
  );
  const falasVolta = aprovacao.startsWith("[") ? JSON.parse(aprovacao) : [aprovacao];
  await conversa("/api/aprovacao/chat/completions", frase, falasVolta, "Produtor", async () => {
    const c = (await estado()).compra;
    console.log(`    (estado: ${c.estado}${c.fechada_com ? ` com ${c.fechada_com}` : ""})`);
    return c.estado === "FECHADA";
  });
  e = await estado();
  confere(e.compra.estado === "FECHADA" && e.compra.fechada_com === "a", `fim: ${e.compra.estado} com ${e.compra.fechada_com}`);
  console.log(`  estados: ${e.compra.historico.map((h) => h.estado).join(" → ")}`);
  console.log(falhas.length ? `  FALHOU: ${falhas.join("; ")}` : "  OK");
  if (!falhas.length) ok++;
}
console.log(`\n${ok}/${n} rodadas ok`);
