// Vocabulário de cor compartilhado: `variant` é a forma, `tone` é a cor.
export const TONES = ["neutral", "accent", "success", "warning", "danger", "info"] as const;
export type Tone = (typeof TONES)[number];

export const FILLS = ["solid", "soft", "outline"] as const;
export type Fill = (typeof FILLS)[number];

const SOLID: Record<Tone, string> = {
  neutral: "bg-secondary text-secondary-foreground",
  accent: "bg-primary text-primary-foreground",
  success: "bg-success text-success-foreground",
  warning: "bg-warning text-warning-foreground",
  danger: "bg-destructive text-destructive-foreground",
  info: "bg-info text-info-foreground",
};

const SOFT: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground",
  accent: "bg-fill-accent text-primary-ink",
  success: "bg-status-success-bg text-status-success-ink",
  warning: "bg-status-warning-bg text-status-warning-ink",
  danger: "bg-status-danger-bg text-status-danger-ink",
  info: "bg-status-info-bg text-status-info-ink",
};

const OUTLINE: Record<Tone, string> = {
  neutral: "border-border text-foreground",
  accent: "border-primary text-primary-ink",
  success: "border-success text-success",
  warning: "border-warning text-warning",
  danger: "border-destructive text-destructive",
  info: "border-info text-info",
};

export const toneColor: Record<Fill, Record<Tone, string>> = { solid: SOLID, soft: SOFT, outline: OUTLINE };

export const toneCompoundVariants = FILLS.flatMap((variant) =>
  TONES.map((tone) => ({ variant, tone, className: toneColor[variant][tone] })),
);
