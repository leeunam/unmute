import { Handshake, SealCheck } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CartaoOferta, type MarcaOferta, type OfertaVisual, type SituacaoLigacao } from "./cartao-oferta";
import { EtapasCompra, type EtapaCompra } from "./etapas-compra";
import { Recomendacao } from "./recomendacao";

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

const ETAPA: Record<string, EtapaCompra> = {
  CRIADA: "pedido",
  LIGANDO_A: "ligando_a",
  LIGANDO_B: "ligando_b",
  OFERTAS_COLETADAS: "aprovacao",
  AGUARDANDO_APROVACAO: "aprovacao",
  FECHADA: "fechada",
  CANCELADA: "cancelada",
};
const MARCAS: MarcaOferta[] = ["recomendada", "fora_do_prazo", "acima_do_teto", "sem_oferta"];
const SITUACOES: SituacaoLigacao[] = ["tocando", "em_andamento", "encerrada", "recusada"];

const brl = (n?: number) => (n === undefined ? undefined : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const total = (n?: number) =>
  n === undefined ? undefined : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: Number.isInteger(n) ? 0 : 2 });
const dia = (iso?: string) =>
  iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" }) : undefined;

/** Os dados da compra no formato que o cartão de oferta desenha. */
function paraVisual(id: string, l?: LigacaoCompra, av?: Avaliada): OfertaVisual {
  const o = l?.oferta;
  const marcas = (av?.marcas ?? []).filter((m): m is MarcaOferta => MARCAS.includes(m as MarcaOferta));
  if (!av && l?.indisponivel) marcas.push("sem_oferta");
  return {
    id,
    nome: l?.fornecedor.nome ?? `Fornecedor ${id.toUpperCase()}`,
    situacao: l && SITUACOES.includes(l.status as SituacaoLigacao) ? (l.status as SituacaoLigacao) : "aguardando",
    total: o?.total_com_frete,
    precoUnitario: brl(o?.preco_unitario),
    precoInicial: l && l.precos.length > 1 ? `Começou em ${brl(l.precos[0])} por unidade` : undefined,
    entrega: o?.prazo_entrega ? dia(o.prazo_entrega) : o?.prazo_falado ? `vago: "${o.prazo_falado}"` : undefined,
    frete: o?.frete ? `${o.frete}${o.frete_valor ? ` (${brl(o.frete_valor)})` : ""}` : undefined,
    pagamento: o?.pagamento,
    marcas,
    motivo: av?.motivo ?? l?.indisponivel?.motivo,
  };
}

/** A compra: as etapas, as ofertas de A e B lado a lado com os selos da comparação e o resultado. */
export function CartaoCompra({ compra: c, pedidoCompleto, onLigar, onAprovar, onCancelar }: Props) {
  const porId = (id: string) => c.ligacoes.find((l) => l.fornecedor.id === id);
  const av = (id: string) => c.comparacao?.avaliadas.find((a) => a.id === id);
  const decidindo = c.estado === "OFERTAS_COLETADAS" || c.estado === "AGUARDANDO_APROVACAO";
  const fechadaCom = c.estado === "FECHADA" ? c.fechada_com : undefined;
  return (
    <Card>
      <CardHeader className="flex-row items-center gap-3 pb-3">
        <span className="grid size-9 place-items-center rounded-[10px] bg-surface-accent text-primary-ink">
          <Handshake weight="duotone" className="size-5" />
        </span>
        <CardTitle className="flex-1">Compra</CardTitle>
        <span className="flex gap-4 text-sm">
          <a className="text-primary-ink underline-offset-4 hover:underline" href="/fornecedor/a" target="_blank" rel="noreferrer">
            Celular do A
          </a>
          <a className="text-primary-ink underline-offset-4 hover:underline" href="/fornecedor/b" target="_blank" rel="noreferrer">
            Celular do B
          </a>
        </span>
      </CardHeader>
      <CardContent className="space-y-4">
        <EtapasCompra atual={ETAPA[c.estado] ?? "pedido"} />

        {fechadaCom && (
          <div className="m-enter flex items-center gap-3 rounded-2xl bg-status-success-bg px-5 py-4 text-status-success-ink">
            <SealCheck weight="fill" className="size-7 shrink-0" />
            <p className="text-[17px] font-semibold">
              Fechada com o {fechadaCom.toUpperCase()} · {porId(fechadaCom)?.fornecedor.nome} ·{" "}
              <span className="tabular-nums">{total(av(fechadaCom)?.total)}</span>
            </p>
          </div>
        )}
        {c.estado === "CANCELADA" && (
          <p className="rounded-2xl bg-status-neutral-bg px-5 py-4 text-[15px] font-medium text-status-neutral-ink">
            Compra cancelada. Não fechou com ninguém.
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {["a", "b"].map((id) => (
            <CartaoOferta
              key={id}
              oferta={paraVisual(id, porId(id), av(id))}
              fechada={fechadaCom === id}
              onAprovar={decidindo ? () => onAprovar(id) : undefined}
            />
          ))}
        </div>

        {(c.frase && !fechadaCom) || decidindo ? (
          <div className="flex items-center gap-4">
            {c.frase && !fechadaCom ? (
              <div className="flex-1">
                <Recomendacao frase={c.frase} />
              </div>
            ) : (
              <span className="flex-1" />
            )}
            {decidindo && (
              <Button variant="tertiary" className="shrink-0" onClick={onCancelar}>
                Cancelar compra
              </Button>
            )}
          </div>
        ) : null}

        {c.estado === "CRIADA" && (
          <Button size="lg" onClick={onLigar} disabled={!pedidoCompleto}>
            Ligar para os fornecedores
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
