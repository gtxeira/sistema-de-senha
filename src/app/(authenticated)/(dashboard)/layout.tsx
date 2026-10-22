import type { ReactNode } from "react";
import { auth } from "@/auth";
import { ServerSessionProvider } from "@/components/server-session-provider";
import { SidebarLayout } from "@/components/sidebar-layout/sidebar-layout";

/**
 * Layout do dashboard — **server component**.
 *
 * A sessão é lida aqui (`auth()` decodifica o cookie httpOnly) e
 * publicada na árvore via `ServerSessionProvider`. Com isso, o HTML já sai
 * com o usuário real e o menu correto — antes, a sessão vinha da store do
 * client, que começa vazia: o HTML carregava o fallback "Atendente" e o
 * item "Administração" só aparecia depois da hidratação.
 *
 * O que sobra de client fica dentro de `sidebar-layout` (que já era client):
 * a rota ativa (`usePathname`) e o estado publicado pelas páginas na store
 * de layout (setor em foco e ações do cabeçalho).
 */
export default async function DashboardLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  const session = await auth();

  return (
    <ServerSessionProvider session={session?.user ?? null}>
      <SidebarLayout>{children}</SidebarLayout>
    </ServerSessionProvider>
  );
}
