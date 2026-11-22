import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "m-focus m-fade relative inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-full border-0 font-medium disabled:pointer-events-none disabled:opacity-(--op-disabled) [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "m-press button-primary bg-primary text-primary-foreground hover:bg-primary-hover",
        tertiary: "border border-input bg-card hover:bg-fill-hover",
        ghost: "hover:bg-fill-hover",
        danger: "m-press bg-destructive text-destructive-foreground hover:bg-destructive/90",
      },
      size: {
        sm: "h-8 px-3 text-sm [&_svg]:size-(--icon-sm)",
        default: "h-9 px-4 text-sm [&_svg]:size-4",
        lg: "h-11 px-5 text-[15px] [&_svg]:size-[18px]",
      },
    },
    defaultVariants: { variant: "primary", size: "default" },
  },
);

export type ButtonProps = ComponentProps<"button"> & VariantProps<typeof buttonVariants>;

export const Button = ({ className, variant, size, type = "button", ...props }: ButtonProps) => (
  <button data-slot="button" type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
);
