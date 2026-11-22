import { NextResponse } from "next/server";
import { visaoProdutor } from "@/lib/negociacao";
import { estado, resetar } from "@/lib/tarefa";

// GET: a tarefa em memória, a conversa e a ligação para o fornecedor (a página consulta a cada 500 ms).
// POST: zera (para testes em texto; /api/sessao também zera).
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ...estado(), ligacao: visaoProdutor() });
}

export async function POST() {
  resetar();
  return NextResponse.json(estado());
}
