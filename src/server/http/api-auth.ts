import 'server-only';

import type { Session } from 'next-auth';
import type { Permission, PermissionCarrier } from '@/shared/permissions';

import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import {
  canAccessSector,
  hasPermission,
  sessionFreshnessProblem,
} from '@/shared/permissions';

/**
 * Authorization helpers for route handlers.
 *
 * `proxy.ts` skips every `/api` path, so these are the only barrier for
 * API routes — each handler must call one of these explicitly.
 *
 * `auth()` in a route decodes the session from the session cookie; there is
 * no extra database round-trip. As permissões vêm nos claims do JWT e são
 * revalidadas aqui por frescor:
 *  - `auth_at` > SESSION_ABSOLUTE_MAX_AGE → sessão expirada (login novo);
 *  - `perms_at` > PERMISSIONS_MAX_AGE → permissões stale (401
 *    `refresh_required`: o client refaz o refresh — que recarrega
 *    permissões do banco — e repete a chamada).
 * É isso que limita a janela de uma revogação a ≤15min sem precisar de
 * ida ao banco a cada request.
 *
 * Usage:
 *   const { session, error } = await requirePermission(QUEUE_RESET);
 *   if (error) return error;
 *
 * O retorno é uma união discriminada por `error`: ao entrar no ramo de erro o
 * `session` já estreita para `Session` de verdade (e vice-versa), então as
 * rotas não precisam de checagem redundante de `!session` depois de `if (error)`.
 */

export type AuthResult =
  | { readonly session: Session; readonly error?: undefined }
  | { readonly session?: undefined; readonly error: NextResponse };

export interface SectorAccessResult {
  readonly error?: NextResponse;
}

function errorResponse(
  status: number,
  message: string,
  code: string,
): NextResponse {
  return NextResponse.json({ error: message, code }, { status });
}

/**
 * Require any authenticated user with a fresh session/permissions.
 */
export async function requireSession(): Promise<AuthResult> {
  const session = await auth();

  if (!session?.user) {
    return { error: errorResponse(401, 'Unauthorized.', 'unauthenticated') };
  }

  const problem = sessionFreshnessProblem(session.user);
  if (problem === 'expired') {
    return { error: errorResponse(401, 'Session expired.', 'session_expired') };
  }
  if (problem === 'stale') {
    return {
      error: errorResponse(
        401,
        'Session refresh required.',
        'refresh_required',
      ),
    };
  }

  return { session };
}

/**
 * Require a fresh session with a specific permission
 * (registro de chaves em `src/shared/permissions.ts`).
 */
export async function requirePermission(
  permission: Permission,
): Promise<AuthResult> {
  const { session, error } = await requireSession();
  if (error) return { error };

  if (!hasPermission(session, permission)) {
    return { error: errorResponse(403, 'Forbidden.', 'forbidden') };
  }

  return { session };
}

/**
 * Escopo de setor: operação no setor alvo só passa se o usuário tem a
 * permissão de escopo (setores.todos.*) ou o setor é o seu próprio.
 *
 * @param sector setor alvo da operação
 * @param mode leitura (fila/monitor/stats) ou escrita (chamar/resetar/…)
 * @returns `{} ` quando permitido
 */
export function assertSectorAccess(
  session: PermissionCarrier | null | undefined,
  sector: string,
  mode: 'read' | 'write' = 'read',
): SectorAccessResult {
  if (canAccessSector(session, sector, mode)) return {};
  return {
    error: errorResponse(403, 'Acesso ao setor negado.', 'sector_forbidden'),
  };
}
