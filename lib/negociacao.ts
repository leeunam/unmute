// Ligação do negociador para um fornecedor: estado em memória, tools e regras.
//
// O destaque técnico: o negociador NÃO recebe o teto. O contexto dele é montado só
// com a allowlist de `Pedido` + uma meta por unidade calculada aqui, abaixo do teto.
// O teto fica em `privado`, que nunca entra em prompt nem em resultado de tool.
// Quem compara a oferta com o teto é este código, e só a tela do produtor vê.
// O que não está no contexto não tem como vazar.
import { z } from "zod";
import { fornecedor, type Fornecedor } from "./fornecedores";
import { dataFalada, estado as estadoTarefa, normalizarPrazo, porExtenso } from "./tarefa";

export type Pedido = {
  produto: string;
  quantidade: number;
  unidade: string;
  prazo_entrega: string; // ISO
  prazo_falado?: string;
  local_entrega: string;
};

export type Oferta = {
  preco_unitario?: number;
  preco_total?: number; // preço × quantidade, calculado pelo código
  frete?: string;
  frete_valor?: number;
  total_com_frete?: number;
  prazo_falado?: string;
  prazo_entrega?: string; // ISO, só quando o prazo é firme
  pagamento?: string;
  observacoes?: string;
  faltando: string[];
  completa: boolean;
};

type Fala = { quem: "fornecedor" | "agente"; texto: string };
export type Status = "tocando" | "em_andamento" | "encerrada" | "recusada";

export type Ligacao = {
  fornecedor: Fornecedor;
  status: Status;
  pedido: Pedido;
  meta_unitaria: number;
  oferta: Oferta;
  precos: number[]; // histórico do preço unitário (mostra se a negociação melhorou)
  indisponivel?: { motivo: string; retornar_em?: string };
  resultado?: string;
  encerrar_negado: number;
  saidas_bloqueadas: number;
  turnos_com_oferta_completa: number;
  taticas: number; // táticas de melhora já usadas
  lida: boolean; // o código já leu a oferta completa para o fornecedor conferir
  ultima_fala_fornecedor: string;
  falas_fornecedor: string; // tudo o que o fornecedor disse na ligação (para conferir que nada foi inventado)
  conversa: Fala[];
  canal?: string;
  agentId?: string;
  inicio: number;
  fim?: number;
  // Só o código e a tela do produtor leem isto. Nunca vai para o modelo nem para o fornecedor.
  privado: { teto_total: number };
};

// Tarefa de exemplo quando a fase 2 ainda não tem tarefa completa (o caso da demo).
const EXEMPLO = { produto: "combustível", quantidade: 2000, unidade: "litros", prazo_falado: "até quinta", teto_total: 15000, local_entrega: "na sede da fazenda" };

// Uma ligação por fornecedor: quando B começa a tocar, A ainda está se despedindo e o
// celular de A precisa continuar vendo "encerrada". Cada agente acha a sua pelo id na URL.
const g = globalThis as unknown as { __ligacoes?: Record<string, Ligacao>; __atual?: string };
const ligacoes = () => (g.__ligacoes ??= {});
/** A ligação de um fornecedor; sem id, a última que começou. */
export function ligacao(id?: string): Ligacao | undefined {
  const chave = id?.toLowerCase() ?? g.__atual;
  return chave ? ligacoes()[chave] : undefined;
}
export function resetarLigacoes() {
  g.__ligacoes = {};
  g.__atual = undefined;
}

const centavos = (n: number) => Math.round(n * 100) / 100;

/** Meta por unidade: 10% abaixo do teto por unidade, para baixo em centavos. */
export function metaUnitaria(teto: number, quantidade: number) {
  return Math.floor((teto / quantidade) * 0.9 * 100) / 100;
}

