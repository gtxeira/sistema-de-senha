'use client';

import type { User } from 'next-auth';
import { useServerSession } from '@/components/server-session-provider';
import { useSession } from '@/stores/use-session-store';

/**
 * A sessão que a UI deve usar.
 *
 * Há duas fontes, com responsabilidades distintas:
 *
 * - **servidor** (`useServerSession`): as claims do cookie httpOnly, lidas
 *   no request. É a fonte autoritativa e a única disponível no primeiro
 *   paint — sem ela, o HTML sai com o fallback ("Atendente") e o item
 *   "Administração" do menu some até a hidratação.
 * - **client** (`useSession`): a store, que renova as claims quando o
 *   `/api/auth/refresh` rotaciona o token. Vem do espelho em localStorage,
 *   então pode estar um passo atrás do cookie.
 *
 * A escolha é por `permsAt` (quando as permissões foram carregadas): o
 * mais recente vence. Empate → a store, que é a fonte que acabou de ser
 * atualizada.
 */
export function useEffectiveSession(): User | null {
  const client = useSession();
  const server = useServerSession();

  if (!client) return server;
  if (!server) return client;

  return client.permsAt >= server.permsAt ? client : server;
}
