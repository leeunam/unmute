import { NextResponse } from "next/server";
import { resetarCompra, visaoCompra } from "@/lib/compra";
import { estado, resetar } from "@/lib/tarefa";

// GET: a tarefa em memória, a conversa e a compra com as ligações (a página consulta a cada 500 ms).
// POST: zera tarefa e compra (para testes em texto; /api/sessao também zera).
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ...estado(), compra: visaoCompra() });
}

export async function POST() {
  resetar();
  resetarCompra();
  return NextResponse.json(estado());
}
