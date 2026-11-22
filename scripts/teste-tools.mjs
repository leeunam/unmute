// Teste só em texto (sem Agora): o modelo chama registrar_oferta com os
// argumentos certos quando o fornecedor dá a proposta? Mede o tempo até o
// primeiro evento (texto ou tool call) e mostra a fala em pt-BR.
// Uso: node --env-file=.env.local scripts/teste-tools.mjs <modelo> [n=5]
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { jsonSchema, streamText, tool } from "ai";

const [modelo, n = "5"] = process.argv.slice(2);
const feita = createOpenAICompatible({
  name: "feita",
  baseURL: "https://api.feita.ai/gateway/v1",
  apiKey: process.env.FEITA_API_KEY,
});
const reasoning = /^google\//.test(modelo) ? { effort: "minimal" } : { enabled: false };

const registrarOferta = tool({
  description: "Registra a proposta que o fornecedor deu nesta ligação. Chame assim que ele informar preço e condições.",
  inputSchema: jsonSchema({
    type: "object",
    properties: {
      preco_unitario: { type: "number", description: "Preço por litro em reais" },
      prazo_entrega: { type: "string", description: "Quando entrega, como o fornecedor disse" },
      frete: { type: "string", description: "Quem paga o frete e quanto" },
      pagamento: { type: "string", description: "Forma e prazo de pagamento" },
      observacoes: { type: "string", description: "Qualquer outra condição relevante" },
    },
    required: ["preco_unitario", "prazo_entrega", "frete", "pagamento"],
  }),
  execute: async () => ({ ok: true }),
});

const instructions = `Você é o agente de voz do Desenrola Agro ligando para um fornecedor em nome de um produtor rural.
Fale em português do Brasil, frases curtas, uma pergunta por vez. O produtor quer 5 mil litros de diesel S10.
Quando o fornecedor der a proposta, chame registrar_oferta e depois responda em voz alta, agradecendo e dizendo que vai levar a proposta ao produtor.`;

const messages = [
  { role: "assistant", content: "Bom dia! Aqui é o assistente de inteligência artificial do Desenrola Agro, falando em nome de um produtor. Vocês têm diesel S10 para cinco mil litros?" },
  { role: "user", content: "Tenho sim. Diesel S10 a 6,10 o litro, entrego quinta, frete por minha conta, pago no boleto 28 dias." },
];

for (let i = 0; i < Number(n); i++) {
  const t0 = performance.now();
  let primeiro = 0;
  const marca = () => { if (!primeiro) primeiro = performance.now() - t0; };
  const result = streamText({
    model: feita.chatModel(modelo),
    instructions,
    messages,
    tools: { registrar_oferta: registrarOferta },
    maxOutputTokens: 400,
    providerOptions: { feita: { reasoning } },
    stopWhen: ({ steps }) => steps.length >= 2,
  });
  let texto = "";
  const chamadas = [];
  for await (const part of result.fullStream) {
    if (part.type === "text-delta") { marca(); texto += part.text; }
    if (part.type === "tool-input-start" || part.type === "tool-call") marca();
    if (part.type === "tool-call") chamadas.push(part.input);
    if (part.type === "error") console.log("  erro:", String(part.error).slice(0, 200));
  }
  console.log(`#${i + 1} 1º evento ${Math.round(primeiro)} ms · total ${Math.round(performance.now() - t0)} ms`);
  console.log(`   tool: ${chamadas.length ? JSON.stringify(chamadas) : "NÃO CHAMOU"}`);
  console.log(`   fala: ${JSON.stringify(texto.trim())}`);
}
