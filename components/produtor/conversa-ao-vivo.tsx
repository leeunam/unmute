"use client";

import { useEffect, useRef } from "react";
import { ChatCircleDots } from "@phosphor-icons/react/dist/ssr";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ChatBubble } from "@/components/ui/chat-bubble";

export type Fala = { quem: string; texto: string };

type Props = {
  falas: Fala[];
  /** Quem fala do lado de cá (aparece à direita, em sálvia). */
  eu?: string;
  nomes?: Record<string, string>;
  titulo?: string;
};

/** A conversa ao vivo em balões; desce sozinha quando chega fala nova. */
export function ConversaAoVivo({ falas, eu = "produtor", nomes = { produtor: "Você" }, titulo = "Conversa" }: Props) {
  const lista = useRef<HTMLDivElement>(null);
  // Desce só a caixa da conversa, nunca a página.
  useEffect(() => {
    const el = lista.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [falas.length]);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{titulo}</CardTitle>
        <CardDescription className="tabular-nums">{falas.length > 0 ? `${falas.length} falas` : ""}</CardDescription>
      </CardHeader>
      <div ref={lista} className="mx-3 mb-3 flex max-h-[560px] min-h-[220px] flex-col gap-2.5 overflow-y-auto rounded-2xl bg-background p-4">
        {falas.length === 0 ? (
          <div className="m-auto flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
            <ChatCircleDots className="size-7 text-primary-ink/60" />
            A conversa aparece aqui enquanto vocês falam.
          </div>
        ) : (
          falas.map((f, i) => (
            <ChatBubble
              key={i}
              className="m-enter"
              direction={f.quem === eu ? "outbound" : "inbound"}
              signature={nomes[f.quem] ?? "Agente"}
            >
              {f.texto}
            </ChatBubble>
          ))
        )}
      </div>
    </Card>
  );
}
