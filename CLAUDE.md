# Desenrola Agro — spec do projeto


## 0. Como trabalhar neste projeto
- Hackathon com tempo curto. Prioridade absoluta: uma demo funcionando ponta a ponta, não código bonito.
- Construir na ordem da seção 7. Só passar para a fase seguinte quando a anterior estiver rodando.
- APIs da Agora mudam: sempre conferir a documentação atual (links na seção 5). Não confiar em nomes de endpoint ou campo de memória.
- Idioma do produto: português do Brasil (fala, interface, prompts).
- Se algo da Agora travar por mais de 30 minutos, usar o plano B da seção 9 e avisar.

## 1. O hackathon
- Obrigatório: Conversational AI Engine da Agora (agente de voz).
- Créditos de qualquer outro provedor de IA (LLM, ASR, TTS). Preferência: Claude como LLM do agente.

| Peso | Critério | O que a banca olha |
|---|---|---|
| 25% | Experiência de voz e interação | clareza, fluidez, tempo de resposta, interrupções, recuperação de falhas |
| 25% | Execução técnica e integração com a Agora | fluxo funcionando, integração efetiva, consistência |
| 20% | Relevância do problema e impacto | público, problema concreto, benefício |
| 15% | Inovação e diferenciação | quanto a voz melhora a experiência |
| 10% | Validação e potencial de evolução | testes, aprendizados, limitações, próximos passos |
| 5% | Clareza da apresentação | explicação e demonstração no tempo |

## 2. O produto
Uma frase: o produtor rural fala o que precisa. Um agente de voz liga para os fornecedores, negocia dentro do limite que ele deu e volta com a melhor proposta para ele aprovar.

Problema: produtores perdem horas no telefone cotando insumos (diesel, ração, adubo, defensivo); preços variam muito; no interior a negociação é por telefone, o fornecedor não preenche formulário.

Público: produtor rural médio. Pagador (hipótese): produtor por assinatura ou cooperativa. Preço: a validar, não inventar números.

Por que voz: voz dos dois lados; produtor no campo com mãos ocupadas; fornecedor resolve por telefone como já faz; negociação tem contraproposta, objeção, "me liga depois".

Caso principal da demo: "Oi, preciso falar com meu fornecedor de combustível, pra reabastecer até quinta. Desenrola um preço de até 15 mil."

## 3. Fluxo do MVP
1. Pedido por voz do produtor → tarefa `{produto, quantidade, unidade, prazo_entrega, teto_total, local_entrega, observações}`.
2. Esclarecimento: pergunta campo obrigatório faltando ("Quantos litros?"), confirma em voz alta.
3. Ligações: agente negociador liga para Fornecedor A, depois B. Na demo, fornecedores são pessoas do time numa tela web que simula o telefone. Em cada ligação: apresenta-se como IA, negocia, registra a oferta por chamada de função.
4. Comparação: preço total, prazo (descarta o que passa do limite), frete, pagamento.
5. Retorno ao produtor: resumo e recomendação por voz ("A sai por R$ 14.200 com entrega na quarta. B é mais barato, mas só entrega na sexta. Fecho com o A?").
6. Aprovação: produtor diz "fecha" ou clica aprovar no painel. No MVP basta marcar "fechado com A".

Extras (só depois do MVP): E1 ligação real via SIP trunk; E2 busca de fornecedores (Google Places), só ligar para lista autorizada do time; E3 memória de preços.

## 4. Regras de segurança do negociador (inegociáveis)
1. Diz que é IA logo no começo.
2. Nunca revela o teto.
3. Nunca fecha negócio sem aprovação explícita do produtor.
4. Nunca inventa informação (quantidade, endereço, pagamento, CNPJ).
5. Nunca passa do teto; reporta ao produtor.
6. Encerra educadamente se pedirem, se hostil ou se não puder atender.

