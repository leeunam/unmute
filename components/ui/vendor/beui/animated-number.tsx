/*
 * Copiado de beUI (https://beui.dev), de Saurabh Chauhan, licença MIT (ver ./LICENSE).
 * Fonte: https://github.com/starc007/ui-components/blob/7bb802bc0123fa8944bc327060e60a5bae8c65bc/components/motion/animated-number.tsx
 * Mudanças: o número aparece no valor já no primeiro desenho (servidor, sem script e movimento reduzido);
 * a contagem só corre onde o movimento é permitido.
 */
"use client";

import { animate, useInView, useReducedMotion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

export interface AnimatedNumberProps {
  value: number;
  duration?: number;
  format?: (n: number) => string;
  className?: string;
  startOnView?: boolean;
}

type CountPhase = "still" | "waiting" | "counting";

const countPhase = ({ reduce, startOnView, inView }: { reduce: boolean; startOnView: boolean; inView: boolean }): CountPhase => {
  if (reduce) return "still";
  if (startOnView && !inView) return "waiting";
  return "counting";
};

export function AnimatedNumber({
  value,
  duration = 1.2,
  format = (n) => Math.round(n).toLocaleString(),
  className,
  startOnView = true,
}: AnimatedNumberProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);

  const phase = countPhase({ reduce: reduce === true, startOnView, inView });

  useLayoutEffect(() => {
    if (phase !== "counting") return;
    fromRef.current = 0;
    setDisplay(0);
  }, [phase]);

  useEffect(() => {
    if (phase === "still") {
      fromRef.current = value;
      setDisplay(value);
      return;
    }
    if (phase === "waiting") return;
    const controls = animate(fromRef.current, value, {
      duration,
      ease: EASE_OUT,
      onUpdate: (v) => setDisplay(v),
    });
    fromRef.current = value;
    return () => controls.stop();
  }, [value, duration, phase]);

  return (
    <span ref={ref} className={cn("tabular-nums", className)}>
      {format(display)}
    </span>
  );
}
