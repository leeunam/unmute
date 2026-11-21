import { NextRequest, NextResponse } from "next/server";
import { getTurns } from "@/lib/agora";

// Latência medida pela própria Agora, turno a turno (e2e_latency_ms e segmentos).
export async function GET(req: NextRequest) {
  const channel = req.nextUrl.searchParams.get("channel");
  const agentId = req.nextUrl.searchParams.get("agentId");
  if (!channel || !agentId) return NextResponse.json({ erro: "channel e agentId são obrigatórios" }, { status: 400 });
  try {
    return NextResponse.json(await getTurns(channel, agentId));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[latencia]", message);
    return NextResponse.json({ erro: message }, { status: 502 });
  }
}
