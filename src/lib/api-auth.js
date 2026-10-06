import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  canAccessSector,
  hasPermission,
  sessionFreshnessProblem,
} from "./permissions.js";

/**
 * Authorization helpers for route handlers.
 *
 * `proxy.js` skips every `/api` path, so these are the only barrier for
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
 */

function errorResponse(status, message, code) {
  return NextResponse.json({ error: message, code }, { status });
}

/**
 * Require any authenticated user with a fresh session/permissions.
 * @returns {Promise<{ session?: object, error?: NextResponse }>}
 */
export async function requireSession() {
  const session = await auth();

  if (!session?.user) {
    return { error: errorResponse(401, "Unauthorized.", "unauthenticated") };
  }

  const problem = sessionFreshnessProblem(session.user);
  if (problem === "expired") {
    return { error: errorResponse(401, "Session expired.", "session_expired") };
  }
  if (problem === "stale") {
    return {
      error: errorResponse(401, "Session refresh required.", "refresh_required"),
    };
  }

  return { session };
}

/**
 * Require a fresh session with a specific permission
 * (registro de chaves em `src/lib/permissions.js`).
 * @param {string} permission
 * @returns {Promise<{ session?: object, error?: NextResponse }>}
 */
export async function requirePermission(permission) {
  const { session, error } = await requireSession();
  if (error) return { error };

  if (!hasPermission(session, permission)) {
    return { error: errorResponse(403, "Forbidden.", "forbidden") };
  }

  return { session };
}

/**
 * Escopo de setor: operação no setor alvo só passa se o usuário tem a
 * permissão de escopo (setores.todos.*) ou o setor é o seu próprio.
 *
 * @param {object} session
 * @param {string} sector setor alvo da operação
 * @param {'read'|'write'} mode leitura (fila/monitor/stats) ou escrita (chamar/resetar/…)
 * @returns {{ error?: NextResponse }} `{} ` quando permitido
 */
export function assertSectorAccess(session, sector, mode = "read") {
  if (canAccessSector(session, sector, mode)) return {};
  return {
    error: errorResponse(403, "Acesso ao setor negado.", "sector_forbidden"),
  };
}
