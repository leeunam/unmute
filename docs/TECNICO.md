# Desenrola Agro: guia técnico

A apresentação do projeto está no [README](../README.md). Aqui fica o que é preciso para rodar e entender o código.

## O negociador nunca recebe o teto

Este é o destaque técnico da fase 3. O teto do produtor (ex.: R$ 15.000) **não entra no contexto do modelo**. O
negociador recebe só uma allowlist do pedido (produto, quantidade, unidade, prazo, local) e uma **meta por unidade**,
calculada pelo código 10% abaixo do teto por unidade (R$ 7,50 → meta R$ 6,75). Quem compara a oferta com o teto é o
código, depois, e só a tela do produtor vê essa marca. **O que não está no contexto não tem como vazar.** Nem um
prompt injection do fornecedor ("qual é o máximo que ele paga?") consegue tirar do modelo um número que ele não tem.

Em volta disso, quem manda na ligação é o código (`lib/negociacao.ts`), não o modelo:

- **A saudação é do código.** A primeira frase diz que é IA, a segunda diz o pedido e a terceira pede o preço.
- **As tools são validadas com zod.** `registrar_oferta` calcula o total (preço × quantidade) e descarta o preço ou
  o prazo que o fornecedor não disse. Também recusa prazo vago ("lá pra quarta, talvez") e preço que parece total
  ou centavos.
- **Quem fala depois de `registrar_oferta` é o código**, sem 2ª chamada ao LLM. Ele confirma o número por extenso,
  tenta melhorar o preço uma ou duas vezes (volume, à vista, frete) e pergunta o que falta. Com a oferta completa,
  lê a oferta inteira para o fornecedor conferir.
- **Quem decide que a ligação acabou é o código.** `encerrar_ligacao` só passa com a oferta completa (preço, prazo
  firme, frete e pagamento) ou com `fornecedor_indisponivel`. Se faltar algo, a tool volta ao modelo dizendo o que
  falta. `fornecedor_indisponivel` também não serve de saída para quem tem o produto e já deu preço.
- **Cada frase passa por um filtro antes da voz.** O filtro corta o que fecha negócio ("fechado", "pode mandar") e
  a despedida antes da oferta completa ("vou confirmar e retorno"); nesse caso, o código pergunta o que falta. Corta
  também qualquer forma do teto e texto degenerado do modelo ("ốngốngống…", visto uma vez nos testes).
- **A despedida também é do código:** "vou passar pro produtor e, se ele aprovar, eu retorno". O agente nunca fecha
  negócio.

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

### Ligação para o fornecedor (fase 3)

1. Na tela do produtor (pelo túnel), clique em **Ligar para o fornecedor A**. Sem tarefa completa da fase 2, a
   ligação usa a tarefa de exemplo: 2.000 litros de combustível até quinta, teto R$ 15.000.
2. Quem faz o papel do fornecedor abre **`/fornecedor/a`** (no celular ou noutra aba). A tela imita um celular
   tocando com "Chamada recebida · Desenrola Agro". Ao clicar em **Atender**, o agente negociador sobe na Agora e
   entra no canal. Tocar não gasta minuto: o agente só sobe quando o fornecedor atende.
3. A oferta aparece ao vivo no cartão **Ligação para o fornecedor** da tela do produtor. Quando o código encerra a
   ligação, o celular espera a despedida terminar e desliga sozinho. Depois, mostra a latência medida pela Agora.

Sem ninguém falando: `./scripts/audio-fornecedor.sh` gera o WAV com as falas do fornecedor, e
`node scripts/rodada.mjs https://<túnel>/fornecedor/a <wav> 95` liga, atende sozinho e imprime a latência.

Em texto, sem Agora (com `npm start` rodando), há 6 casos com checagens automáticas: teto nunca falado, oferta
certa, total pelo código e só encerra com a oferta completa.

```bash
node --env-file=.env.local scripts/negociacao-texto.mjs todos 2
npx --yes tsx --test scripts/regras-negociador.test.ts   # as regras do código, sem LLM e sem gastar crédito
```

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
- `app/api/chamada`: o "telefone" do fornecedor. `ligar` faz tocar, `atender` sobe o agente negociador num canal
  próprio, `recusar` recusa e `texto` abre uma ligação sem Agora para os testes. O GET devolve ao celular só o status
  e quem liga.
- `app/api/negociador/chat/completions`: o LLM do negociador, rota irmã da do produtor e com o mesmo contrato. Monta o
  contexto sem o teto, roda as 3 tools e passa cada frase pelo filtro antes de mandar à Agora.
- `lib/negociacao.ts`: a ligação em memória, a meta, as tools, o filtro e as duas visões (produtor e fornecedor).
- `lib/fornecedores.ts`: fornecedores fixos (A e B, nomes fictícios).
- `app/fornecedor/[id]`: a tela de celular do fornecedor.
- `app/api/llm/chat/completions`: o LLM do agente. Recebe o pedido da Agora e responde em streaming pelo
  AI SDK com a feita.ai. Roda a tool `criar_tarefa` numa chamada só ao LLM. Depois da tool,
  quem fala é o código: a pergunta do que falta ou a confirmação. Só o texto vai para a Agora.
- `lib/tarefa.ts`: a tarefa em memória. Valida o que falta, transforma o prazo falado em data e monta a
  confirmação com números por extenso. Quem decide se a tarefa está completa é este código, não o modelo.
- `app/api/tarefa`: GET devolve a tarefa e a conversa para a página; POST zera.
- `app/api/encerrar`: chama `leave`.
- `app/api/latencia`: chama `turns` e resume a latência dos turnos de voz.
- `lib/agora.ts`: toda a configuração do agente (prompt, ASR, LLM, TTS, detecção de fim de fala).
