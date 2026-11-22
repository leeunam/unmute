// A compra do produtor: liga para A, depois para B, compara e espera a aprovação.
// Quem anda com o estado e quem compara é este código, sem LLM.
//
//   CRIADA → LIGANDO_A → LIGANDO_B → OFERTAS_COLETADAS → AGUARDANDO_APROVACAO → FECHADA | CANCELADA
//
// OFERTAS_COLETADAS: a comparação está pronta e a tela do produtor toca.
// AGUARDANDO_APROVACAO: o produtor atendeu e ouviu a recomendação.
// avancar() é idempotente e roda a cada consulta das telas e no fim de cada turno do negociador.
import { FORNECEDORES } from "./fornecedores";
import { ligacao, novaLigacao, reaisFalado, resetarLigacoes, visaoProdutor, type Ligacao, type Oferta } from "./negociacao";
import { porExtenso } from "./tarefa";

export type EstadoCompra =
  | "CRIADA"
  | "LIGANDO_A"
  | "LIGANDO_B"
  | "OFERTAS_COLETADAS"
  | "AGUARDANDO_APROVACAO"
  | "FECHADA"
  | "CANCELADA";

export type Marca = "recomendada" | "fora_do_prazo" | "acima_do_teto" | "sem_oferta";

export type Avaliada = {
  id: string;
  nome: string;
  total?: number; // total com frete
  prazo?: string; // ISO
  marcas: Marca[];
  motivo?: string; // por que foi descartada
};

export type Comparacao = { recomendada?: string; avaliadas: Avaliada[] };

export type EntradaComparacao = {
  id: string;
  nome: string;
  oferta: Oferta;
  indisponivel?: { motivo: string };
  status: string;
};

type Compra = {
  estado: EstadoCompra;
  historico: { estado: EstadoCompra; em: number }[];
  comparacao?: Comparacao;
  frase?: string;
  fechada_com?: string;
};

const g = globalThis as unknown as { __compra?: Compra };
export function compra(): Compra {
  return (g.__compra ??= { estado: "CRIADA", historico: [{ estado: "CRIADA", em: Date.now() }] });
}
export function resetarCompra() {
  g.__compra = undefined;
  resetarLigacoes();
}
function mudar(estado: EstadoCompra) {
  const c = compra();
  c.estado = estado;
  c.historico.push({ estado, em: Date.now() });
}

const letra = (id: string) => id.toUpperCase();
const ligandoPara = (id: string) => `LIGANDO_${letra(id)}` as EstadoCompra;

// ---------- comparação (pura) ----------

/** Descarta sem oferta, fora do prazo e acima do teto; ordena o resto pelo total com frete. */
export function comparar(entradas: EntradaComparacao[], prazoPedido: string, teto: number): Comparacao {
  const avaliadas: Avaliada[] = entradas.map((e) => {
    const o = e.oferta;
    const a: Avaliada = { id: e.id, nome: e.nome, total: o.total_com_frete, prazo: o.prazo_entrega, marcas: [] };
    if (e.indisponivel || !o.completa) {
      a.marcas.push("sem_oferta");
      // Vira frase: "O A não tem oferta: sem estoque." (o motivo vem do modelo, em qualquer forma).
      a.motivo = e.indisponivel
        ? `não tem oferta: ${e.indisponivel.motivo}`
        : e.status === "recusada"
          ? "não atendeu"
          : "não passou a oferta completa";
      return a;
    }
    const motivos: string[] = [];
    if (o.prazo_entrega! > prazoPedido) {
      a.marcas.push("fora_do_prazo");
      motivos.push("entrega depois do prazo");
    }
    if (o.total_com_frete! > teto) {
      a.marcas.push("acima_do_teto");
      motivos.push("acima do teto");
    }
    if (motivos.length) a.motivo = motivos.join(" e ");
    return a;
  });
  const validas = avaliadas
    .filter((a) => a.marcas.length === 0)
    .sort((x, y) => x.total! - y.total! || x.prazo!.localeCompare(y.prazo!));
  const melhor = validas[0];
  if (melhor) melhor.marcas.push("recomendada");
  return { recomendada: melhor?.id, avaliadas };
}

