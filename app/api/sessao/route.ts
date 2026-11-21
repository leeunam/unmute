import { NextRequest, NextResponse } from "next/server";
import { startAgent, USER_UID, userRtcToken } from "@/lib/agora";

// Cria um canal novo, gera o token do navegador e sobe o agente da Agora nele.
export async function POST(req: NextRequest) {
  // Endereço público do app (o túnel), para a Agora chamar a nossa rota de LLM.
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const origin = `${proto}://${host}`;
  console.log("[sessao] origin", origin);
  const channel = `desenrola-${Date.now()}`;
  try {
    const token = userRtcToken(channel);
    const agent = await startAgent(channel, origin);
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
