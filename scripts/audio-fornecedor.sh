#!/usr/bin/env bash
# Gera o WAV do fornecedor para a prova de voz da ligação (scripts/rodada.mjs <túnel>/fornecedor/a <wav>).
# Cada fala tem o silêncio que vem DEPOIS dela. A 3ª entra ~3,5 s depois da 2ª, enquanto o agente
# ainda fala: é a interrupção. Precisa de macOS (say) e ffmpeg.
set -euo pipefail
dir="$(mktemp -d)"
falas=(
  "Faço a seis e vinte o litro.|9"
  "Pra dois mil litros eu consigo seis e dez.|3.5"
  "Entrego na quarta, pode contar. O frete é por minha conta.|8"
  "Pix à vista.|17"
  "Isso, tá certo.|12"
)
entradas=(-f lavfi -t 16 -i anullsrc=r=48000:cl=mono)   # 16 s para a saudação (diz que é IA e pede o preço)
filtro="[0:a]"
n=1
for i in "${!falas[@]}"; do
  texto="${falas[$i]%%|*}"
  pausa="${falas[$i]##*|}"
  say -v Luciana -o "$dir/f$i.aiff" "$texto"
  entradas+=(-i "$dir/f$i.aiff" -f lavfi -t "$pausa" -i anullsrc=r=48000:cl=mono)
  filtro+="[$n:a][$((n + 1)):a]"
  n=$((n + 2))
done
filtro+="concat=n=$n:v=0:a=1[out]"
ffmpeg -loglevel error -y "${entradas[@]}" -filter_complex "$filtro" -map "[out]" -ar 48000 -ac 1 "$dir/fornecedor.wav"
echo "$dir/fornecedor.wav"
