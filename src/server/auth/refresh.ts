import 'server-only';
/**
 * Refresh tokens da sessão (server-only — importar apenas em Route Handlers).
 *
 * O token é opaco (256 bits aleatórios) e só o SHA-256 é persistido.
 * Cada rotação marca a linha atual como usada e emite uma nova na mesma
 * família, preservando o `expires_at` original (janela absoluta de 12h
 * desde o login). Reapresentar um token já usado:
 *  - dentro de REFRESH_REUSE_GRACE → corrida entre dois fluxos de refresh
 *    simultâneos no mesmo cliente: sinaliza `conflict` sem punir;
 *  - fora da graça → possível roubo do token: revoga a família inteira.
 *
 * Os valores puros (hash/geração) não dependem de Prisma para permitir
 * testes unitários sem banco.
 *
 * `prisma` é injetado e tipado pela superfície mínima usada aqui — o client
 * real satisfaz a interface por estrutura, e o fake dos testes unitários
 * também, sem cast.
 */
import { createHash, randomBytes } from 'node:crypto';

import {
  REFRESH_COOKIE_NAME,
  REFRESH_REUSE_GRACE,
  REFRESH_TOKEN_MAX_AGE,
} from '@/shared/constants';

export { REFRESH_COOKIE_NAME };

/* ─── Superfície mínima de persistência ─────────────────────────────────────── */

export type RotateFailure = 'conflict' | 'expired' | 'revoked' | 'unknown';

/** União discriminada por `ok`: `result.raw` só existe no ramo de sucesso. */
export type RotateResult =
  | {
      readonly expiresAt: Date;
      readonly ok: true;
      readonly raw: string;
      readonly userId: string;
    }
  | { readonly ok: false; readonly reason: RotateFailure };

/* ─── Valores puros ─────────────────────────────────────────────────────────── */

export interface ClearRefreshCookieOptions extends RefreshCookieOptions {
  readonly expires: Date;
  readonly maxAge: 0;
}

export interface RefreshCookieOptions {
  readonly httpOnly: true;
  readonly maxAge: number;
  readonly path: '/';
  readonly sameSite: 'lax';
  readonly secure: boolean;
}

export interface RefreshTokenRow {
  readonly id: string;
  readonly created_at: Date;
  readonly expires_at: Date;
  readonly family_id: string;
  readonly token_hash: string;
  readonly used_at: Date | null;
  readonly user_id: string;
}

export interface RefreshTokenStore {
  $transaction<T>(ops: ReadonlyArray<PromiseLike<T>>): Promise<T[]>;
  refresh_tokens: {
    create(args: {
      readonly data: Record<string, unknown>;
    }): Promise<RefreshTokenRow>;
    deleteMany(args: {
      readonly where: Record<string, unknown>;
    }): Promise<{ readonly count: number }>;
    findUnique(args: {
      readonly where: { readonly token_hash: string };
    }): Promise<RefreshTokenRow | null>;
    update(args: {
      readonly data: Record<string, unknown>;
      readonly where: { readonly id: string };
    }): Promise<RefreshTokenRow>;
  };
}

export function clearRefreshCookieOptions(
  secure: boolean,
): ClearRefreshCookieOptions {
  return {
    expires: new Date(0),
    httpOnly: true,
    maxAge: 0,
    path: '/',
    sameSite: 'lax',
    secure: !!secure,
  };
}

export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

/* ─── Ciclo de vida ─────────────────────────────────────────────────────────── */

export function hashRefreshToken(raw: string): string {
  return createHash('sha256').update(String(raw)).digest('hex');
}

/**
 * Emite o primeiro refresh token de um login (nova família).
 */
export async function issueRefreshToken(
  prisma: RefreshTokenStore,
  userId: string,
): Promise<{ expiresAt: Date; familyId: string; raw: string; }> {
  const raw = generateRefreshToken();
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_MAX_AGE * 1000);
  const familyId = crypto.randomUUID();
  await prisma.refresh_tokens.create({
    data: {
      expires_at: expiresAt,
      family_id: familyId,
      token_hash: hashRefreshToken(raw),
      user_id: userId,
    },
  });
  return { expiresAt, familyId, raw };
}

/** Opções do cookie de refresh (httpOnly, SameSite=Lax — já é o padrão do Auth.js). */
export function refreshCookieOptions(
  expiresAt: Date,
  secure: boolean,
): RefreshCookieOptions {
  return {
    httpOnly: true,
    maxAge: Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000)),
    path: '/',
    sameSite: 'lax',
    secure: !!secure,
  };
}

/**
 * Revoga a família do token apresentado (logout).
 * @returns true se alguma linha foi removida
 */
export async function revokeRefreshToken(
  prisma: RefreshTokenStore,
  raw: string,
): Promise<boolean> {
  const row = await prisma.refresh_tokens.findUnique({
    where: { token_hash: hashRefreshToken(raw) },
  });
  if (!row) return false;
  await prisma.refresh_tokens.deleteMany({
    where: { family_id: row.family_id },
  });
  return true;
}

/**
 * Rotaciona um refresh token apresentado.
 */
export async function rotateRefreshToken(
  prisma: RefreshTokenStore,
  raw: string,
): Promise<RotateResult> {
  const row = await prisma.refresh_tokens.findUnique({
    where: { token_hash: hashRefreshToken(raw) },
  });

  if (!row) return { ok: false, reason: 'unknown' };

  if (row.used_at) {
    const ageMs = Date.now() - row.used_at.getTime();
    if (ageMs <= REFRESH_REUSE_GRACE * 1000) {
      // Dois fluxos do mesmo cliente rotacionaram quase ao mesmo tempo:
      // o vencedor já emitiu os cookies. Não revoga (o "atacante" aqui é
      // o próprio cliente), apenas sinaliza para o perdedor repetir.
      return { ok: false, reason: 'conflict' };
    }
    // Reuso fora da graça: possível roubo do token. Revoga a família.
    await prisma.refresh_tokens.deleteMany({
      where: { family_id: row.family_id },
    });
    return { ok: false, reason: 'revoked' };
  }

  if (row.expires_at.getTime() <= Date.now()) {
    await prisma.refresh_tokens.deleteMany({ where: { id: row.id } });
    return { ok: false, reason: 'expired' };
  }

  const nextRaw = generateRefreshToken();
  await prisma.$transaction([
    prisma.refresh_tokens.update({
      data: { used_at: new Date() },
      where: { id: row.id },
    }),
    prisma.refresh_tokens.create({
      data: {
        family_id: row.family_id,
        token_hash: hashRefreshToken(nextRaw),
        user_id: row.user_id,
        // Janela absoluta: a rotação NÃO renova o prazo do login.
        expires_at: row.expires_at,
      },
    }),
  ]);

  return {
    expiresAt: row.expires_at,
    ok: true,
    raw: nextRaw,
    userId: row.user_id,
  };
}
