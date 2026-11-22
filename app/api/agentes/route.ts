import { NextResponse } from "next/server";
import { listRunning, stopAgent } from "@/lib/agora";

// GET lista agentes de pé; POST encerra todos. Para não deixar agente gastando RTC.
export async function GET() {
  try {
    return NextResponse.json({ agentes: await listRunning() });
  } catch (err) {
    return NextResponse.json({ erro: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST() {
  try {
    const agentes = await listRunning();
    for (const a of agentes) await stopAgent(a.channel || "listagem", a.agent_id).catch(() => {});
    return NextResponse.json({ encerrados: agentes.map((a) => a.agent_id) });
  } catch (err) {
    return NextResponse.json({ erro: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
