import { NextResponse } from "next/server";
import { estado, resetar } from "@/lib/tarefa";

// GET: a tarefa em memória e a conversa (a página consulta a cada 500 ms).
// POST: zera (para testes em texto; /api/sessao também zera).
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(estado());
}

export async function POST() {
  resetar();
  return NextResponse.json(estado());
}