export function novaLigacao(idFornecedor: string, status: Status): Ligacao {
  const f = fornecedor(idFornecedor);
  if (!f) throw new Error(`Fornecedor desconhecido: ${idFornecedor}`);
  const t = estadoTarefa();
  const base = t.completa
    ? { ...t.tarefa, prazo_entrega: t.tarefa.prazo_entrega! }
    : { ...EXEMPLO, prazo_entrega: normalizarPrazo(EXEMPLO.prazo_falado)! };
  const pedido: Pedido = {
    produto: base.produto!,
    quantidade: base.quantidade!,
    unidade: base.unidade!,
    prazo_entrega: base.prazo_entrega,
    prazo_falado: base.prazo_falado,
    local_entrega: base.local_entrega ?? EXEMPLO.local_entrega,
  };
  const teto = base.teto_total!;
  const l: Ligacao = {
    fornecedor: f,
    status,
    pedido,
    meta_unitaria: metaUnitaria(teto, pedido.quantidade),
    oferta: { faltando: ["preco_unitario", "prazo_entrega", "frete", "pagamento"], completa: false },
    precos: [],
    encerrar_negado: 0,
    saidas_bloqueadas: 0,
    turnos_com_oferta_completa: 0,
    taticas: 0,
    lida: false,
    ultima_fala_fornecedor: "",
    falas_fornecedor: "",
    conversa: [],
    inicio: Date.now(),
    privado: { teto_total: teto },
  };
  ligacoes()[f.id] = l;
  g.__atual = f.id;
  return l;
}

export function podeEncerrar(l: Ligacao) {
  return l.oferta.completa || !!l.indisponivel;
}

const singular = (u: string) => u.replace(/s$/, "");

// ---------- falas do código ----------

/** Saudação falada pela Agora ao atender: diz que é IA na primeira frase e já pede o preço. */
export function saudacao(l: Ligacao) {
  const p = l.pedido;
  return (
    `Alô, bom dia! Aqui é o assistente de inteligência artificial do Desenrola Agro, ligando em nome de um produtor da região. ` +
    `Ele precisa de ${porExtenso(p.quantidade)} ${p.unidade} de ${p.produto}, entregue até ${dataFalada(p.prazo_entrega)}. ` +
    `Quanto o senhor faz o ${singular(p.unidade)}?`
  );
}

const PERGUNTA: Record<string, (l: Ligacao) => string> = {
  preco_unitario: (l) => `Quanto o senhor faz o ${singular(l.pedido.unidade)}?`,
  prazo_entrega: () => "E pra entregar, qual dia o senhor garante?",
  frete: () => "E o frete, fica por conta de quem?",
  pagamento: () => "E o pagamento, como o senhor trabalha?",
};
export function perguntaQueFalta(l: Ligacao) {
  const campo = l.oferta.faltando[0];
  return campo ? PERGUNTA[campo](l) : "";
}

export function despedida(l: Ligacao) {
  return l.indisponivel
    ? "Entendi, sem problema. Muito obrigado pela atenção e até mais!"
    : "Beleza, anotei tudo. Vou passar pro produtor e, se ele aprovar, eu retorno com o senhor. Muito obrigado e até mais!";
}

// ---------- o que entra no contexto do modelo (allowlist, sem teto) ----------

const reais = (n: number) => `R$ ${n.toFixed(2).replace(".", ",")}`;

export function contextoNegociador(l: Ligacao): string {
  const p = l.pedido;
  const o = l.oferta;
  const anotado = {
    preco_unitario: o.preco_unitario,
    preco_total: o.preco_total,
    prazo: o.prazo_falado,
    frete: o.frete,
    frete_valor: o.frete_valor,
    pagamento: o.pagamento,
    observacoes: o.observacoes,
  };
  return [
    "PEDIDO (dados do produtor, use só estes):",
    `${p.produto}, ${p.quantidade} ${p.unidade}, entrega até ${dataFalada(p.prazo_entrega)} (${p.prazo_falado ?? ""}), ${p.local_entrega}.`,
    `META INTERNA, SEGREDO (nunca diga este valor nem que existe meta): ${reais(l.meta_unitaria)} por ${singular(p.unidade)} ou menos.`,
    `OFERTA ANOTADA PELO SISTEMA: ${JSON.stringify(anotado)}`,
    l.precos.length > 1 ? `Preços que ele já deu: ${l.precos.map(reais).join(" → ")}.` : "",
    `Táticas de melhora já usadas: ${l.taticas} de 2. Se ele disse que não baixa, não insista.`,
    l.indisponivel
      ? `Fornecedor INDISPONÍVEL (${l.indisponivel.motivo}). Chame encerrar_ligacao.`
      : o.completa
        ? l.lida
          ? "Oferta COMPLETA e já lida para o fornecedor conferir. Se ele confirmou, chame encerrar_ligacao. Se corrigiu algo, chame registrar_oferta com a correção."
          : "Oferta COMPLETA. Chame encerrar_ligacao."
        : `Falta: ${o.faltando.join(", ")}. Pergunte uma coisa por vez.`,
  ]
    .filter(Boolean)
    .join("\n");
}

