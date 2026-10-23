import type { Mock } from 'vitest';

import { vi } from 'vitest';

import { auth } from '@/auth';

/**
 * Assinatura do mock de `@/auth`.
 *
 * O `auth` do next-auth v5 é uma interseção de cinco sobrecargas e
 * `ReturnType<typeof auth>` cai na última (a de middleware do Next) — por
 * isso `vi.mocked(auth)` prometeria `NextMiddleware` no `mockResolvedValue`.
 * Os handlers chamam `auth()` sem argumentos; este alias fixa o mock nessa
 * sobrecarga.
 *
 * O valor resolvido é `unknown` de propósito: alguns testes montam
 * deliberadamente sessões fora do tipo (cookie legado sem claims de frescor)
 * justamente para verificar que a rota as rejeita.
 */
export type AuthMock = Mock<() => Promise<unknown>>;

/** O `auth` que `tests/setup.ts` instala, na sobrecarga usada pelas rotas. */
export const authMock: AuthMock = vi.mocked(auth) as unknown as AuthMock;
