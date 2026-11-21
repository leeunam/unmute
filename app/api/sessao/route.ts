import { NextResponse } from "next/server";
import { startAgent, USER_UID, userRtcToken } from "@/lib/agora";

// Cria um canal novo, gera o token do navegador e sobe o agente da Agora nele.
export async function POST() {
  const channel = `desenrola-${Date.now()}`;
  try {
    const token = userRtcToken(channel);
    const agent = await startAgent(channel);
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
    return NextResponse.json({ erro: message }, { status: 502 });
  }
}
