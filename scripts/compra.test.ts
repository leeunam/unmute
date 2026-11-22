// Comparação, frase da recomendação e máquina de estados da compra, sem LLM (não gasta crédito).
// Uso: npx --yes tsx --test scripts/compra.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  aprovarOferta,
  avancar,
  cancelarTarefa,
  compra,
  comparar,
  fornecedorNomeado,
  fraseRecomendacao,
  iniciarLigacoes,
  produtorAtendeu,
  resetarCompra,
  type EntradaComparacao,
} from "../lib/compra";
import { finalizar, ligacao, type Oferta } from "../lib/negociacao";
import { resetar } from "../lib/tarefa";

// Sábado, 21/11/2026. O pedido é "até quinta" = 26/11.
const HOJE = new Date("2026-11-21T12:00:00Z");
const PRAZO = "2026-11-26";
const TETO = 15000;

function oferta(total: number, prazo: string, frete = 0): Oferta {
  return {
    preco_unitario: total / 2000,
    preco_total: total,
    frete_valor: frete,
    total_com_frete: total + frete,
    frete: frete ? `${frete} reais` : "por conta do fornecedor",
    prazo_entrega: prazo,
    pagamento: "pix",
    faltando: [],
    completa: true,
  };
}
const entrada = (id: string, o: Oferta, extra: Partial<EntradaComparacao> = {}): EntradaComparacao => ({
  id,
  nome: `Fornecedor ${id}`,
  oferta: o,
  status: "encerrada",
  ...extra,
});

test("caso da demo: A 14.200 na quarta, B mais barato na sexta → recomenda A, B fora do prazo", () => {
  const c = comparar([entrada("a", oferta(14200, "2026-11-25")), entrada("b", oferta(13000, "2026-11-27"))], PRAZO, TETO);
  assert.equal(c.recomendada, "a");
  assert.deepEqual(c.avaliadas[0].marcas, ["recomendada"]);
  assert.deepEqual(c.avaliadas[1].marcas, ["fora_do_prazo"]);
  assert.equal(c.avaliadas[1].motivo, "entrega depois do prazo");
  assert.equal(
    fraseRecomendacao(c, HOJE),
    "O A sai por catorze mil e duzentos reais, com entrega na quarta. O B é mais barato, mas só entrega na sexta. Fecho com o A?",
  );
});

test("o frete conta no total: o mais barato sem frete perde para o outro", () => {
  const c = comparar([entrada("a", oferta(12400, "2026-11-25")), entrada("b", oferta(12000, "2026-11-25", 600))], PRAZO, TETO);
  assert.equal(c.recomendada, "a");
  assert.match(fraseRecomendacao(c, HOJE), /O B sai mais caro, por doze mil e seiscentos reais\./);
});

test("acima do teto é descartada, mesmo no prazo", () => {
  const c = comparar([entrada("a", oferta(15600, "2026-11-25")), entrada("b", oferta(14800, "2026-11-26"))], PRAZO, TETO);
  assert.equal(c.recomendada, "b");
  assert.deepEqual(c.avaliadas[0].marcas, ["acima_do_teto"]);
  assert.match(fraseRecomendacao(c, HOJE), /O A pediu quinze mil e seiscentos reais, acima do seu limite\. Fecho com o B\?$/);
});

test("entrega no próprio dia do prazo vale", () => {
  const c = comparar([entrada("a", oferta(14000, PRAZO))], PRAZO, TETO);
  assert.equal(c.recomendada, "a");
});

test("sem oferta: indisponível e recusada são descartadas com o motivo", () => {
  const c = comparar(
    [
      entrada("a", { faltando: ["preco_unitario"], completa: false }, { indisponivel: { motivo: "sem estoque" } }),
      entrada("b", { faltando: ["preco_unitario"], completa: false }, { status: "recusada" }),
    ],
    PRAZO,
    TETO,
  );
  assert.equal(c.recomendada, undefined);
  assert.equal(fraseRecomendacao(c, HOJE), "O A não tem oferta: sem estoque. O B não atendeu. Nenhum serviu. Quer que eu cancele a compra?");
});

test("máquina de estados: A termina → B toca; B termina → ofertas coletadas → aprovação → fechada", () => {
  resetar();
  resetarCompra();
  assert.equal(compra().estado, "CRIADA");
  assert.equal(iniciarLigacoes().ok, true);
  assert.equal(compra().estado, "LIGANDO_A");
  assert.equal(ligacao("a")!.status, "tocando");

  avancar(); // A ainda não terminou
  assert.equal(compra().estado, "LIGANDO_A");
  const a = ligacao("a")!;
  a.oferta = oferta(14200, "2026-11-25");
  finalizar(a, "oferta coletada");
  avancar();
  assert.equal(compra().estado, "LIGANDO_B");
  assert.equal(ligacao("b")!.status, "tocando");
  assert.equal(ligacao("a")!.status, "encerrada", "A continua encerrada para o celular dele desligar");

  const b = ligacao("b")!;
  b.oferta = oferta(13000, "2026-11-27");
  finalizar(b, "oferta coletada");
  avancar();
  assert.equal(compra().estado, "OFERTAS_COLETADAS");
  assert.equal(compra().comparacao?.recomendada, "a");

  assert.match(produtorAtendeu()!, /Fecho com o A\?$/);
  assert.equal(compra().estado, "AGUARDANDO_APROVACAO");
  const negado = aprovarOferta("b");
  assert.equal(negado.ok, false);
  assert.match(negado.fala!, /Com o B não dá: entrega depois do prazo\. Fecho com o A\?/);
  assert.equal(compra().estado, "AGUARDANDO_APROVACAO");

  const ok = aprovarOferta("a");
  assert.equal(ok.ok, true);
  assert.equal(compra().estado, "FECHADA");
  assert.equal(compra().fechada_com, "a");
  assert.equal(cancelarTarefa().ok, false, "não cancela compra fechada");
  assert.deepEqual(
    compra().historico.map((h) => h.estado),
    ["CRIADA", "LIGANDO_A", "LIGANDO_B", "OFERTAS_COLETADAS", "AGUARDANDO_APROVACAO", "FECHADA"],
  );
});

test("não aprova antes de ter as ofertas", () => {
  resetarCompra();
  iniciarLigacoes();
  assert.equal(aprovarOferta("a").ok, false);
  assert.equal(compra().estado, "LIGANDO_A");
});

test("fornecedor A recusa a chamada → B toca", () => {
  resetarCompra();
  iniciarLigacoes();
  ligacao("a")!.status = "recusada";
  avancar();
  assert.equal(compra().estado, "LIGANDO_B");
});

test("o fornecedor que o produtor disse vale mais que o do modelo", () => {
  assert.equal(fornecedorNomeado("Fecha com o B então."), "b");
  assert.equal(fornecedorNomeado("fecha com o bê"), "b");
  assert.equal(fornecedorNomeado("Tá, fecha com o A."), "a");
  assert.equal(fornecedorNomeado("pode fechar o A"), "a");
  assert.equal(fornecedorNomeado("Fecha."), undefined);
  assert.equal(fornecedorNomeado("Fecha com o adubo"), undefined);
  assert.equal(fornecedorNomeado("pode fechar"), undefined);
});