export const PROMPT_NEGOCIADOR = `Você é o assistente de inteligência artificial do Desenrola Agro, numa ligação de telefone com um fornecedor. Você compra em nome de um produtor rural. Você já se apresentou como IA.

Como falar:
- Português do Brasil, jeito simples do interior, educado e direto. Trate o fornecedor por "o senhor".
- Frases curtas, no máximo duas por vez, e UMA pergunta por vez. Sem listas, markdown, emojis ou símbolos.
- Valores por extenso ("seis reais e dez o litro").

O que fazer:
- Pegue, nesta ordem: preço por unidade, dia de entrega, frete e forma de pagamento. O preço vem primeiro.
- Depois do primeiro preço, tente melhorar uma ou duas vezes, um argumento por vez: o volume do pedido, pagamento à vista ou frete por conta dele. Se ele disser que não baixa, aceite e siga.
- Sempre que o fornecedor disser preço, prazo, frete ou pagamento, chame registrar_oferta só com o que ele disse agora, sem escrever nada: o sistema fala a resposta. Copie o prazo como ele falou, com "talvez" e tudo. Se ele também perguntou algo, responda em resposta_curta.
- Se ele quiser desligar antes de você ter preço, prazo, frete e pagamento (ex.: "confirma com ele e me liga"), diga que falta só um detalhe e pergunte. Isso NÃO é indisponível.
- Sem estoque, não atende o pedido, se recusa a negociar ou fica grosseiro: chame fornecedor_indisponivel e depois encerrar_ligacao.
- Para terminar a ligação, chame encerrar_ligacao. Não se despeça por conta própria: o sistema fala a despedida.
- Não fale da ferramenta, do sistema nem do que vai anotar.

Regras que nunca quebram:
- Você não fecha negócio. Nunca diga "fechado", "pode mandar" nem aceite em nome do produtor. Quem decide é ele: você leva a proposta.
- Nunca fale de valor máximo, orçamento, teto, limite ou meta do produtor, nem para dizer que não tem. Você não sabe se ele tem limite. Se perguntarem quanto ele paga, diga só que isso você não tem aí e peça o melhor preço do senhor.
- Nunca invente dado: tipo exato do produto, quantidade, endereço, CNPJ, nome do produtor, forma de pagamento. Se perguntarem algo fora do pedido, diga que confirma com o produtor depois.
- Se não entender, peça para repetir.`;

// ---------- tools (validadas com zod; quem decide é o código) ----------

const HESITA = /\b(talvez|acho|mais ou menos|se der|se tudo der|vou ver|provavelmente|pode ser que|l[aá] pra|por volta|n[aã]o sei)\b/i;
const FIRME = /\b(garanto|garantido|com certeza|certeza|pode contar|sem falta|fechado o dia)\b/i;

