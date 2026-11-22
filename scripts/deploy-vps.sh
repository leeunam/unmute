#!/usr/bin/env bash
# Sobe o app na VPS do Davi (Easypanel com Traefik), fora do Easypanel, no mesmo padrão do social-credit:
# imagem buildada na VPS a partir do commit atual (git archive), serviço Docker "desenrola_app" na rede
# "easypanel" e uma rota no Traefik com HTTPS (Let's Encrypt) em https://desenrola.daviduarte.com.br.
# As chaves saem do .env.local e ficam só em /root/desenrola/app.env na VPS (fora da imagem).
# Uso: ./scripts/deploy-vps.sh   (sobe o HEAD commitado; mudança não commitada não vai)
# DNS público no serviço: com o DNS padrão do container, cada consulta à feita levava 4–11 s (o LLM ia de
# ~0,9 s para ~5 s por turno). Com 1.1.1.1, ~0,2 s.
# Para desfazer na VPS: docker service rm desenrola_app; rm /etc/easypanel/traefik/config/desenrola.yaml
set -euo pipefail
cd "$(dirname "$0")/.."
VPS=${VPS:-root@212.38.89.33}
DOMINIO=${DOMINIO:-desenrola.daviduarte.com.br}
TAG="desenrola:$(git rev-parse --short HEAD)"
remoto() { ssh -o ServerAliveInterval=60 -i "$HOME/.ssh/id_rsa" "$VPS" "$@"; }

echo "1/4 chaves → /root/desenrola/app.env"
{ grep -E '^[A-Z_]+=' .env.local | grep -v '^PUBLIC_URL='; echo "PUBLIC_URL=https://$DOMINIO"; } |
  remoto 'mkdir -p /root/desenrola && umask 077 && cat > /root/desenrola/app.env'

echo "2/4 build da imagem $TAG na VPS"
git archive --format=tar HEAD | remoto "docker build -q -t $TAG -"

echo "3/4 serviço desenrola_app"
remoto bash -s <<REMOTO
set -e
docker service rm desenrola_app >/dev/null 2>&1 && sleep 3 || true
docker service create -q --name desenrola_app --network easypanel --replicas 1 \
  --env-file /root/desenrola/app.env \
  --dns 1.1.1.1 --dns 8.8.8.8 \
  --label criado-por=claude-fora-do-easypanel --label projeto=desenrola-agro \
  $TAG
# A VPS está com o disco quase cheio: apaga as imagens antigas do desenrola.
docker image ls desenrola --format '{{.Repository}}:{{.Tag}}' | grep -vx "$TAG" | xargs -r docker image rm >/dev/null || true
REMOTO

echo "4/4 rota no Traefik"
remoto 'cat > /etc/easypanel/traefik/config/desenrola.yaml' <<YAML
# Desenrola Agro. Criado fora do Easypanel pelo scripts/deploy-vps.sh do repo leeunam/unmute.
# Para desfazer: apague este arquivo e rode "docker service rm desenrola_app".
http:
  routers:
    http-desenrola:
      rule: "Host(\`$DOMINIO\`)"
      service: desenrola
      entryPoints: [http]
      middlewares: [desenrola-https]
    https-desenrola:
      rule: "Host(\`$DOMINIO\`)"
      service: desenrola
      entryPoints: [https]
      tls:
        certResolver: letsencrypt
        domains:
          - main: $DOMINIO
  middlewares:
    desenrola-https:
      redirectScheme:
        scheme: https
        permanent: true
  services:
    desenrola:
      loadBalancer:
        passHostHeader: true
        servers:
          - url: "http://desenrola_app:3000/"
YAML

echo "pronto: https://$DOMINIO (o certificado pode levar alguns segundos na 1ª vez)"
