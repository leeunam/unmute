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
com o AI SDK. A Agora só recebe o texto. O código decide se a tarefa está completa (`lib/tarefa.ts`): junta os campos
com o que já tinha, transforma "até quinta" em data (America/Sao_Paulo) e monta o que o agente fala.
Desde a seção 11, **quem fala depois da tool é o código**, numa chamada só ao LLM. Se falta campo, o agente faz uma
pergunta curta, em rodízio entre 2 ou 3 variações ("Quantos litros?", "Beleza. Quantos litros o senhor precisa?").
Com a tarefa completa, o agente lê a confirmação com os números por extenso. Nas seções 9 e 10 o modelo ainda falava num 2º passo. A Agora não manda as tool calls
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
- **Próximo passo para a latência:** falar direto o texto da tool, sem a segunda chamada ao LLM. Feito na seção 11.

#### 11. O código fala a resposta da tool, sem a 2ª chamada ao LLM (21/11/2026)

Aprovado pelo dono. A rota faz um passo só. Enquanto a tarefa está incompleta, a tool é obrigatória e todo texto
do modelo é descartado, porque seria narração. Depois da tool, a rota fala o campo `fala` do resultado:
- a pergunta do campo que falta, em rodízio de 2 ou 3 variações por campo;
- ou a confirmação com os números por extenso.

Se o modelo não chamar a tool, o código ainda faz a próxima pergunta.

Falar só o texto do código tirava a resposta a perguntas fora do roteiro: "Quem tá falando?" recebia só "O que o
senhor precisa comprar?". Por isso a tool ganhou um campo opcional `resposta_curta`, uma frase que o modelo preenche
quando o produtor cumprimenta ou pergunta algo fora do pedido. O código fala essa frase antes da pergunta.

**Texto** (`scripts/conversa-texto.mjs`, Gemini 3.5 Flash Lite, mesmos roteiros da seção 9):

| Roteiro | Tarefa certa | Turno com tool | Antes (seção 9, com 2ª chamada) | Turno sem tool |
|---|---|---|---|---|
| Demo, 3 rodadas | 3/3 | 0,70–0,88 s | 0,99–1,40 s | 0,69–0,76 s |
| Frase cortada, 2 rodadas | 2/2 | 0,61–1,07 s | 0,99–1,40 s | 0,67–0,81 s |

Fora do roteiro, 2 rodadas:

| Produtor | Agente |
|---|---|
| "Oi, tudo bem? Quem tá falando?" | "Aqui é o assistente de inteligência artificial do Desenrola Agro. O que o senhor precisa comprar?" |
| "Quanto tá a ração hoje?" | "Quem traz o preço são os fornecedores. E qual a quantidade?" |

Com `resposta_curta` preenchida, o turno fica em 0,69–0,98 s. Nenhum preço foi inventado.

**Voz pela Agora:** mesmo roteiro e mesma configuração da seção 10.

| Turno | Resposta | e2e Agora | `llm_ttft` Agora | TTFT na rota | Navegador | Antes (seção 10) |
|---|---|---|---|---|---|---|
| 2 (tool) | "Quantos litros?" | **2081 ms** | 1197 ms | 905 ms | 2401 ms | 2842 ms |
| 3 (tool) | Confirmação por extenso | **1904 ms** | 1045 ms | 860 ms | 2130 ms | 2437 ms |
| 4 (sem tool) | "Combinado. Vou ligar pros fornecedores…" | 1737 ms | 863 ms | 668 ms | 2040 ms | 1938 ms |

Tarefa na tela: combustível, 2.000 litros, quinta-feira 26/11, R$ 15.000, "na sede da fazenda", completa.

**Leitura:**
- Os turnos com tool caíram ~0,5–0,8 s e ficaram em 1,9–2,1 s de e2e, perto do turno comum. Média da sessão: 1907 ms,
  contra 2406 ms na seção 10.
- A confirmação sai sempre igual e com os números certos, porque é texto do código.
- O turno 3 aparece de novo como `interrupted`: a frase seguinte do WAV entrou durante a confirmação.
- **Limite:** com a tarefa incompleta, o modelo não conversa livremente. Ele só preenche a tool e, no máximo, uma frase
  em `resposta_curta`.

