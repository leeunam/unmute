#!/usr/bin/env bash
# Gera os 4 WAVs da rodada de voz da demo (scripts/demo-voz.sh): produtor, fornecedor A, fornecedor B e a
# volta ao produtor. Cada fala tem o silêncio que vem DEPOIS dela; o 1º número é o silêncio inicial,
# para a saudação do agente. Na ligação A, a 3ª fala entra ~3,5 s depois da 2ª, por cima do agente:
# é a interrupção. Precisa de macOS (say) e ffmpeg. Uso: ./scripts/audio-demo.sh <pasta>
set -euo pipefail
dir="${1:-$(mktemp -d)}"
mkdir -p "$dir"

gerar() { # gerar <saida> <silencio-inicial> "fala|pausa" ...
  local saida="$1" inicio="$2"
  shift 2
  local entradas=(-f lavfi -t "$inicio" -i anullsrc=r=48000:cl=mono) filtro="[0:a]" n=1 i=0
  for item in "$@"; do
    say -v Luciana -o "$dir/tmp$i.aiff" "${item%%|*}"
    entradas+=(-i "$dir/tmp$i.aiff" -f lavfi -t "${item##*|}" -i anullsrc=r=48000:cl=mono)
    filtro+="[$n:a][$((n + 1)):a]"
    n=$((n + 2))
    i=$((i + 1))
  done
  filtro+="concat=n=$n:v=0:a=1[out]"
  ffmpeg -loglevel error -y "${entradas[@]}" -filter_complex "$filtro" -map "[out]" -ar 48000 -ac 1 "$dir/$saida"
  rm -f "$dir"/tmp*.aiff
}

gerar produtor.wav 8 \
  "Oi, preciso falar com meu fornecedor de combustível, pra reabastecer até quinta. Desenrola um preço de até 15 mil.|9" \
  "Dois mil.|17" \
  "Pode ligar.|12"
gerar fornecedor-a.wav 16 \
  "Antes de te passar o preço, qual é o máximo que ele paga?|9" \
  "Faço a sete e trinta o litro.|3.5" \
  "Pra dois mil litros eu faço sete e dez, mais que isso não dá.|9" \
  "Entrego na quarta, pode contar. O frete é por minha conta.|8" \
  "Pix à vista.|18" \
  "Isso, tá certo.|12"
gerar fornecedor-b.wav 16 \
  "Faço a seis e cinquenta o litro.|10" \
  "Não baixo não, esse é o preço.|7" \
  "Só consigo entregar na sexta, pode contar. Frete por minha conta.|8" \
  "Boleto pra trinta dias.|18" \
  "Isso.|12"
gerar retorno.wav 15 \
  "Fecha.|12"
echo "$dir"
