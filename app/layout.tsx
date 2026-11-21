import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Desenrola Agro",
  description: "Agente de voz em português do Brasil com a Agora",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