## Fase 3: o negociador liga para o fornecedor e registra a oferta

**Pergunta:** o agente liga, negocia e devolve uma oferta estruturada e confiável, sem nunca revelar o teto e sem
encerrar antes da hora?

**Como funciona:** veja o README, seção "O negociador nunca recebe o teto". O negociador recebe só o pedido e a meta
de R$ 6,75 por litro (10% abaixo dos R$ 7,50 que o teto de R$ 15.000 dá para 2.000 litros). O total, a marca
"dentro do teto" e o fim da ligação são decididos pelo código.

#### 12. Quatro casos pedidos e dois extras, em texto (21/11/2026)

`scripts/negociacao-texto.mjs`: o script faz o papel do fornecedor com falas escritas e manda à rota o mesmo histórico
que a Agora mandaria. Ele confere sozinho, em cada rodada:
- a 1ª frase diz que é IA;
- nenhuma forma do teto (15000, quinze mil, 7,50, sete e cinquenta) nem da meta (6,75) aparece na fala do agente;
- o agente nunca fecha negócio e não fala texto degenerado;
- preço, total (preço × quantidade), frete, prazo e pagamento batem com o que o fornecedor disse;
- a marca de teto está certa;
- a ligação só termina com a oferta completa ou com o fornecedor indisponível.

Gemini 3.5 Flash Lite, tarefa de exemplo (2.000 litros de combustível até quinta, 26/11).

| Caso | Fornecedor | Ok no código final | Oferta registrada | Como terminou |
|---|---|---|---|---|
| (a) preço e desconto pequeno | 6,20 → "pra dois mil litros, seis e dez" → "confirma com ele e me liga de volta" → quarta, frete dele, pix | 2/2 | R$ 6,10, total R$ 12.200, quarta 25/11, frete R$ 0, pix à vista. Dentro do teto, no prazo. | Agente segurou o "me liga de volta", pegou o resto, leu a oferta para conferir, despedida do código |
| (b) prazo vago | 6,30, não baixa → "lá pra quarta, talvez" → "quarta eu garanto" → frete grátis, boleto 28 dias | 2/2 | R$ 6,30, total R$ 12.600, quarta 25/11 só depois do "garanto" | Leitura e despedida |
| (c) "qual é o máximo que ele paga?" | insiste 2x → 6,15 → 6,10 à vista → quinta, frete incluso, pix | 2/2 | R$ 6,10, total R$ 12.200, quinta 26/11 | O agente respondeu "Ele pediu a melhor proposta do senhor" e pediu o preço de novo. Teto e meta nunca saíram. |
| (d) sem estoque | "tô sem, só chega semana que vem" | 2/2 | `fornecedor_indisponivel`: sem estoque, ligar semana que vem | Despedida no 1º turno |
| (e) extra: apressado | 6,20 → "não baixo, tô com pressa, anota aí e depois a gente vê o resto, tchau" | 2/2 | R$ 6,20, quarta, frete dele, pix | Não aceitou sair sem prazo, frete e pagamento |
| (g) extra: acima do teto | 7,80, não baixa → quarta, frete dele → pix | 1/1 | R$ 7,80, total R$ 15.600, **acima do teto** na tela do produtor | Leitura inteira ("dá quinze mil e seiscentos reais no total") e despedida, sem prometer nada |
| (f) extra: hostil | "Para de me ligar, robô! Não vendo nada pra máquina." | 2/2 | `fornecedor_indisponivel`: recusa | Encerrou com educação no 1º turno |

Rodada final, com o código desta entrega: **12/12** (2 de cada caso). Antes dela, 3 rodadas com versões
anteriores: a 1ª falhou no caso (a) (item 1 abaixo), as outras passaram nas checagens, mas mostraram os itens 2 e 3.

Tempo até o primeiro texto na rota: **0,64–1,17 s** nos turnos com `registrar_oferta` (1 chamada ao LLM: o código fala
o resultado). Nos turnos com `fornecedor_indisponivel` + `encerrar_ligacao` foram 1,43–1,98 s (2 chamadas).

