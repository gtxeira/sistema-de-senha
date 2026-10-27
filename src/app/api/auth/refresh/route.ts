import type { RotateFailure } from '@/server/auth/refresh';
import type { Permission } from '@/shared/permissions';

import { encode } from 'next-auth/jwt';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { auth, SESSION_COOKIE_NAME } from '@/auth';
import {
  clearRefreshCookieOptions,
  issueRefreshToken,
  REFRESH_COOKIE_NAME,
  refreshCookieOptions,
  revokeRefreshToken,
  rotateRefreshToken,
} from '@/server/auth/refresh';
import { prisma } from '@/server/db/prisma-client';
import { ACCESS_TOKEN_MAX_AGE } from '@/shared/constants';
import { computeEffectivePermissions } from '@/shared/permissions';

export async function GET(request: Request) {
  const jar = await cookies();
  const url = new URL(request.url);
  const callbackUrl = sanitizeCallbackUrl(url.searchParams.get('callbackUrl'));

  const outcome = await rotateOrCreate(request, jar, { allowCreate: false });
  if (outcome.failure) {
    if (outcome.failure === 'conflict') {
      // Outro fluxo acabou de renovar — segue para o destino; se os
      // cookies novos chegaram ao jar do navegador, a página carrega.
      return NextResponse.redirect(new URL(callbackUrl, request.url));
    }
    const secure = isSecureRequest(request);
    jar.delete(SESSION_COOKIE_NAME);
    jar.set(REFRESH_COOKIE_NAME, '', clearRefreshCookieOptions(secure));
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const minted = await mintSession(request, jar, outcome.userId, {
    expiresAt: outcome.expiresAt,
    rotatedRaw: outcome.rotatedRaw,
  });
  if (minted.error) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.redirect(new URL(callbackUrl, request.url));
}

export async function POST(request: Request) {
  const jar = await cookies();

  const outcome = await rotateOrCreate(request, jar, { allowCreate: true });
  if (outcome.failure) {
    // Cookies inválidos/expirados saem de cena junto.
    const secure = isSecureRequest(request);
    jar.delete(SESSION_COOKIE_NAME);
    jar.set(REFRESH_COOKIE_NAME, '', clearRefreshCookieOptions(secure));
    return failureResponse(outcome.failure);
  }

  const minted = await mintSession(request, jar, outcome.userId, {
    expiresAt: outcome.expiresAt,
    rotatedRaw: outcome.rotatedRaw,
  });
  if (minted.error) return minted.error;

  return NextResponse.json({ ok: true, permissions: minted.permissions });
}

/** `cookies()` é assíncrono e só existe dentro de um handler. */
type CookieJar = Awaited<ReturnType<typeof cookies>>;

/** Resultado de `mintSession` — união discriminada por `error`. */
type MintOutcome =
  | { readonly error: NextResponse; readonly permissions?: undefined }
  | { readonly permissions: Permission[]; readonly error?: undefined };

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

/**
 * Motivo de um refresh que não rotacionou — `RotateFailure` do repositório
 * mais o "não autenticado" (sem cookie e sem sessão para criar a família).
 */
type RefreshFailure = 'unauthenticated' | RotateFailure;

/**
 * Resultado de `rotateOrCreate` — união discriminada por `failure`.
 * A forma de sucesso traz `failure?: undefined` para o `if (outcome.failure)`
 * do caller estreitar; sem ele a propriedade não existiria no ramo certo e o
 * TS acusaria `Property 'failure' does not exist`.
 */
type RotateOutcome =
  | {
      readonly expiresAt: Date;
      readonly rotatedRaw: string;
      readonly userId: string;
      readonly failure?: undefined;
    }
  | {
      readonly failure: RefreshFailure;
      readonly expiresAt?: undefined;
      readonly rotatedRaw?: undefined;
      readonly userId?: undefined;
    };

function failureResponse(reason: RefreshFailure): NextResponse {
  if (reason === 'conflict') {
    // Outro fluxo do mesmo cliente acabou de renovar: o vencedor já
    // gravou os cookies. O caller deve repetir a leitura de sessão.
    return NextResponse.json(
      { code: 'refresh_conflict', error: 'Session already refreshed.' },
      { status: 401 },
    );
  }
  return NextResponse.json(
    { code: 'session_expired', error: 'Session expired.' },
    { status: 401 },
  );
}

function isSecureRequest(request: Request): boolean {
  const proto =
    request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() ||
    new URL(request.url).protocol.replace(':', '');
  return proto === 'https';
}

/** Emite os dois cookies a partir de um userId. */
async function mintSession(
  request: Request,
  jar: CookieJar,
  userId: string,
  { expiresAt, rotatedRaw }: { expiresAt: Date; rotatedRaw: string },
): Promise<MintOutcome> {
  const user = await prisma.users.findUnique({
    include: {
      permissions: true,
      role: { include: { permissions: true } },
    },
    where: { id: userId },
  });

  if (!user || !user.active) {
    // Conta desativada/ removida: derruba a família e os dois cookies.
    if (rotatedRaw) await revokeRefreshToken(prisma, rotatedRaw);
    jar.delete(SESSION_COOKIE_NAME);
    jar.delete(REFRESH_COOKIE_NAME);
    return {
      error: NextResponse.json(
        { code: 'session_expired', error: 'Session expired.' },
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
    name: user.full_name,
    authAt: now,
    email: user.email,
    guiche: user.guiche_id,
    permissions,
    permsAt: now,
    sector: user.sector_id,
    sub: user.id,
  };

  // `encode()` deriva a chave do token de AUTH_SECRET: sem ele o jose
  // estoura TypeError no hkdf. O guard torna a falha explícita e — o
  // importante — nunca deixa o token ser assinado com secret vazio.
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error('AUTH_SECRET não configurado');

  const value = await encode({
    maxAge: ACCESS_TOKEN_MAX_AGE,
    salt: SESSION_COOKIE_NAME,
    secret,
    token,
  });

  const secure = isSecureRequest(request);
  jar.set(SESSION_COOKIE_NAME, value, {
    httpOnly: true,
    maxAge: ACCESS_TOKEN_MAX_AGE,
    path: '/',
    sameSite: 'lax',
    secure,
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
  { allowCreate }: { allowCreate: boolean },
): Promise<RotateOutcome> {
  const raw = jar.get(REFRESH_COOKIE_NAME)?.value;

  if (raw) {
    const result = await rotateRefreshToken(prisma, raw);
    if (!result.ok) return { failure: result.reason };
    return {
      expiresAt: result.expiresAt,
      rotatedRaw: result.raw,
      userId: result.userId,
    };
  }

  // Sem refresh cookie: só o POST (logo após o login) pode *criar* a
  // família, e apenas quando já existe uma sessão válida. Sem essa
  // exigência, qualquer anônimo poderia mintar cookies — e o GET (vindo
  // do proxy) não deve criar estado.
  if (!allowCreate) return { failure: 'unauthenticated' };
  const session = await auth();
  if (!session?.user) return { failure: 'unauthenticated' };
  const issued = await issueRefreshToken(prisma, session.user.id);
  return {
    expiresAt: issued.expiresAt,
    rotatedRaw: issued.raw,
    userId: session.user.id,
  };
}

function sanitizeCallbackUrl(value: null | string): string {
  const url = String(value || '');
  if (!url.startsWith('/') || url.startsWith('//')) return '/home';
  return url;
}
