import type { ReactNode } from "react";
import {
  BatteryFull,
  CellSignalFull,
  CircleNotch,
  Phone,
  PhoneDisconnect,
  PhoneSlash,
  Plant,
  WifiHigh,
} from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/lib/utils";

export type ModoCelular = "tocando" | "conectando" | "em_ligacao" | "parado";

type Props = {
  modo: ModoCelular;
  chamador?: string;
  descricao?: string;
  /** Texto do estado parado: "Sem chamadas", "Ligação encerrada", "Chamada recusada". */
  rotuloParado: string;
  fornecedor: string;
  /** Relógio da ligação, "01:23". */
  duracao: string;
  agenteFalando: boolean;
  onAtender: () => void;
  onRecusar: () => void;
  onDesligar: () => void;
};

function BotaoRedondo({
  rotulo,
  cor,
  onClick,
  children,
  pulsa,
}: {
  rotulo: string;
  cor: "verde" | "vermelho";
  onClick: () => void;
  children: ReactNode;
  pulsa?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-2.5">
      <button
        data-slot="button"
        type="button"
        onClick={onClick}
        aria-label={rotulo}
        className={cn(
          "m-press m-focus grid size-[72px] cursor-pointer place-items-center rounded-full text-white",
          cor === "verde" ? "bg-[#2f9e6a] hover:bg-[#2a8d5f]" : "bg-[#e0483e] hover:bg-[#c93f36]",
          pulsa && "anel-chamada",
        )}
      >
        {children}
      </button>
      <span className="text-[13px] text-white/75">{rotulo}</span>
    </div>
  );
}

function Avatar({ falando, tocando }: { falando?: boolean; tocando?: boolean }) {
  return (
    <div className="relative grid size-28 place-items-center">
      {tocando && (
        <>
          <span className="onda-chamada absolute inset-0 rounded-full" aria-hidden />
          <span className="onda-chamada absolute inset-0 rounded-full [animation-delay:1s]" aria-hidden />
        </>
      )}
      <div
        className={cn(
          "relative grid size-28 place-items-center rounded-full bg-gradient-to-b from-[#86a896] to-[#537162] text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.25)]",
          falando && "anel-vivo",
        )}
      >
        <Plant weight="duotone" className="size-14" />
      </div>
    </div>
  );
}

/** O celular simulado do fornecedor. Só desenha: o estado e as ações vêm da página. */
export function Celular({
  modo,
  chamador = "Desenrola Agro",
  descricao,
  rotuloParado,
  fornecedor,
  duracao,
  agenteFalando,
  onAtender,
  onRecusar,
  onDesligar,
}: Props) {
  return (
    <div className="rounded-[56px] bg-[#1b1f1a] p-3 shadow-float ring-1 ring-black/40">
      <div className="relative flex h-[720px] w-[340px] flex-col overflow-hidden rounded-[46px] bg-[radial-gradient(120%_75%_at_50%_0%,#4a6a5a_0%,#26362e_55%,#151a16_100%)] px-7 pt-3 pb-12 text-white">
        {/* barra de status */}
        <div className="flex h-9 items-center justify-between px-3 text-[13px] font-semibold tabular-nums">
          <span>9:41</span>
          <span className="h-7 w-24 rounded-full bg-black" aria-hidden />
          <span className="flex items-center gap-1" aria-hidden>
            <CellSignalFull weight="fill" className="size-4" />
            <WifiHigh weight="bold" className="size-4" />
            <BatteryFull weight="fill" className="size-5" />
          </span>
        </div>

        {modo === "tocando" && (
          <div key="tocando" className="m-enter flex flex-1 flex-col items-center">
            <p className="mt-14 text-[13px] text-white/70">Chamada recebida</p>
            <div className="mt-10">
              <Avatar tocando />
            </div>
            <p className="mt-7 text-[30px] leading-tight font-semibold tracking-[-0.015em]">{chamador}</p>
            {descricao ? <p className="mt-1 text-center text-[15px] text-white/70">{descricao}</p> : null}
            <div className="mt-auto flex w-full justify-between px-4">
              <BotaoRedondo rotulo="Recusar" cor="vermelho" onClick={onRecusar}>
                <PhoneDisconnect weight="fill" className="size-8" />
              </BotaoRedondo>
              <BotaoRedondo rotulo="Atender" cor="verde" onClick={onAtender} pulsa>
                <Phone weight="fill" className="size-8" />
              </BotaoRedondo>
            </div>
          </div>
        )}

        {modo === "conectando" && (
          <div key="conectando" className="m-enter flex flex-1 flex-col items-center justify-center gap-4 text-white/80">
            <CircleNotch className="size-9 animate-spin" />
            <p className="text-[15px]">Conectando…</p>
          </div>
        )}

        {modo === "em_ligacao" && (
          <div key="em_ligacao" className="m-enter flex flex-1 flex-col items-center">
            <p className="mt-14 text-[13px] text-white/70">Em ligação</p>
            <p className="mt-1 text-[17px] font-medium tabular-nums">{duracao}</p>
            <div className="mt-9">
              <Avatar falando={agenteFalando} />
            </div>
            <p className="mt-7 text-[30px] leading-tight font-semibold tracking-[-0.015em]">{chamador}</p>
            {descricao ? <p className="mt-1 text-center text-[15px] text-white/70">{descricao}</p> : null}
            <div
              className={cn(
                "m-fade mt-6 flex items-center gap-2.5 rounded-full px-3.5 py-1.5 text-sm",
                agenteFalando ? "bg-white/15 text-white" : "bg-white/5 text-white/60",
              )}
            >
              <span className="onda" data-ativa={agenteFalando} aria-hidden>
                <i />
                <i />
                <i />
                <i />
              </span>
              {agenteFalando ? "Agente falando" : "Ouvindo você"}
            </div>
            <div className="mt-auto">
              <BotaoRedondo rotulo="Desligar" cor="vermelho" onClick={onDesligar}>
                <PhoneDisconnect weight="fill" className="size-8" />
              </BotaoRedondo>
            </div>
          </div>
        )}

        {modo === "parado" && (
          <div key="parado" className="m-enter flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <span className="grid size-16 place-items-center rounded-full bg-white/10">
              <PhoneSlash weight="duotone" className="size-8 text-white/80" />
            </span>
            <p className="text-xl font-semibold">{rotuloParado}</p>
            <p className="text-sm text-white/60">Fornecedor {fornecedor}</p>
          </div>
        )}
      </div>
    </div>
  );
}
