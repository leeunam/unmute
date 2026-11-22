// Fornecedores fixos da demo (CLAUDE.md, seção 6). Nomes fictícios: quem atende é alguém do time.
export type Fornecedor = { id: string; nome: string; contato: string };

export const FORNECEDORES: Fornecedor[] = [
  { id: "a", nome: "Distribuidora Boa Vista", contato: "Seu Antônio" },
  { id: "b", nome: "Agro Diesel Cerrado", contato: "Dona Marta" },
];

export function fornecedor(id: string): Fornecedor | undefined {
  return FORNECEDORES.find((f) => f.id === id.toLowerCase());
}
