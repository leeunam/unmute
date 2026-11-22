// Tarefa do produtor: estado em memória, validação e normalização.
// Quem decide se a tarefa está completa é este código, não o modelo.
// A Agora só manda texto de volta (nunca as tool calls), então o estado vive
// aqui e entra no prompt a cada turno.
import { z } from "zod";

// Todos opcionais: a tool recebe só o que o produtor disse neste turno e o
// código junta com o que já tinha.
export const criarTarefaSchema = z.object({
  produto: z.string().optional().describe('O que o produtor quer comprar, como ele disse (ex.: "combustível", "diesel S10")'),
  quantidade: z.number().optional().describe("Quantidade numérica (dois mil → 2000)"),
  unidade: z.string().optional().describe('Unidade da quantidade (ex.: "litros", "sacos", "toneladas")'),
  prazo_entrega: z.string().optional().describe('Prazo exatamente como o produtor falou (ex.: "até quinta", "amanhã", "dia 30")'),
  teto_total: z.number().optional().describe("Valor máximo total em reais inteiros (quinze mil → 15000)"),
  local_entrega: z.string().optional().describe("Onde entregar, só se o produtor disser"),
  observacoes: z.string().optional().describe("Só se o produtor pedir algo a mais. Nunca invente."),
});
export type EntradaTarefa = z.infer<typeof criarTarefaSchema>;

export type Tarefa = {
  produto?: string;
  quantidade?: number;
  unidade?: string;
  prazo_falado?: string;
  prazo_entrega?: string; // ISO yyyy-mm-dd
  teto_total?: number;
  local_entrega?: string;
  observacoes?: string;
};

type Fala = { quem: "produtor" | "agente"; texto: string };

type Estado = {
  tarefa: Tarefa;
  faltando: string[];
  completa: boolean;
  confirmacao?: string;
  conversa: Fala[];
  atualizado: number;
};

// Perfil fixo do produtor da demo (como os fornecedores fixos no código).
// Evita perguntar o endereço sem inventar um.
const PERFIL = { local_entrega: "na sede da fazenda" };

const OBRIGATORIOS = ["produto", "quantidade", "unidade", "prazo_entrega", "teto_total"] as const;

const g = globalThis as unknown as { __tarefa?: Estado };
function novo(): Estado {
  return { tarefa: {}, faltando: [...OBRIGATORIOS], completa: false, conversa: [], atualizado: Date.now() };
}
export function estado(): Estado {
  return (g.__tarefa ??= novo());
}
export function resetar() {
  g.__tarefa = novo();
}
export function registrarConversa(conversa: Fala[]) {
  const e = estado();
  e.conversa = conversa;
  e.atualizado = Date.now();
}

// ---------- prazo relativo → data (America/Sao_Paulo) ----------

const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function hojeSP(): Date {
  const [a, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()).split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d));
}
const iso = (d: Date) => d.toISOString().slice(0, 10);
const mais = (d: Date, dias: number) => new Date(d.getTime() + dias * 864e5);
const semAcento = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function normalizarPrazo(falado: string, hoje = hojeSP()): string | null {
  const s = semAcento(falado);
  if (/\b(hoje)\b/.test(s)) return iso(hoje);
  if (/depois de amanha/.test(s)) return iso(mais(hoje, 2));
  if (/\bamanha\b/.test(s)) return iso(mais(hoje, 1));
  const dm = s.match(/\b(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*\/\s*(\d{2,4}))?/);
  if (dm) {
    let ano = dm[3] ? Number(dm[3]) : hoje.getUTCFullYear();
    if (ano < 100) ano += 2000;
    let d = new Date(Date.UTC(ano, Number(dm[2]) - 1, Number(dm[1])));
    if (!dm[3] && d < hoje) d = new Date(Date.UTC(ano + 1, Number(dm[2]) - 1, Number(dm[1])));
    return iso(d);
  }
  const dia = s.match(/\bdia (\d{1,2})\b/);
  if (dia) {
    const n = Number(dia[1]);
    let d = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), n));
    if (d < hoje) d = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() + 1, n));
    return iso(d);
  }
  const semanas = s.match(/\b(\d+|uma|duas) semanas?\b/);
  if (semanas) return iso(mais(hoje, 7 * ({ uma: 1, duas: 2 }[semanas[1]] ?? Number(semanas[1]))));
  if (/semana que vem|proxima semana/.test(s) && !DIAS.some((d) => s.includes(semAcento(d)))) return iso(mais(hoje, 7));
  for (let i = 0; i < 7; i++) {
    if (new RegExp(`\\b${semAcento(DIAS[i])}`).test(s)) {
      let delta = (i - hoje.getUTCDay() + 7) % 7 || 7;
      if (/que vem|proxim/.test(s) && delta < 7) delta += 7;
      return iso(mais(hoje, delta));
    }
  }
  return null;
}

