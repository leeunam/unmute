# Testes do Desenrola Agro

## Fase 1: agente de voz em pt-BR no navegador

**Pergunta:** o Conversational AI Engine da Agora conversa em português do Brasil com latência boa para a demo?
**Alvo:** menos de ~1,5 s entre o fim da fala e o início da resposta.

### Configuração padrão (atualizada em 21/11/2026, depois das rodadas da seção 7)

| Peça | Provedor | Por quê |
|---|---|---|
| ASR | Deepgram `nova-3`, `pt-BR`, gerenciado pela Agora | Sem chave. `asr_ttlw` de 300 ms, contra ~370 ms do ARES com o mesmo VAD. |
| LLM | `google/gemini-3.5-flash-lite` pelo gateway da feita.ai, via nossa rota com AI SDK, raciocínio mínimo | Desde a fase 2: acerta a tool `criar_tarefa` (seção 9). Na fase 1 era o Nemotron 3 Super, mais rápido mas erra a tool. |
| TTS | Cartesia `sonic-3.6`, voz multilíngue "Jacqueline" falando `pt`, gerenciado pela Agora | Sem chave. `tts_ttfb` de ~90 ms, o menor medido. |
| Fim de fala | VAD com 300 ms de silêncio | Ganha ~0,2 s em relação a 480 ms sem cortar frases com pausa. O semântico só existe para inglês e chinês. |

### Como medir

1. `npm run build && npm start`, `npm run tunel` e abrir o endereço do túnel.
   Sem ninguém falando: `SO_GERAR=1 ./scripts/audio-falso.sh` gera o WAV e
   `node scripts/rodada.mjs https://<túnel> <wav> 75 voz.webm` conversa sozinho, grava a voz do agente e
   confere que nenhum agente ficou de pé.
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

#### 2. Conversa de ponta a ponta pela Agora (21/11/2026)

Áudio gravado com 4 frases em pt-BR (voz Luciana do macOS), Chrome headless com `scripts/rodada.mjs`,
servidor no Mac em São Paulo e túnel cloudflared. **e2e** é o `e2e_latency_ms` da Agora, só nos turnos de voz.
**Navegador** vai do último som da fala até o primeiro som do agente. Cada rodada tem 4 turnos de voz.

| Rodada | ASR | LLM | TTS | e2e média (p50) | Navegador média | `llm_ttft` | `tts_ttfb` | Interrupção |
|---|---|---|---|---|---|---|---|---|
| Base, nossa rota | ARES | Gemini 3.5 Flash Lite | MiniMax | 2260 ms (2171) | 2532 ms | 769–1465 | ~230 | ok (turno 3 cortado) |
| Base, feita direto | ARES | Gemini 3.5 Flash Lite | MiniMax | 2259 ms (2237) | 2500 ms | 734–1152 | ~240 | ok |
| Base, repetição | ARES | Gemini 3.5 Flash Lite | MiniMax | 2189 ms (2323) | 2384 ms | 711–1036 | ~250 | ok |
| Haiku 5.5 sem raciocínio | ARES | Claude Haiku 5.5 | MiniMax | 2858 ms (3074) | 3105 ms | 1101–2111 | ~250 | ok |
| ElevenLabs pela feita | ARES | Gemini 3.5 Flash Lite | ElevenLabs Flash v2.5 (`generic_http`) | 2685 ms (2701) | 2856 ms | 649–1012 | 532–1065 | ok |

Partes fixas em todas as rodadas: `algorithm_processing` 200 ms, `asr_ttlw` 520–600 ms (inclui a espera
de 480 ms do VAD) e `transport` ~210 ms. **Antes do LLM já se vão ~1,0 s**, e com o TTS dá ~1,25 s.

**Leitura:**
- A conversa funciona de ponta a ponta em pt-BR. O ARES entendeu as frases e o agente respondeu no tema.
- A interrupção funciona: a frase seguinte cortou a fala do agente em todas as rodadas (`interrupted`).
- **O alvo de 1,5 s não fecha** com ASR + LLM + TTS em cascata: o melhor caso foi ~2,0 s e a média ~2,2 s.
- Nossa rota com AI SDK e o túnel custam ~60 ms de `llm_ttft` em relação à Agora chamar a feita direto
  (982 contra 921 ms de média). Fica dentro do ruído.
