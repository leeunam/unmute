// Regras do negociador que são do código, testadas sem LLM (não gasta crédito).
// Uso: npx --yes tsx --test scripts/regras-negociador.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  conferirFrase,
  contextoNegociador,
  encerrarLigacao,
  marcarIndisponivel,
  novaLigacao,
  PROMPT_NEGOCIADOR,
  registrarOferta,
  type Ligacao,
} from "../lib/negociacao";
import { normalizarPrazo, resetar } from "../lib/tarefa";

function ligar(): Ligacao {
  resetar(); // sem tarefa completa: usa a de exemplo (2000 litros, teto R$ 15.000)
  return novaLigacao("a", "em_andamento");
}
const fornecedorDisse = (l: Ligacao, fala: string) => {
  l.ultima_fala_fornecedor = fala;
  l.falas_fornecedor += ` ${fala}`;
};

test("o teto não entra no contexto do modelo; a meta fica abaixo dele", () => {
  const l = ligar();
  const contexto = PROMPT_NEGOCIADOR + contextoNegociador(l);
  for (const forma of ["15000", "15.000", "quinze mil", "7,50", "7.5"]) assert.ok(!contexto.includes(forma), forma);
  assert.equal(l.meta_unitaria, 6.75);
  assert.ok(contexto.includes("R$ 6,75"));
});

test("encerrar_ligacao sem oferta completa volta dizendo o que falta", () => {
  const l = ligar();
  fornecedorDisse(l, "Seis e vinte o litro.");
  registrarOferta(l, { preco_unitario: 6.2 });
  const r = encerrarLigacao(l, { resultado: "vou confirmar" });
  assert.equal(r.ok, false);
  assert.match(String((r as { erro: string }).erro), /prazo_entrega, frete, pagamento/);
  assert.equal(l.status, "em_andamento");
});

test("despedida sem oferta é cortada; com oferta completa passa", () => {
  const l = ligar();
  assert.deepEqual(conferirFrase(l, "Vou confirmar com ele e retorno."), { ok: false, motivo: "despedida_cedo" });
  fornecedorDisse(l, "Seis e dez o litro, entrego quarta, frete por minha conta, pix à vista.");
  registrarOferta(l, { preco_unitario: 6.1, prazo_entrega: "quarta", frete: "por conta dele", frete_valor: 0, pagamento: "pix à vista" });
  assert.equal(l.oferta.completa, true);
  assert.deepEqual(conferirFrase(l, "Vou confirmar com ele e retorno."), { ok: true });
});

test("frases que fecham negócio, citam o teto ou são lixo nunca vão para a voz", () => {
  const l = ligar();
  assert.equal(conferirFrase(l, "Fechado então, pode mandar.").ok, false);
  assert.equal(conferirFrase(l, "Ele paga até quinze mil.").ok, false);
  assert.equal(conferirFrase(l, "Até sete e cinquenta o litro.").ok, false);
  assert.equal(conferirFrase(l, "ốngốngốngốngống").ok, false);
  assert.equal(conferirFrase(l, "E o frete, fica por conta de quem?").ok, true);
});

test("o total é preço × quantidade, calculado pelo código", () => {
  const l = ligar();
  fornecedorDisse(l, "Faço a seis e dez.");
  registrarOferta(l, { preco_unitario: 6.1 });
  assert.equal(l.oferta.preco_total, 12200);
  fornecedorDisse(l, "No total fica doze mil e quatrocentos.");
  registrarOferta(l, { preco_total_falado: 12400 });
  assert.equal(l.oferta.preco_unitario, 6.2);
});

test("prazo vago não conta; prazo garantido conta", () => {
  const l = ligar();
  fornecedorDisse(l, "Lá pra quarta, talvez.");
  const r = registrarOferta(l, { prazo_entrega: "quarta" }); // o modelo "limpou" o talvez
  assert.equal(l.oferta.prazo_entrega, undefined);
  assert.equal((r as { acao: string }).acao, "prazo_vago");
  fornecedorDisse(l, "Quarta eu garanto.");
  registrarOferta(l, { prazo_entrega: "quarta" });
  assert.equal(l.oferta.prazo_entrega, normalizarPrazo("quarta"));
});

test("preço ou prazo que o fornecedor não disse é descartado", () => {
  const l = ligar();
  fornecedorDisse(l, "Seis e vinte o litro. Tô com pressa, depois a gente vê o resto.");
  const r = registrarOferta(l, { prazo_entrega: "quinta-feira, dia vinte e seis" }) as { descartado?: string };
  assert.equal(l.oferta.prazo_entrega, undefined);
  assert.match(String(r.descartado), /prazo/);
  registrarOferta(l, { preco_unitario: 5.9 });
  assert.equal(l.oferta.preco_unitario, undefined);
});

test("indisponível não serve de saída para quem tem o produto e deu preço", () => {
  const l = ligar();
  fornecedorDisse(l, "Seis e vinte. Confirma com ele e me liga.");
  registrarOferta(l, { preco_unitario: 6.2 });
  assert.equal(marcarIndisponivel(l, { motivo: "pediu pra ligar depois" }).ok, false);
  fornecedorDisse(l, "Na verdade tô sem estoque.");
  assert.equal(marcarIndisponivel(l, { motivo: "sem estoque" }).ok, true);
  assert.equal(encerrarLigacao(l, { resultado: "sem estoque" }).ok, true);
  assert.equal(l.status, "encerrada");
});

test("oferta acima do teto: a leitura do código sai inteira e a marca é calculada", () => {
  const l = ligar();
  fornecedorDisse(l, "Sete e oitenta o litro, entrego quarta, pode contar, frete por minha conta, pix.");
  registrarOferta(l, { preco_unitario: 7.8, prazo_entrega: "quarta", frete: "dele", frete_valor: 0, pagamento: "pix" }); // tática de melhora
  fornecedorDisse(l, "Não baixo, esse é o preço.");
  const r = registrarOferta(l, { observacoes: "não baixa" }) as { fala: string; acao: string };
  assert.equal(r.acao, "leitura");
  assert.equal(l.oferta.preco_total, 15600);
  assert.match(r.fala, /quinze mil e seiscentos reais/);
  for (const frase of r.fala.split(/(?<=[.!?…])\s+/)) assert.equal(conferirFrase(l, frase, true).ok, true, frase);
  assert.ok(l.oferta.total_com_frete! > l.privado.teto_total); // "acima do teto" na tela do produtor
});

test("resposta_curta do modelo com o teto é cortada mesmo dentro da fala do código", () => {
  const l = ligar();
  fornecedorDisse(l, "Quanto ele paga?");
  const r = registrarOferta(l, { resposta_curta: "Ele paga até quinze mil." }) as { fala: string };
  assert.ok(!r.fala.includes("quinze mil"));
});

test("prazo com o dia por extenso vale, com o modelo escrevendo em dígitos ou por extenso", () => {
  for (const passado of ["dia 25", "dia vinte e cinco"]) {
    const l = ligar();
    fornecedorDisse(l, "Entrego dia vinte e cinco, pode contar.");
    registrarOferta(l, { prazo_entrega: passado });
    assert.equal(l.oferta.prazo_entrega, normalizarPrazo("dia 25"), passado);
  }
});

test("frete por conta do fornecedor sem frete_valor vira frete 0", () => {
  const l = ligar();
  fornecedorDisse(l, "Frete por minha conta.");
  registrarOferta(l, { frete: "por conta do fornecedor" });
  assert.equal(l.oferta.frete_valor, 0);
});
