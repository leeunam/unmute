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
- **A pergunta do máximo é respondida pelo código.** O negociador não sabe se o produtor tem limite, então qualquer
  resposta do modelo seria inventada (já saiu "ele não estipulou limite"). Quando o fornecedor só pergunta quanto o
  produtor paga, a rota responde sem LLM: "Isso eu não tenho aqui, mas me passa o melhor preço do senhor que eu levo
  pra ele." Se ele já deu preço, a frase pede o que falta. O filtro também corta qualquer frase do modelo que fale de
  limite, teto, orçamento, valor máximo ou "pode cobrar", e põe a frase do código no lugar.
- **Depois da leitura, o "ok" encerra.** Se o fornecedor confirma e o modelo registra a mesma oferta de novo, o código
  se despede em vez de ler outra vez.
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

### A compra inteira: A, depois B, comparar e fechar (fase 4)

1. O produtor faz o pedido por voz. Quando o agente confirma e ele diz "pode ligar", a compra começa e a sessão do
   produtor termina sozinha depois da frase do agente. Reserva: o botão **Ligar para os fornecedores** no cartão
   **Compra**.
2. Quem faz o fornecedor A abre **`/fornecedor/a`** (no celular ou noutra aba) e quem faz o B abre **`/fornecedor/b`**.
   A tela de A toca primeiro. Quando o código aceita o `encerrar_ligacao` de A, a tela de B toca sozinha. Tocar não
   gasta minuto: o agente só sobe quando o fornecedor atende.
3. As duas ofertas aparecem lado a lado no cartão **Compra**, com as marcas "Recomendada", "Fora do prazo" e "Acima do
   teto". A comparação é do código, sem LLM: descarta a oferta sem preço completo, a que entrega depois do prazo e a
   que passa do teto, e ordena o resto pelo total com frete.
4. Com as duas ofertas, a tela do produtor toca ("Desenrola Agro ligando com as propostas"). Ao atender, o agente
   abre falando a recomendação montada pelo código, por exemplo: "O A sai por catorze mil e duzentos reais, com
   entrega na quarta. O B é mais barato, mas só entrega na sexta. Fecho com o A?". O produtor diz "fecha", e a
   compra fica **Fechada com A**. Reserva: os botões **Aprovar** e **Cancelar**.

Estados da compra (`lib/compra.ts`): `CRIADA → LIGANDO_A → LIGANDO_B → OFERTAS_COLETADAS → AGUARDANDO_APROVACAO →
FECHADA | CANCELADA`. `OFERTAS_COLETADAS` é a tela do produtor tocando; `AGUARDANDO_APROVACAO` começa quando ele atende.

A demo inteira por voz, sem ninguém falando: `./scripts/demo-voz.sh https://<túnel>` gera 4 WAVs
(`scripts/audio-demo.sh`), abre 4 Chromes headless (produtor, A, B e a volta ao produtor), cada um atende quando a
sua tela toca, e no fim imprime os estados, as ofertas e os agentes de pé.

Em texto, sem Agora (com `npm start` rodando): `node --env-file=.env.local scripts/fluxo-texto.mjs 1` faz o fluxo
inteiro e confere cada passo. `npx --yes tsx --test scripts/compra.test.ts` testa a comparação, a frase e a máquina
de estados sem LLM.

### Uma ligação avulsa para um fornecedor (fase 3)

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
- `lib/compra.ts`: a máquina de estados da compra, a comparação sem LLM, a frase da recomendação e as tools
  `aprovar_oferta`/`cancelar_tarefa`. `avancar()` é idempotente e roda a cada consulta das telas: quando a ligação da
  vez termina, faz a próxima tocar.
- `app/api/compra`: os botões de reserva (ligar, aprovar, cancelar) e o "atender" em texto.
- `app/api/aprovacao/chat/completions`: o LLM da volta ao produtor. Tools `aprovar_oferta(oferta_id)` e
  `cancelar_tarefa()`. O código só aprova se a última fala do produtor tem uma palavra de aprovação, usa o fornecedor
  que ele disse ("fecha com o B") no lugar do que o modelo mandou e só cancela com pedido explícito.
- Cada ligação fica guardada pelo id do fornecedor (`ligacao(id)` em `lib/negociacao.ts`), e a URL do LLM de cada
  agente leva `?fornecedor=a`. Assim, quando B começa a tocar, A ainda vê "encerrada" e desliga depois da despedida.
- `app/fornecedor/[id]`: a tela de celular do fornecedor.
- `app/api/llm/chat/completions`: o LLM do agente. Recebe o pedido da Agora e responde em streaming pelo
  AI SDK com a feita.ai. Roda a tool `criar_tarefa` numa chamada só ao LLM. Depois da tool,
  quem fala é o código: a pergunta do que falta ou a confirmação. Só o texto vai para a Agora.
- `lib/tarefa.ts`: a tarefa em memória. Valida o que falta, transforma o prazo falado em data e monta a
  confirmação com números por extenso. Quem decide se a tarefa está completa é este código, não o modelo.
- `app/api/tarefa`: GET devolve a tarefa, a conversa e a compra para a página; POST zera tarefa e compra.
- `app/api/encerrar`: chama `leave`.
- `app/api/latencia`: chama `turns` e resume a latência dos turnos de voz.
- `lib/agora.ts`: toda a configuração do agente (prompt, ASR, LLM, TTS, detecção de fim de fala e o `filler_words`,
  que fala "Hum, deixa eu ver." quando a nossa rota demora mais de 1 s para mandar texto).

## Visual das telas

O visual fica separado da lógica, para as fases novas encaixarem sem mexer em regra:

- `app/globals.css`: Tailwind 4 e os tokens do tema claro (fundo quente, sálvia, cores de situação, raios, sombras,
  movimento de 140–240 ms). As classes antigas (`section`, `.ind`, `.marca`…) ficam em `@layer base`,
  apontando para os mesmos tokens, então uma tela que ainda usa essas classes já sai com o tema.
- `app/layout.tsx`: a fonte IBM Plex Sans (`next/font`).
- `components/ui/`: componentes genéricos de um kit shadcn (cartão, selo de situação com glifo, balão de conversa,
  número animado, skeleton). `lib/utils.ts` tem o `cn`.
- `components/produtor/`: os blocos da tela do produtor. Recebem tudo por props; a página continua dona do estado.
- `components/produtor/cartao-oferta.tsx`, `etapas-compra.tsx` e `recomendacao.tsx`: as ofertas com os selos da comparação, as etapas da compra e a frase do agente. O `cartao-compra.tsx` da fase 4 só traduz os dados de `lib/compra.ts` para eles.
- `components/fornecedor/celular.tsx`: o celular simulado (tocando, conectando, em ligação, parado), também só por props.
