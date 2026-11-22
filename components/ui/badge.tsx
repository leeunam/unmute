import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { StatusGlyph } from "./status-glyph";
import { TONES, toneCompoundVariants } from "./tone-variants";

const noColor = Object.fromEntries(TONES.map((tone) => [tone, ""])) as Record<(typeof TONES)[number], string>;

// Situação: fundo claro, tinta escura, glifo. Nunca selo cheio.
const STATUS: Record<(typeof TONES)[number], string> = {
  neutral: "bg-status-neutral-bg text-status-neutral-ink",
  accent: "bg-fill-accent text-primary-ink",
  success: "bg-status-success-bg text-status-success-ink",
  warning: "bg-status-warning-bg text-status-warning-ink",
  danger: "bg-status-danger-bg text-status-danger-ink",
  info: "bg-status-info-bg text-status-info-ink",
};
const statusCompoundVariants = TONES.map((tone) => ({ variant: "status" as const, tone, className: STATUS[tone] }));

const badgeVariants = cva("badge-box m-fade inline-flex items-center gap-1 rounded-full border whitespace-nowrap", {
  variants: {
    size: {
      sm: "h-5 px-1.5 text-xs font-medium [&>svg]:size-(--icon-xs)",
      md: "h-6 px-2 text-[13px] leading-4 font-medium [&>svg]:size-3",
      lg: "h-7 px-2.5 text-sm font-medium [&>svg]:size-3.5",
    },
    variant: { solid: "border-transparent", soft: "border-transparent", outline: "", status: "border-transparent" },
    tone: noColor,
  },
  compoundVariants: [...toneCompoundVariants, ...statusCompoundVariants],
  defaultVariants: { variant: "soft", tone: "neutral", size: "sm" },
});

export type BadgeProps = ComponentProps<"span"> & VariantProps<typeof badgeVariants> & { readonly icon?: boolean };

export const Badge = ({ className, variant, tone, size, icon = true, children, ...props }: BadgeProps) => (
  <span data-slot="badge" className={cn(badgeVariants({ variant, tone, size }), className)} {...props}>
    {variant === "status" && icon && <StatusGlyph tone={tone ?? "neutral"} />}
    {children}
  </span>
);

export { badgeVariants };
