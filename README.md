# Desenrola Agro

O produtor rural fala o que precisa e um agente de voz negocia com os fornecedores por ele.
A spec completa está em [`CLAUDE.md`](CLAUDE.md).

Este repositório está na **fase 2**: o produtor fala o pedido para o agente de voz da Agora e ele vira uma tarefa
estruturada na tela, com o agente perguntando o que faltar. O resultado dos testes fica em [`TESTES.md`](TESTES.md).

## Como rodar

Precisa de Node 20 ou mais novo e do `cloudflared` (`brew install cloudflared`).

```bash
npm install
cp .env.example .env.local   # preencha as chaves (veja abaixo)
npm run build && npm start   # num terminal (dev também funciona, mas compila a rota na 1ª chamada)
npm run tunel                # noutro: mostra um endereço https://…trycloudflare.com
```

Abra **o endereço do túnel** no navegador, clique em **Falar com o agente**, permita o microfone e diga o pedido,
por exemplo: "Oi, preciso falar com meu fornecedor de combustível, pra reabastecer até quinta. Desenrola um preço de
até 15 mil." O cartão **Pedido** se preenche enquanto você fala.
A Agora precisa chamar a nossa rota de LLM pela internet. Por isso o app é aberto pelo túnel, e o servidor
usa esse mesmo endereço para a Agora.

Ao clicar em **Encerrar conversa**, a página mostra duas medidas de latência:

- **No navegador**: do último som da sua fala até o primeiro som do agente.
- **Pela Agora**: a métrica `e2e_latency_ms` de cada turno, com as partes (ASR, LLM, TTS).

O terminal do servidor imprime, a cada turno, o tempo até o primeiro token na nossa rota (`[llm] … ttft_ms=`).

### Chaves necessárias

| Variável | Onde achar |
|---|---|
| `AGORA_APP_ID`, `AGORA_APP_CERTIFICATE` | [console.agora.io](https://console.agora.io) → projeto → Config. O projeto precisa ter o App Certificate ligado. |
| `FEITA_API_KEY` | feita.ai → API Keys |
| `LLM_PROXY_SECRET` | Qualquer segredo: `openssl rand -hex 24` |

Reconhecimento de fala e voz não precisam de chave: usam o modo gerenciado da Agora.

### Medir sem ninguém falando (macOS)

```bash
URL=https://<endereço-do-túnel> ./scripts/audio-falso.sh
```

Precisa do `ffmpeg`. O Chrome abre em `/?auto=75`: a conversa começa sozinha, encerra depois de 75 s e o terminal
do servidor imprime as linhas `[latencia-navegador]` e `[latencia-agora]`.

Para testar o pedido em texto, sem Agora e sem gastar minutos (com `npm start` rodando):

```bash
node --env-file=.env.local scripts/conversa-texto.mjs google/gemini-3.5-flash-lite 3
```

Para medir só o LLM (sem Agora), compare o gateway direto com a nossa rota:

```bash
npm run medir-llm -- https://api.feita.ai/gateway/v1/chat/completions $FEITA_API_KEY 5
npm run medir-llm -- https://<túnel>/api/llm/chat/completions $LLM_PROXY_SECRET 5
```

## Como funciona

```
navegador ──(RTC, áudio)── canal Agora ── agente do Conversational AI Engine
    │                                       ASR: Deepgram nova-3 pt-BR (gerenciado pela Agora)
    │ POST /api/sessao                      TTS: Cartesia sonic-3.6 (gerenciado pela Agora)
    ▼                                       LLM: chama a nossa rota ↓
servidor Next.js ◀──(túnel cloudflared)──── POST /api/llm/chat/completions (SSE, formato OpenAI)
    │                                          AI SDK streamText + tool criar_tarefa → gateway da feita.ai
    │                                          (Gemini 3.5 Flash Lite)
    └── GET /api/tarefa (a página consulta a cada 500 ms)
    └──(REST)── api.agora.io/api/conversational-ai-agent/v2 (join, leave, turns)
```

- `app/api/sessao`: cria o canal, gera os tokens e chama `join` para subir o agente.
- `app/api/llm/chat/completions`: o LLM do agente. Recebe o pedido da Agora e responde em streaming pelo
  AI SDK com a feita.ai. Roda a tool `criar_tarefa` em dois passos e só manda o texto para a Agora.
- `lib/tarefa.ts`: a tarefa em memória. Valida o que falta, transforma o prazo falado em data e monta a
  confirmação com números por extenso. Quem decide se a tarefa está completa é este código, não o modelo.
- `app/api/tarefa`: GET devolve a tarefa e a conversa para a página; POST zera.
- `app/api/encerrar`: chama `leave`.
- `app/api/latencia`: chama `turns` e resume a latência dos turnos de voz.
- `lib/agora.ts`: toda a configuração do agente (prompt, ASR, LLM, TTS, detecção de fim de fala).