// ---------- números por extenso (pt-BR) ----------

const UNI = ["zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
const DEZ = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const CEN = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

function ate999(n: number): string {
  if (n < 20) return UNI[n];
  if (n < 100) return DEZ[Math.floor(n / 10)] + (n % 10 ? ` e ${UNI[n % 10]}` : "");
  if (n === 100) return "cem";
  return CEN[Math.floor(n / 100)] + (n % 100 ? ` e ${ate999(n % 100)}` : "");
}

export function porExtenso(n: number): string {
  n = Math.round(n);
  if (n < 1000) return ate999(n);
  if (n < 1_000_000) {
    const mil = Math.floor(n / 1000);
    const resto = n % 1000;
    const cabeca = mil === 1 ? "mil" : `${ate999(mil)} mil`;
    if (!resto) return cabeca;
    // "dois mil e quinhentos", "dois mil quatrocentos e dez"
    const liga = resto < 100 || resto % 100 === 0 ? " e " : " ";
    return cabeca + liga + ate999(resto);
  }
  const mi = Math.floor(n / 1_000_000);
  const resto = n % 1_000_000;
  const cabeca = mi === 1 ? "um milhão" : `${ate999(mi)} milhões`;
  return resto ? `${cabeca} e ${porExtenso(resto)}` : cabeca;
}

function dataFalada(isoData: string): string {
  const d = new Date(`${isoData}T00:00:00Z`);
  const dia = DIAS[d.getUTCDay()];
  const nomeDia = d.getUTCDay() === 0 || d.getUTCDay() === 6 ? dia : `${dia}-feira`;
  const mes = d.getUTCMonth() === hojeSP().getUTCMonth() ? "" : ` de ${MESES[d.getUTCMonth()]}`;
  return `${nomeDia}, dia ${d.getUTCDate() === 1 ? "primeiro" : porExtenso(d.getUTCDate())}${mes}`;
}

// ---------- a tool ----------

const COMBUSTIVEL = /combust|diesel|gasolin|etanol|alcool|oleo/;

const PERGUNTA: Record<string, (t: Tarefa) => string> = {
  produto: () => "O que o senhor precisa comprar?",
  quantidade: (t) => (t.unidade ? `Quantos ${t.unidade}?` : "Quanto o senhor precisa?"),
  unidade: () => "Em que medida? Litros, sacos, toneladas?",
  prazo_entrega: () => "Pra quando o senhor precisa?",
  teto_total: () => "Até quanto o senhor topa pagar no total?",
};

export function aplicarCriarTarefa(entrada: EntradaTarefa) {
  const e = estado();
  const t = e.tarefa;
  const erros: string[] = [];
  const limpo = (v?: string) => (v && v.trim() ? v.trim() : undefined);

  if (limpo(entrada.produto)) t.produto = limpo(entrada.produto);
  if (entrada.quantidade && entrada.quantidade > 0) t.quantidade = entrada.quantidade;
  if (limpo(entrada.unidade)) t.unidade = limpo(entrada.unidade);
  if (!t.unidade && t.produto && COMBUSTIVEL.test(semAcento(t.produto))) t.unidade = "litros";
  if (entrada.teto_total) {
    // "15 mil" virando 15 é erro comum do modelo.
    if (entrada.teto_total < 100) erros.push(`teto_total=${entrada.teto_total} parece estar em milhares. Mande em reais inteiros (quinze mil → 15000).`);
    else t.teto_total = entrada.teto_total;
  }
  if (limpo(entrada.prazo_entrega)) {
    const data = normalizarPrazo(entrada.prazo_entrega!);
    if (data) {
      t.prazo_falado = entrada.prazo_entrega!.trim();
      t.prazo_entrega = data;
    } else erros.push(`Não entendi o prazo "${entrada.prazo_entrega}". Pergunte o dia da entrega.`);
  }
  if (limpo(entrada.local_entrega)) t.local_entrega = limpo(entrada.local_entrega);
  if (limpo(entrada.observacoes)) t.observacoes = limpo(entrada.observacoes);

  e.faltando = OBRIGATORIOS.filter((k) => t[k] === undefined);
  e.completa = e.faltando.length === 0 && erros.length === 0;
  e.atualizado = Date.now();

  if (!e.completa) {
    const proximo = e.faltando[0];
    e.confirmacao = undefined;
    return {
      ok: false,
      erro: [...erros, e.faltando.length ? `Tarefa incompleta. Falta: ${e.faltando.join(", ")}.` : ""].filter(Boolean).join(" "),
      pergunte_ao_produtor: proximo ? PERGUNTA[proximo](t) : undefined,
    };
  }

  const local = t.local_entrega ?? PERFIL.local_entrega;
  e.confirmacao =
    `Então ficou assim: ${porExtenso(t.quantidade!)} ${t.unidade} de ${t.produto}, ` +
    `entregue até ${dataFalada(t.prazo_entrega!)}, ${local}, ` +
    `pagando no máximo ${porExtenso(t.teto_total!)} reais. Posso ligar pros fornecedores?`;
  return { ok: true, tarefa_completa: true, confirmacao: e.confirmacao };
}

/** Bloco que entra no prompt a cada turno: o modelo não vê as tool calls antigas. */
export function estadoParaPrompt(): string {
  const e = estado();
  const t = e.tarefa;
  const campos = Object.keys(t).length ? JSON.stringify(t) : "(vazia)";
  return [
    "ESTADO ATUAL DA TAREFA (do sistema, é a verdade):",
    `Campos: ${campos}`,
    e.completa ? `Tarefa COMPLETA. Confirmação já calculada: "${e.confirmacao}"` : `Falta: ${e.faltando.join(", ")}.`,
  ].join("\n");
}

export const PROMPT_PRODUTOR = `Agora você está anotando o pedido de compra do produtor.
Regras:
- Sempre que o produtor disser qualquer dado do pedido (produto, quantidade, prazo, valor máximo, local), chame a ferramenta criar_tarefa ANTES de responder, só com os dados novos que ele disse.
- Não diga nada antes de chamar a ferramenta e nunca fale sobre a ferramenta.
- Passe o prazo exatamente como ele falou ("até quinta"). Valores em reais inteiros (quinze mil → 15000). Quantidade em número (dois mil → 2000).
- Nunca invente nada. Só preencha observacoes se o produtor pedir algo a mais.
- Se a ferramenta devolver erro, faça ao produtor só a pergunta de pergunte_ao_produtor, curta.
- Se a ferramenta devolver confirmacao, fale a confirmação exatamente como veio, sem mudar números.
- Se a tarefa já está completa e o produtor concordar ("isso", "pode", "fecha"), diga em uma frase que vai ligar pros fornecedores e volta com a melhor proposta. Não chame a ferramenta de novo.`;
