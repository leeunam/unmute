# Ajustes nos slides de negócio

Este documento compara o que será apresentado (o roteiro do Canva, nos 10 slides, segundo o `Desenrola_Agro_Contexto_Final_README.md`) com os dados do [RELATORIO-ECONOMIA.md](RELATORIO-ECONOMIA.md) e com a documentação do repositório (README, CLAUDE.md, CONTEXTO-TIME, TESTES).

## Resumo

| Slide | Situação | O que fazer |
|---|---|---|
| 1 · Problema (8 fornecedores, Unicafes) | ✅ Com fonte | Manter. Usar os 8 fornecedores no lugar das "17 ligações", que não têm fonte. |
| 2 · Público (1.254 cooperativas, Bozano) | ✅ Com fonte | Manter. |
| 3 a 5 · Equipe, solução, como funciona | ✅ Bate com o README | Manter. |
| 6 · Receita (R$ 100, 100 ativos, R$ 10 mil/mês) | ⚠️ Falta ressalva | Pôr de volta "meta a validar no piloto". |
| 7 · Custo, retorno e KPIs (R$ 200, 2×) | ❌ Subestimado | Trocar para R$ 550 de possibilidade e R$ 275 no conservador, ou para os slides novos. |
| 8 · Benchmark | ❌ Duas versões diferentes | Escolher uma lista de concorrentes e mover o Desenrola para o canto de cima à direita. |
| 9 · Roadmap | ✅ | Manter. |
| 10 · Fecho (QR) | ⚠️ | Inserir a URL real da demo e testar. |

## Slide 7: R$ 200 ou R$ 550

O roteiro atual diz: *"cada cem reais investidos gerem duzentos de economia"*. A conta é 2.000 L × R$ 0,10/L, um valor sem fonte.

Os dados sustentam mais:

| Base | R$/L | Em 2.000 L | Retorno sobre R$ 100 | Tipo de dado |
|---|---|---|---|---|
| Premissa atual do slide | 0,10 | R$ 200 | 2× | Sem fonte |
| Conservador (50% da diferença da ANP) | 0,1375 | R$ 275 | 2,75× | Premissa sobre dado calculado |
| **Diferença mediana entre o preço médio e o mais barato (ANP, 316 municípios, 3,8%)** | **0,275** | **R$ 550** | **5,5×** | **Calculado** |
| Redução média em dois pregões (Bozano e Dom Pedrito) | 0,36 | R$ 720 | 7,2× | Medido, amostra de 2 casos |

**Recomendação:** usar **R$ 550 como possibilidade de economia** e citar os pregões como prova de que negociar baixa o preço.
- A diferença de 4% é **calculada**, não estimada.
- Que o cooperado capture essa diferença é **premissa**, porque ainda não testamos com fornecedor real.

Nova fala do slide 7:
> *"Nessa escala, custa setenta reais por produtor. Em compras públicas, negociar o diesel baixou o preço de R$ 0,20 a R$ 0,52 por litro. Com a diferença mediana da ANP, são R$ 550 por mês de economia possível para o cooperado: cinco vezes e meia o que a cooperativa paga."*

Se preferirem os 2 slides novos (`modelo-negocios-v2.html`), eles entram no lugar dos slides 6 e 7, e o total continua em 10:
- **Além do tempo, dinheiro:** 14% → 4% → R$ 550.
- **Modelo de negócios:** R$ 100, a composição do custo e os KPIs.

## Slide 6: receita

- Os números batem: R$ 100 × 100 ativos = R$ 10 mil/mês, R$ 120 mil anualizados.
- A receita do 1º ano é **R$ 75 mil** (25, 50, 75 e 100 ativos médios por trimestre). Cai para **R$ 69 mil** se o 1º trimestre tiver só os 5 produtores do piloto. No pitch, o número mais simples é o de R$ 10 mil/mês.
- **Ativo** = produtor que recebe ao menos uma proposta válida no mês.
- Falta a etiqueta "meta a validar no piloto". O CLAUDE.md diz "preço: a validar", e o README diz que o preço não foi validado com ninguém.

## KPIs: alinhar a definição