// ---------- a frase da recomendação (números por extenso) ----------

const DIAS = ["no domingo", "na segunda", "na terça", "na quarta", "na quinta", "na sexta", "no sábado"];
/** "na quarta" para os próximos 6 dias; depois, "no dia trinta". */
export function diaFalado(iso: string, hoje = new Date()) {
  const d = new Date(`${iso}T12:00:00Z`);
  const dias = (d.getTime() - hoje.getTime()) / 864e5;
  return dias < 6.5 ? DIAS[d.getUTCDay()] : `no dia ${porExtenso(d.getUTCDate())}`;
}
/** 14200 → "catorze mil e duzentos reais" (sem centavos quando redondo). */
const valor = (n: number) => reaisFalado(n).replace(/\bquatorze\b/g, "catorze");

export function fraseRecomendacao(c: Comparacao, hoje = new Date()): string {
  const rec = c.avaliadas.find((a) => a.id === c.recomendada);
  const outras = c.avaliadas.filter((a) => a.id !== c.recomendada);
  const partes: string[] = [];
  if (rec) partes.push(`O ${letra(rec.id)} sai por ${valor(rec.total!)}, com entrega ${diaFalado(rec.prazo!, hoje)}.`);
  for (const o of outras) {
    const nome = `O ${letra(o.id)}`;
    if (o.marcas.includes("sem_oferta")) partes.push(`${nome} ${o.motivo}.`);
    else if (o.marcas.includes("fora_do_prazo")) {
      const maisBarato = rec && o.total! < rec.total!;
      partes.push(
        maisBarato
          ? `${nome} é mais barato, mas só entrega ${diaFalado(o.prazo!, hoje)}.`
          : `${nome} só entrega ${diaFalado(o.prazo!, hoje)}, depois do prazo.`,
      );
    } else if (o.marcas.includes("acima_do_teto")) partes.push(`${nome} pediu ${valor(o.total!)}, acima do seu limite.`);
    else partes.push(`${nome} sai mais caro, por ${valor(o.total!)}.`);
  }
  partes.push(rec ? `Fecho com o ${letra(rec.id)}?` : "Nenhum serviu. Quer que eu cancele a compra?");
  return partes.join(" ");
}

// ---------- o andamento ----------

const terminou = (l?: Ligacao) => !!l && (l.status === "encerrada" || l.status === "recusada");

/** CRIADA → LIGANDO_A: o celular de A toca. */
export function iniciarLigacoes() {
  const c = compra();
  if (c.estado !== "CRIADA") return { ok: false, erro: `A compra já está em ${c.estado}.` };
  novaLigacao(FORNECEDORES[0].id, "tocando");
  mudar(ligandoPara(FORNECEDORES[0].id));
  return { ok: true };
}

/** Anda a máquina quando a ligação da vez termina. Idempotente. */
export function avancar() {
  const c = compra();
  const i = FORNECEDORES.findIndex((f) => c.estado === ligandoPara(f.id));
  if (i < 0 || !terminou(ligacao(FORNECEDORES[i].id))) return;
  const proximo = FORNECEDORES[i + 1];
  if (proximo) {
    novaLigacao(proximo.id, "tocando");
    mudar(ligandoPara(proximo.id));
    return;
  }
  const ls = FORNECEDORES.map((f) => ligacao(f.id)!);
  c.comparacao = comparar(
    ls.map((l) => ({ id: l.fornecedor.id, nome: l.fornecedor.nome, oferta: l.oferta, indisponivel: l.indisponivel, status: l.status })),
    ls[0].pedido.prazo_entrega,
    ls[0].privado.teto_total,
  );
  c.frase = fraseRecomendacao(c.comparacao);
  mudar("OFERTAS_COLETADAS");
}

