import { NextRequest, NextResponse } from "next/server";
import { startAgent, USER_UID, userRtcToken } from "@/lib/agora";
import { avancar } from "@/lib/compra";
import { ligacao, novaLigacao, PROMPT_NEGOCIADOR, saudacao, visaoFornecedor } from "@/lib/negociacao";

export const dynamic = "force-dynamic";

// GET ?fornecedor=a: o que o celular do fornecedor mostra (sem pedido, sem teto).
// Também anda a compra: quando A termina, é esta consulta do celular de B que o faz tocar.
export async function GET(req: NextRequest) {
  avancar();
  return NextResponse.json(visaoFornecedor(req.nextUrl.searchParams.get("fornecedor") ?? ""));
}

// POST {acao, fornecedor}
//   ligar:   o celular do fornecedor começa a tocar (ainda sem agente: tocar não gasta minuto da Agora).
//            Liga só para um fornecedor, fora da compra (teste de uma ligação). A compra usa /api/compra.
//   atender: sobe o agente negociador no canal e devolve o token do fornecedor
//   recusar: marca a ligação como recusada
//   texto:   ligação sem Agora, para testar em texto. Se o celular estiver tocando (compra), atende;
//            senão cria uma ligação avulsa (scripts/negociacao-texto.mjs)
export async function POST(req: NextRequest) {
  const { acao, fornecedor = "a" } = await req.json();
  try {
    if (acao === "ligar") {
      novaLigacao(fornecedor, "tocando");
      return NextResponse.json({ ok: true });
    }
    if (acao === "texto") {
      const tocando = ligacao(fornecedor);
      const l = tocando?.status === "tocando" ? tocando : novaLigacao(fornecedor, "em_andamento");
      l.status = "em_andamento";
      return NextResponse.json({ saudacao: saudacao(l) });
    }
    const l = ligacao(fornecedor);
    if (!l || l.status !== "tocando") {
      return NextResponse.json({ erro: "Nenhuma chamada tocando para este fornecedor." }, { status: 409 });
    }
    if (acao === "recusar") {
      l.status = "recusada";
      l.fim = Date.now();
      avancar();
      return NextResponse.json({ ok: true });
    }
    if (acao === "atender") {
      const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
      const proto = req.headers.get("x-forwarded-proto") ?? "http";
      const channel = `ligacao-${fornecedor}-${Date.now()}`;
      const fala = saudacao(l);
      const agent = await startAgent(channel, `${proto}://${host}`, {
        // O id na URL: cada agente acha a sua ligação, mesmo quando a do outro fornecedor já começou.
        rota: `/api/negociador/chat/completions?fornecedor=${l.fornecedor.id}`,
        sistema: PROMPT_NEGOCIADOR, // a rota troca pelo prompt completo com o contexto; aqui é só o padrão da Agora
        saudacao: fala,
      });
      l.status = "em_andamento";
      l.canal = channel;
      l.agentId = agent.agent_id;
      l.conversa = [{ quem: "agente", texto: fala }];
      return NextResponse.json({
        appId: process.env.AGORA_APP_ID,
        channel,
        uid: USER_UID,
        token: userRtcToken(channel),
        agentId: agent.agent_id,
      });
    }
    return NextResponse.json({ erro: `acao inválida: ${acao}` }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[chamada]", message);
    return NextResponse.json({ erro: message }, { status: 500 });
  }
}
