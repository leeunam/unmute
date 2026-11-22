O produtor rural médio perde horas no telefone para cotar diesel, ração, feno e adubo. O preço muda muito de um fornecedor para outro, quase ninguém tem tempo de cotar três, e no interior o fornecedor não responde formulário: tudo se resolve por telefone.

O Desenrola Agro é um agente de voz que faz essa ligação pelo produtor. Ele fala o que precisa ("preciso de diesel até quinta, desenrola um preço de até 15 mil") e o agente pergunta só o que falta, como a quantidade. Depois liga para os fornecedores, se apresenta como assistente de IA, pede o preço e tenta melhorar pelo volume, pelo pagamento ou pelo frete. No fim, volta ao produtor com a recomendação ("o A sai por catorze mil e duzentos e entrega na quarta, fecho?"). Nada é comprado sem o "fecha" dele.

Usamos o Conversational AI Engine da Agora dos dois lados da conversa. A Agora cuida da voz em tempo real: ouve com Deepgram nova-3 em português, detecta o fim da fala e a interrupção, e fala com Cartesia. O raciocínio roda no nosso servidor: a Agora chama a nossa rota de LLM (Next.js com Vercel AI SDK, modelo Gemini Flash Lite), onde ficam as tools e as regras. O modelo conversa e o código garante. O negociador nunca recebe o teto de preço, então não tem como revelá-lo. É o código que decide quando o pedido e a oferta estão completos, e é dele que saem o total e os números falados.

Medimos 1,54 s do fim da fala ao início da resposta numa conversa simples e 1,91 s de média com o pedido virando tarefa. Nos testes, o pedido virou tarefa certa em 10 de 10 casos.

Próximos passos: prever quando o insumo vai acabar e ligar para o produtor antes; compra coletiva com cooperativas para todo mundo pagar menos; e montar o histórico pelas notas fiscais e pelos ERPs do agro.
