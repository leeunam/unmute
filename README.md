# Desenrola Agro

O produtor rural fala o que precisa e um agente de voz negocia com os fornecedores por ele.
A spec completa está em [`CLAUDE.md`](CLAUDE.md).

Este repositório está na **fase 1**: um agente de voz da Agora conversando em português do Brasil
no navegador, com a latência medida. O resultado dos testes fica em [`TESTES.md`](TESTES.md).

## Como rodar

Precisa de Node 20 ou mais novo.

```bash
npm install
cp .env.example .env.local   # preencha as chaves (veja abaixo)
npm run dev
```

Abra http://localhost:3000, clique em **Falar com o agente**, permita o microfone e converse.
Ao clicar em **Encerrar conversa**, a página mostra duas medidas de latência:

- **No navegador**: do último som da sua fala até o primeiro som do agente.
- **Pela Agora**: a métrica `e2e_latency_ms` de cada turno, com as partes (ASR, LLM, TTS).

### Chaves necessárias

| Variável | Onde achar |
|---|---|
| `AGORA_APP_ID`, `AGORA_APP_CERTIFICATE` | [console.agora.io](https://console.agora.io) → projeto → Config. O projeto precisa ter o App Certificate ligado. |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) → API Keys |

ASR e TTS não precisam de chave: usam o modo gerenciado da Agora.
Sem chave da Anthropic, dá para testar com `LLM_PROVIDER=openai-gerenciado` (OpenAI paga pela Agora).

### Medir sem ninguém falando (macOS)

```bash
npm run dev                  # num terminal
./scripts/audio-falso.sh     # noutro: abre o Chrome com frases em pt-BR como microfone
```

Precisa do `ffmpeg`. No Chrome que abrir, clique em **Falar com o agente** e espere as quatro frases.

## Como funciona

```
navegador ──(RTC, áudio)── canal Agora ── agente do Conversational AI Engine
    │                                       ASR: ARES (Agora), pt-BR
    │ POST /api/sessao                      LLM: Claude (API da Anthropic)
    ▼                                       TTS: MiniMax (gerenciado pela Agora)
servidor Next.js ──(REST)── api.agora.io/api/conversational-ai-agent/v2
```

- `app/api/sessao`: cria o canal, gera os tokens e chama `join` para subir o agente.
- `app/api/encerrar`: chama `leave`.
- `app/api/latencia`: chama `turns` e resume a latência dos turnos de voz.
- `lib/agora.ts`: toda a configuração do agente (prompt, ASR, LLM, TTS, detecção de fim de fala).
