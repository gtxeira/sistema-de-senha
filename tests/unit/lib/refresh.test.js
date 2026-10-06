import { beforeEach, describe, expect, it } from "vitest";
import {
  generateRefreshToken,
  hashRefreshToken,
  issueRefreshToken,
  revokeRefreshToken,
  rotateRefreshToken,
} from "@/lib/refresh.js";
import {
  REFRESH_REUSE_GRACE,
  REFRESH_TOKEN_MAX_AGE,
} from "@/lib/constants.js";

/**
 * Fake mínimo de `prisma.refresh_tokens` — cobre findUnique/create/update/
 * deleteMany + $transaction, que é tudo o que o módulo usa. Assim os casos
 * de rotação/reuso/expiração rodam sem banco.
 */
function makeFakePrisma() {
  const rows = [];

  function match(row, where) {
    if (where.token_hash !== undefined) return row.token_hash === where.token_hash;
    if (where.family_id !== undefined) return row.family_id === where.family_id;
    if (where.id !== undefined) return row.id === where.id;
    return false;
  }

  return {
    rows,
    refresh_tokens: {
      findUnique: async ({ where }) =>
        rows.find((r) => match(r, where)) ?? null,
      create: async ({ data }) => {
        const row = {
          id: crypto.randomUUID(),
          used_at: null,
          created_at: new Date(),
          ...data,
        };
        rows.push(row);
        return row;
      },
      update: async ({ where, data }) => {
        const row = rows.find((r) => match(r, where));
        if (!row) throw new Error("not found");
        Object.assign(row, data);
        return row;
      },
      deleteMany: async ({ where }) => {
        const before = rows.length;
        for (let i = rows.length - 1; i >= 0; i--) {
          if (match(rows[i], where)) rows.splice(i, 1);
        }
        return { count: before - rows.length };
      },
    },
    // No Prisma, os argumentos de $transaction são PrismaPromises; aqui
    // basta aguardar em ordem.
    $transaction: async (ops) => Promise.all(ops),
  };
}

const USER = "user-1";

describe("refresh tokens — rotação", () => {
  let prisma;

  beforeEach(() => {
    prisma = makeFakePrisma();
  });

  it("emite token opaco e guarda apenas o hash", async () => {
    const { raw, expiresAt, familyId } = await issueRefreshToken(prisma, USER);

    expect(typeof raw).toBe("string");
    expect(raw.length).toBeGreaterThanOrEqual(32);
    expect(familyId).toBeTruthy();

    const row = prisma.rows[0];
    expect(row.token_hash).toBe(hashRefreshToken(raw));
    expect(row.token_hash).not.toBe(raw);
    expect(row.user_id).toBe(USER);
    expect(row.used_at).toBeNull();

    // janela absoluta de 12h desde o login
    const ttl = (expiresAt.getTime() - Date.now()) / 1000;
    expect(ttl).toBeGreaterThan(REFRESH_TOKEN_MAX_AGE - 10);
    expect(ttl).toBeLessThanOrEqual(REFRESH_TOKEN_MAX_AGE);
  });

  it("gera tokens únicos", () => {
    const tokens = new Set(Array.from({ length: 50 }, () => generateRefreshToken()));
    expect(tokens.size).toBe(50);
  });

  it("rotaciona: marca a antiga como usada e emite nova na mesma família", async () => {
    const first = await issueRefreshToken(prisma, USER);

    const result = await rotateRefreshToken(prisma, first.raw);
    expect(result.ok).toBe(true);
    expect(result.raw).not.toBe(first.raw);
    expect(result.userId).toBe(USER);
    expect(result.familyId).toBeUndefined();

    expect(prisma.rows).toHaveLength(2);
    const [oldRow, newRow] = prisma.rows;
    expect(oldRow.used_at).toBeInstanceOf(Date);
    expect(newRow.used_at).toBeNull();
    expect(newRow.family_id).toBe(first.familyId);
    // rotação NÃO renova o prazo absoluto
    expect(newRow.expires_at.getTime()).toBe(oldRow.expires_at.getTime());
  });

  it("token desconhecido ⇒ unknown", async () => {
    const result = await rotateRefreshToken(prisma, "nunca-emitido");
    expect(result).toEqual({ ok: false, reason: "unknown" });
  });

  it("token expirado ⇒ expired e é removido", async () => {
    const first = await issueRefreshToken(prisma, USER);
    // envelhece a linha para além da janela
    prisma.rows[0].expires_at = new Date(Date.now() - 1000);

    const result = await rotateRefreshToken(prisma, first.raw);
    expect(result).toEqual({ ok: false, reason: "expired" });
    expect(prisma.rows).toHaveLength(0);
  });

  it("reuso dentro da janela de graça ⇒ conflict (corrida do próprio client)", async () => {
    const first = await issueRefreshToken(prisma, USER);
    const rotated = await rotateRefreshToken(prisma, first.raw);
    expect(rotated.ok).toBe(true);

    // o cliente perdedor reapresenta o token antigo imediatamente
    const result = await rotateRefreshToken(prisma, first.raw);
    expect(result).toEqual({ ok: false, reason: "conflict" });
    // NÃO revoga a família — os 2 tokens seguem válidos
    expect(prisma.rows).toHaveLength(2);
  });

  it("reuso fora da graça ⇒ revoga a família inteira (reuse detection)", async () => {
    const first = await issueRefreshToken(prisma, USER);
    const rotated = await rotateRefreshToken(prisma, first.raw);
    expect(rotated.ok).toBe(true);

    // simula o token antigo reapresentado 1min depois
    prisma.rows[0].used_at = new Date(
      Date.now() - (REFRESH_REUSE_GRACE + 60) * 1000,
    );

    const result = await rotateRefreshToken(prisma, first.raw);
    expect(result).toEqual({ ok: false, reason: "revoked" });
    // família apagada: nem o token vigente serve mais
    expect(prisma.rows).toHaveLength(0);
  });

  it("reuso detectado mantém mesmo prazo absoluto em toda a família", async () => {
    const first = await issueRefreshToken(prisma, USER);
    const absolute = first.expiresAt.getTime();

    let current = first.raw;
    for (let i = 0; i < 3; i++) {
      const result = await rotateRefreshToken(prisma, current);
      expect(result.ok).toBe(true);
      current = result.raw;
      expect(result.expiresAt.getTime()).toBe(absolute);
    }
  });
});

describe("refresh tokens — logout", () => {
  let prisma;

  beforeEach(() => {
    prisma = makeFakePrisma();
  });

  it("revokeRefreshToken apaga toda a família", async () => {
    const first = await issueRefreshToken(prisma, USER);
    const rotated = await rotateRefreshToken(prisma, first.raw);

    const removed = await revokeRefreshToken(prisma, rotated.raw);
    expect(removed).toBe(true);
    expect(prisma.rows).toHaveLength(0);
  });

  it("token desconhecido não remove nada", async () => {
    await issueRefreshToken(prisma, USER);
    const removed = await revokeRefreshToken(prisma, "desconhecido");
    expect(removed).toBe(false);
    expect(prisma.rows).toHaveLength(1);
  });
});