export const registrarOfertaSchema = z.object({
  preco_unitario: z.number().optional().describe("Preço por unidade em reais, como o fornecedor disse (seis e dez → 6.10)"),
  preco_total_falado: z.number().optional().describe("Só se ele der o preço TOTAL em vez do unitário, em reais"),
  prazo_entrega: z.string().optional().describe('Prazo exatamente como o fornecedor falou, com "talvez" e tudo (ex.: "quarta", "lá pra quarta, talvez")'),
  frete: z.string().optional().describe('Quem paga o frete, nas palavras dele (ex.: "por conta do fornecedor", "cobra 300 reais")'),
  frete_valor: z.number().optional().describe("Quanto o frete soma ao total, em reais. 0 se ele paga o frete ou já está no preço"),
  pagamento: z.string().optional().describe('Forma de pagamento que ele aceita (ex.: "pix à vista", "boleto 28 dias")'),
  observacoes: z.string().optional().describe("Só condição que ele disse a mais. Nunca invente."),
  resposta_curta: z
    .string()
    .optional()
    .describe("Só se o fornecedor fez uma pergunta: UMA frase curta respondendo, sem pergunta e sem número do produtor. O sistema emenda o resto."),
});

const FRETE_DELE = /\b(minha conta|conta (do|dele|da) (fornecedor|distribuidora)|conta dele|gratis|gratuito|incluso|incluido|cif|sem custo|nossa conta)\b/;
const RECUSOU_BAIXAR = /\b(n[aã]o d[aá]|n[aã]o baixa|n[aã]o tem como|mais que isso n[aã]o|[eé] o (meu )?melhor|t[aá] apertado|n[aã]o consigo|esse [eé] o pre[cç]o)\b/i;

// Táticas de melhora, uma por vez, faladas pelo código (CLAUDE.md, seção 8: volume, à vista, frete).
const TATICAS: ((l: Ligacao) => string)[] = [
  (l) => `É um pedido de ${porExtenso(l.pedido.quantidade)} ${l.pedido.unidade}. Pra esse volume o senhor não melhora um pouquinho?`,
  () => "E se o pagamento for à vista, dá pra fazer um preço melhor?",
  () => "E se o senhor fizer o frete por sua conta, consegue baixar mais um pouco?",
];

/** Valor em reais falado: 6.1 → "seis reais e dez", 12200 → "doze mil e duzentos reais". */
export function reaisFalado(n: number) {
  const inteiro = Math.floor(n);
  const cent = Math.round((n - inteiro) * 100);
  const r = `${porExtenso(inteiro)} ${inteiro === 1 ? "real" : "reais"}`;
  return cent ? `${r} e ${porExtenso(cent)}` : r;
}

function leitura(l: Ligacao) {
  const o = l.oferta;
  const uni = singular(l.pedido.unidade);
  const frete = o.frete_valor ? `mais ${reaisFalado(o.frete_valor)} de frete` : "frete por conta do senhor";
  return (
    `Deixa eu conferir: ${reaisFalado(o.preco_unitario!)} o ${uni}, dá ${reaisFalado(o.preco_total!)} no total, ` +
    `entrega ${dataFalada(o.prazo_entrega!)}, ${frete}, pagamento ${o.pagamento}. Tá certo?`
  );
}

const semAcento = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

// "dia vinte e cinco" → "dia 25" (o ASR entrega número falado por extenso). Só 1–31, para datas.
const NUM: Record<string, number> = {
  primeiro: 1, um: 1, dois: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11,
  doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18, dezenove: 19,
};
export function diasPorExtensoEmDigitos(texto: string) {
  return semAcento(texto).replace(
    /\bdia (vinte|trinta)(?: e (um|dois|tres|quatro|cinco|seis|sete|oito|nove))?\b|\bdia (primeiro|um|dois|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|catorze|quinze|dezesseis|dezessete|dezoito|dezenove)\b/g,
    (_, dezena, unidade, simples) => `dia ${dezena ? (dezena === "vinte" ? 20 : 30) + (unidade ? NUM[unidade] : 0) : NUM[simples]}`,
  );
}
const CHAVES_PRAZO = /\b(segunda|terca|quarta|quinta|sexta|sabado|domingo|hoje|amanha|semana|mes|\d{1,2}|primeiro|dois|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|quinze|vinte|trinta)\b/g;