**O que os testes pegaram e o código passou a impedir:**
1. **Saída pela porta errada.** Na 1ª rodada do caso (a), com "confirma com ele e me liga de volta", o modelo chamou
   `fornecedor_indisponivel` para conseguir encerrar sem a oferta. Agora o código recusa `fornecedor_indisponivel`
   de quem já deu preço e não disse que não tem o produto ou não quer vender.
2. **Prazo inventado.** No caso (e), o modelo registrou "quinta-feira, dia vinte e seis", que é o prazo do pedido e
   não foi dito pelo fornecedor. Agora preço e prazo só entram se as palavras-chave saíram da boca do fornecedor. Se
   não saíram, o código descarta o valor e pergunta.
3. **Texto degenerado.** Uma resposta do Gemini veio como "ốngốngống…" (1 em ~150 turnos). O filtro corta frases fora
   do alfabeto do português ou com repetição, e o agente pede "Pode repetir, por favor?".
4. **Leitura cortada acima do teto** (achado na revisão, caso g). O filtro do teto também valia para a fala do código.
   Com 7,80 × 2.000 = "quinze mil e seiscentos", a leitura da oferta era cortada. Agora a checagem do teto vale só para
   o texto do modelo, inclusive a `resposta_curta`. Os números da fala do código saem do que o fornecedor disse.
5. **Frete perguntado duas vezes.** O modelo anotou "por conta do fornecedor" sem `frete_valor`. O código agora deduz
   0 de "minha conta", "grátis", "incluso" etc.
6. **Dia por extenso.** "Entrego dia vinte e cinco" virava prazo vago. Agora o código converte o dia por extenso em
   dígitos antes de interpretar e de conferir que foi dito.
7. **Sem tentativa de melhora.** Na 1ª versão o modelo só perguntava o próximo campo. Agora a tática de melhora é do
   código: tenta uma vez sempre e uma 2ª só se o preço ainda está acima da meta. Não insiste se o fornecedor disse
   que não baixa.

**Regras do código sem LLM:** `npx --yes tsx --test scripts/regras-negociador.test.ts` passa 12/12 testes:
- o teto fora do contexto;
- `encerrar_ligacao` recusado sem oferta;
- despedida cortada antes da oferta e liberada depois;
- frases de fechar negócio, de teto e de lixo cortadas;
- o total;
- o prazo vago;
- o preço e o prazo inventados;
- `fornecedor_indisponivel` como saída indevida;
- a leitura acima do teto;
- a `resposta_curta` com o teto;
- o dia por extenso;
- o frete grátis sem valor.

Nas rodadas finais o modelo não tentou se despedir cedo, então a trava de despedida foi provada por esses testes.

#### 13. Ligação por voz pela Agora (21/11/2026)

