import './globals.css';
import Providers from './providers';

export const metadata = {
  title: 'Sistema de Atendimento por Senhas',
  description: 'Gerenciamento de chamadas de senhas para unidades de saúde',
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}