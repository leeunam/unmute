import { NextRequest, NextResponse } from "next/server";
import { stopAgent } from "@/lib/agora";

export async function POST(req: NextRequest) {
  const { channel, agentId } = await req.json();
  if (!channel || !agentId) return NextResponse.json({ erro: "channel e agentId são obrigatórios" }, { status: 400 });
  try {
    await stopAgent(channel, agentId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[encerrar]", message);
    return NextResponse.json({ erro: message }, { status: 502 });
  }
}
