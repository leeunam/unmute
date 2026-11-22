import { NextRequest, NextResponse } from "next/server";
import { aprovarOferta, cancelarTarefa, iniciarLigacoes, produtorAtendeu } from "@/lib/compra";

export const dynamic = "force-dynamic";

// POST {acao}: os botões da tela do produtor (reserva da voz) e os testes em texto.
//   ligar:    CRIADA → LIGANDO_A (o celular de A toca)
//   aprovar:  {oferta_id} fecha com essa oferta, se não foi descartada
//   cancelar: cancela a compra
//   retorno:  o produtor "atende" sem Agora (teste em texto); devolve a frase da recomendação
export async function POST(req: NextRequest) {
  const { acao, oferta_id } = await req.json();
  const r =
    acao === "ligar"
      ? iniciarLigacoes()
      : acao === "aprovar"
        ? aprovarOferta(String(oferta_id ?? ""))
        : acao === "cancelar"
          ? cancelarTarefa()
          : acao === "retorno"
            ? { ok: true, frase: produtorAtendeu() }
            : { ok: false, erro: `acao inválida: ${acao}` };
  return NextResponse.json(r, { status: r.ok ? 200 : 409 });
}
