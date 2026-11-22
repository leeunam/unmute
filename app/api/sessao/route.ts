import { NextRequest, NextResponse } from "next/server";
import { perfilRetorno, startAgent, USER_UID, userRtcToken } from "@/lib/agora";
import { compra, produtorAtendeu, resetarCompra } from "@/lib/compra";
import { resetar } from "@/lib/tarefa";

// Cria um canal novo, gera o token do navegador e sobe o agente da Agora nele.
// Body {retorno: true}: o produtor atende a ligação de volta com as ofertas. Não zera nada, e o
// agente abre falando a recomendação. Sem body: pedido novo, zera a tarefa e a compra.
export async function POST(req: NextRequest) {
  // Endereço público do app (o túnel), para a Agora chamar a nossa rota de LLM.
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const origin = `${proto}://${host}`;
  const { retorno = false } = await req.json().catch(() => ({}));
  console.log("[sessao] origin", origin, retorno ? "retorno" : "");
  const channel = `desenrola-${Date.now()}`;
  try {
    let perfil;
    if (retorno) {
      const estado = compra().estado;
      if (estado !== "OFERTAS_COLETADAS" && estado !== "AGUARDANDO_APROVACAO") {
        return NextResponse.json({ erro: `Sem ofertas para apresentar: a compra está em ${estado}.` }, { status: 409 });
      }
      perfil = perfilRetorno(produtorAtendeu()!);
    } else {
      resetar();
      resetarCompra();
    }
    const token = userRtcToken(channel);
    const agent = await startAgent(channel, origin, perfil);
    return NextResponse.json({
      appId: process.env.AGORA_APP_ID,
      channel,
      uid: USER_UID,
      token,
      agentId: agent.agent_id,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[sessao]", message);
    return NextResponse.json({ erro: message }, { status: 500 });
  }
}
