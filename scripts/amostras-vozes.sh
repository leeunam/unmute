#!/usr/bin/env bash
# Grava a mesma fala em várias vozes pela Agora, para o dono escolher de ouvido.
# Para cada voz: sobe o app numa porta própria com a voz no .env, abre o Chrome headless com o microfone
# mudo, o agente fala só a saudação (a fala de teste), e o script salva o MP3 e o tts_ttfb do turno da
# saudação. O LLM vai direto para a feita (LLM_PROVIDER=feita-direto), então não precisa de túnel.
# Uso: npm run build && ./scripts/amostras-vozes.sh [só-esta-voz]
# Saída: amostras/vozes-v2/<fornecedor>-<voz>.mp3 e a tabela no terminal.
set -euo pipefail
cd "$(dirname "$0")/.."
PORTA=${PORTA:-3217}
SAIDA=amostras/vozes-v2
TMP="$(mktemp -d)"
mkdir -p "$SAIDA"
export SAUDACAO="Bom dia, aqui é o assistente de inteligência artificial do seu João. Tô ligando pra cotar dois mil e quinhentos litros de diesel S10, com entrega até quinta. Quanto que o senhor faz o litro?"
export LLM_PROVIDER=feita-direto

cartesia() { # $1 = voice id
  echo "{\"credential_mode\":\"managed\",\"vendor\":\"cartesia\",\"params\":{\"model_id\":\"sonic-3.6\",\"voice\":{\"mode\":\"id\",\"id\":\"$1\"},\"output_format\":{\"container\":\"raw\",\"sample_rate\":24000},\"language\":\"pt\"}}"
}
# nome | TTS_JSON (vazio = usa TTS_VENDOR/TTS_MODEL/TTS_VOICE da 3ª coluna)
VOZES=(
  "cartesia-jacqueline-atual|$(cartesia 9626c31c-bec5-4cca-baa8-f8ba9e84c8bc)|"
  "cartesia-felipe|$(cartesia 616c64d7-f541-436b-9b8d-e79cfbe19ef9)|"
  "cartesia-rafael|$(cartesia 07b6f895-78b9-4921-8e10-8a21c99c2e8a)|"
  "cartesia-fabiana|$(cartesia 81452d3b-a5f6-4ef4-afff-542182fac725)|"
  "cartesia-larissa|$(cartesia 8d826d43-20ad-4c56-8d37-1048eccca1bf)|"
  "cartesia-alice|$(cartesia 9904416a-0831-44ea-b8ee-5f145e8f9bbf)|"
  "elevenlabs-joao-pedro||TTS_VENDOR=feita TTS_MODEL=elevenlabs/eleven-flash-v2.5 TTS_VOICE=7u8qsX4HQsSHJ0f8xsQZ"
  "microsoft-francisca||TTS_VENDOR=feita TTS_MODEL=microsoft/mai-voice-2.1-flash TTS_VOICE=pt-BR-FranciscaNeural"
  "microsoft-antonio||TTS_VENDOR=feita TTS_MODEL=microsoft/mai-voice-2.1-flash TTS_VOICE=pt-BR-AntonioNeural"
  "fish-adam|{\"credential_mode\":\"managed\",\"vendor\":\"fishaudio\",\"params\":{\"reference_id\":\"84c748173dc14017a29c99ff7feb4d32\",\"backend\":\"s2.1-pro\"}}|"
  "minimax-friendly-neighbor||TTS_VENDOR=minimax TTS_VOICE=Portuguese_FriendlyNeighbor"
)

ffmpeg -loglevel error -y -f lavfi -t 40 -i anullsrc=r=48000:cl=mono "$TMP/mudo.wav"

for linha in "${VOZES[@]}"; do
  IFS='|' read -r nome json extra <<<"$linha"
  [ -n "${1:-}" ] && [ "$1" != "$nome" ] && continue
  log="$TMP/$nome.log"
  # shellcheck disable=SC2086
  env TTS_JSON="$json" $extra npx next start -p "$PORTA" >"$log" 2>&1 &
  pid=$!
  until curl -s -o /dev/null "http://localhost:$PORTA/api/tarefa"; do sleep 0.5; done
  SEM_LIMPAR=1 node scripts/rodada.mjs "http://localhost:$PORTA" "$TMP/mudo.wav" 18 "$TMP/$nome.webm" >"$TMP/$nome.rodada" 2>&1 || true
  sleep 2
  kill "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
  # Corta o silêncio do começo e do fim.
  ffmpeg -loglevel error -y -i "$TMP/$nome.webm" -af "silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse" -ac 1 -b:a 96k "$SAIDA/$nome.mp3" || echo "$nome: sem áudio"
  ttfb=$(grep -o '"inicio":"[a-z_]*","fim":"[a-z_]*","e2e_ms":[0-9a-z]*,"segmentos":{[^}]*}' "$log" | grep -v voice_input | head -1 | grep -o '"tts_ttfb":[0-9]*' | cut -d: -f2 || true)
  dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$SAIDA/$nome.mp3" 2>/dev/null || echo "?")
  vol=$(ffmpeg -i "$SAIDA/$nome.mp3" -af volumedetect -f null - 2>&1 | grep -o 'mean_volume: [-0-9.]* dB' || echo "?")
  echo "$nome | tts_ttfb=${ttfb:-?} ms | ${dur} s | ${vol}"
done
echo "logs em $TMP"
