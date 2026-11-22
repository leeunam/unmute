#!/usr/bin/env bash
# Uma rodada de voz da demo inteira, sem ninguém falando: 4 Chromes headless, cada um com o seu WAV
# no microfone (scripts/audio-demo.sh). O produtor pede, A toca e atende, B toca quando A termina,
# a tela do produtor toca com a recomendação e ele diz "fecha". No fim, imprime o estado da compra
# e confere que nenhum agente ficou de pé.
# Uso (com npm start e npm run tunel rodando): ./scripts/demo-voz.sh https://<túnel> [pasta-de-saída]
set -euo pipefail
url="$1"
out="${2:-$(mktemp -d)}"
mkdir -p "$out"
wav="$(./scripts/audio-demo.sh "$out/wav" | tail -1)"
curl -s -X POST "$url/api/tarefa" >/dev/null   # zera a tarefa e a compra
echo "saída em $out"

SEM_LIMPAR=1 node scripts/rodada.mjs "$url" "$wav/produtor.wav" 120 "$out/produtor.webm" >"$out/1-produtor.log" 2>&1 &
p1=$!
ESPERAR=200 node scripts/rodada.mjs "$url/fornecedor/a" "$wav/fornecedor-a.wav" 150 >"$out/2-fornecedor-a.log" 2>&1 &
p2=$!
ESPERAR=400 node scripts/rodada.mjs "$url/fornecedor/b" "$wav/fornecedor-b.wav" 130 >"$out/3-fornecedor-b.log" 2>&1 &
p3=$!
# A volta ao produtor só pode abrir depois que a compra começou (antes disso, ?auto= começaria um pedido novo).
until curl -s "$url/api/tarefa" | grep -q '"estado":"LIGANDO_A"'; do sleep 2; done
echo "LIGANDO_A: a tela de A toca"
ESPERAR=400 node scripts/rodada.mjs "$url" "$wav/retorno.wav" 60 "$out/retorno.webm" >"$out/4-retorno.log" 2>&1 &
p4=$!
wait $p1 $p2 $p3 $p4 || true
curl -s "$url/api/tarefa" | node -e '
const e = JSON.parse(require("fs").readFileSync(0, "utf8"));
const c = e.compra;
console.log("estados:", c.historico.map((h) => h.estado).join(" → "));
for (const l of c.ligacoes) console.log(l.fornecedor.id, l.status, JSON.stringify(l.oferta));
console.log("comparação:", JSON.stringify(c.comparacao));
console.log("frase:", c.frase);
console.log("fechada com:", c.fechada_com);'
agentes="$(curl -s "$url/api/agentes")"
echo "agentes de pé: $agentes"
if echo "$agentes" | grep -q agent_id; then curl -s -X POST "$url/api/agentes"; echo; fi
