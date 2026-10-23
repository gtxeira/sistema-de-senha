import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME } from "@/auth";
import { prisma } from "@/server/db/prisma-client";
import {
  REFRESH_COOKIE_NAME,
  clearRefreshCookieOptions,
  revokeRefreshToken,
} from "@/server/auth/refresh";

/**
 * POST — encerra a sessão por completo: revoga a família do refresh token
 * no banco e limpa os dois cookies. O `signOut()` do Auth.js (chamado pela
 * UI) limpa apenas o cookie de sessão — sem esta rota, o refresh token
 * continuaria válido por até 12h e uma aba esquecida poderia "acordar".
 *
 * Não exige sessão válida (ela pode já ter expirado); o próprio cookie de
 * refresh identifica a família a revogar.
 */
export async function POST(request: Request) {
  const jar = await cookies();
  const raw = jar.get(REFRESH_COOKIE_NAME)?.value;
  const secure = request.headers.get("x-forwarded-proto") === "https";

  if (raw) await revokeRefreshToken(prisma, raw);

  jar.delete(SESSION_COOKIE_NAME);
  jar.set(REFRESH_COOKIE_NAME, "", clearRefreshCookieOptions(secure));

  return NextResponse.json({ ok: true });
}
