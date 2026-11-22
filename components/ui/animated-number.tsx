"use client";

import { AnimatedNumber as CountUp, type AnimatedNumberProps as CountUpProps } from "./vendor/beui/animated-number";

export type AnimatedNumberProps = Omit<CountUpProps, "format" | "value"> & {
  value: number;
  /** Valor em reais (não em centavos). */
  money?: boolean;
};

const COUNT = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const MONEY = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Um número que conta até o valor ao aparecer. Com movimento reduzido, não conta. */
export const AnimatedNumber = ({ value, money = false, ...props }: AnimatedNumberProps) => (
  <CountUp {...props} value={value} format={money ? (n) => MONEY.format(n) : (n) => COUNT.format(Math.round(n))} />
);