- O Claude Haiku 5.5 soma ~0,6 s em relação ao Gemini Flash Lite.
- O ElevenLabs pela feita soma ~0,5 s de TTS em relação à MiniMax gerenciada.
- Amostras para ouvir: `amostras/voz-base-minimax.mp3` e `amostras/voz-elevenlabs.mp3`.

#### 3. Claude Haiku 5.5: por que estava lento (21/11/2026)

Gateway da feita, pedidos curtos com streaming:

| Configuração | TTFT médio | Observação |
|---|---|---|
| Padrão | 2090 ms | Pensamento adaptativo ligado e oculto. Uma resposta parou em `max_tokens` com 70 caracteres. A resposta vazia de antes foi isso. |
| `reasoning: {enabled: false}` | 1194–1268 ms | Estável e sem respostas vazias. **É o que a rota usa agora.** |
| `/messages` (formato Anthropic), padrão | 1760 ms | Os eventos mostram blocos `thinking` com `signature_delta` |
| `/messages` com `thinking: {type: "disabled"}` | 1272 ms | Igual ao formato OpenAI: a tradução não é a causa |
| `reasoning_effort: minimal` ou `effort: low` | 2073–2283 ms | Pior: ainda pensa |
| Roteamento `provider.order` (Vertex, Bedrock, Anthropic) | 977–1358 ms | Variação grande e não reproduzível |

O primeiro chunk já é texto: não há metadado atrasando. A meta de 0,8 s **não foi atingida** pela feita.
O piso medido é ~1,1–1,2 s.

#### 4. Bake-off de LLM pelo gateway da feita (21/11/2026, 5–6 pedidos cada)

| Modelo | TTFT mediana | Raciocínio | pt-BR (prompt real do agente) |
|---|---|---|---|
| `nvidia/nemotron-3-super-120b-a12b` | **370 ms** | desligado | Bom. Usa "contactar" e faz duas perguntas de uma vez. |
| `google/gemini-3.5-flash-lite` | 575 ms | mínimo (obrigatório) | Melhor tom: "Entendi, cumpade… Qual é o nome do seu fornecedor?" |
| `nvidia/nemotron-3.5-lightning` | 575 ms | desligado | Fraco: pediu nome completo e endereço |
| `anthropic/claude-haiku-5.5` | 1162–1383 ms | desligado | Muito bom, mas mais lento |
| `anthropic/claude-sonnet-5.5` | 1637 ms | mínimo (obrigatório) | — |
| `anthropic/claude-opus-5.5` | 3599 ms | mínimo (obrigatório) | — |
| `anthropic/claude-fable-5.2` | 3628 ms | mínimo (obrigatório) | — |

Nemotron é uma família de LLMs da NVIDIA, e a feita também tem Nemotron de transcrição. Na Agora ele só
entra como LLM, porque a Agora não aceita ASR genérico.

#### 5. TTS pelo gateway da feita (21/11/2026, TTFB de um pedido isolado, PCM 24 kHz)

| Modelo | Voz testada | TTFB |
|---|---|---|
| `microsoft/mai-voice-2.1-flash` | `pt-BR-FranciscaNeural` | 603 ms |
| `elevenlabs/eleven-flash-v2.5` | Adam / Rachel (premade) | 697–752 ms |
| `elevenlabs/eleven-v4-turbo` | Adam | 1512 ms |
| `google/gemini-3.8-flash-tts` | Kore | 4202 ms |
| MiniMax gerenciado pela Agora (referência) | `Portuguese_FriendlyNeighbor` | ~230–250 ms (`tts_ttfb` na Agora) |

A Agora aceita qualquer um desses pelo `generic_http` (`TTS_VENDOR=feita`, `TTS_MODEL`, `TTS_VOICE`).
O gateway não publica lista de vozes.

#### 6. Speech-to-speech (MLLM)

A Agora suporta OpenAI Realtime (`gpt-realtime`), OpenAI GPT-Live, Gemini Live e xAI Grok, e todos aceitam
custom tools (`mllm.tools`). **Nenhum liga só com configuração:** todos pedem chave do próprio fornecedor
(OpenAI, Google ou xAI). O modo gerenciado da Agora não cobre MLLM, e a feita não tem modelos realtime.
Não foi testado.

#### 7. Nemotron, VAD de 300 ms e vozes gerenciadas (21/11/2026)

