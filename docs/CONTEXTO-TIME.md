# Desenrola Agro: contexto para quem vai ajudar

Este arquivo é para colar no seu Claude (ou ler você mesmo) antes de trabalhar numa parte do projeto. Ele diz o que é o projeto, o que já está pronto, o que decidimos e o que ainda está em aberto.

Atualizado em 21/11/2026.

---

## 1. O projeto em uma frase

O produtor rural fala o que precisa. Um agente de voz liga para os fornecedores, negocia dentro do limite que ele deu e volta com a melhor proposta para ele aprovar.

Caso da demo: *"Oi, preciso falar com meu fornecedor de combustível, pra reabastecer até quinta. Desenrola um preço de até 15 mil."*

## 2. O hackathon

- Obrigatório: usar o Conversational AI Engine da Agora (agente de voz).
- É hackathon. O que conta é **funcionar, ser sofisticado tecnicamente e provar que dá para fazer**. Não precisa ser bonito nem completo.
- Como a banca avalia:

| Peso | Critério |
|---|---|
| 25% | Experiência de voz: clareza, fluidez, tempo de resposta, interrupções, recuperação de falhas |
| 25% | Execução técnica e integração com a Agora |
| 20% | Relevância do problema e impacto |
| 15% | Inovação: quanto a voz melhora a experiência |
| 10% | Validação: testes, aprendizados, limitações, próximos passos |
| 5% | Clareza da apresentação |

## 3. O que já está pronto

O código está em `github.com/leeunam/unmute`, branch `main`.

| Fase | O que faz | Estado |
|---|---|---|
| 1 | Agente de voz da Agora conversando em pt-BR no navegador | Pronto. 1,54 s de ponta a ponta |
| 2 | O pedido falado vira uma tarefa estruturada; o agente pergunta o que falta e confirma | Pronto. 1,91 s de média, 10/10 tarefas certas |
| 3 | O negociador liga para um fornecedor (numa tela que imita o celular), negocia e registra a oferta | Pronto. 1,98 s por voz; a oferta saiu certa e o teto nunca foi falado em todos os casos de teste |
| 4 | Ligar para A e B, comparar e voltar ao produtor com a recomendação até o "fecha" | Em construção |
| Visual | Telas com o visual da Nimbe | Em construção |
| Extra | Cadastro por voz, previsão de reposição | A fazer |

**Stack:** Agora (RTC + Conversational AI Engine), Deepgram nova-3 para ouvir, Cartesia sonic-3.6 para falar, Gemini 3.5 Flash Lite pelo gateway da feita.ai como LLM, Next.js + Vercel AI SDK no servidor.

**Como a voz chega no nosso código:** a Agora cuida de ouvir e falar, e chama a nossa rota `/api/llm/chat/completions` (formato de chat da OpenAI, com streaming). As tools e as regras rodam na nossa rota.

Arquivos que valem ler no repo: `CLAUDE.md` (a spec completa), `docs/TECNICO.md` (como rodar e o mapa do código), `TESTES.md` (todas as medições).

**Entrega:** 22/11 às 12h, com o pitch às 13h (horário de Brasília). São 4 entregas: descrição de até 2.000 caracteres, apresentação de até 10 slides, vídeo narrado de até 2 minutos e repositório público.

## 4. Decisões já tomadas (não reabrir sem falar com o Davi)

- **O modelo conversa, o código garante.** Regras críticas ficam em código, não em prompt:
  - o negociador **não recebe o teto** de preço; ele recebe só uma meta, e o código compara a oferta com o teto;
  - quem decide se a tarefa ou a oferta está completa é o código;
  - o total e os números falados na confirmação saem do código.
- **O agente nunca fecha negócio.** Só o produtor aprova.
- **O agente diz que é IA** logo no começo de cada ligação.
- **Nada de perguntas fixas no cadastro.** O código guarda o que precisa saber e o que já foi dito; o modelo escolhe a próxima pergunta pelo contexto.
- **Sem nota fiscal de verdade no hackathon.** O histórico de compras da demo é gerado como exemplo. Importar NF-e fica como próximo passo.
- **Ligações só para números do próprio time.** Nunca ligar para empresa real sem consentimento.
- **Português do Brasil** em tudo: fala, interface, prompts.

