import { Timer } from "@phosphor-icons/react/dist/ssr";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { Resumo } from "@/lib/resumo";

type Turno = { turno: number; inicio: string; fim: string; e2e_ms: number | null; segmentos: Record<string, number> };

type Props = {
  /** Medido no navegador: do último som da fala até o primeiro som do agente. */
  navegador: Resumo;
  /** Medido pela Agora (e2e_latency_ms), depois que a sessão encerra. */
  agora?: { resumo: Resumo; turnos: Turno[] } | null;
};

// Alvo da spec: resposta em menos de ~1,5 s.
const ALVO_MS = 1500;
const ms = (n: number) => n.toLocaleString("pt-BR");

function Numero({ r }: { r: Resumo }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[40px] leading-none font-semibold tracking-[-0.02em]">
        {r ? <AnimatedNumber value={r.media_ms} duration={0.6} /> : <span className="text-muted-foreground">—</span>}
      </span>
      <span className="text-sm text-muted-foreground">ms em média</span>
    </div>
  );
}

/** Cartão de métrica da latência da sessão. */
export function CartaoLatencia({ navegador, agora }: Props) {
  const principal = agora?.resumo ?? navegador;
  return (
    <Card className="p-6">
      <div className="flex items-center gap-3">
        <span className="grid size-9 place-items-center rounded-[10px] bg-surface-accent text-primary-ink">
          <Timer weight="duotone" className="size-5" />
        </span>
        <span className="flex-1 text-sm font-medium text-foreground/80">Latência da sessão</span>
        {principal ? (
          principal.media_ms < ALVO_MS ? (
            <Badge variant="status" tone="success" size="md">
              Abaixo de 1,5 s
            </Badge>
          ) : (
            <Badge variant="status" tone="warning" size="md">
              Acima de 1,5 s
            </Badge>
          )
        ) : null}
      </div>

      <div className="mt-5">
        <Numero r={principal} />
        {principal ? (
          <p className="mt-2 text-[13px] text-muted-foreground tabular-nums">
            p50 {ms(principal.p50_ms)} ms · p90 {ms(principal.p90_ms)} ms · máx. {ms(principal.max_ms)} ms
          </p>
        ) : (
          <p className="mt-2 text-[13px] text-muted-foreground">Nenhuma resposta medida ainda.</p>
        )}
      </div>

      {agora?.resumo && navegador ? (
        <p className="mt-4 rounded-xl bg-surface-accent px-4 py-3 text-sm tabular-nums">
          No navegador, com a rede e o silêncio que o agente espera: {ms(navegador.media_ms)} ms em média ({navegador.n}{" "}
          respostas).
        </p>
      ) : null}

      {agora?.turnos.length ? (
        <div className="mt-4 max-h-48 overflow-y-auto">
          <table data-slot="table" className="w-full text-[13px] tabular-nums">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-1.5 font-medium">Turno</th>
                <th className="py-1.5 font-medium">Total</th>
                <th className="py-1.5 font-medium">Partes (ms)</th>
              </tr>
            </thead>
            <tbody>
              {agora.turnos.map((t) => (
                <tr key={t.turno} className="border-t border-border-muted">
                  <td className="py-1.5">{t.turno}</td>
                  <td className="py-1.5 font-semibold">{t.e2e_ms ?? "–"}</td>
                  <td className="py-1.5 text-muted-foreground">
                    {Object.entries(t.segmentos)
                      .map(([k, v]) => `${k} ${v}`)
                      .join(" · ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <p className="mt-5 border-t border-border-muted pt-3 text-xs text-muted-foreground">
        {agora?.resumo
          ? `n = ${agora.resumo.n} turnos de voz, medidos pela Agora (e2e_latency_ms).`
          : `n = ${navegador?.n ?? 0} respostas. Do último som da sua fala até o primeiro som do agente, medido no navegador.`}
      </p>
    </Card>
  );
}
