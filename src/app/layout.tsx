import './globals.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { Geist } from 'next/font/google';

import { cn } from '@/client/utils';
import { APP_NAME, APP_TITLE_TEMPLATE } from '@/shared/page-title';
import Providers from './providers';

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  /**
   * Título da aba: **nome da tela + separador + nome do sistema**.
   *
   * O `template` vale para os segmentos filhos — cada rota define o nome
   * da sua tela (ver `src/shared/page-title.ts`) e o layout raiz completa
   * com o nome do sistema. O `default` cobre as rotas que não definem
   * título próprio (a raiz, que só redireciona).
   */
  title: {
    default: APP_NAME,
    template: APP_TITLE_TEMPLATE,
  },
  description: 'Gerenciamento de chamadas de senhas para unidades de saúde',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="pt-BR"
      suppressHydrationWarning
      className={cn('font-sans', geist.variable)}
    >
      <body suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
