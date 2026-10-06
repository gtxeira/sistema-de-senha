import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { encode } from "next-auth/jwt";
import { auth, SESSION_COOKIE_NAME } from "@/auth";
import { prisma } from "@/lib/prisma-client";
import {
  REFRESH_COOKIE_NAME,
  clearRefreshCookieOptions,
  issueRefreshToken,
  refreshCookieOptions,
  revokeRefreshToken,
  rotateRefreshToken,
} from "@/lib/refresh";
import { ACCESS_TOKEN_MAX_AGE } from "@/lib/constants.js";
import { computeEffectivePermissions } from "@/lib/permissions.js";

/**
 * Rotação da sessão em dois níveis.
 *
 * POST — usada pelo client (intervalo proativo, interceptor de 401 e logo
 * após o login): rotaciona o refresh token, recarrega as permissões do
 * banco e emite um novo access JWT (15min) com `perms_at` atual — é por
 * aqui que uma revogação de permissão passa a valer em ≤15min.
 *
 * GET — usada pelo proxy quando a aba/fila de TV acorda sem cookie de
 * sessão válido mas com refresh cookie: mesmo fluxo, redirecionando de
 * volta para a página pedida.
 *
 * `unstable_update()` do Auth.js não serve aqui: ele depende de um cookie
 * de sessão ainda válido, exatamente o que expirou. Emitimos o JWT
 * diretamente com `encode()` usando o mesmo `salt` (nome do cookie fixado
 * em src/auth.js), garantindo que o decode do Auth.js abra o token.
 */

function isSecureRequest(request) {
  const proto =
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
    new URL(request.url).protocol.replace(":", "");
  return proto === "https";
}

function sanitizeCallbackUrl(value) {
  const url = String(value || "");
  if (!url.startsWith("/") || url.startsWith("//")) return "/home";
  return url;
}

/**
 * Emite os dois cookies a partir de um userId.
 * @returns {Promise<{response: Response, permissions: string[]}|{error: Response}>}
 */
async function mintSession(request, jar, userId, { rotatedRaw, expiresAt }) {
  const user = await prisma.users.findUnique({
    where: { id: userId },
    include: {
      role: { include: { permissions: true } },
      permissions: true,
    },
  });

  if (!user || !user.active) {
    // Conta desativada/ removida: derruba a família e os dois cookies.
    if (rotatedRaw) await revokeRefreshToken(prisma, rotatedRaw);
    jar.delete(SESSION_COOKIE_NAME);
    jar.delete(REFRESH_COOKIE_NAME);
    return {
      error: NextResponse.json(
        { error: "Session expired.", code: "session_expired" },
        { status: 401 },
      ),
    };
  }

  const now = Date.now();
  const permissions = computeEffectivePermissions(
    user.role.permissions.map((p) => p.permission),
    user.permissions,
  );

  // Mesmo formato de claims produzido pelo callback `jwt` em src/auth.js.
  const token = {
    sub: user.id,
    name: user.full_name,
    email: user.email,
    sector: user.sector_id,
    guiche: user.guiche_id,
    permissions,
    authAt: now,
    permsAt: now,
  };

  const value = await encode({
    token,
    secret: process.env.AUTH_SECRET,
    maxAge: ACCESS_TOKEN_MAX_AGE,
    salt: SESSION_COOKIE_NAME,
  });

  const secure = isSecureRequest(request);
  jar.set(SESSION_COOKIE_NAME, value, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: ACCESS_TOKEN_MAX_AGE,
  });
  if (rotatedRaw) {
    jar.set(
      REFRESH_COOKIE_NAME,
      rotatedRaw,
      refreshCookieOptions(expiresAt, secure),
    );
  }

  return { permissions };
}

async function rotateOrCreate(request, jar, { allowCreate }) {
  const raw = jar.get(REFRESH_COOKIE_NAME)?.value;

  if (raw) {
    const result = await rotateRefreshToken(prisma, raw);
    if (!result.ok) return { failure: result.reason };
    return {
      userId: result.userId,
      rotatedRaw: result.raw,
      expiresAt: result.expiresAt,
    };
  }

  // Sem refresh cookie: só o POST (logo após o login) pode *criar* a
  // família, e apenas quando já existe uma sessão válida. Sem essa
  // exigência, qualquer anônimo poderia mintar cookies — e o GET (vindo
  // do proxy) não deve criar estado.
  if (!allowCreate) return { failure: "unauthenticated" };
  const session = await auth();
  if (!session?.user) return { failure: "unauthenticated" };
  const issued = await issueRefreshToken(prisma, session.user.id);
  return {
    userId: session.user.id,
    rotatedRaw: issued.raw,
    expiresAt: issued.expiresAt,
  };
}

function failureResponse(reason) {
  if (reason === "conflict") {
    // Outro fluxo do mesmo cliente acabou de renovar: o vencedor já
    // gravou os cookies. O caller deve repetir a leitura de sessão.
    return NextResponse.json(
      { error: "Session already refreshed.", code: "refresh_conflict" },
      { status: 401 },
    );
  }
  return NextResponse.json(
    { error: "Session expired.", code: "session_expired" },
    { status: 401 },
  );
}

export async function POST(request) {
  const jar = await cookies();

  const outcome = await rotateOrCreate(request, jar, { allowCreate: true });
  if (outcome.failure) {
    // Cookies inválidos/expirados saem de cena junto.
    const secure = isSecureRequest(request);
    jar.delete(SESSION_COOKIE_NAME);
    jar.set(REFRESH_COOKIE_NAME, "", clearRefreshCookieOptions(secure));
    return failureResponse(outcome.failure);
  }

  const minted = await mintSession(request, jar, outcome.userId, {
    rotatedRaw: outcome.rotatedRaw,
    expiresAt: outcome.expiresAt,
  });
  if (minted.error) return minted.error;

  return NextResponse.json({ ok: true, permissions: minted.permissions });
}

export async function GET(request) {
  const jar = await cookies();
  const url = new URL(request.url);
  const callbackUrl = sanitizeCallbackUrl(url.searchParams.get("callbackUrl"));

  const outcome = await rotateOrCreate(request, jar, { allowCreate: false });
  if (outcome.failure) {
    if (outcome.failure === "conflict") {
      // Outro fluxo acabou de renovar — segue para o destino; se os
      // cookies novos chegaram ao jar do navegador, a página carrega.
      return NextResponse.redirect(new URL(callbackUrl, request.url));
    }
    const secure = isSecureRequest(request);
    jar.delete(SESSION_COOKIE_NAME);
    jar.set(REFRESH_COOKIE_NAME, "", clearRefreshCookieOptions(secure));
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const minted = await mintSession(request, jar, outcome.userId, {
    rotatedRaw: outcome.rotatedRaw,
    expiresAt: outcome.expiresAt,
  });
  if (minted.error) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.redirect(new URL(callbackUrl, request.url));
}
