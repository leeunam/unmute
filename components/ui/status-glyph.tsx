import type { Icon } from "@phosphor-icons/react";
import { Check, CircleNotch, Clock, Minus, Warning } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/lib/utils";

// Um glifo por sentido, para a situação ler sem a cor.
export type StatusMeaning = "success" | "warning" | "danger" | "info" | "neutral";

export const STATUS_GLYPH: Record<StatusMeaning, Icon> = {
  success: Check,
  warning: Clock,
  danger: Warning,
  info: CircleNotch,
  neutral: Minus,
};

const isMeaning = (tone: string | null | undefined): tone is StatusMeaning =>
  tone != null && Object.hasOwn(STATUS_GLYPH, tone);

export const StatusGlyph = ({ tone, className }: { readonly tone: string | null | undefined; readonly className?: string }) => {
  if (!isMeaning(tone)) return null;
  const Glyph = STATUS_GLYPH[tone];
  return <Glyph weight="bold" aria-hidden data-slot="status-glyph" className={cn("shrink-0", className)} />;
};
