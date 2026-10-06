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
 */
import { createHash, randomBytes } from "node:crypto";
import {
  REFRESH_COOKIE_NAME,
  REFRESH_REUSE_GRACE,
  REFRESH_TOKEN_MAX_AGE,
} from "./constants.js";

export { REFRESH_COOKIE_NAME };

export function hashRefreshToken(raw) {
  return createHash("sha256").update(String(raw)).digest("hex");
}

export function generateRefreshToken() {
  return randomBytes(32).toString("base64url");
}

/** Opções do cookie de refresh (httpOnly, SameSite=Lax — já é o padrão do Auth.js). */
export function refreshCookieOptions(expiresAt, secure) {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: !!secure,
    path: "/",
    maxAge: Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000)),
  };
}

export function clearRefreshCookieOptions(secure) {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: !!secure,
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  };
}

/**
 * Emite o primeiro refresh token de um login (nova família).
 * @returns {Promise<{raw: string, expiresAt: Date, familyId: string}>}
 */
export async function issueRefreshToken(prisma, userId) {
  const raw = generateRefreshToken();
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_MAX_AGE * 1000);
  const familyId = crypto.randomUUID();
  await prisma.refresh_tokens.create({
    data: {
      user_id: userId,
      token_hash: hashRefreshToken(raw),
      family_id: familyId,
      expires_at: expiresAt,
    },
  });
  return { raw, expiresAt, familyId };
}

/**
 * Rotaciona um refresh token apresentado.
 * @returns {Promise<
 *   {ok: true, raw: string, userId: string, expiresAt: Date} |
 *   {ok: false, reason: 'unknown'|'expired'|'revoked'|'conflict'}
 * >}
 */
export async function rotateRefreshToken(prisma, raw) {
  const row = await prisma.refresh_tokens.findUnique({
    where: { token_hash: hashRefreshToken(raw) },
  });

  if (!row) return { ok: false, reason: "unknown" };

  if (row.used_at) {
    const ageMs = Date.now() - row.used_at.getTime();
    if (ageMs <= REFRESH_REUSE_GRACE * 1000) {
      // Dois fluxos do mesmo cliente rotacionaram quase ao mesmo tempo:
      // o vencedor já emitiu os cookies. Não revoga (o "atacante" aqui é
      // o próprio cliente), apenas sinaliza para o perdedor repetir.
      return { ok: false, reason: "conflict" };
    }
    // Reuso fora da graça: possível roubo do token. Revoga a família.
    await prisma.refresh_tokens.deleteMany({
      where: { family_id: row.family_id },
    });
    return { ok: false, reason: "revoked" };
  }

  if (row.expires_at.getTime() <= Date.now()) {
    await prisma.refresh_tokens.deleteMany({ where: { id: row.id } });
    return { ok: false, reason: "expired" };
  }

  const nextRaw = generateRefreshToken();
  await prisma.$transaction([
    prisma.refresh_tokens.update({
      where: { id: row.id },
      data: { used_at: new Date() },
    }),
    prisma.refresh_tokens.create({
      data: {
        user_id: row.user_id,
        token_hash: hashRefreshToken(nextRaw),
        family_id: row.family_id,
        // Janela absoluta: a rotação NÃO renova o prazo do login.
        expires_at: row.expires_at,
      },
    }),
  ]);

  return { ok: true, raw: nextRaw, userId: row.user_id, expiresAt: row.expires_at };
}

/**
 * Revoga a família do token apresentado (logout).
 * @returns {Promise<boolean>} true se alguma linha foi removida
 */
export async function revokeRefreshToken(prisma, raw) {
  const row = await prisma.refresh_tokens.findUnique({
    where: { token_hash: hashRefreshToken(raw) },
  });
  if (!row) return false;
  await prisma.refresh_tokens.deleteMany({
    where: { family_id: row.family_id },
  });
  return true;
}