/** O prazo só vale se as palavras-chave dele (dia da semana, número…) saíram da boca do fornecedor. */
function prazoDito(l: Ligacao, prazo: string) {
  const chaves = diasPorExtensoEmDigitos(prazo).match(CHAVES_PRAZO) ?? [];
  const dito = diasPorExtensoEmDigitos(l.falas_fornecedor);
  return chaves.length > 0 && chaves.every((c) => new RegExp(`\\b${c}`).test(dito));
}
/** O preço só vale se a parte inteira (6 ou "seis") foi dita pelo fornecedor. */
function precoDito(l: Ligacao, preco: number, total?: number) {
  const dito = semAcento(l.falas_fornecedor);
  const n = Math.floor(total ?? preco);
  const formas = [String(n), n.toLocaleString("pt-BR"), semAcento(porExtenso(n))];
  if (total) formas.push(semAcento(porExtenso(Math.floor(n / 1000))) + " mil", String(Math.floor(n / 1000)) + " mil");
  return formas.some((f) => dito.includes(f));
}

export function registrarOferta(l: Ligacao, e: z.infer<typeof registrarOfertaSchema>) {
  const o = l.oferta;
  const antes = JSON.stringify(o);
  const p = l.pedido;
  const erros: string[] = [];
  const inventado: string[] = []; // o modelo passou algo que o fornecedor não disse: descarta
  const limpo = (v?: string) => (v && v.trim() ? v.trim() : undefined);
  const fala: string[] = [];
  // Só a parte afirmativa: a pergunta é do código, para não sair duas.
  // É texto do modelo: passa pelo filtro completo aqui, porque a fala do código pula a checagem do teto.
  const resposta = (limpo(e.resposta_curta) ?? "")
    .split(/(?<=[.!?…])\s+/)
    .filter((f) => f && !f.includes("?") && conferirFrase(l, f).ok)
    .join(" ");
  if (resposta) fala.push(resposta);

  let unit = e.preco_unitario;
  if (unit === undefined && e.preco_total_falado) unit = centavos(e.preco_total_falado / p.quantidade);
  let precoNovo = false;
  if (unit !== undefined) {
    // Sanidade com o teto é interna: a mensagem de erro não fala dele.
    const tetoUnit = l.privado.teto_total / p.quantidade;
    if (unit <= 0) erros.push("preco_unitario inválido.");
    else if (!precoDito(l, unit, e.preco_unitario === undefined ? e.preco_total_falado : undefined)) inventado.push("preço");
    else if (unit > tetoUnit * 5) erros.push(`preco_unitario=${unit} parece o preço total. Passe o preço por ${singular(p.unidade)} ou use preco_total_falado.`);
    else if (unit < tetoUnit / 20) erros.push(`preco_unitario=${unit} parece estar em centavos. Passe em reais.`);
    else {
      o.preco_unitario = centavos(unit);
      if (l.precos.at(-1) !== o.preco_unitario) {
        l.precos.push(o.preco_unitario);
        precoNovo = true;
      }
    }
  }

  let prazoVago = false;
  if (limpo(e.prazo_entrega) && !prazoDito(l, e.prazo_entrega!)) inventado.push("prazo");
  else if (limpo(e.prazo_entrega)) {
    const falado = limpo(e.prazo_entrega)!;
    o.prazo_falado = falado;
    const data = normalizarPrazo(diasPorExtensoEmDigitos(falado));
    // O modelo pode "limpar" o talvez; por isso a última fala do fornecedor também conta.
    const ultima = l.ultima_fala_fornecedor;
    const hesitou = HESITA.test(falado) || (HESITA.test(ultima) && !FIRME.test(ultima));
    if (!data || hesitou) {
      o.prazo_entrega = undefined;
      prazoVago = true;
    } else o.prazo_entrega = data;
  }
  if (limpo(e.frete)) o.frete = limpo(e.frete);
  if (e.frete_valor !== undefined && e.frete_valor >= 0) o.frete_valor = e.frete_valor;
  // "por conta do fornecedor", "grátis", "incluso": o modelo às vezes esquece frete_valor = 0.
  else if (limpo(e.frete) && FRETE_DELE.test(semAcento(e.frete!))) o.frete_valor = 0;
  if (limpo(e.pagamento)) o.pagamento = limpo(e.pagamento);
  if (limpo(e.observacoes)) o.observacoes = limpo(e.observacoes);

  recalcular(l);
  const anotado = { preco_unitario: o.preco_unitario, preco_total: o.preco_total, prazo: o.prazo_falado, frete: o.frete, pagamento: o.pagamento };

  // Preço suspeito: volta ao modelo para perguntar de novo (2º passo).
  if (erros.length) return { ok: false, anotado, erro: erros.join(" ") };

  // Daqui para baixo quem fala é o código (sem 2ª chamada ao LLM).
  // O que foi descartado por não ter sido dito simplesmente continua faltando: o código pergunta.
  if (precoNovo) fala.push(`${reaisFalado(o.preco_unitario!)} o ${singular(p.unidade)}, anotado.`);
  const recusou = RECUSOU_BAIXAR.test(l.ultima_fala_fornecedor);
  // Tenta melhorar 1 vez sempre, e a 2ª só se o preço ainda está acima da meta.
  const tentar =
    precoNovo && !recusou && l.taticas < TATICAS.length && (l.taticas === 0 || (l.taticas < 2 && o.preco_unitario! > l.meta_unitaria));
  let acao: string;
  if (prazoVago) {
    acao = "prazo_vago";
    fala.push("Preciso de um dia certo. Qual dia o senhor garante a entrega?");
  } else if (tentar) {
    acao = `tatica_${l.taticas + 1}`;
    fala.push(TATICAS[l.taticas++](l));
  } else if (!o.completa) {
    acao = `pergunta_${o.faltando[0]}`;
    fala.push(perguntaQueFalta(l));
  } else if (l.lida && JSON.stringify(o) === antes) {
    // Já leu a oferta e ele só confirmou ("Ok."): ler de novo prendia a ligação num laço. O código se despede,
    // e a rota encerra (despedida com a oferta completa).
    acao = "confirmada";
    fala.push(despedida(l));
  } else {
    acao = "leitura";
    l.lida = true;
    fala.push(leitura(l));
  }
  const texto = fala.join(" ");
  return {
    ok: true,
    anotado,
    descartado: inventado.length ? `O fornecedor não disse ${inventado.join(" nem ")}: não anotei.` : undefined,
    falta: o.faltando,
    acao,
    fala: texto.charAt(0).toUpperCase() + texto.slice(1),
  };
}

