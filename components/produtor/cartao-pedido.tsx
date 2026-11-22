import { Basket } from "@phosphor-icons/react/dist/ssr";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type CampoPedido = { chave: string; rotulo: string; valor?: string; faltando: boolean; largo?: boolean };

type Props = {
  /** null enquanto a tarefa ainda não chegou do servidor. */
  campos: CampoPedido[] | null;
  completa: boolean;
  /** Com a compra andando, o pedido vira esta linha só, para a compra caber na tela. */
  resumo?: string;
};

/** O pedido estruturado: cada campo entra com uma animação curta quando o agente o preenche. */
export function CartaoPedido({ campos, completa, resumo }: Props) {
  if (resumo)
    return (
      <Card className="m-enter flex items-center gap-3 px-6 py-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-surface-accent text-primary-ink">
          <Basket weight="duotone" className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] text-muted-foreground">Pedido</p>
          <p className="text-[15px] font-semibold tabular-nums">{resumo}</p>
        </div>
      </Card>
    );
  const faltam = campos?.filter((c) => c.faltando).map((c) => c.rotulo.toLowerCase()) ?? [];
  // Os campos curtos em pares, os longos (data, local, observações) na linha inteira.
  const ordem = campos ? [...campos.filter((c) => !c.largo), ...campos.filter((c) => c.largo)] : null;
  return (
    <Card>
      <CardHeader className="flex-row items-center gap-3">
        <span className="grid size-9 place-items-center rounded-[10px] bg-surface-accent text-primary-ink">
          <Basket weight="duotone" className="size-5" />
        </span>
        <CardTitle className="flex-1">Pedido</CardTitle>
        {campos &&
          (completa ? (
            <Badge variant="status" tone="success" size="md">
              Completo
            </Badge>
          ) : faltam.length > 0 ? (
            <Badge variant="status" tone="warning" size="md">
              Falta {faltam.join(", ")}
            </Badge>
          ) : (
            <Badge variant="status" tone="neutral" size="md" icon={false}>
              Esperando o pedido
            </Badge>
          ))}
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-x-6">
          {(ordem ?? Array.from({ length: 6 }, (_, i) => ({ chave: String(i), rotulo: "", faltando: false }) as CampoPedido)).map(
            (c) => (
              <div key={c.chave} className={cn("border-t border-border-muted py-3", c.largo && "col-span-2")}>
                <dt className="text-[13px] text-muted-foreground">{campos ? c.rotulo : <Skeleton className="h-4 w-20" />}</dt>
                <dd className="mt-1 min-h-7 text-[17px] font-semibold tabular-nums">
                  {!campos ? (
                    <Skeleton className="h-6 w-32" />
                  ) : c.valor !== undefined ? (
                    <span key={c.valor} className="m-chegou -mx-1.5 inline-block rounded-md px-1.5">
                      {c.valor}
                    </span>
                  ) : c.faltando ? (
                    <Badge variant="status" tone="warning">
                      faltando
                    </Badge>
                  ) : (
                    <span className="font-normal text-muted-foreground">—</span>
                  )}
                </dd>
              </div>
            ),
          )}
        </dl>
      </CardContent>
    </Card>
  );
}