## 5. Ideias de produto que já discutimos

1. **Previsão de reposição.** O sistema aprende de quanto em quanto tempo o produtor compra cada insumo e liga para ele antes de faltar: "Seu diesel deve acabar lá pelo dia 3. Quer que eu já cote?". Na demo, o cálculo é feito em código (consumo por dia → data prevista), e um botão "avançar o relógio" faz a tela do produtor tocar.
2. **Cadastro por voz de número novo.** Três caminhos: número já cadastrado vai direto ao pedido; número novo na lista de convidados faz o cadastro conversando; número fora da lista recebe um aviso educado e tem o contato anotado. O que precisamos saber: nome, fazenda ou empresa, CPF ou CNPJ, cidade e local de entrega, e o que compra e quanto. Também vale anotar, se aparecer: o tamanho da operação (hectares ou cabeças), os fornecedores que já usa e a forma de pagamento. **Faturamento não entra** (soa invasivo por voz); só se a pessoa contar.
3. **Compra coletiva com cooperativas.** O agente junta os pedidos de vários cooperados do mesmo insumo e negocia o volume total, para todo mundo pagar menos. A cooperativa pode ser quem paga pelo serviço.
4. **Histórico pela NF-e.** Toda compra de insumo gera uma NF-e em XML, num formato nacional padrão que qualquer ERP exporta. Ler esses XMLs dá o histórico sem integrar com cada ERP. O código NCM de cada item diz se é diesel, feno etc. A Receita publica a tabela de NCM em `github.com/receitafederal/calculadora-rtc-regime-regular`; os outros repos da Receita são calculadoras de imposto e não servem para nós.
5. **ERPs do agro.** Os mais citados: TOTVS Agro, Siagri (Aliare), Agrotis, Datacoper (cooperativas), Aegro, Senior. **Ainda não conferimos quais têm API aberta**: é um bom trabalho de pesquisa.
6. **Ligação telefônica real** por SIP trunk, que a Agora suporta. Fica fora do caminho crítico da demo.

## 6. Em aberto: o que o time de negócio pode fazer

Tudo aqui é hipótese. **Não inventar números**: quando um dado não tiver fonte, escrever "a validar".

- **Quem paga e quanto.** Produtor por assinatura, cooperativa para os cooperados ou comissão sobre a economia? Comparar os modelos e dizer o que precisaria ser verdade para cada um funcionar.
- **Tamanho do mercado.** Quantos produtores médios existem no Brasil, quanto gastam com diesel, ração e adubo e quanto varia o preço entre fornecedores. Sempre com a fonte (IBGE, Conab, Embrapa, Censo Agro).
- **Cooperativas.** Quais são as maiores, como compram hoje e se já têm compra coletiva. Esse é o canal de entrada mais forte.
- **ERPs do agro.** Para cada ERP da seção 5: tem API pública? Exporta NF-e? Quem usa?
- **Regulação.** O que a Anatel exige para ligações automáticas e o que a LGPD exige para gravar ou transcrever ligações.
- **Pitch.** O roteiro da demo tem 3 a 4 minutos: problema (30 s) → pedido ao vivo → ligação para o fornecedor A (com interrupção e contraproposta) → fornecedor B (mais barato, mas fora do prazo) → recomendação e "fecha" → números, limitações e próximos passos.

## 7. Regras para quem mexer no código

- Converse com o Davi antes de abrir uma frente nova. Uma coisa por vez, num PR pequeno.
- Chaves ficam só no `.env.local`, que nunca vai para o Git.
- Os créditos de IA são limitados. Teste em texto sempre que puder (`scripts/conversa-texto.mjs`) e deixe a voz pela Agora para a prova final.
- Antes de usar qualquer endpoint da Agora, confira a documentação atual: as APIs mudam.
