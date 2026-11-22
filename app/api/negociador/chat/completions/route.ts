// LLM do agente negociador (rota irmã de /api/llm, mesmo contrato OpenAI com SSE).
// A Agora chama esta URL na ligação para o fornecedor. O contexto do modelo sai só de
// contextoNegociador(): pedido + meta por unidade. O teto nunca entra.
//
// Quem manda na ligação é o código:
// - registrar_oferta, fornecedor_indisponivel e encerrar_ligacao validam com zod e
//   devolvem ao modelo o que falta (2º passo só nos turnos com tool);
// - cada frase passa por conferirFrase() antes de ir para a voz: corta "fechado",
//   corta despedida sem oferta completa e corta qualquer forma do teto;
// - a despedida é falada pelo código quando encerrar_ligacao passa.
import { streamText, tool, type ModelMessage } from "ai";
import { NextRequest } from "next/server";
import { avancar } from "@/lib/compra";
import { comReserva, feita, feitaModelId, feitaModeloReserva, feitaReasoning } from "@/lib/feita";
import { sanear, SEM_FALA, type MensagemOpenAI } from "@/lib/historico";
import {
  conferirFrase,
  contextoNegociador,
  despedida,
  ehDespedida,
  encerrarLigacao,
  encerrarSchema,
  finalizar,
  indisponivelSchema,
  ligacao,
  marcarIndisponivel,
  perguntaQueFalta,
  perguntouLimite,
  podeEncerrar,
  PROMPT_NEGOCIADOR,
  registrarOferta,
  registrarOfertaSchema,
  respostaLimite,
  saudacao,
  type Ligacao,
} from "@/lib/negociacao";

// O prompt de sistema é todo do código (o da Agora é ignorado): regras + contexto sem teto.
// O histórico vem saneado (lib/historico.ts): sem vazias e com as seguidas do mesmo papel juntas.
function conversa(l: Ligacao, messages: MensagemOpenAI[]) {
  const { conversa: msgs, semFala, ajustes } = sanear(messages);
  // Se a Agora não mandar a saudação no histórico, ela entra aqui: o modelo precisa saber que já se apresentou.
  if (msgs[0]?.role !== "assistant") msgs.unshift({ role: "assistant", content: saudacao(l) } as ModelMessage);
  return { msgs, semFala, ajustes };
}

function ferramentas(l: Ligacao) {
  return {
    registrar_oferta: tool({
      description:
        "Anota o que o fornecedor disse da oferta: preço por unidade, prazo, frete, pagamento. Mande só o que ele disse agora. O sistema calcula o total e diz o que falta.",
      inputSchema: registrarOfertaSchema,
      execute: async (e) => registrarOferta(l, e),
    }),
    fornecedor_indisponivel: tool({
      description:
        "Use quando o fornecedor não tem o produto, não atende o pedido, se recusa a negociar ou fica grosseiro. NÃO use quando ele só pede para você confirmar com o produtor.",
      inputSchema: indisponivelSchema,
      execute: async (e) => marcarIndisponivel(l, e),
    }),
    encerrar_ligacao: tool({
      description:
        "Termina a ligação. Só passa com a oferta completa (preço, prazo firme, frete e pagamento) ou com o fornecedor indisponível. O sistema fala a despedida.",
      inputSchema: encerrarSchema,
      execute: async (e) => encerrarLigacao(l, e),
    }),
  };
}

