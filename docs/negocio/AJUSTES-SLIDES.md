# Ajustes nos slides de negócio

Este documento confere os slides de negócio contra a documentação do repositório. Os números e as fontes estão em [RELATORIO-ECONOMIA.md](RELATORIO-ECONOMIA.md).

## Modelo de negócio (proposta, decisão do time)

- **Preço:** R$ 100 por mês por produtor ativo. Quem paga é a cooperativa. Garantia: no mês em que a economia medida do produtor ficar abaixo de R$ 100, ele não é cobrado.
- **Custo:** R$ 70 por produtor ativo. Margem de R$ 30. Ponto de equilíbrio em 62 ativos.
- **Expansão:** quando entrarem compras grandes (farelo, fertilizante), cobrar uma % pequena da economia, por exemplo 5%.
- **Como medir a economia:** (média das primeiras ofertas − preço fechado) × volume. Se a média das ofertas passar do preço médio da ANP no município, usa-se o valor da ANP.

## Slide 1: além do tempo, dinheiro

| Número | O que é | Origem |
|---|---|---|
| 14% | Diferença entre o posto mais caro e o mais barato em Sorriso/MT (R$ 7,09 a 8,09) | ANP, medido |
| 4% | Diferença mediana entre o preço médio e o mais barato da cidade: R$ 0,275/L, ou 3,8% (316 municípios) | ANP, calculado |
| R$ 550/mês | 2.000 L × R$ 0,275. É uma **possibilidade**: supõe que o agente chega ao preço mais barato | Premissa |
| R$ 275/mês | Cenário conservador: o agente captura 50% dessa diferença | Premissa |

A diferença de 4% é calculada a partir de dados reais. Já a hipótese de que o cooperado captura essa diferença é **premissa**, porque ainda não testamos com fornecedor de verdade (ver README).

## Slide 2: modelo de negócios e KPIs

- Pôr de volta a etiqueta **"meta a validar no piloto"** junto aos R$ 100. O CLAUDE.md diz "preço: a validar" e o README diz que o preço não foi validado.
- **KPIs:**
  - **Economia por real pago:** meta de 5×.
  - **Recorrência:** % dos produtores ativos que cotam de novo no mês seguinte. Mede se o produtor confia no agente a ponto de voltar. Meta a validar.
  - **Custo por produtor ativo:** até R$ 70.

## Benchmark

- Mover "Nossa Solução" para o canto de cima à direita (automatizado e negociação), com o nome Desenrola Agro.
- Fala: *"Algumas ferramentas mostram preço, como CoteCerto, Agrofy e Aegro, mas ninguém negocia pelo produtor. Outras negociam, como o WhatsApp e o leilão, mas ele faz tudo na mão. O Desenrola Agro é o único que negocia sozinho."*
- O Aegro também aparece como ERP para integrar (CONTEXTO-TIME, seção 5). Ele pode ser concorrente hoje e fonte de histórico amanhã.
- O dgenny é o mais próximo: um agente de IA que negocia por WhatsApp, mas para construtoras e por texto.

## Coerência com a demo

- Na demo, o fornecedor oferece R$ 6,10 a 6,30/L, cerca de R$ 1 abaixo do preço real (média de R$ 7,31 nos municípios da ANP). Sugestão: quem faz o fornecedor começa em R$ 7,30 a 7,40 e baixa até uns R$ 7,10.
- Na demo, o agente tirou R$ 0,20/L, ou R$ 400 em 2.000 L, com fornecedor simulado.

## Sem fonte (não usar como dado)

- "17 ligações para fechar".
- "Quase ninguém tem tempo de cotar três" (README).

## Para o Davi decidir

O README ainda diz que o pagador é "o produtor, por assinatura, ou a cooperativa". Se o modelo acima for aprovado, a sugestão é trocar por: *"A hipótese é que a cooperativa pague R$ 100 por mês por produtor ativo, com garantia de economia. O preço ainda não foi validado com nenhuma cooperativa."*