Mesma rodada automática da seção 2: 4 frases em pt-BR e uma mudança por vez.

| Rodada | ASR | LLM | TTS | VAD | e2e média (melhor) | Navegador média | `asr_ttlw` | `llm_ttft` | `tts_ttfb` |
|---|---|---|---|---|---|---|---|---|---|
| Base (seção 2) | ARES | Gemini Flash Lite | MiniMax | 480 | 2189 (1991) | 2384 | ~570 | 711–1036 | ~250 |
| Nemotron | ARES | Nemotron 3 Super | MiniMax | 480 | 1957 (1821) | 2218 | ~555 | 593–963 | ~250 |
| VAD 300 | ARES | Gemini Flash Lite | MiniMax | 300 | 1921 (1845) | 2354 | ~360 | 752–954 | ~235 |
| Nemotron + VAD 300 | ARES | Nemotron 3 Super | MiniMax | 300 | 1816 (1690) | 2252 | ~380 | 631–913 | ~237 |
| + Cartesia | ARES | Nemotron 3 Super | Cartesia sonic-3.6 | 300 | 1724 (1636) | 2054 | ~410 | 582–934 | ~140 |
| + Fish Audio | ARES | Nemotron 3 Super | Fish Audio s2.1-pro ("adam") | 300 | 1974 (1768) | 2224 | ~365 | 697–1058 | ~220 |
| + Deepgram | Deepgram nova-3 | Nemotron 3 Super | Cartesia sonic-3.6 | 300 | 1661 (**1364**) | 1996 | 300 | 587–1087 | ~90 |
| **Padrão novo** (confirmação, sem variáveis) | Deepgram nova-3 | Nemotron 3 Super | Cartesia sonic-3.6 | 300 | **1544** (**1438**) | 1881 | 300 | 597–863 | ~90 |

**Leitura:**
- **VAD de 300 ms não cortou o usuário.** Todas as rodadas tiveram 4 turnos de voz para 4 frases, e a frase
  com pausa ("Oi, tudo bem? Eu preciso comprar diesel…") chegou inteira ao LLM.
- A interrupção do agente continuou funcionando: a frase seguinte cortou a fala dele (`interrupted`).
- **O padrão novo chega no alvo:** e2e médio de 1,54 s, com 3 de 4 turnos abaixo de 1,61 s. Antes era ~2,2 s.
- O LLM continua sendo a maior parte variável (0,6–1,1 s). Antes dele, ~0,7 s são fixos:
  processamento 200, ASR 300 e transporte ~210 ms.
- Qualidade do Nemotron na voz: entendeu tudo e respondeu no tema. É mais falante que o Gemini e inventa
  preço ("cerca de seis reais e cinquenta"). O prompt precisa proibir isso nas próximas fases.

**Vozes para ouvir** (em `amostras/`, gravadas da chamada real):
- `voz-deepgram-nemotron-cartesia.mp3`: padrão novo, Cartesia "Jacqueline". É multilíngue, e falta conferir se o sotaque soa brasileiro.
- `voz-cartesia.mp3`: a mesma voz, com ASR ARES.
- `voz-fish.mp3`: Fish Audio "adam", voz da comunidade descrita como sotaque brasileiro claro.
- `voz-base-minimax.mp3` e `voz-elevenlabs.mp3`: as de antes.

**Recomendação de voz:** Cartesia sonic-3.6, a mais rápida, ~150 ms a menos que MiniMax e Fish.
Se o dono achar o sotaque estrangeiro, a troca é Fish Audio "adam" com
`TTS_JSON={"credential_mode":"managed","vendor":"fishaudio","params":{"reference_id":"84c748173dc14017a29c99ff7feb4d32","backend":"s2.1-pro"}}`,
ao custo de ~0,15 s. Na Fish, as vozes pt-BR mais usadas imitam pessoas reais (Lula, Bolsonaro, Neymar) e foram descartadas.

DeepSeek dos créditos restritos (`deepseek/deepseek-v4.1-flash-1017`, raciocínio desligado): 1932 ms até a
primeira palavra numa chamada. Lento demais para voz.

#### 8. Tools para o negociador: Nemotron 3 Super contra Gemini Flash Lite (21/11/2026, só texto)

`scripts/teste-tools.mjs`: AI SDK com a tool `registrar_oferta` e a fala do fornecedor
"Diesel S10 a 6,10 o litro, entrego quinta, frete por minha conta, pago no boleto 28 dias." 5 chamadas por modelo.