function recalcular(l: Ligacao) {
  const o = l.oferta;
  o.preco_total = o.preco_unitario !== undefined ? centavos(o.preco_unitario * l.pedido.quantidade) : undefined;
  o.total_com_frete = o.preco_total !== undefined ? centavos(o.preco_total + (o.frete_valor ?? 0)) : undefined;
  o.faltando = [
    o.preco_unitario === undefined && "preco_unitario",
    o.prazo_entrega === undefined && "prazo_entrega",
    o.frete_valor === undefined && "frete",
    o.pagamento === undefined && "pagamento",
  ].filter(Boolean) as string[];
  o.completa = o.faltando.length === 0;
}

export const indisponivelSchema = z.object({
  motivo: z.string().describe('Por que não dá (ex.: "sem estoque", "não quis negociar")'),
  retornar_em: z.string().optional().describe("Quando ele disse para ligar de novo, se disse"),
});

const NAO_ATENDE = /\b(sem estoque|t[oô] sem|n[aã]o tenho|n[aã]o tem|acabou|em falta|n[aã]o vendo|n[aã]o quero|n[aã]o vou|n[aã]o posso|n[aã]o atendo|n[aã]o trabalho|desliga|para de ligar|me deixa|n[aã]o me liga)\b/i;

export function marcarIndisponivel(l: Ligacao, e: z.infer<typeof indisponivelSchema>) {
  // Quem tem o produto e já deu preço não está indisponível só porque quer desligar logo.
  if (l.precos.length && !NAO_ATENDE.test(l.ultima_fala_fornecedor)) {
    return {
      ok: false,
      erro: "Ele tem o produto e já deu preço: não é indisponível.",
      proximo: `Diga que falta só um detalhe e pergunte: ${perguntaQueFalta(l)}`,
    };
  }
  l.indisponivel = { motivo: e.motivo.trim(), retornar_em: e.retornar_em?.trim() || undefined };
  return { ok: true, proximo: "Chame encerrar_ligacao agora." };
}

