import { Check, X } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/lib/utils";

export type EtapaCompra = "pedido" | "ligando_a" | "ligando_b" | "aprovacao" | "fechada" | "cancelada";

const ETAPAS: { chave: Exclude<EtapaCompra, "cancelada">; rotulo: string; agora: string }[] = [
  { chave: "pedido", rotulo: "Pedido", agora: "Anotando o pedido" },
  { chave: "ligando_a", rotulo: "Fornecedor A", agora: "Ligando para A" },
  { chave: "ligando_b", rotulo: "Fornecedor B", agora: "Ligando para B" },
  { chave: "aprovacao", rotulo: "Aprovação", agora: "Aguardando sua aprovação" },
  { chave: "fechada", rotulo: "Fechada", agora: "Compra fechada" },
];

/** Onde a compra está: pedido → A → B → aprovação → fechada (ou cancelada). */
export function EtapasCompra({ atual }: { atual: EtapaCompra }) {
  const cancelada = atual === "cancelada";
  const idx = cancelada ? -1 : ETAPAS.findIndex((e) => e.chave === atual);
  const fim = atual === "fechada";
  return (
    <div>
      <p className="mb-2 text-[13px] text-muted-foreground">
        {cancelada ? "Compra cancelada" : ETAPAS[idx]?.agora}
      </p>
      <ol className="flex items-start">
        {ETAPAS.map((e, i) => {
          const feita = !cancelada && (i < idx || (fim && i === idx));
          const agora = !cancelada && !fim && i === idx;
          return (
            <li key={e.chave} className="relative flex flex-1 flex-col items-center gap-2 text-center">
              {i > 0 && (
                <span
                  aria-hidden
                  className={cn(
                    "m-fade absolute top-[11px] right-1/2 left-[-50%] -z-0 h-0.5 rounded-full",
                    !cancelada && i <= idx ? "bg-primary" : "bg-border",
                  )}
                />
              )}
              <span
                className={cn(
                  "m-fade relative grid size-6 place-items-center rounded-full text-primary-foreground",
                  feita && "bg-primary",
                  agora && "anel-vivo bg-primary",
                  !feita && !agora && "bg-card shadow-1",
                  cancelada && "bg-status-neutral-bg shadow-none",
                )}
              >
                {feita ? (
                  <Check weight="bold" className="size-3" />
                ) : agora ? (
                  <span className="size-2 rounded-full bg-primary-foreground" />
                ) : cancelada ? (
                  <X weight="bold" className="size-3 text-status-neutral-ink" />
                ) : null}
              </span>
              <span
                className={cn(
                  "text-xs font-medium",
                  agora ? "text-primary-ink" : feita ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {e.rotulo}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
