import { Sparkle } from "@phosphor-icons/react/dist/ssr";

/** O que o agente diz ao produtor depois de comparar, em texto. */
export function Recomendacao({ frase }: { frase: string }) {
  return (
    <div className="m-enter rounded-2xl bg-surface-accent px-5 py-4">
      <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-primary-ink">
        <Sparkle weight="fill" className="size-3.5" />
        Recomendação do agente
      </p>
      <p className="text-[15px] leading-snug">{frase}</p>
    </div>
  );
}
