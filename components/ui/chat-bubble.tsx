import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type ChatBubbleDirection = "inbound" | "outbound";

const BUBBLE: Record<ChatBubbleDirection, string> = {
  // Recebida: branca com sombra, cauda em cima à esquerda.
  inbound: "self-start rounded-2xl rounded-tl-sm bg-card px-3.5 py-2.5 shadow-bubble",
  // Enviada: sálvia claro, à direita.
  outbound: "self-end rounded-2xl rounded-tr-sm bg-bubble-out px-3.5 py-2.5 text-bubble-out-foreground shadow-bubble",
};

export type ChatBubbleProps = Omit<ComponentProps<"div">, "children"> & {
  readonly direction: ChatBubbleDirection;
  /** A linha em negrito no topo: quem fala. */
  readonly signature?: ReactNode;
  readonly time?: string;
  readonly children: ReactNode;
};

/** Uma fala da conversa. Alinha-se sozinha: vai dentro de uma coluna flex. */
export const ChatBubble = ({ direction, signature, time, className, children, ...props }: ChatBubbleProps) => (
  <div
    data-slot="chat-bubble"
    data-direction={direction}
    className={cn("max-w-[85%] text-[15px] leading-snug", BUBBLE[direction], className)}
    {...props}
  >
    {signature ? <b className="mb-0.5 block text-xs font-semibold text-muted-foreground">{signature}</b> : null}
    {children}
    {time ? <time className="block text-end text-xs text-muted-foreground tabular-nums">{time}</time> : null}
  </div>
);
