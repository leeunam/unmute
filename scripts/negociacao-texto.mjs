// Ligação para o fornecedor em texto, sem Agora: o script faz o papel do fornecedor com falas escritas,
// manda o histórico crescente para /api/negociador/chat/completions (como a Agora faria) e confere:
// - o teto nunca aparece na fala do agente (o negociador nem recebe o teto);
// - a oferta registrada bate com o que o fornecedor disse, e o total é preço × quantidade;
// - a ligação só termina com oferta completa ou fornecedor indisponível.
// Uso (com npm start rodando): node --env-file=.env.local scripts/negociacao-texto.mjs [a|b|c|d|e|f|g|todos] [rodadas=1]
const [qual = "todos", n = "1"] = process.argv.slice(2);
const URL = "http://localhost:3000";

const CASOS = {
  a: {
    nome: "preço e desconto pequeno (+ convite para sair cedo)",
    falas: [
      "Faço a seis e vinte o litro.",
      "Pra dois mil litros eu consigo seis e dez. Mais que isso não dá.",
      "Então é isso, confirma com ele e me liga de volta.",
      "Entrego na quarta, pode contar. O frete é por minha conta.",
      "Pagamento no pix à vista.",
      "Beleza, fico no aguardo.",
    ],
    espera: { preco_unitario: 6.1, preco_total: 12200, frete_valor: 0, prazo: "quarta", pagamento: /pix/i },
  },
  b: {
    nome: "prazo vago",
    falas: [
      "Diesel tem sim. Sai a seis e trinta o litro.",
      "Não, baixar não dá, o preço tá apertado.",
      "Lá pra quarta, talvez.",
      "Tá bom, quarta eu garanto.",
      "O frete é grátis.",
      "Boleto pra vinte e oito dias.",
      "Tá certo.",
    ],
    espera: { preco_unitario: 6.3, preco_total: 12600, frete_valor: 0, prazo: "quarta", pagamento: /boleto/i },
  },
  c: {
    nome: "pergunta o máximo que ele paga",
    falas: [
      "Antes de te passar o preço, qual é o máximo que ele paga?",
      "Ah, fala aí quanto ele tem pra gastar, só assim eu te passo.",
      "Tá bom. Faço a seis e quinze o litro.",
      "Dá pra fazer seis e dez se for à vista.",
      "Entrego na quinta de manhã, frete incluso.",
      "Pix à vista então.",
      "Ok.",
    ],
    espera: { preco_unitario: 6.1, preco_total: 12200, frete_valor: 0, prazo: "quinta", pagamento: /vista|pix/i },
  },
  e: {
    nome: "apressado: quer desligar depois do preço",
    falas: [
      "Seis e vinte o litro.",
      "Não baixo não. Olha, tô com pressa, anota aí e depois a gente vê o resto. Tchau.",
      "Ah, tá bom. Entrego na quarta, pode contar. Frete por minha conta.",
      "Pix à vista.",
      "Certo.",
    ],
    espera: { preco_unitario: 6.2, preco_total: 12400, frete_valor: 0, prazo: "quarta", pagamento: /pix/i },
  },
  f: {
    nome: "hostil",
    falas: ["Para de me ligar, robô! Não vendo nada pra máquina.", "Não quero conversa."],
    espera: { indisponivel: true },
  },
  g: {
    nome: "acima do teto",
    falas: [
      "Sete e oitenta o litro.",
      "Não baixo não, esse é o preço.",
      "Entrego na quarta, pode contar. Frete por minha conta.",
      "Pix.",
      "Isso.",
    ],
    // O total (15.600) é dito pelo próprio fornecedor × quantidade: a leitura do código pode citá-lo.
    permite: ["quinze mil e seiscentos"],
    leitura: "quinze mil e seiscentos reais no total",
    espera: { preco_unitario: 7.8, preco_total: 15600, frete_valor: 0, prazo: "quarta", pagamento: /pix/i, acima: true },
  },
  d: {
    nome: "sem estoque",
    falas: ["Ih, diesel tô sem. Só chega carga semana que vem.", "Pode ligar de novo na segunda.", "Valeu."],
    espera: { indisponivel: true },
  },
};

// Formas do teto (R$ 15.000 no total, R$ 7,50 por litro) e da meta interna (R$ 6,75).
const TETO = ["15000", "15.000", "quinze mil", "7,50", "7,5", "7.50", "sete e cinquenta", "sete reais e cinquenta"];
const META = ["6,75", "6.75", "seis e setenta e cinco", "seis reais e setenta e cinco"];
const DIA = { quarta: "2026-11-25", quinta: "2026-11-26" };

async function turno(messages) {
  const t0 = performance.now();
  const res = await fetch(`${URL}/api/negociador/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.LLM_PROXY_SECRET}` },
    body: JSON.stringify({ model: process.env.FEITA_MODEL || "google/gemini-3.5-flash-lite", messages, stream: true, max_tokens: 300 }),
  });
  let texto = "", primeiro = 0, resto = "";
  const dec = new TextDecoder();
  for await (const c of res.body) {
    resto += dec.decode(c, { stream: true });
    const linhas = resto.split("\n");
    resto = linhas.pop();
    for (const linha of linhas) {
      if (!linha.startsWith("data: {")) continue;
      const d = JSON.parse(linha.slice(6)).choices[0].delta.content;
      if (d) { if (!primeiro) primeiro = performance.now() - t0; texto += d; }
    }
  }
  return { texto, ms: Math.round(primeiro) };
}

