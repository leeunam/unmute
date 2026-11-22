import { Microphone, PhoneDisconnect, CircleNotch } from "@phosphor-icons/react/dist/ssr";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type EstadoChamada = "parado" | "conectando" | "conversando" | "encerrando";

type Props = {
  estado: EstadoChamada;
  usuarioFalando: boolean;
  agenteFalando: boolean;
  status: string;
  erro?: string;
  onIniciar: () => void;
  onEncerrar: () => void;
};

const TITULO: Record<EstadoChamada, string> = {
  parado: "Fale o que você precisa comprar",
  conectando: "Chamando o agente…",
  conversando: "O agente está na linha",
  encerrando: "Encerrando a conversa…",
};

function Onda({ ativa }: { ativa: boolean }) {
  return (
    <span className="onda" data-ativa={ativa} aria-hidden>
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}

function QuemFala({ nome, ativo, aberta }: { nome: string; ativo: boolean; aberta: boolean }) {
  return (
    <div
      className={cn(
        "m-fade flex items-center gap-2.5 rounded-full px-3.5 py-1.5 text-sm font-medium",
        ativo ? "bg-surface-accent-hover text-primary-ink" : "bg-muted/60 text-muted-foreground",
        !aberta && "opacity-60",
      )}
    >
      <Onda ativa={ativo} />
      {nome}
      <span className="sr-only">{ativo ? "falando" : "em silêncio"}</span>
    </div>
  );
}

/** O botão grande de falar, quem está falando e a linha de situação da chamada. */
export function ChamadaHero({ estado, usuarioFalando, agenteFalando, status, erro, onIniciar, onEncerrar }: Props) {
  const aberta = estado === "conversando" || estado === "encerrando";
  const ocupado = estado === "conectando" || estado === "encerrando";
  const Icone = estado === "conectando" ? CircleNotch : aberta ? PhoneDisconnect : Microphone;

  return (
    <Card className="rounded-3xl p-8">
      <div className="flex items-center gap-7">
        <button
          data-slot="button"
          type="button"
          onClick={aberta ? onEncerrar : onIniciar}
          disabled={ocupado}
          aria-label={aberta ? "Encerrar conversa" : "Falar com o agente"}
          className={cn(
            "m-focus m-press grid size-28 shrink-0 cursor-pointer place-items-center rounded-full text-primary-foreground disabled:cursor-default",
            aberta ? "bg-destructive hover:bg-destructive/90" : "button-primary bg-primary hover:bg-primary-hover",
            estado === "conversando" && "anel-vivo",
          )}
        >
          <Icone weight="fill" className={cn("size-11", estado === "conectando" && "animate-spin")} />
        </button>

        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            {aberta ? (
              <Badge variant="status" tone="success" size="md">
                Em conversa
              </Badge>
            ) : estado === "conectando" ? (
              <Badge variant="status" tone="info" size="md">
                Conectando
              </Badge>
            ) : (
              <Badge variant="status" tone="neutral" size="md" icon={false}>
                Pronto para ouvir
              </Badge>
            )}
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">{TITULO[estado]}</h2>
          <p className="mt-1 min-h-[1.5em] text-[15px] text-muted-foreground">
            {status || (aberta ? "" : "Toque no botão e diga o produto, a quantidade, o prazo e quanto quer pagar no máximo.")}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <QuemFala nome="Você" ativo={usuarioFalando} aberta={aberta} />
            <QuemFala nome="Agente" ativo={agenteFalando} aberta={aberta} />
          </div>
        </div>
      </div>
      {erro ? (
        <p className="mt-5 rounded-xl bg-status-danger-bg px-4 py-3 text-sm break-words whitespace-pre-wrap text-status-danger-ink">
          {erro}
        </p>
      ) : null}
    </Card>
  );
}
