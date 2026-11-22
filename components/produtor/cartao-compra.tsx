import { Handshake } from "@phosphor-icons/react/dist/ssr";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Tone } from "@/components/ui/tone-variants";

export type OfertaCompra = {
  preco_unitario?: number;
  total_com_frete?: number;
  frete?: string;
  frete_valor?: number;
  prazo_falado?: string;
  prazo_entrega?: string;
  pagamento?: string;
};
export type LigacaoCompra = {
  fornecedor: { id: string; nome: string };
  status: string;
  oferta: OfertaCompra;
  precos: number[];
  indisponivel?: { motivo: string };
  conversa: { quem: string; texto: string }[];
};
export type Avaliada = { id: string; nome: string; total?: number; prazo?: string; marcas: string[]; motivo?: string };
export type Compra = {
  estado: string;
  comparacao?: { recomendada?: string; avaliadas: Avaliada[] };
  frase?: string;
  fechada_com?: string;
  ligacoes: LigacaoCompra[];
};

type Props = { compra: Compra; pedidoCompleto: boolean; onLigar: () => void; onAprovar: (id: string) => void; onCancelar: () => void };

const ESTADO: Record<string, [string, Tone]> = {
  CRIADA: ["Esperando o pedido", "neutral"],
  LIGANDO_A: ["Ligando para o A", "info"],
  LIGANDO_B: ["Ligando para o B", "info"],
  OFERTAS_COLETADAS: ["Ofertas coletadas", "info"],
  AGUARDANDO_APROVACAO: ["Aguardando sua aprovação", "warning"],
  FECHADA: ["Fechada", "success"],
  CANCELADA: ["Cancelada", "danger"],
};
const LIGACAO: Record<string, [string, Tone]> = {
  tocando: ["Tocando", "info"],
  em_andamento: ["Em ligação", "info"],
  encerrada: ["Encerrada", "neutral"],
  recusada: ["Recusada", "danger"],
};
const MARCA: Record<string, [string, Tone]> = {
  recomendada: ["Recomendada", "success"],
  fora_do_prazo: ["Fora do prazo", "danger"],
  acima_do_teto: ["Acima do teto", "danger"],
  sem_oferta: ["Sem oferta", "danger"],
};

const brl = (n?: number) => (n === undefined ? undefined : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const dia = (iso?: string) =>
  iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" }) : undefined;

function Oferta({ id, l, av }: { id: string; l?: LigacaoCompra; av?: Avaliada }) {
  const o = l?.oferta;
  const linhas: [string, string | undefined][] = o
    ? [
        ["Total com frete", brl(o.total_com_frete)],
        ["Entrega", o.prazo_entrega ? dia(o.prazo_entrega) : o.prazo_falado ? `vago: "${o.prazo_falado}"` : undefined],
        ["Frete", o.frete ? `${o.frete}${o.frete_valor ? ` (${brl(o.frete_valor)})` : ""}` : undefined],
        ["Pagamento", o.pagamento],
        ["Preço por unidade", o.preco_unitario !== undefined ? `${brl(o.preco_unitario)}${l!.precos.length > 1 ? ` (começou em ${brl(l!.precos[0])})` : ""}` : undefined],
      ]
    : [];
  const st = l && LIGACAO[l.status];
  return (
    <div className="rounded-2xl bg-background p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="flex-1 text-[15px] font-semibold">
          {id.toUpperCase()} · {l?.fornecedor.nome ?? "Fornecedor"}
        </h3>
        {st && (
          <Badge variant="status" tone={st[1]} size="sm">
            {st[0]}
          </Badge>
        )}
      </div>
      {av && av.marcas.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {av.marcas.map((m) => (
            <Badge key={m} variant="status" tone={MARCA[m]?.[1] ?? "neutral"} size="md">
              {MARCA[m]?.[0] ?? m}
            </Badge>
          ))}
        </div>
      )}
      {!l ? (
        <p className="mt-3 text-sm text-muted-foreground">Ainda não ligou.</p>
      ) : l.indisponivel ? (
        <p className="mt-3 text-sm">Indisponível: {l.indisponivel.motivo}</p>
      ) : (
        <dl className="mt-2">
          {linhas.map(([k, v]) => (
            <div key={k} className="border-t border-border-muted py-2">
              <dt className="text-[13px] text-muted-foreground">{k}</dt>
              <dd className="text-[15px] font-semibold tabular-nums">
                {v ?? <span className="font-normal text-muted-foreground">—</span>}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

/** A compra: o estado, as ofertas de A e B lado a lado com as marcas da comparação e o resultado. */
export function CartaoCompra({ compra: c, pedidoCompleto, onLigar, onAprovar, onCancelar }: Props) {
  const porId = (id: string) => c.ligacoes.find((l) => l.fornecedor.id === id);
  const av = (id: string) => c.comparacao?.avaliadas.find((a) => a.id === id);
  const rec = c.comparacao?.recomendada;
  const decidindo = c.estado === "OFERTAS_COLETADAS" || c.estado === "AGUARDANDO_APROVACAO";
  const [rotulo, tom] = ESTADO[c.estado] ?? [c.estado, "neutral"];
  return (
    <Card>
      <CardHeader className="flex-row items-center gap-3">
        <span className="grid size-9 place-items-center rounded-[10px] bg-surface-accent text-primary-ink">
          <Handshake weight="duotone" className="size-5" />
        </span>
        <CardTitle className="flex-1">Compra</CardTitle>
        <Badge variant="status" tone={tom} size="md">
          {rotulo}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Oferta id="a" l={porId("a")} av={av("a")} />
          <Oferta id="b" l={porId("b")} av={av("b")} />
        </div>
        {c.frase && <p className="text-[15px]">{c.frase}</p>}
        {c.estado === "FECHADA" && c.fechada_com && (
          <p className="text-[17px] font-semibold">
            Fechada com {c.fechada_com.toUpperCase()} · {porId(c.fechada_com)?.fornecedor.nome} · {brl(av(c.fechada_com)?.total)}
          </p>
        )}
        {c.estado === "CANCELADA" && <p className="text-[17px] font-semibold">Compra cancelada. Não fechou com ninguém.</p>}
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {c.estado === "CRIADA" && (
            <button type="button" className="button-primary m-press rounded-full bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-50" onClick={onLigar} disabled={!pedidoCompleto}>
              Ligar para os fornecedores
            </button>
          )}
          {decidindo && rec && (
            <button type="button" className="button-primary m-press rounded-full bg-primary px-4 py-2 font-medium text-primary-foreground" onClick={() => onAprovar(rec)}>
              Aprovar {rec.toUpperCase()}
            </button>
          )}
          {decidindo && (
            <button type="button" className="m-press rounded-full bg-muted px-4 py-2 font-medium" onClick={onCancelar}>
              Cancelar
            </button>
          )}
          <a className="text-primary-ink underline" href="/fornecedor/a" target="_blank" rel="noreferrer">Celular do A</a>
          <a className="text-primary-ink underline" href="/fornecedor/b" target="_blank" rel="noreferrer">Celular do B</a>
        </div>
      </CardContent>
    </Card>
  );
}
