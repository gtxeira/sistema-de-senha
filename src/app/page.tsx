import { redirect } from 'next/navigation';

import { auth } from '@/auth';

/**
 * Raiz do app: decide para onde o usuário vai.
 *
 * O `proxy.ts` deixa a raiz passar — é a única rota que ele não classifica
 * — e a decisão fica aqui, no servidor, que tem a sessão em mãos:
 * autenticado vai para a home, anônimo vai para o login.
 */
export default async function RootPage() {
  const session = await auth();
  redirect(session?.user ? '/home' : '/login');
}
