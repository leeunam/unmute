import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

// Cartão: a borda é o anel da sombra (shadow-2), não um border.
export const Card = ({ className, ...props }: ComponentProps<"div">) => (
  <div data-slot="card" className={cn("rounded-2xl bg-card text-card-foreground shadow-2", className)} {...props} />
);

export const CardHeader = ({ className, ...props }: ComponentProps<"div">) => (
  <div className={cn("flex flex-col gap-1 p-6 pb-4", className)} {...props} />
);

export const CardTitle = ({
  className,
  as: Heading = "h2",
  ...props
}: ComponentProps<"h2"> & { as?: "h2" | "h3" | "h4" }) => (
  <Heading className={cn("text-[17px] font-semibold leading-tight tracking-tight", className)} {...props} />
);

export const CardDescription = ({ className, ...props }: ComponentProps<"p">) => (
  <p className={cn("text-sm text-muted-foreground", className)} {...props} />
);

export const CardContent = ({ className, ...props }: ComponentProps<"div">) => (
  <div className={cn("px-6 pb-6", className)} {...props} />
);
