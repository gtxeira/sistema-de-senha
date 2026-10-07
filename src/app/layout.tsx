import './globals.css';
import Providers from './providers';
import type { ReactNode } from 'react';
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: 'Sistema de Atendimento por Senhas',
  description: 'Gerenciamento de chamadas de senhas para unidades de saúde',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}