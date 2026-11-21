# Testes do Desenrola Agro

## Fase 1: agente de voz em pt-BR no navegador

**Pergunta:** o Conversational AI Engine da Agora conversa em português do Brasil com latência boa para a demo?
**Alvo:** menos de ~1,5 s entre o fim da fala e o início da resposta.

### Configuração testada

| Peça | Provedor | Por quê |
|---|---|---|
| ASR | ARES (nativo da Agora), `pt-BR` | Sem chave, sem salto para outro provedor. Aceita `pt-BR`. |
| LLM | `google/gemini-3.5-flash-lite` pelo gateway da feita.ai, via nossa rota com AI SDK | O mais rápido até o primeiro token entre os testados (abaixo). |
| TTS | MiniMax `speech-2.8-turbo`, voz `Portuguese_FriendlyNeighbor`, modo gerenciado | Sem chave, tem dezenas de vozes em português. |
| Fim de fala | VAD com 480 ms de silêncio | Fim de fala semântico só existe para inglês e chinês. O padrão é 640 ms. |

### Como medir

1. `npm run build && npm start`, `npm run tunel` e abrir o endereço do túnel.
   Sem ninguém falando: `URL=https://<túnel> ./scripts/audio-falso.sh` começa e encerra sozinho.
2. Conversar pelo menos 5 turnos e clicar em **Encerrar conversa**.
3. Anotar as medidas:
   - **Navegador:** último som da fala até o primeiro som do agente. Inclui a espera do VAD e a rede.
   - **Agora (`e2e_latency_ms`):** vem da API `turns`. Conta só turnos iniciados por voz, sem a saudação.
     As partes são `asr_ttlw`, `llm_ttft`, `llm_ftfs`, `tts_ttfb` e `algorithm_processing`.
   - **Nossa rota:** `[llm] ttft_ms=` no terminal do servidor.

### Resultados

#### 1. LLM pelo gateway da feita.ai: tempo até o primeiro token (21/11/2026)

Medido do Mac em São Paulo com `scripts/medir-llm.mjs`: pedido em streaming com prompt de sistema e uma
frase de produtor. O tempo conta até o primeiro token de **conteúdo**.

Comparação de modelos, gateway direto, 3 pedidos cada (5 para o Haiku 5.5):

| Modelo | TTFT médio | Observação |
|---|---|---|
| `google/gemini-3.5-flash-lite` | **783 ms** | Frases curtas e naturais ("Claro, chefe. Quanto de diesel o senhor precisa?") |
| `openai/gpt-5.4-nano` | 1007 ms | Responde com listas e markdown |
| `anthropic/claude-haiku-4.5` | 1031 ms | Bom texto, às vezes com markdown |
| `anthropic/claude-haiku-5.5` | 1464 ms | Variou de 1,2 a 2,5 s; 1 de 5 respostas veio vazia |
| `openai/gpt-5.4-mini` | 1744 ms | Um pedido de 3 s |
| `qwen/qwen3.8-flash`, `z-ai/glm-5.3-flash` | 5 s ou mais | Raciocinam antes; respostas vazias |
| `google/gemini-3.8-flash` | 5060 ms | Raciocina antes |

Quanto a nossa rota (AI SDK) e o túnel somam, com `google/gemini-3.5-flash-lite`, 6 pedidos cada:

| Caminho | TTFT médio | Mediana | Máx |
|---|---|---|---|
| Gateway da feita.ai direto | 628 ms | 552 ms | 1028 ms |
| Nossa rota, local | 596 ms | 584 ms | 720 ms |
| Nossa rota pelo túnel cloudflared | 626 ms | 575 ms | 940 ms |

Claude pelo túnel, 5 pedidos cada: `claude-haiku-4.5` com média de 889 ms e `claude-haiku-5.5` com 1952 ms.

**Leitura:**
- Medida do Mac, a rota com AI SDK e o túnel não somam nada mensurável: a diferença fica dentro da variação
  do próprio gateway.
- Na conversa real, a Agora chama o túnel a partir da nuvem dela. Isso acrescenta o trecho nuvem da Agora →
  Cloudflare → Mac. O número dessa parte sai do `llm_ttft` da Agora, comparando `LLM_PROVIDER=feita-proxy`
  com `feita-direto`.
- O LLM é a maior parte do orçamento. Com `gemini-3.5-flash-lite` (~0,6–0,8 s) sobram ~0,7 s para VAD (0,48 s),
  ASR e o primeiro áudio do TTS. Com Claude Haiku 5.5 o alvo de 1,5 s não fecha.

#### 2. Conversa de ponta a ponta pela Agora

**Ainda não medido.** Faltam `AGORA_APP_ID` e `AGORA_APP_CERTIFICATE`.

| Data | Quem / áudio | LLM | Caminho | Turnos | Navegador média (p90) | Agora e2e média (p90) | `llm_ttft` médio | Observações |
|---|---|---|---|---|---|---|---|---|
| | | | | | | | | |

### O que ouvir além do número

- A voz `Portuguese_*` da MiniMax soa brasileira ou portuguesa? Se soar de Portugal, trocar `TTS_VOICE`
  ou passar para Cartesia `sonic-3.x` gerenciado com `language: "pt"`.
- O ARES entende sotaque do interior e termos do agro (diesel, ração, adubo)? Se errar, usar `keywords`.
- Interrupção: falar por cima do agente corta a fala dele?

### feita.ai

A feita.ai é um app de criação de imagem e vídeo com IA. Ela tem um **gateway de modelos**
(feita.ai/ai-gateway) em `https://api.feita.ai/gateway/v1`, compatível com OpenAI (`/chat/completions`,
`/responses`) e Anthropic (`/messages`), com mais de 500 modelos. A chave usa `Authorization: Bearer`.

Na primeira investigação testei `https://api.feita.ai/v1/chat/completions` e `/v1/messages`, que dão 404.
O gateway fica no prefixo `/gateway/v1`, achado no código do próprio site.

Créditos da conta em 21/11/2026: 200 de uso geral e 10.000 restritos a `deepseek/deepseek-v4.1-flash-1017`.
Esse DeepSeek gasta tokens raciocinando antes de responder: TTFT de ~1,9 s. Cada pedido curto com Gemini
Flash Lite ou Claude Haiku custa ~0,003–0,004 crédito.
