"use client";

import { AnimatedNumber as CountUp, type AnimatedNumberProps as CountUpProps } from "./vendor/beui/animated-number";

export type AnimatedNumberProps = Omit<CountUpProps, "format" | "value"> & {
  value: number;
  /** Valor em reais (não em centavos). */
  money?: boolean;
};

const COUNT = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const MONEY = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const MONEY_REDONDO = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/** Um número que conta até o valor ao aparecer. Com movimento reduzido, não conta. */
export const AnimatedNumber = ({ value, money = false, ...props }: AnimatedNumberProps) => {
  // Valor redondo sai sem centavos ("R$ 14.200"); com centavos, mostra os centavos.
  const dinheiro = Number.isInteger(value) ? (n: number) => MONEY_REDONDO.format(Math.round(n)) : (n: number) => MONEY.format(n);
  return <CountUp {...props} value={value} format={money ? dinheiro : (n) => COUNT.format(Math.round(n))} />;
};