/** O produtor atendeu a ligação de volta: o agente fala a recomendação. */
export function produtorAtendeu() {
  const c = compra();
  if (c.estado === "OFERTAS_COLETADAS") mudar("AGUARDANDO_APROVACAO");
  return c.frase;
}

const podeDecidir = () => ["OFERTAS_COLETADAS", "AGUARDANDO_APROVACAO"].includes(compra().estado);

/** Só passa com a compra esperando decisão e uma oferta que não foi descartada. */
export function aprovarOferta(ofertaId: string) {
  const c = compra();
  if (!podeDecidir()) return { ok: false, erro: `Nada para aprovar: a compra está em ${c.estado}.` };
  const id = ofertaId.trim().toLowerCase();
  const a = c.comparacao?.avaliadas.find((x) => x.id === id);
  if (!a) return { ok: false, erro: `Oferta desconhecida: ${ofertaId}.`, fala: c.frase };
  if (a.motivo) {
    const rec = c.comparacao?.recomendada;
    return {
      ok: false,
      erro: `A oferta ${letra(id)} foi descartada: ${a.motivo}.`,
      fala: `Com o ${letra(id)} não dá: ${a.motivo}.` + (rec ? ` Fecho com o ${letra(rec)}?` : " Quer que eu cancele?"),
    };
  }
  c.fechada_com = id;
  mudar("FECHADA");
  return { ok: true, fala: `Pronto, compra fechada com o ${letra(id)}, ${a.nome}, por ${valor(a.total!)}. Obrigado!` };
}

// "fecha com o B", "o bê", "fornecedor A": o fornecedor que o produtor disse vale mais que o do modelo.
const NOMEADO = /(?:^|\s)(?:com|o|do|no|pro|fornecedor)\s+(?:o\s+)?(a|á|b|bê)(?=[\s.,!?]|$)/i;
export function fornecedorNomeado(fala: string): string | undefined {
  const m = fala.match(NOMEADO)?.[1].toLowerCase();
  return m ? (m.startsWith("b") ? "b" : "a") : undefined;
}

export function cancelarTarefa() {
  const c = compra();
  if (c.estado === "FECHADA" || c.estado === "CANCELADA") return { ok: false, erro: `A compra já está ${c.estado}.` };
  mudar("CANCELADA");
  return { ok: true, fala: "Tudo bem, cancelei a compra. Não fechei com ninguém." };
}

/** Bloco do prompt do agente de aprovação: as ofertas e a recomendação, já decididas pelo código. */
export function contextoAprovacao() {
  const c = compra();
  const linhas = (c.comparacao?.avaliadas ?? []).map((a) => {
    const l = ligacao(a.id)!;
    const o = l.oferta;
    return `- oferta_id "${a.id}" (${letra(a.id)}, ${a.nome}): ${a.total !== undefined ? `total ${a.total} reais com frete` : "sem total"}, entrega ${o.prazo_entrega ?? "–"}, frete ${o.frete ?? "–"}, pagamento ${o.pagamento ?? "–"}. ${a.motivo ? `DESCARTADA: ${a.motivo}.` : a.marcas.includes("recomendada") ? "RECOMENDADA." : "válida."}`;
  });
  return [
    `ESTADO DA COMPRA: ${c.estado}${c.fechada_com ? ` com ${letra(c.fechada_com)}` : ""}.`,
    "OFERTAS (do sistema, é a verdade):",
    ...linhas,
    `Você já disse ao produtor: "${c.frase}"`,
  ].join("\n");
}

/** Para a tela do produtor. */
export function visaoCompra() {
  avancar();
  const c = compra();
  return {
    estado: c.estado,
    historico: c.historico,
    comparacao: c.comparacao,
    frase: c.frase,
    fechada_com: c.fechada_com,
    ligacoes: FORNECEDORES.map((f) => ligacao(f.id)).filter((l): l is Ligacao => !!l).map(visaoProdutor),
  };
}
