import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { encode } from "next-auth/jwt";
import { auth, SESSION_COOKIE_NAME } from "@/auth";
import { prisma } from "@/server/db/prisma-client";
import {
  REFRESH_COOKIE_NAME,
  clearRefreshCookieOptions,
  issueRefreshToken,
  refreshCookieOptions,
  revokeRefreshToken,
  rotateRefreshToken,
} from "@/server/auth/refresh";
import type { RotateFailure } from "@/server/auth/refresh";
import { ACCESS_TOKEN_MAX_AGE } from "@/shared/constants";
import { computeEffectivePermissions } from "@/shared/permissions";
import type { Permission } from "@/shared/permissions";

/** `cookies()` é assíncrono e só existe dentro de um handler. */
type CookieJar = Awaited<ReturnType<typeof cookies>>;

/**
 * Motivo de um refresh que não rotacionou — `RotateFailure` do repositório
 * mais o "não autenticado" (sem cookie e sem sessão para criar a família).
 */
type RefreshFailure = RotateFailure | "unauthenticated";

/**
 * Resultado de `rotateOrCreate` — união discriminada por `failure`.
 * A forma de sucesso traz `failure?: undefined` para o `if (outcome.failure)`
 * do caller estreitar; sem ele a propriedade não existiria no ramo certo e o
 * TS acusaria `Property 'failure' does not exist`.
 */
type RotateOutcome =
  | {
      readonly failure: RefreshFailure;
      readonly userId?: undefined;
      readonly rotatedRaw?: undefined;
      readonly expiresAt?: undefined;
    }
  | {
      readonly failure?: undefined;
      readonly userId: string;
      readonly rotatedRaw: string;
      readonly expiresAt: Date;
    };

/** Resultado de `mintSession` — união discriminada por `error`. */
type MintOutcome =
  | { readonly error: NextResponse; readonly permissions?: undefined }
  | { readonly error?: undefined; readonly permissions: Permission[] };

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
 * em src/auth.ts), garantindo que o decode do Auth.js abra o token.
 */

function isSecureRequest(request: Request): boolean {
  const proto =
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
    new URL(request.url).protocol.replace(":", "");
  return proto === "https";
}

function sanitizeCallbackUrl(value: string | null): string {
  const url = String(value || "");
  if (!url.startsWith("/") || url.startsWith("//")) return "/home";
  return url;
}

/** Emite os dois cookies a partir de um userId. */
async function mintSession(
  request: Request,
  jar: CookieJar,
  userId: string,
  {
    rotatedRaw,
    expiresAt,
  }: { rotatedRaw: string; expiresAt: Date }
): Promise<MintOutcome> {
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

  // Mesmo formato de claims produzido pelo callback `jwt` em src/auth.ts.
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

  // `encode()` deriva a chave do token de AUTH_SECRET: sem ele o jose
  // estoura TypeError no hkdf. O guard torna a falha explícita e — o
  // importante — nunca deixa o token ser assinado com secret vazio.
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET não configurado");

  const value = await encode({
    token,
    secret,
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

async function rotateOrCreate(
  request: Request,
  jar: CookieJar,
  { allowCreate }: { allowCreate: boolean }
): Promise<RotateOutcome> {
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

function failureResponse(reason: RefreshFailure): NextResponse {
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

export async function POST(request: Request) {
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

export async function GET(request: Request) {
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