export async function POST(req: NextRequest) {
  const t0 = performance.now();
  const segredo = process.env.LLM_PROXY_SECRET;
  if (segredo && req.headers.get("authorization") !== `Bearer ${segredo}`) {
    return new Response("não autorizado", { status: 401 });
  }
  const body = await req.json();
  const modelo: string = body.model ?? feitaModelId();
  const id = `chatcmpl-${Date.now()}`;
  const created = Math.floor(Date.now() / 1000);
  const turno = body.turn_id ?? "?";
  const enc = new TextEncoder();
  const chunk = (delta: Record<string, string>, finish: string | null) =>
    enc.encode(
      `data: ${JSON.stringify({ id, object: "chat.completion.chunk", created, model: modelo, choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`,
    );
  const resposta = (gerar: (falar: (t: string) => void) => Promise<void>) =>
    new Response(
      new ReadableStream({
        async start(controller) {
          controller.enqueue(chunk({ role: "assistant" }, null));
          try {
            await gerar((t) => controller.enqueue(chunk({ content: t }, null)));
          } catch (err) {
            console.error("[negociador] stream", err);
          }
          controller.enqueue(chunk({}, "stop"));
          controller.enqueue(enc.encode("data: [DONE]\n\n"));
          controller.close();
        },
      }),
      { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" } },
    );

  // A URL do agente traz ?fornecedor=a; sem ele (scripts antigos), vale a última ligação.
  const l = ligacao(req.nextUrl.searchParams.get("fornecedor") ?? undefined);
  if (!l || l.status === "encerrada") {
    return resposta(async (falar) => falar(l ? "Até mais!" : "Desculpa, essa ligação não está ativa."));
  }

  const { msgs, semFala, ajustes } = conversa(l, body.messages ?? []);
  // O fornecedor não disse nada que deu para usar (ex.: logo depois de uma interrupção): pede para repetir,
  // antes de mexer no estado da ligação. Sem isso, o histórico termina numa fala do agente e o Gemini recusa (400).
  if (semFala) {
    console.log(`[negociador] fornecedor=${l.fornecedor.id} turno=${turno} sem_fala historico=${JSON.stringify(ajustes)}`);
    return resposta(async (falar) => falar(SEM_FALA));
  }
  const ultima = msgs.at(-1);
  l.ultima_fala_fornecedor = ultima?.role === "user" ? String(ultima.content) : "";
  l.falas_fornecedor = msgs.filter((m) => m.role === "user").map((m) => String(m.content)).join(" ");
  if (l.oferta.completa) l.turnos_com_oferta_completa++;
  const passos: string[] = [];

  // "Qual o máximo que ele paga?": o negociador não sabe (o teto não está no contexto). Quem responde é o
  // código, sem LLM, para o modelo não inventar ("ele não estipulou limite"). Regra 4.
  if (perguntouLimite(l.ultima_fala_fornecedor)) {
    const fala = respostaLimite(l);
    l.conversa = [
      ...msgs.map((m) => ({ quem: m.role === "user" ? ("fornecedor" as const) : ("agente" as const), texto: String(m.content) })),
      { quem: "agente" as const, texto: fala },
    ];
    console.log(`[negociador] fornecedor=${l.fornecedor.id} turno=${turno} limite_pelo_codigo resposta=${JSON.stringify(fala)}`);
    return resposta(async (falar) => falar(fala));
  }

  const criar = (m: string) => streamText({
    model: feita.chatModel(m),
    instructions: `${PROMPT_NEGOCIADOR}\n\n${contextoNegociador(l)}`,
    messages: msgs,
    tools: ferramentas(l),
    toolChoice: "auto",
    // Texto puro: uma chamada. registrar_oferta traz a fala pronta do código: para no 1º passo.
    // encerrar_ligacao recusado (ou indisponível) volta ao modelo (até 3 passos).
    // Se encerrar_ligacao passou, para na hora: a despedida é do código.
    stopWhen: ({ steps }) =>
      steps.length >= 3 ||
      l.status === "encerrada" ||
      !!steps.at(-1)?.toolResults.some((r) => typeof (r.output as { fala?: string })?.fala === "string"),
    maxOutputTokens: body.max_tokens ?? 300,
    abortSignal: req.signal,
    providerOptions: { feita: { reasoning: feitaReasoning(m) } } as never,
    onError: ({ error }) => console.error("[negociador] erro", m, error instanceof Error ? error.message : error),
  });

  let primeiro = 0;
  let dito = "";
  return resposta(async (falarBruto) => {
    const falar = (t: string) => {
      if (!t.trim()) return;
      if (!primeiro) primeiro = performance.now();
      const parte = dito ? ` ${t.trim()}` : t.trim();
      dito += parte;
      falarBruto(parte);
    };
    const bloqueios: string[] = [];
    let despediuSe = false;
    // Frase a frase: só sai para a voz o que passou no filtro.
    const soltar = (frase: string, doCodigo = false) => {
      if (!frase.trim()) return;
      const v = conferirFrase(l, frase, doCodigo);
      if (!v.ok) {
        bloqueios.push(`${v.motivo}: ${frase.trim()}`);
        if (v.motivo === "despedida_cedo") l.saidas_bloqueadas++;
        // O modelo falou do limite: no lugar, a frase do código (uma vez só).
        if (v.motivo === "limite" && !bloqueios.some((b) => b.startsWith("trocada"))) {
          bloqueios.push("trocada: limite");
          falar(respostaLimite(l));
        }
        return;
      }
      if (ehDespedida(frase)) despediuSe = true;
      falar(frase);
    };
    let buffer = "";
    let encerrouAgora = false;
    const falasTool: string[] = [];
    // Se o gateway der erro, uma 2ª tentativa com outro modelo (lib/feita.ts).
    const partes = comReserva(() => criar(modelo).fullStream, () => criar(feitaModeloReserva()).fullStream, "negociador", {
      signal: req.signal,
      falou: () => !!dito,
      // O que a 1ª juntou (texto degenerado, frase cortada) não entra na fala da 2ª.
      recomecar: () => {
        buffer = "";
        passos.push("2a_tentativa");
      },
    });
    for await (const part of partes) {
      const ms = Math.round(performance.now() - t0);
      if (part.type === "tool-call") passos.push(`tool@${ms} ${part.toolName} ${JSON.stringify(part.input)}`);
      if (part.type === "tool-result") {
        passos.push(`resultado ${part.toolName} ${JSON.stringify(part.output)}`);
        if (part.toolName === "encerrar_ligacao" && (part.output as { ok?: boolean }).ok) encerrouAgora = true;
        const f = (part.output as { fala?: string }).fala;
        if (f) falasTool.push(f);
      }
      if (part.type === "finish-step") {
        soltar(buffer);
        buffer = "";
        passos.push(`fim_passo@${ms}`);
      }
      if (part.type === "error") console.error("[negociador] erro no stream", part.error);
      if (part.type !== "text-delta" || !part.text) continue;
      buffer += part.text;
      let m: RegExpMatchArray | null;
      while ((m = buffer.match(/^([\s\S]*?[.!?…])(\s+)/))) {
        soltar(m[1]);
        buffer = buffer.slice(m[0].length);
      }
    }
    soltar(buffer);
    // A fala do código (resultado de registrar_oferta) também passa pelo filtro.
    for (const f of falasTool) for (const frase of f.split(/(?<=[.!?…])\s+/)) soltar(frase, true);

    const tentouSair = bloqueios.some((b) => b.startsWith("despedida_cedo"));
    if (encerrouAgora) {
      falar(despedida(l)); // encerrar_ligacao passou: a despedida é do código
    } else if (podeEncerrar(l) && (despediuSe || !dito)) {
      // Oferta completa e o modelo se despediu (ou calou): o código encerra.
      if (!dito) falar(despedida(l));
      finalizar(l, despediuSe ? "despedida do modelo com oferta completa" : "encerrada pelo código");
    } else if (!podeEncerrar(l) && tentouSair) {
      // Tentou sair sem a oferta: volta para o que falta.
      falar(dito ? perguntaQueFalta(l) : `Antes de desligar, só me fala: ${perguntaQueFalta(l)}`);
    } else if (!dito) {
      // Tudo cortado (ex.: lixo do modelo): pede para repetir em vez de ficar mudo.
      falar(bloqueios.some((b) => b.startsWith("lixo")) ? "Desculpa, não peguei. Pode repetir, por favor?" : perguntaQueFalta(l) || "Pode repetir, por favor?");
    }

    l.conversa = [
      ...msgs.map((m) => ({ quem: m.role === "user" ? ("fornecedor" as const) : ("agente" as const), texto: String(m.content) })),
      { quem: "agente" as const, texto: dito },
    ];
    avancar(); // se esta ligação acabou, a próxima toca
    const ttft = primeiro ? Math.round(primeiro - t0) : -1;
    console.log(
      `[negociador] fornecedor=${l.fornecedor.id} turno=${turno} modelo=${modelo} ttft_ms=${ttft} total_ms=${Math.round(performance.now() - t0)} resposta=${JSON.stringify(dito)} bloqueios=${JSON.stringify(bloqueios)} passos=${JSON.stringify(passos)}${ajustes.length ? ` historico=${JSON.stringify(ajustes)}` : ""}`,
    );
  });
}