| Modelo | Chamou a tool | Argumentos | Fala | 1º evento |
|---|---|---|---|---|
| Nemotron 3 Super | 5/5 | Preço 6,1 sempre certo. Em 2/5 copiou "frete por minha conta" na voz do fornecedor. Em 3/5 inventou `observacoes` ("Nenhuma", "negociação realizada via ligação…"). | Longa, narra a tool ("Dê-me um momento enquanto preencho os detalhes"), soa traduzida | 322–654 ms |
| Gemini 3.5 Flash Lite | 5/5 | 5/5 corretos e padronizados ("Por conta do fornecedor", "Boleto 28 dias") | Curta e natural ("Perfeito, anotei tudo aqui… Um abraço!") | 810–1040 ms |

**Leitura:** os dois servem para tools. O Gemini é mais confiável nos argumentos e soa mais natural. O Nemotron
é ~0,4 s mais rápido, mas fala demais e precisa de um prompt mais rígido para não narrar a tool nem inventar campos.

## Fase 2: o pedido do produtor vira tarefa estruturada

**Pergunta:** o agente transforma o pedido falado numa tarefa completa, pergunta o que falta e confirma em voz alta?

**Como funciona:** a tool `criar_tarefa` (schema zod, todos os campos opcionais) roda dentro da nossa rota de LLM
com o AI SDK em dois passos: no passo 1 o modelo chama a tool, no passo 2 ele fala. A Agora só recebe o texto.
O código decide se a tarefa está completa (`lib/tarefa.ts`): junta os campos com o que já tinha, transforma "até quinta"
em data (America/Sao_Paulo), devolve ao modelo o que falta e uma pergunta curta ("Quantos litros?"). Com a tarefa
completa, devolve a confirmação pronta com os números por extenso, e o modelo só lê. A Agora não manda as tool calls
de volta no histórico, então o estado fica em memória no servidor e entra no prompt a cada turno. O local de entrega,
se não for falado, vem do perfil fixo do produtor ("na sede da fazenda"). A página consulta `/api/tarefa` a cada 500 ms.

#### 9. Gemini Flash Lite contra Nemotron 3 Super com `criar_tarefa` (21/11/2026, só texto)

`scripts/conversa-texto.mjs`: manda à rota local o mesmo histórico que a Agora mandaria. Dois roteiros:
- **Demo:** "Oi, preciso falar com meu fornecedor de combustível, pra reabastecer até quinta. Desenrola um preço de até 15 mil." → "Dois mil litros." → "Isso, pode seguir."
- **Frase cortada** (o VAD pode partir a frase da demo): "…pra reabastecer até quinta." → "Desenrola um preço de até 15 mil." → "Uns dois mil litros." → "Isso."

Tempo até o primeiro texto na nossa rota. "Turno com tool" conta as duas chamadas ao LLM.

| Modelo | Tool forçada no 1º passo | Tarefa certa | Turno com tool | Turno sem tool | Problemas |
|---|---|---|---|---|---|
| Gemini 3.5 Flash Lite | não | **5/5** (3 demo, 2 cortada) | 0,94–1,42 s | 0,60–0,77 s | Nenhum |
| Gemini 3.5 Flash Lite | sim | **5/5** (3 demo, 2 cortada) | 0,99–1,40 s | 0,62–0,74 s | Nenhum |
| Nemotron 3 Super | não | 3/3 demo, **0/2 cortada** | 0,79–1,24 s | 0,33–0,48 s | Na frase cortada, pulou a tool, fez 2 ou 3 perguntas por turno e **inventou "diesel S10"**, que foi gravado na tarefa |
| Nemotron 3 Super | sim | 4/5 | 1,5–23 s | 0,36–0,71 s | Ignora `tool_choice: "required"` no gateway: o AI SDK acusa `AI_ToolChoiceViolationError` e tenta de novo (turnos de 6, 19 e 23 s). Uma rodada terminou com a tarefa vazia. |

Em todas as rodadas do Gemini: perguntou só "Quantos litros?", passou `prazo_entrega: "até quinta"` e
`teto_total: 15000` certos, não inventou `observacoes`, não narrou a tool e leu a confirmação sem mudar números.

