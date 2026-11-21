# Testes do Desenrola Agro

## Fase 1: agente de voz em pt-BR no navegador

**Pergunta:** o Conversational AI Engine da Agora conversa em português do Brasil com latência boa para a demo?
**Alvo:** menos de ~1,5 s entre o fim da fala e o início da resposta.

### Configuração testada

| Peça | Provedor | Por quê |
|---|---|---|
| ASR | ARES (nativo da Agora), `pt-BR` | Sem chave, sem salto para outro provedor. Aceita `pt-BR`. |
| LLM | Claude `claude-haiku-5-5` pela API da Anthropic (`style: "anthropic"`) | A Agora fala o formato da Anthropic direto: não precisa de proxy. Haiku é o Claude mais rápido. |
| TTS | MiniMax `speech-2.8-turbo`, voz `Portuguese_FriendlyNeighbor`, modo gerenciado | Sem chave, tem dezenas de vozes em português. |
| Fim de fala | VAD com 480 ms de silêncio | Fim de fala semântico só existe para inglês e chinês. O padrão é 640 ms. |

Plano B do LLM (spec, seção 9): `LLM_PROVIDER=openai-gerenciado` usa `gpt-4.1-mini` gerenciado pela Agora.

### Como medir

1. `npm run dev` e abrir http://localhost:3000 (ou `./scripts/audio-falso.sh` para usar frases gravadas).
2. Conversar pelo menos 5 turnos e clicar em **Encerrar conversa**.
3. Anotar as duas medidas da página:
   - **Navegador:** último som da fala até o primeiro som do agente. Inclui a espera do VAD e a rede.
   - **Agora (`e2e_latency_ms`):** vem da API `turns`. Conta só turnos iniciados por voz, sem a saudação.
     As partes são `asr_ttlw`, `llm_ttft`, `llm_ftfs`, `tts_ttfb` e `algorithm_processing`.

### Resultados

**Ainda não medido.** Faltam as credenciais da Agora e da Anthropic (veja o PR).

| Data | Quem / áudio | LLM | Turnos | Navegador média (p90) | Agora e2e média (p90) | Observações |
|---|---|---|---|---|---|---|
| | | | | | | |

### O que ouvir além do número

- A voz `Portuguese_*` da MiniMax soa brasileira ou portuguesa? Se soar de Portugal, trocar `TTS_VOICE`
  ou passar para Cartesia `sonic-3.x` gerenciado com `language: "pt"`.
- O ARES entende sotaque do interior e termos do agro (diesel, ração, adubo)? Se errar, usar `keywords`.
- Interrupção: falar por cima do agente corta a fala dele?

### feita.ai

A chave `FEITA_API_KEY` que veio com o projeto é da feita.ai, um app de criação de imagens e vídeos com IA.
A API dela (`api.feita.ai`) lista modelos de texto (Claude, GPT, Qwen), imagem, vídeo e música,
mas não expõe endpoint de chat compatível com OpenAI ou Anthropic
(`/v1/chat/completions` e `/v1/messages` dão 404) e não tem ASR nem TTS.
**Não serve para o agente** sem um proxy próprio, que só acrescentaria latência. Não foi usada.
