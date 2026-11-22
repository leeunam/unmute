import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { cn } from "@/lib/utils";

export type MarcaOferta = "recomendada" | "fora_do_prazo" | "acima_do_teto" | "sem_oferta";
export type SituacaoLigacao = "aguardando" | "tocando" | "em_andamento" | "encerrada" | "recusada";

export type OfertaVisual = {
  id: string;
  nome: string;
  situacao: SituacaoLigacao;
  /** Total com frete, em reais. */
  total?: number;
  precoUnitario?: string;
  /** "começou em R$ 6,10", quando o preço caiu na negociação. */
  precoInicial?: string;
  entrega?: string;
  frete?: string;
  pagamento?: string;
  marcas: MarcaOferta[];
  /** Por que ficou sem oferta ("não atendeu"); os outros descartes já falam pelo selo. */
  motivo?: string;
};

type Props = {
  oferta: OfertaVisual;
  fechada?: boolean;
  onAprovar?: () => void;
};

const SITUACAO: Record<SituacaoLigacao, { rotulo: string; tone: "info" | "neutral" | "success" | "danger" }> = {
  aguardando: { rotulo: "Na fila", tone: "neutral" },
  tocando: { rotulo: "Tocando", tone: "info" },
  em_andamento: { rotulo: "Em ligação", tone: "info" },
  encerrada: { rotulo: "Ligação encerrada", tone: "neutral" },
  recusada: { rotulo: "Não atendeu", tone: "neutral" },
};

const SELO: Record<MarcaOferta, { rotulo: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  recomendada: { rotulo: "Recomendada", tone: "success" },
  fora_do_prazo: { rotulo: "Fora do prazo", tone: "warning" },
  acima_do_teto: { rotulo: "Acima do teto", tone: "danger" },
  sem_oferta: { rotulo: "Sem oferta", tone: "neutral" },
};

/** Uma oferta como cartão: total grande, as condições e os selos da comparação. */
export function CartaoOferta({ oferta: o, fechada, onAprovar }: Props) {
  const recomendada = o.marcas.includes("recomendada");
  const descartada = o.marcas.some((m) => m !== "recomendada");
  const s = SITUACAO[o.situacao];
  const linhas: [string, string | undefined][] = [
    ["Preço por unidade", o.precoUnitario],
    ["Entrega", o.entrega],
    ["Frete", o.frete],
    ["Pagamento", o.pagamento],
  ];
  return (
    <article
      data-slot="card"
      className={cn(
        "m-fade flex flex-col rounded-2xl bg-card p-5 shadow-2",
        recomendada && "shadow-none ring-2 ring-primary",
        fechada && "bg-surface-accent",
      )}
    >
      <header className="flex items-center gap-3">
        <span
          className={cn(
            "grid size-9 shrink-0 place-items-center rounded-full text-sm font-semibold",
            recomendada ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
          )}
        >
          {o.id.toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] leading-tight font-semibold">{o.nome}</p>
          <p className="text-xs text-muted-foreground">Fornecedor {o.id.toUpperCase()}</p>
        </div>
        {o.situacao !== "encerrada" && (
          <Badge variant="status" tone={s.tone} size="md" icon={s.tone !== "neutral"}>
            {s.rotulo}
          </Badge>
        )}
      </header>

      <div className="mt-5 flex items-baseline gap-2">
        <span className={cn("text-[30px] leading-[1.1] font-semibold tracking-[-0.02em]", descartada && "text-muted-foreground")}>
          {o.total !== undefined ? <AnimatedNumber value={o.total} money duration={0.8} /> : <span className="text-muted-foreground">—</span>}
        </span>
        <span className="text-[13px] whitespace-nowrap text-muted-foreground">{o.total !== undefined ? "com frete" : ""}</span>
      </div>
      {o.precoInicial ? <p className="mt-1 text-[13px] text-muted-foreground tabular-nums">{o.precoInicial}</p> : null}

      {o.marcas.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {fechada ? (
            <Badge variant="status" tone="success" size="md">
              Fechada
            </Badge>
          ) : (
            o.marcas.map((m) => (
              <Badge key={m} variant="status" tone={SELO[m].tone} size="md" className="m-enter">
                {SELO[m].rotulo}
              </Badge>
            ))
          )}
        </div>
      )}
      {o.motivo && o.marcas.includes("sem_oferta") ? <p className="mt-2 text-[13px] text-muted-foreground">{o.motivo}</p> : null}

      <dl className="mt-4 text-sm">
        {linhas.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 border-t border-border-muted py-2">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="text-right font-medium tabular-nums">
              {v !== undefined ? (
                <span key={v} className="m-chegou -mx-1 inline-block rounded-md px-1">
                  {v}
                </span>
              ) : (
                <span className="font-normal text-muted-foreground">—</span>
              )}
            </dd>
          </div>
        ))}
      </dl>

      {onAprovar && recomendada && !fechada ? (
        <Button size="lg" className="mt-4 w-full" onClick={onAprovar}>
          Fechar com o {o.id.toUpperCase()}
        </Button>
      ) : null}
    </article>
  );
}