**Decisão:** Gemini 3.5 Flash Lite virou o modelo padrão (`lib/feita.ts`). O Nemotron é ~0,3 s mais rápido, mas erra
justamente onde a voz é imprevisível. A rota obriga a tool no 1º passo enquanto a tarefa está incompleta; com o
Gemini isso não custa nada e garante que nenhum dado falado se perde.

#### 10. Prova de voz pela Agora (21/11/2026)

Uma rodada com `scripts/rodada.mjs` e o roteiro da demo na voz Luciana do macOS. Deepgram nova-3, Gemini 3.5 Flash Lite
pela nossa rota e túnel, Cartesia sonic-3.6, VAD 300 ms.

| Turno | Fala do produtor (ASR) | Resposta do agente | e2e Agora | `llm_ttft` Agora | TTFT na rota | Navegador |
|---|---|---|---|---|---|---|
| 2 (tool) | "Oi? Preciso falar com meu fornecedor de combustível. Para reabastecer até quinta. Desenrola um preço de até quinze mil." | "Quantos litros?" | 2842 ms | 1958 ms | 1656 ms | 3270 ms |
| 3 (tool) | "Dois mil litros." | "Então ficou assim: dois mil litros de combustível, entregue até quinta-feira, dia vinte e seis, na sede da fazenda, pagando no máximo quinze mil reais. Posso ligar pros fornecedores?" | 2437 ms | 1541 ms | 1378 ms | 2603 ms |
| 4 (sem tool) | "Isso, pode seguir." | "Beleza, vou ligar pros fornecedores agora e volto daqui a pouco com a melhor proposta para o senhor." | 1938 ms | 1038 ms | 865 ms | 2198 ms |

Tarefa na tela ao fim: combustível, 2.000 litros, quinta-feira 26/11 ("até quinta"), R$ 15.000, completa.

**Leitura:**
- **Funciona de ponta a ponta:** a frase da demo chegou num turno só, o agente perguntou só a quantidade, confirmou com
  os números por extenso, e a tarefa ficou completa na tela enquanto a conversa acontecia.
- **Turnos com tool custam ~0,5–0,9 s a mais** que um turno comum, porque são duas chamadas ao LLM antes do primeiro
  áudio. O e2e fica em 2,4–2,8 s, acima do alvo de 1,5 s. O turno sem tool ficou em 1,9 s.
- A Agora vê ~0,2–0,3 s a mais de `llm_ttft` que a nossa rota: é o trecho nuvem da Agora → túnel → Mac.
- O turno 3 aparece como `interrupted`: a frase seguinte do WAV entrou enquanto a confirmação (~10 s) ainda tocava.
  É o roteiro gravado, não uma falha. A interrupção funcionou.
- **Próximo passo para a latência:** quando a tool devolve a pergunta ou a confirmação, a rota pode falar esse texto
  direto, sem a segunda chamada ao LLM. Ganharia ~0,5–0,7 s nos turnos com tool, mas aí quem fala é o código, não o
  modelo. Não foi feito: fica para decidir.

### Gasto

Reserva para a demo: 80 créditos gerais da feita e 60 min de agente da Agora.

| Momento | feita: créditos gerais | feita: DeepSeek | Agora: min de agente acumulados |
|---|---|---|---|
| Início do projeto | 200 | 10.000 | 0 |
| Fim da seção 6 (bake-off) | 189 | 10.000 | ~8 (7 sessões) |
| Fim das seções 7 e 8 | 189 | 10.000 | ~17 (14 sessões) |
| Fim da fase 2 (seções 9 e 10) | 185 | 10.000 | ~20 (16 sessões) |

A fase 2 gastou 4 créditos: ~75 pedidos em texto, quase todos com duas chamadas por turno, e 2 sessões de voz.
Uma das sessões ficou de pé ~2 min porque o `rodada.mjs` parava ao ver "falta" na página (o cartão do pedido mostra
"falta: …"). O critério de parada foi corrigido e o agente, encerrado.
1 crédito ≈ US$ 0,01, pelo custo por pedido que o gateway devolve. O saldo da API vem arredondado:
as seções 7 e 8 custaram menos de 1 crédito (~60 pedidos de Nemotron e Gemini e 1 de DeepSeek).
A Agora cobra o agente à parte (US$ 0,10/min, 300 min grátis por mês) do RTC do usuário (US$ 0,00099/min).

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