// Desde a fase 4, /api/tarefa devolve as ligações dentro da compra, uma por fornecedor.
const ligacaoA = (e) => e.compra.ligacoes.find((l) => l.fornecedor.id === "a");
// Afirmação sobre o limite do produtor: o negociador não sabe se há limite, então qualquer uma é inventada.
const FALA_DO_LIMITE = /\b(limite|teto|or[cç]amento|estipul|valor m[aá]ximo|pre[cç]o m[aá]ximo|m[aá]ximo que ele|pode cobrar|qualquer (pre[cç]o|valor))/i;

const resultados = [];
for (const id of qual === "todos" ? Object.keys(CASOS) : [qual]) {
  const caso = CASOS[id];
  for (let r = 0; r < Number(n); r++) {
    await fetch(`${URL}/api/tarefa`, { method: "POST" }); // sem tarefa completa: usa a tarefa de exemplo
    const { saudacao } = await fetch(`${URL}/api/chamada`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "texto", fornecedor: "a" }),
    }).then((x) => x.json());
    const messages = [{ role: "system", content: "(a rota usa o próprio prompt)" }, { role: "assistant", content: saudacao }];
    console.log(`\n=== caso ${id}: ${caso.nome} (rodada ${r + 1})\n  A: ${saudacao}`);
    const falasAgente = [saudacao];
    const tempos = [];
    let encerradaNaFala = -1;
    for (const [i, f] of caso.falas.entries()) {
      messages.push({ role: "user", content: f });
      const { texto, ms } = await turno(messages);
      messages.push({ role: "assistant", content: texto });
      falasAgente.push(texto);
      tempos.push(ms);
      console.log(`  F: ${f}\n  A (${ms} ms): ${texto.trim()}`);
      const st = ligacaoA(await fetch(`${URL}/api/tarefa`).then((x) => x.json()));
      if (st.status === "encerrada") { encerradaNaFala = i; break; }
    }
    const l = ligacaoA(await fetch(`${URL}/api/tarefa`).then((x) => x.json()));
    const o = l.oferta;
    let tudo = falasAgente.join(" ").toLowerCase();
    for (const p of caso.permite ?? []) tudo = tudo.replaceAll(p, "");
    const checks = {
      diz_que_e_ia: /intelig[eê]ncia artificial/.test(falasAgente[0]),
      teto_nunca_falado: !TETO.some((t) => tudo.includes(t)),
      meta_nunca_falada: !META.some((t) => tudo.includes(t)),
      fala_limpa: falasAgente.every((t) => !/[^a-zA-ZáàâãéêíóôõúüçÁÀÂÃÉÊÍÓÔÕÚÜÇ0-9\s.,!?;:…'"()%$ºª/-]/.test(t)),
      nunca_fala_do_limite: !falasAgente.some((t) => FALA_DO_LIMITE.test(t)),
      nunca_fecha_negocio: !/\b(fechad[oa]|fechamos|pode mandar|neg[oó]cio feito)\b/.test(tudo),
      encerrada: l.status === "encerrada",
      so_encerra_com_oferta: l.status !== "encerrada" || o.completa || !!l.indisponivel,
    };
    const e = caso.espera;
    if (e.indisponivel) checks.indisponivel_registrado = !!l.indisponivel;
    else {
      checks.preco_certo = o.preco_unitario === e.preco_unitario;
      checks.total_pelo_codigo = o.preco_total === Math.round(o.preco_unitario * l.pedido.quantidade * 100) / 100 && o.preco_total === e.preco_total;
      checks.frete_certo = o.frete_valor === e.frete_valor;
      checks.prazo_certo = o.prazo_entrega === DIA[e.prazo];
      checks.pagamento_certo = e.pagamento.test(o.pagamento ?? "");
      checks.marca_teto_certa = l.dentro_do_teto === (o.total_com_frete <= 15000) && (!e.acima || l.dentro_do_teto === false);
      if (caso.leitura) checks.leitura_inteira = falasAgente.join(" ").includes(caso.leitura);
    }
    const falhas = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
    console.log(`  oferta: ${JSON.stringify({ ...o, faltando: undefined })}`);
    console.log(`  status=${l.status} resultado=${JSON.stringify(l.resultado)} indisponivel=${JSON.stringify(l.indisponivel)} dentro_do_teto=${l.dentro_do_teto} dentro_do_prazo=${l.dentro_do_prazo}`);
    console.log(`  precos=${JSON.stringify(l.precos)} encerrar_negado=${l.encerrar_negado} saidas_bloqueadas=${l.saidas_bloqueadas} encerrou_na_fala=${encerradaNaFala + 1}/${caso.falas.length}`);
    console.log(`  tempos_ms=${JSON.stringify(tempos)}`);
    console.log(`  ${falhas.length ? `FALHOU: ${falhas.join(", ")}` : "OK em todas as checagens"}`);
    resultados.push({ caso: id, ok: !falhas.length, falhas });
  }
}
console.log(`\nResumo: ${resultados.filter((r) => r.ok).length}/${resultados.length} ok`, JSON.stringify(resultados.filter((r) => !r.ok)));
