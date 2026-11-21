#!/usr/bin/env bash
# Gera um WAV com frases em pt-BR separadas por silêncio e abre o Chrome usando
# esse arquivo como microfone. Serve para medir latência sem uma pessoa falando.
# Precisa de macOS (comando say) e ffmpeg.
# Uso: npm run dev em outro terminal, depois ./scripts/audio-falso.sh
# A página começa sozinha (?auto=75), encerra depois de 75 s e o terminal do
# npm run dev imprime as linhas [latencia-navegador] e [latencia-agora].
set -euo pipefail
dir="$(mktemp -d)"
frases=(
  "Oi, tudo bem? Eu preciso comprar diesel para a fazenda."
  "Uns cinco mil litros. Dá para entregar até quinta?"
  "E quanto fica mais ou menos o litro hoje?"
  "Tá bom, obrigado. Pode encerrar."
)
entradas=(-f lavfi -t 8 -i anullsrc=r=48000:cl=mono)   # 8 s para a saudação
filtro="[0:a]"
n=1
for i in "${!frases[@]}"; do
  say -v Luciana -o "$dir/f$i.aiff" "${frases[$i]}"
  entradas+=(-i "$dir/f$i.aiff" -f lavfi -t 10 -i anullsrc=r=48000:cl=mono)  # 10 s para a resposta
  filtro+="[$n:a][$((n + 1)):a]"
  n=$((n + 2))
done
filtro+="concat=n=$n:v=0:a=1[out]"
ffmpeg -loglevel error -y "${entradas[@]}" -filter_complex "$filtro" -map "[out]" -ar 48000 -ac 1 "$dir/fala.wav"
echo "Áudio: $dir/fala.wav"
[ "${SO_GERAR:-}" = 1 ] && exit 0
open -na "Google Chrome" --args \
  --user-data-dir="$dir/chrome" \
  --use-fake-ui-for-media-stream \
  --use-fake-device-for-media-stream \
  --autoplay-policy=no-user-gesture-required \
  "--use-file-for-fake-audio-capture=$dir/fala.wav%noloop" \
  "${URL:-http://localhost:3000}/?auto=75"