| KPI | No contexto final | No slide v2 | Decisão |
|---|---|---|---|
| Economia por real investido | Economia comprovada nas compras ÷ valor pago pela cooperativa | Meta de 5× | A meta de 5× segue o R$ 550. Se o slide 7 continuar com R$ 200, a meta volta a 2×. |
| Produtores que voltam a cotar | % da coorte com nova cotação **em até 90 dias** | Antes era "todo mês", que não é um número | **Usar 90 dias.** O slide v2 já foi corrigido. |
| Custo por produtor ativo | Custo operacional ÷ ativos no mês | Até R$ 70 | Igual. |

## Slide 8: benchmark

Existem duas versões diferentes:

| Contexto final (Canva) | Print enviado pelo grupo |
|---|---|
| Aegro, Agrofy, FarmFlow, AGD, Telefone/WhatsApp | Aegro, Agrofy, CoteCerto Agro, dgenny, Leilão pra Você, WhatsApp |
| Desenrola no meio, embaixo | Desenrola no centro |

**Decidir uma lista só e fazer a fala bater com os logos.** Nas duas versões, mover o Desenrola Agro para o **canto de cima à direita** (automatizado e negociação). Hoje ele aparece como meio-termo.

O que sabemos de cada concorrente:
- **Aegro:** mostra o preço de notas fiscais passadas (Compare Preços). Também está na lista de ERPs para integrar no CONTEXTO-TIME. Ou seja, concorrente hoje e fonte de histórico no futuro.
- **Agrofy:** catálogo, com cotação pedida por formulário.
- **FarmFlow:** dispara pedidos e junta as respostas dos fornecedores pelo WhatsApp.
- **AGD:** cotações e disputa de lances.
- **dgenny:** agente de IA que negocia por WhatsApp, mas para construtoras e por texto. É o concorrente mais próximo.
- **Leilão pra Você:** leilões da Conab, sem custo para o usuário.
- **CoteCerto Agro:** não encontramos informação pública.

Fala curta:
> *"O Aegro mostra preços passados. Na Agrofy, você pede cotação. O FarmFlow dispara pelo WhatsApp. Na AGD, tem lances. Por telefone, você mesmo negocia. No Desenrola, você delega a conversa e a IA negocia por você."*

## Demo: coerência dos preços

- O roteiro atual da demo usa **A: R$ 7,30 → R$ 7,10/L** (R$ 14.200, quarta) e **B: R$ 6,50/L** (R$ 13.000, sexta, fora do prazo).
- Os preços de A ficam dentro da faixa real da ANP (Sorriso: R$ 7,09 a 8,09; média nacional de R$ 7,31). Não precisa mudar.
- B a R$ 6,50 fica abaixo do mínimo de Sorriso. Isso é aceitável porque B é o fornecedor que perde por prazo.
- A redução de R$ 0,20/L no A, ou R$ 400 em 2.000 L, é resultado da **demo com fornecedor simulado**. Não serve como prova de economia real.

## Modelo de cobrança: proposta que ainda não está nos slides

- **Garantia:** no mês em que a economia medida ficar abaixo de R$ 100, aquele produtor não é cobrado.
- **Como medir:** (média das primeiras ofertas − preço fechado) × volume. Se a média das ofertas ficar acima do preço médio da ANP no município, usa-se o valor da ANP.
- **Expansão:** cobrar uma % pequena (por exemplo, 5%) da economia em compras grandes (farelo, fertilizante).
- O que a cooperativa ganha: renda do cooperado, menos inadimplência, fidelidade e dados de compra. O conflito com a loja da própria cooperativa se resolve incluindo a loja em toda cotação. Ver RELATORIO-ECONOMIA, seções 6 e 9.

## Sem fonte (não usar como dado)

- "17 ligações para fechar". Usar os 8 fornecedores da Unicafes.
- "Quase ninguém tem tempo de cotar três" (README).

## Para o Davi decidir

O README ainda diz que o pagador é "o produtor, por assinatura, ou a cooperativa". Se o modelo for aprovado, a sugestão é trocar por:
> *"A hipótese é que a cooperativa pague R$ 100 por mês por produtor ativo, com garantia de economia. O preço ainda não foi validado com nenhuma cooperativa."*