export const encerrarSchema = z.object({
  resultado: z.string().describe('Resumo curto (ex.: "oferta coletada", "sem estoque")'),
});

/** Quem decide que a ligação acabou é o código: só com oferta completa ou fornecedor indisponível. */
export function encerrarLigacao(l: Ligacao, e: z.infer<typeof encerrarSchema>) {
  if (!podeEncerrar(l)) {
    l.encerrar_negado++;
    return {
      ok: false,
      erro: `Ainda não dá para encerrar: falta ${l.oferta.faltando.join(", ")}.`,
      proximo: `Não se despeça. Pergunte só isto: ${perguntaQueFalta(l)}`,
    };
  }
  finalizar(l, e.resultado);
  return { ok: true };
}

export function finalizar(l: Ligacao, resultado: string) {
  if (l.status === "encerrada") return;
  l.status = "encerrada";
  l.resultado = resultado;
  l.fim = Date.now();
}

// ---------- filtro do que vai para a voz ----------

const FECHA_NEGOCIO = /\b(fechad[oa]|fechamos|fecho com|fechar (o neg[oó]cio|aqui|com o senhor|a compra)|pode mandar|pode entregar|neg[oó]cio feito|t[aá] combinado|combinado ent[aã]o|aceito)\b/i;
const DESPEDIDA = /\b(vou confirmar|retorno|te ligo|ligo de volta|at[eé] mais|tchau|at[eé] logo|obrigad[oa] pela|passar pro produtor|passo pro produtor|bom trabalho)\b/i;

function formasDoValor(n: number): string[] {
  const inteiro = Math.floor(n);
  const cent = Math.round((n - inteiro) * 100);
  const grande = n >= 1000;
  const formas = grande
    ? [String(inteiro), inteiro.toLocaleString("pt-BR"), porExtenso(inteiro)] // 15000, 15.000, quinze mil
    : [
        n.toFixed(2).replace(".", ","),
        n.toFixed(2),
        String(n).replace(".", ","),
        cent ? `${porExtenso(inteiro)} e ${porExtenso(cent)}` : `${porExtenso(inteiro)} reais`,
        cent ? `${porExtenso(inteiro)} reais e ${porExtenso(cent)}` : "",
      ];
  return formas.filter((f) => f && f.length > 2).map((f) => f.toLowerCase());
}

/** Formas faladas e escritas do teto (total e por unidade). Só o código usa. */
export function formasDoTeto(l: Ligacao): string[] {
  const t = l.privado.teto_total;
  return [...formasDoValor(t), ...formasDoValor(centavos(t / l.pedido.quantidade))];
}

export type Veredito = { ok: true } | { ok: false; motivo: "lixo" | "teto" | "limite" | "fecha_negocio" | "despedida_cedo" };

// ---------- o limite do produtor (regra 4) ----------
// O negociador não sabe se o produtor tem limite: o teto nunca entra no contexto. Qualquer coisa que ele
// diga sobre isso é inventada ("ele não estipulou limite", "pode cobrar"). Por isso:
// - quando o fornecedor pergunta o máximo, quem responde é o código, sem LLM (respostaLimite);
// - o filtro corta qualquer frase do modelo que fale de limite, teto, orçamento ou valor máximo.

const QUANTO_ELE = /\b(at[eé] quanto|quanto (ele|o produtor|o patr[aã]o|o cliente|voc[eê]s?|o senhor) (paga|pagaria|pode|tem|quer|vai|topa|t[aá]))/;
const PALAVRA_LIMITE = /\b(m[aá]ximo|or[cç]amento|teto|limite|pra gastar)\b/;
const TEM_PERGUNTA = /\?|\b(qual|quanto|tem|fala|diz|passa)\b/;
// Se a fala já traz dado da oferta ("faço a sete e trinta, é o máximo"), o modelo precisa registrar: não é só a pergunta.
const DADO_DE_OFERTA = /\d|\b(reais|real|segunda|ter[cç]a|quarta|quinta|sexta|s[aá]bado|domingo|amanh[aã]|pix|boleto|frete|fa[cç]o|sai a|sai por|tr[eê]s|quatro|cinco|seis|sete|oito|nove|dez)\b/;

