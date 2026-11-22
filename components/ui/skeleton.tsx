import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const Skeleton = ({ className, ...props }: ComponentProps<"div">) => (
  <div data-slot="skeleton" className={cn("m-skeleton rounded-md bg-muted", className)} {...props} />
);