## 5. Notas técnicas Agora (conferir na doc atual)
- Conversational AI Engine sobe agente (ASR+LLM+TTS) num canal RTC; a interface entra no mesmo canal pelo navegador.
- Ligação para fora: `POST https://api.agora.io/api/conversational-ai-agent/v2/projects/{appid}/call`, `sip.to_number`/`sip.from_number` E.164, Basic Auth. Docs: https://docs.agora.io/en/conversational-ai/rest-api/telephony/start
- SIP trunk: Elastic SIP Trunk externo (ex. Twilio), Termination URI, ACL de IPs, importar número no Agent Studio; ponto de conexão sa-east-1. Docs: https://docs.agora.io/en/ai/studio/deploy/sip-trunk. Fora do caminho crítico (extra E1).
- LLM: BYOK. Confirmar se precisa API compatível com OpenAI; se sim, proxy pequeno para Claude com tools e streaming. Medir latência.
- ASR/TTS pt-BR: testar cedo, TTS ruim derruba a nota.
- Análise estruturada pós-ligação: usar se simples; senão, function calls durante a ligação.

## 6. Arquitetura sugerida
- Frontend (Next.js ou similar): `/produtor` (botão falar, transcrição ao vivo, tarefa estruturada), `/fornecedor/[id]` (tela de celular tocando, atende, entra no canal RTC), `/painel` (tarefas, status das ligações em tempo real, transcrições, tabela de ofertas, botão Aprovar).
- Backend (Node ou FastAPI): máquina de estados `CRIADA → ESCLARECENDO → LIGANDO(fornecedor_i) → OFERTAS_COLETADAS → AGUARDANDO_APROVACAO → FECHADA | CANCELADA`; WebSocket ou SSE para o painel.
- Tools do negociador: `registrar_oferta(preco_unitario, preco_total, prazo_entrega, frete, pagamento, observacoes)`, `fornecedor_indisponivel(motivo, retornar_em?)`, `encerrar_ligacao(resultado)`.
- Tools do produtor: `criar_tarefa(...)`, `aprovar_oferta(oferta_id)`, `cancelar_tarefa()`.
- Dados: memória ou SQLite; fornecedores fixos no código.

## 7. Ordem de construção
1. Agente de voz básico da Agora conversando em pt-BR no navegador. Medir latência (alvo < ~1,5 s). ← maior risco, primeiro
2. Agente do produtor: pedido → tarefa estruturada, com esclarecimento.
3. Negociador com tela de fornecedor simulado, `registrar_oferta` funcionando.
4. Orquestrador: A depois B, comparar, voltar ao produtor.
5. Painel em tempo real com aprovação.
6. Polimento de voz (seção 8).
7. Extras: E2 → E1 → E3.

## 8. Checklist de voz (demonstrar de propósito)
Interrupção; resposta vaga → compromisso; silêncio/áudio ruim → pede para repetir; pergunta fora do roteiro; contraproposta sem revelar teto; números falados com clareza; latência medida para o slide.
Prompt do negociador: educado, direto, linguagem do interior; pede preço primeiro; tenta melhorar 1–2 vezes (volume, à vista, frete); coleta preço unitário, total, prazo, frete, pagamento; frases curtas, uma pergunta por vez.

## 9. Planos B
SIP falha → navegador. Latência alta com proxy Claude → modelo mais rápido no turno de voz, Claude no planejamento/comparação. Function call instável → extrair oferta da transcrição no fim. Agente do produtor instável → tarefa pré-preenchida, foco na negociação.

## 10. Roteiro da demo (3–4 min)
Problema (30 s) → pedido ao vivo com "quantos litros?" → ligação A (interrupção + contraproposta, oferta no painel) → ligação B (mais barato, fora do prazo) → agente volta com recomendação, "fecha" → métricas, limitações, próximos passos.

## 11. Validação
`TESTES.md`: nº de ligações de teste com pessoas diferentes, latência média, interrupções bem tratadas, ofertas extraídas corretamente, falhas e correções.
Limitações: sem fornecedor real; regras Anatel para ligações automáticas; responsabilidade da compra é do produtor; sinal ruim no campo.

## 12. Fora do escopo
Pagamento/pedido/nota fiscal; login e multiusuário; mais de um produto por tarefa; ligar para empresas reais sem consentimento.
