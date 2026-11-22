# Desenrola Agro

> "Oi, preciso falar com meu fornecedor de combustível, pra reabastecer até quinta. Desenrola um preço de até 15 mil."

É só isso que o produtor fala. O Desenrola Agro liga para os fornecedores, negocia dentro do limite que ele deu e volta com a melhor proposta para ele aprovar.

Feito para o hackathon da Agora, com o Conversational AI Engine.

## Por que isso existe

Quem compra insumo no campo conhece a rotina: para cotar diesel, ração ou feno, é preciso ligar para um fornecedor, depois para outro, esperar retorno e anotar preço, prazo e frete num papel. O preço muda bastante de um para outro, e quase ninguém tem tempo de cotar três. No interior, isso não vai mudar para um formulário online tão cedo: o fornecedor resolve por telefone, e é assim que ele gosta.

Pensamos no produtor rural médio, que compra insumo toda semana ou todo mês e não tem um comprador dedicado. Ele está no campo, com as mãos ocupadas, e o telefone é o que ele tem à mão.

## Como funciona na prática

O produtor fala o pedido como falaria com um funcionário. Se faltar alguma coisa, como a quantidade, o agente pergunta ("Quantos litros?") e depois confirma em voz alta, com os números por extenso.

Aí o agente liga para os fornecedores. Ele começa dizendo que é o assistente de IA do produtor, pede o preço e tenta melhorar uma ou duas vezes: pelo volume, pelo pagamento à vista ou pelo frete. Se o fornecedor interrompe, ele para e escuta. Se o fornecedor pergunta "qual o máximo que ele paga?", ele não tem a resposta, e explicamos o porquê logo abaixo.

Com as ofertas na mão, o sistema compara preço total, prazo, frete e pagamento, e descarta o que não chega a tempo. O agente volta ao produtor e recomenda: "O A sai por catorze mil e duzentos com entrega na quarta. O B é mais barato, mas só entrega na sexta. Fecho com o A?". Nada é comprado sem o "fecha" dele.

A voz aparece dos dois lados, e não foi por moda. O fornecedor continua atendendo o telefone como sempre, sem instalar nada. O produtor pede sem largar o trabalho. E negociar tem contraproposta, objeção e "me liga depois", coisas que um formulário ou um chatbot de texto não fazem bem.

## Como usamos a Agora

```
Produtor (navegador)
   │  voz em tempo real (Agora RTC)
   ▼
Agora Conversational AI Engine
   ouve ── Deepgram nova-3 (pt-BR)
   pensa ─ chama o nosso servidor ──▶ Nossa rota de LLM (Next.js + Vercel AI SDK)
   fala ── Cartesia sonic-3.6                tools, regras e estado ficam aqui
                                             │
                                             ▼
                                      Gateway de LLM da feita.ai
                                      (Gemini 3.5 Flash Lite)
```

A Agora cuida de tudo o que é voz: ouvir, perceber quando a pessoa terminou de falar, lidar com a interrupção e falar de volta. O raciocínio fica com a gente. A Agora chama a nossa rota de LLM no formato de chat da OpenAI, com streaming, e é ali que rodam as tools, as regras de negócio e o estado da conversa.

## O modelo conversa, o código garante

A gente não confia num LLM para guardar segredo nem para fazer conta. Por isso, as regras que não podem falhar moram no código:

- **O negociador não sabe o teto.** Ele recebe só uma meta de preço. Quem compara a oferta com o teto do produtor é o código, depois da ligação. Não dá para vazar o que não está no contexto.
- **O código decide quando o pedido está completo.** Se falta a quantidade, a tool devolve o que falta e o agente pergunta. O mesmo vale para a oferta: a ligação só termina quando há preço, prazo, frete e pagamento, ou quando o fornecedor disse que não atende.
- **Os números saem do código.** O total é calculado em código, e a confirmação falada ("dois mil litros, até quinze mil reais") também é montada em código. Isso fez a resposta ficar mais rápida, porque é uma chamada a menos ao LLM, e acabou com número errado na fala.
- **Só o produtor fecha.** O agente registra a oferta e, no máximo, diz "vou confirmar com ele e retorno".