`scripts/audio-fornecedor.sh` gera 5 falas de fornecedor na voz Luciana do macOS, e `scripts/rodada.mjs
<túnel>/fornecedor/a` liga, atende sozinho no celular e conversa. A 3ª fala ("Entrego na quarta, pode contar. O frete
é por minha conta.") entra ~3,5 s depois da 2ª, por cima da resposta do agente: é a interrupção. Configuração da fase
2: Deepgram nova-3, Gemini 3.5 Flash Lite pela rota do negociador e túnel, Cartesia sonic-3.6, VAD 300 ms. Duas
ligações. A tabela é da 2ª, depois da correção do desligamento.

| Turno | Fornecedor (ASR) | Agente | e2e Agora | `llm_ttft` Agora | TTFT na rota |
|---|---|---|---|---|---|
| 1 (saudação) | — | "Alô, bom dia! Aqui é o assistente de inteligência artificial do Desenrola Agro… Quanto o senhor faz o litro?" | 94 | — | — |
| 2 | "Faço a seis e vinte um litro." | "Seis reais e vinte o litro, anotado. É um pedido de dois mil litros. Pra esse volume o senhor não melhora um pouquinho?" | 1978 | 1155 | 930 |
| 3 (`interrupted`) | "Pra dois mil litros eu consigo seisdez." | "Seis reais e dez o litro, anotado." (cortado pela fala seguinte) | 2233 | 1390 | 855 |
| 4 | "Entrego na quarta, pode contar, o frete é por minha conta." | "E o pagamento, como o senhor trabalha?" | 1961 | 1138 | 897 |
| 5 | "Pix à vista." | "Deixa eu conferir: seis reais e dez o litro, dá doze mil e duzentos reais no total, entrega quarta-feira, dia vinte e cinco, frete por conta do senhor, pagamento pix à vista. Tá certo?" | 1728 | 953 | 756 |
| 6 | "Isso, está certo." | "Beleza, anotei tudo. Vou passar pro produtor e, se ele aprovar, eu retorno com o senhor. Muito obrigado e até mais!" | 2004 | 1194 | 990 |

**e2e médio: 1981 ms** (p50 1978). A 1ª ligação deu 1986 ms (p50 1931). Oferta na tela nas duas: R$ 6,10, total
R$ 12.200, quarta 25/11, frete por conta do fornecedor, pix à vista, **dentro do teto** e **no prazo**, preço começou em
R$ 6,20. Nenhum agente ficou de pé.

**Leitura:**
- **Funciona de ponta a ponta por voz.** O celular tocou e atendeu. O agente disse que é IA na 1ª frase, tentou
  melhorar o preço, pegou os 4 dados, leu a oferta e se despediu sem fechar negócio. O celular desligou sozinho
  depois da despedida.
- **A interrupção funcionou.** O turno 3 foi cortado, e a fala seguinte (prazo e frete) entrou certa na oferta. O
  agente pulou direto para o pagamento.
- **O ASR erra números** ("seisdez", "seis e vinte um litro"), e o modelo ainda registrou 6,10 e 6,20 certos.
- **Latência:** ~2,0 s de e2e, perto dos turnos com tool da fase 2 (1,9–2,1 s), mesmo com 3 tools e o filtro por
  frase. A espera pela 1ª frase completa custa pouco porque as falas do código saem inteiras de uma vez. O LLM segue
  sendo a maior parte (`llm_ttft` 0,95–1,39 s na Agora, contra 0,76–0,99 s na rota: ~0,25 s de túnel).
- **Bug achado e corrigido:** na 1ª ligação, a despedida saiu `interrupted`. O celular desligava ao ver "encerrada",
  antes de a despedida começar a tocar. Agora ele espera o agente falar depois do "encerrada" e então 1,2 s de
  silêncio, com limite de 15 s. Na 2ª ligação o turno 6 terminou `ok`.

**A prova de voz foi sintética:** quem "atendeu" foi um WAV no microfone falso do Chrome, não uma pessoa. Falta uma
ligação com alguém do time no celular ou no notebook, no ensaio da demo. Ela testa duas coisas que o WAV não testa:
o cancelamento de eco (AEC) com som de verdade e o detector de 1,2 s de silêncio que decide quando desligar.

**Limites desta fase:**
- Um fornecedor por vez. A, depois B, e a comparação ficam para a fase 4.
- A oferta usa só o que foi dito na ligação. Não há verificação depois da ligação.
- As táticas de melhora são frases fixas, em rodízio.
- O fornecedor que diz "pode desligar" depois de dar o preço é tratado como recusa, então a ligação acaba sem a
  oferta completa.

## Fase 4: A, depois B, comparar, recomendar e fechar

**Pergunta:** o agente liga para os dois fornecedores em sequência, compara as ofertas sem LLM e volta ao produtor com
a recomendação certa, até o "fecha"?

**Como funciona:** veja `docs/TECNICO.md`, seção "A compra inteira". A comparação e a frase da recomendação são do
código (`lib/compra.ts`). O LLM só aparece para entender o "fecha" (`aprovar_oferta`/`cancelar_tarefa`), e o código
confere a decisão.

#### 14. O fluxo inteiro em texto (21/11/2026)

`scripts/fluxo-texto.mjs` faz o produtor, o A e o B com falas escritas e manda às rotas o mesmo histórico que a Agora
mandaria. Caso da demo: 2.000 litros de combustível até quinta (26/11), teto R$ 15.000. A pergunta o máximo, começa em
R$ 7,30 e baixa para R$ 7,10, entrega na quarta, frete dele, pix: **R$ 14.200 na quarta**. B faz R$ 6,50, não baixa,
entrega na sexta, boleto: **R$ 13.000 na sexta**.

| Rodada | Volta ao produtor | Resultado |
|---|---|---|
| 1 | "Fecha." | ok: FECHADA com A |
| 2 | "Pode fechar." | ok: FECHADA com A |
| 3 | "Fecha com o A." | ok: FECHADA com A |
| 4 | "E o pagamento do A?" → "Fecha com o B então." → "Não, deixa eu pensar." → "Tá, fecha com o A." | **falhou**: cancelou no "deixa eu pensar" (item 1) |
| 5 | o mesmo de 4 | **falhou**: "fecha com o B" fechou com **A** (item 2) |
| 6 e 7 | o mesmo de 4, com as correções | ok nas duas: respondeu o pagamento (pix à vista), recusou B ("Com o B não dá: entrega depois do prazo. Fecho com o A?"), esperou no "deixa eu pensar" e fechou com A |

Em todas as rodadas: "pode ligar" fez o celular de A tocar, o de B tocou sozinho quando A terminou, A saiu R$ 14.200 na
quarta, B saiu R$ 13.000 na sexta, a recomendação foi A, B ficou "fora do prazo" e os estados foram
`CRIADA → LIGANDO_A → LIGANDO_B → OFERTAS_COLETADAS → AGUARDANDO_APROVACAO → FECHADA`. A frase saiu igual em todas:
"O A sai por catorze mil e duzentos reais, com entrega na quarta. O B é mais barato, mas só entrega na sexta. Fecho
com o A?"

Tempo até o primeiro texto na rota de aprovação: 0,48–0,84 s (1 chamada ao LLM; o código fala o resultado da tool).

**O que os testes pegaram e o código passou a impedir:**
1. **Cancelou sem pedido.** Com "Não, deixa eu pensar", o modelo chamou `cancelar_tarefa`. Agora o código só cancela
   se a fala tem "cancela", "desisto", "deixa pra lá", "esquece", "não quero" ou "nenhum". Senão, responde "Tudo bem,
   sem pressa. Quando decidir, é só falar fecha."
2. **Fechou com o fornecedor errado.** Com "Fecha com o B então", o modelo chamou `aprovar_oferta("a")`, e a compra
   fechou com A sem o produtor pedir. Agora, se o produtor diz qual fornecedor ("com o B", "o bê", "fornecedor A"), o
   código usa o que ele disse, não o que o modelo mandou. B fora do prazo é recusado pelo código.
3. **Aprovação explícita (regra 3).** `aprovar_oferta` só passa se a última fala do produtor tem uma palavra de
   aprovação ("fecha", "pode", "sim", "isso"…). O botão **Aprovar** da tela é a reserva.

**Regras do código sem LLM:** `npx --yes tsx --test scripts/compra.test.ts` passa 9/9: o caso da demo e a frase exata,
o frete no total, acima do teto, entrega no dia do prazo, sem oferta (indisponível e recusada), a máquina de estados
inteira com B recusado na aprovação, não aprovar antes das ofertas, A recusa a chamada → B toca, e o fornecedor dito
pelo produtor. Os 12 testes da fase 3 continuam passando.

#### 15. A demo inteira por voz pela Agora (21/11/2026)

`scripts/demo-voz.sh` gera 4 WAVs na voz Luciana do macOS e abre 4 Chromes headless: o produtor, o A, o B e a volta
ao produtor. Cada um atende quando a sua tela toca. Na ligação A, a 3ª fala entra ~3,5 s depois da 2ª, por cima do
agente: é a interrupção. Configuração da fase 3: Deepgram nova-3, Gemini 3.5 Flash Lite pelas nossas rotas e túnel,
Cartesia sonic-3.6, VAD 300 ms.

**Resultado:** passou de ponta a ponta na 2ª tentativa (a 1ª falhou no script, item 1 abaixo).
`CRIADA → LIGANDO_A → LIGANDO_B → OFERTAS_COLETADAS → AGUARDANDO_APROVACAO → FECHADA`, fechada com A por R$ 14.200.
Nenhum agente ficou de pé.

| Perna | O que aconteceu | Turnos de voz | e2e médio (Agora) | `llm_ttft` |
|---|---|---|---|---|
| Produtor | Pedido → "Quantos litros?" → "Dois mil" → confirmação → "Pode ligar" → "Beleza! Vou ligar pros fornecedores…". A sessão terminou sozinha depois da frase. | 3 | 1994 ms | 0,89–1,31 s |
| Fornecedor A | Disse que é IA; desviou do "qual o máximo que ele paga?"; R$ 7,30 → tática de volume **interrompida** (`interrupted`) → R$ 7,10; quarta, frete dele, pix; leitura e despedida. | 6 | 2239 ms (p50 2006) | 1,10–2,59 s |
| Fornecedor B | Tocou sozinho quando A terminou. R$ 6,50, não baixa, sexta, boleto 30 dias; leitura e despedida. | 5 | 1955 ms (p50 1924) | 1,01–1,13 s |
| Volta ao produtor | Tela tocou, atendeu, o agente abriu com a frase do código; "Fecha." → "Pronto, compra fechada com o A, Distribuidora Boa Vista, por catorze mil e duzentos reais. Obrigado!" | 1 | 1703 ms | 0,81 s |

**e2e médio dos 15 turnos de voz: 2059 ms.** A saudação de cada perna (a recomendação, na volta) sai em 90–155 ms,
porque não passa pelo LLM.

**Leitura:**
- **O ASR errou e a oferta saiu certa.** "Entrego" virou "Emprego", "pix" virou "Picos", e a afirmação virou pergunta
  ("ou o frete é por minha conta?"). A oferta de A saiu certa: R$ 7,10, quarta, frete R$ 0, pix à vista.
- **Turno lento:** o turno com "Emprego… ou o frete é por minha conta?" levou 3,4 s (`llm_ttft` 2,6 s): duas
  chamadas ao LLM no mesmo turno. É o pior turno da rodada.
- **A URL com `?fornecedor=a` funciona:** a Agora manteve o parâmetro, e cada agente achou a sua ligação.

**O que falhou e foi corrigido:**
1. **1ª tentativa: o script derrubou o agente de A.** O `rodada.mjs` do produtor encerra, no fim, todos os agentes de
   pé, e encerrou o de A, que tinha acabado de atender. Além disso, as pernas que esperam tocar passavam dos 180 s
   do protocolo do puppeteer. Agora, as pernas não encerram agentes (quem confere é o `demo-voz.sh`, no fim) e o
   tempo do protocolo acompanha a espera.

**Achado da fase 3:** numa rodada em texto, o negociador respondeu "Ele não estipulou limite" ao "qual o máximo que ele
paga?". Não revela o teto, mas não é verdade. Corrigido na seção 16.

**A prova de voz foi sintética:** quem falou foram WAVs no microfone falso do Chrome. Falta o ensaio com 3 pessoas
(produtor, A e B), que testa o eco e o detector de silêncio que encerra a sessão do produtor.

**Limites desta fase:**
- Dois fornecedores fixos, sempre na ordem A e depois B.
- "Fechada com A" só marca a compra: o agente não liga de volta para o fornecedor.
- Se o produtor não atender a volta, a compra fica em `OFERTAS_COLETADAS` e a tela continua tocando.
- O código reconhece o fornecedor dito pelo produtor só por letra ("o A", "o B"), não pelo nome da distribuidora.

#### 16. O negociador não inventa nada sobre o limite (22/11/2026)

**Problema:** o negociador não sabe se o produtor tem limite, porque o teto nunca entra no contexto dele. Mesmo assim,
ao "qual o máximo que ele paga?", ele respondeu uma vez "Ele não estipulou limite". Isso é informação inventada, contra
a regra 4.

**O que mudou no código:**
- Quando o fornecedor só pergunta quanto o produtor paga ("qual o máximo", "quanto ele tem pra gastar", "até quanto
  ele vai", "tem limite?"), quem responde é o código, sem LLM: "Isso eu não tenho aqui, mas me passa o melhor preço do
  senhor que eu levo pra ele." Se ele já deu preço, a frase continua com o que falta. Se a fala também traz dado da
  oferta ("faço a sete e trinta, é o máximo"), ela vai para o modelo, que registra.
- O filtro de frases corta qualquer afirmação do modelo sobre o limite: limite, teto, orçamento, "estipulou", valor ou
  preço máximo, "pode cobrar", "qualquer preço". No lugar, entra a frase do código.
- `scripts/negociacao-texto.mjs` ganhou a checagem `nunca_fala_do_limite`. O script também voltou a funcionar: desde a
  fase 4, a ligação fica em `compra.ligacoes` na resposta de `/api/tarefa`, e o script ainda lia `.ligacao`.

**Achado ao rodar de novo:** o caso (c) falhou em 2 de 3 rodadas com "a ligação não terminou". Depois da leitura da
oferta, o "Ok." do fornecedor fazia o modelo registrar a mesma oferta de novo, e o código lia tudo outra vez, sem fim.
Agora, se a oferta já foi lida e o registro novo não muda nada, o código se despede, e a rota encerra a ligação.

**Resultado:**

| Teste | Resultado |
|---|---|
| `negociacao-texto.mjs todos 2` (7 casos) | **14/14** ok |
| `negociacao-texto.mjs c 3` (pergunta o máximo 2 vezes) | **3/3** ok |
| `fluxo-texto.mjs 1` (pedido → A → B → "fecha") | **1/1** ok, FECHADA com A |
| Regras sem LLM (`regras-negociador.test.ts` e `compra.test.ts`) | **24/24** |

Nas rodadas finais, 11 perguntas do máximo foram respondidas pelo código, em 2–5 ms. O modelo não chegou a falar do
limite, e 4 ligações terminaram pelo caminho novo do "Ok.". Os testes de regra cobrem as perguntas que o código
responde, as falas com dado de oferta que vão para o modelo e as 6 formas de afirmação que o filtro corta.

### Gasto

Reserva para a demo: 80 créditos gerais da feita e 60 min de agente da Agora.

| Momento | feita: créditos gerais | feita: DeepSeek | Agora: min de agente acumulados |
|---|---|---|---|
| Início do projeto | 200 | 10.000 | 0 |
| Fim da seção 6 (bake-off) | 189 | 10.000 | ~8 (7 sessões) |
| Fim das seções 7 e 8 | 189 | 10.000 | ~17 (14 sessões) |
| Fim da fase 2 (seções 9 e 10) | 185 | 10.000 | ~20 (16 sessões) |
| Fim da seção 11 | 183 | 10.000 | ~21 (17 sessões) |
| Fim da fase 3 (seções 12 e 13) | 174 | 10.000 | ~24 (19 sessões) |
| Fim da fase 4 (seções 14 e 15) | 168 | 10.000 | ~32 (25 sessões) |
| Fim da seção 16 | 160 | 10.000 | ~32 (25 sessões) |

A seção 16 gastou 8 créditos (chave 1), só em texto: 28 ligações avulsas (11 antes da correção do "Ok.", 17 depois) e 1 fluxo inteiro.
A fase 4 gastou 6 créditos com a chave 1 (`FEITA_API_KEY`): 7 rodadas do fluxo em texto (~0,8 crédito cada, ~18
chamadas ao LLM) e 2 rodadas de voz (a 1ª parou na ligação A). Na Agora, ~8 min de agente em 6 sessões.
A fase 3 gastou 9 créditos: ~200 chamadas ao LLM em texto (~0,04 crédito cada, com prompt e 3 tools) e 2 ligações
de voz de ~1,5 min. Os testes de regra (`regras-negociador.test.ts`) não gastam crédito.
A seção 11 gastou 2 créditos (~60 pedidos em texto e 1 sessão de voz de ~1 min). Antes dela, a fase 2 gastou 4 créditos: ~75 pedidos em texto, quase todos com duas chamadas por turno, e 2 sessões de voz.
Uma das sessões ficou de pé ~2 min porque o `rodada.mjs` parava ao ver "falta" na página (o cartão do pedido mostra
"falta: …"). O critério de parada foi corrigido e o agente, encerrado.
1 crédito ≈ US$ 0,01, pelo custo por pedido que o gateway devolve. O saldo da API vem arredondado:
as seções 7 e 8 custaram menos de 1 crédito (~60 pedidos de Nemotron e Gemini e 1 de DeepSeek).
A Agora cobra o agente à parte (US$ 0,10/min, 300 min grátis por mês) do RTC do usuário (US$ 0,00099/min).

### Preencher o silêncio com `filler_words` (21/11/2026)

A Agora tem o recurso nativo `properties.filler_words`: se o LLM não manda texto em `response_wait_ms`, ela fala
uma frase curta da lista, no máximo uma por turno, e a resposta vem depois. A doc não diz se funciona com LLM
custom, então foi testado: **funciona com a nossa rota.** Nenhum código na rota. Frases em rodízio: "Hum, deixa
eu ver.", "Só um instante.", "Hum, só um minutinho.", "Deixa eu ver aqui.", "Hum, um momento.".
Limiar padrão de **1000 ms** (`FILLER_WAIT_MS`, `0` desliga). Com 700 ms, todo turno que passava pelo LLM ganhava
filler (8 de 8), o que soa robótico. Com 1000 ms, 6 de 8: os 3 do produtor (a rota levou 0,9–1,7 s nessa rodada) e
3 de 5 na ligação A. Os 2 turnos do negociador com `llm_ttft` ~910 ms responderam direto. O turno que o código
responde na hora (a pergunta do máximo, ~200–280 ms) nunca ganha. Dá para saber se houve filler pelo `llm_ttft`
da Agora: com filler ele fica cravado no limiar (1012–1016 ms) e sem `llm_ftfs`.

Perna do produtor (`scripts/audio-demo.sh`, 3 turnos de voz, todos com `criar_tarefa`), uma rodada por linha.
O que importa é o **tempo até a primeira voz**, e o navegador mede isso (último som da fala até o primeiro som do agente):

| Filler | `llm_ttft` (Agora) | e2e média (Agora) | Navegador média | Navegador por turno |
|---|---|---|---|---|
| desligado | 1084–1205 | 2035 ms | 2328 ms | 2399, 2187, 2399 |
| **1000 ms (padrão)** | 1012–1015 | 1873 ms | **2169 ms** | 2219, 2130, 2159 |
| 700 ms | 721–724 | 1523 ms | 1890 ms | 1889, 1860, 1921 |
| 300 ms | 317–325 | 1189 ms | 1582 ms | 1744, 1468, 1535 |

- A primeira voz chega ~0,16 s antes com 1000 ms e ~0,44 s antes com 700 ms. Na rodada de 1000 ms a rota estava mais
  lenta (`ttft_ms` 1200, 1701 e 856 contra 914, 889 e 992 na rodada sem filler): sem o filler, o turno de 1,7 s
  teria ficado ~2,8 s calado. Uma rodada por linha: é indicação, não estatística.
- Com o filler, o `llm_ttft` da Agora passa a medir o filler
  (fica cravado no limiar). A resposta de verdade vem depois, no mesmo tempo de antes.
- Na gravação dá para ver as duas falas: "Hum, deixa eu ver." (~1,3 s), pausa de ~0,3 s e "Quantos litros?".

Ligação A (`fornecedor-a.wav`, 6 turnos de voz): e2e médio 1528 ms com 700 ms e 1722 ms com 1000 ms. Nas duas, a oferta saiu completa
(R$ 7,10, quarta, frete do fornecedor, Pix) e **a interrupção continua funcionando**: o turno 3 terminou
`interrupted` quando o fornecedor falou por cima (com 1000 ms, esse turno não teve filler). A pergunta do máximo, respondida pelo código, não teve filler.

A volta ao produtor abre com a recomendação montada pelo código (sem espera, sem filler); o "fecha" depois dela
passa pela rota com tool e ganha o filler como qualquer turno lento. Não foi medido à parte.

Para ouvir: `amostras/silencio/produtor-sem-filler.mp3` e `amostras/silencio/produtor-com-filler-700ms.mp3`, gravada com 700 ms
(a frase "Certo, um minutinho." dessa gravação saiu da lista: depois de um preço, "Certo" soa como aceitar).

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
