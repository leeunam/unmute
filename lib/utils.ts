import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Junta classes e resolve conflitos do Tailwind (convenção do shadcn). */
export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs));
