# Imagem do Desenrola Agro para a VPS (scripts/deploy-vps.sh). O .env não entra na imagem: vai no serviço.
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build
ENV NODE_ENV=production
EXPOSE 3000
# Sem npx: o sinal de parada chega direto ao Next (o npx registrava SIGTERM como erro).
CMD ["node_modules/.bin/next", "start", "-H", "0.0.0.0", "-p", "3000"]