## O que medimos

Numa conversa simples, a resposta começa em média **1,54 s** depois que a pessoa para de falar. O turno mais rápido levou 1,36 s. Com o pedido virando tarefa, a média da sessão ficou em **1,91 s**. Nos testes em texto, o pedido falado virou a tarefa certa em **10 de 10** casos.

Na negociação, testamos em texto o fornecedor que dá desconto, o que responde vago ("lá pra quarta, talvez"), o que pergunta "qual o máximo que ele paga?" e o que não tem estoque. Também testamos o apressado, o hostil e o que pede acima do teto. A oferta saiu certa em todos, e o teto não apareceu na fala nenhuma vez. Por voz, com o fornecedor interrompendo o agente, a resposta começou em **1,98 s** de média.

Chegar nesses números deu trabalho. Começamos em 2,2 s. Testamos 8 LLMs (o Claude Haiku 5.5 escreve bem, mas passava de 2,8 s na voz), trocamos o reconhecimento de fala e a voz, encurtamos a espera de fim de fala de 480 para 300 ms sem cortar ninguém e tiramos do LLM a fala da confirmação. Todas as rodadas estão em [`TESTES.md`](TESTES.md).

## Para onde isso vai

**O agente liga antes de faltar.** Com o histórico de compras, dá para saber de quanto em quanto tempo cada produtor compra cada insumo. Quando o diesel estiver perto de acabar, quem liga é o agente: "Seu diesel deve acabar lá pelo dia 3. Quer que eu já cote dois mil litros?".

**Cadastro por voz, sem questionário.** Um número novo liga e o agente faz o cadastro conversando. Se a pessoa diz "tenho 300 cabeças", ele já sabe o tamanho da operação e que ela compra ração e feno, e não pergunta de novo. Se ela já liga com um pedido, ele atende o pedido primeiro.

**Compra coletiva com cooperativas.** Ligado a uma cooperativa, o agente junta os pedidos de vários produtores do mesmo insumo e negocia o volume total. Todo mundo paga menos, e a cooperativa oferece o serviço aos cooperados.

**Histórico pela nota fiscal.** Toda compra de insumo gera uma NF-e num formato padrão que qualquer ERP exporta. Ler essas notas dá o histórico desde o primeiro dia, sem integrar com cada sistema. Depois vem a integração direta com os ERPs do agro.

**Ligação telefônica de verdade.** Na demo, o fornecedor atende numa tela que imita o celular. O próximo passo é ligar para um número real por SIP trunk, que a Agora já suporta.

## O que ainda não resolvemos

Ainda não testamos com um fornecedor de verdade: na demo, quem atende é alguém do time. Ligações automáticas em escala precisam seguir as regras da Anatel. A responsabilidade pela compra continua sendo do produtor, que aprova cada uma. E o sinal de celular no campo é ruim. Sobre o modelo de negócio, a hipótese é que pague o produtor, por assinatura, ou a cooperativa, para os cooperados. O preço ainda não foi validado com ninguém.

## Stack

Agora RTC e Agora Conversational AI Engine · Deepgram nova-3 (pt-BR) e Cartesia sonic-3.6, gerenciados pela Agora · Gemini 3.5 Flash Lite pelo gateway da feita.ai · Next.js e Vercel AI SDK, com as tools validadas em zod.

## Para rodar e entender o código

Como rodar, as chaves necessárias, o mapa dos arquivos e os detalhes do negociador estão em [`docs/TECNICO.md`](docs/TECNICO.md). As medições estão em [`TESTES.md`](TESTES.md), e a spec original em [`CLAUDE.md`](CLAUDE.md). O contexto para quem for ajudar no projeto está em [`docs/CONTEXTO-TIME.md`](docs/CONTEXTO-TIME.md).

Você vai precisar de Node 20 ou mais novo, do `cloudflared` e de uma conta na Agora e na feita.ai. O `ffmpeg` é opcional e só serve para os testes com áudio gravado.