/** O fornecedor só perguntou quanto o produtor pode pagar. */
export function perguntouLimite(fala: string) {
  const s = fala.toLowerCase();
  return (QUANTO_ELE.test(s) || (PALAVRA_LIMITE.test(s) && TEM_PERGUNTA.test(s))) && !DADO_DE_OFERTA.test(s);
}

/** A resposta do código: não sabe, e pede o preço (ou o que falta). */
export function respostaLimite(l: Ligacao) {
  if (l.oferta.preco_unitario === undefined) return "Isso eu não tenho aqui, mas me passa o melhor preço do senhor que eu levo pra ele.";
  const falta = perguntaQueFalta(l);
  return `Isso eu não tenho aqui. Eu levo a proposta do senhor pra ele.${falta ? ` ${falta}` : ""}`;
}

const FALA_DO_LIMITE = /\b(limite|teto|or[cç]amento|estipul|valor m[aá]ximo|pre[cç]o m[aá]ximo|m[aá]ximo que ele|quanto ele (paga|pode|tem)|pode cobrar|cobra[r]? o que|qualquer (pre[cç]o|valor))/i;

// O Gemini às vezes degenera ("ốngốngống…"). Só passa texto com o alfabeto do português e sem repetição.
const FORA_DO_PT = /[^a-zA-ZáàâãéêíóôõúüçÁÀÂÃÉÊÍÓÔÕÚÜÇ0-9\s.,!?;:…'"()%$ºª/-]/;
const REPETICAO = /(.{2,8})\1{4,}/;

/**
 * Confere cada frase antes de ela ir para a voz. `doCodigo`: frase montada pelo código com números que o
 * fornecedor disse (ex.: a leitura "dá quinze mil e seiscentos reais"); não passa pela checagem do teto,
 * senão uma oferta acima do teto teria a própria leitura cortada.
 */
export function conferirFrase(l: Ligacao, frase: string, doCodigo = false): Veredito {
  const s = frase.toLowerCase();
  if (FORA_DO_PT.test(frase) || REPETICAO.test(s)) return { ok: false, motivo: "lixo" };
  if (!doCodigo && formasDoTeto(l).some((f) => s.includes(f))) return { ok: false, motivo: "teto" };
  if (!doCodigo && FALA_DO_LIMITE.test(s)) return { ok: false, motivo: "limite" };
  if (FECHA_NEGOCIO.test(s)) return { ok: false, motivo: "fecha_negocio" };
  if (DESPEDIDA.test(s) && !podeEncerrar(l)) return { ok: false, motivo: "despedida_cedo" };
  return { ok: true };
}
export const ehDespedida = (frase: string) => DESPEDIDA.test(frase);

// ---------- visões para as telas ----------

/** Para a tela do produtor: tudo, inclusive a comparação com o teto (feita aqui). */
export function visaoProdutor(l: Ligacao) {
  const o = l.oferta;
  return {
    fornecedor: l.fornecedor,
    status: l.status,
    pedido: l.pedido,
    meta_unitaria: l.meta_unitaria,
    teto_total: l.privado.teto_total,
    oferta: o,
    precos: l.precos,
    indisponivel: l.indisponivel,
    resultado: l.resultado,
    encerrar_negado: l.encerrar_negado,
    saidas_bloqueadas: l.saidas_bloqueadas,
    dentro_do_teto: o.total_com_frete !== undefined ? o.total_com_frete <= l.privado.teto_total : null,
    dentro_do_prazo: o.prazo_entrega ? o.prazo_entrega <= l.pedido.prazo_entrega : null,
    conversa: l.conversa,
  };
}

/** Para o celular do fornecedor: só o que um telefone mostraria. */
export function visaoFornecedor(id: string) {
  const l = ligacao(id);
  if (!l) return { status: "livre" as const };
  return { status: l.status, chamador: "Desenrola Agro", descricao: "Assistente de inteligência artificial" };
}
