import 'server-only';

import type { PrismaClient } from '@/server/generated/prisma/client';
import type { Permission } from '@/shared/permissions';

import bcrypt from 'bcryptjs';
import { CredentialsSignin } from 'next-auth';

import { DEFAULT_GUICHE, USERNAME_REGEX } from '@/shared/constants';
import { computeEffectivePermissions } from '@/shared/permissions';
import {
  checkLoginRateLimit,
  clientIp,
  loginRateLimitKeys,
  recordLoginFailure,
  resetLoginRateLimit,
} from './login-rate-limit';

/**
 * Verificação de credenciais do login (Credentials provider).
 *
 * Fica fora de `config.ts` para ser testável com um `findUser` fake e para
 * concentrar o rate limit num único ponto. O Prisma continua sendo importado
 * dinamicamente: `config.ts` (e este módulo) são carregados pelo `proxy.ts`,
 * que roda em Edge — o client nunca pode ser avaliado no module scope.
 */

/** Busca do usuário pelo username já normalizado. */
export type CredentialsLookup = (
  username: string,
) => Promise<CredentialsUser | null>;

/** Dependências injetáveis (testes) — em produção tudo vem do default. */
export interface AuthorizeCredentialsDeps {
  readonly findUser?: CredentialsLookup;
  readonly now?: () => number;
}

/** Dados devolvidos ao Auth.js quando as credenciais são válidas. */
export interface AuthorizedUser {
  readonly id: string;
  readonly name: string;
  readonly authAt: number;
  readonly email: string;
  readonly guiche: string;
  readonly permissions: Permission[];
  readonly permsAt: number;
  readonly sector: null | string;
}

/** Credenciais como o Auth.js entrega: strings na chamada. */
export interface CredentialsInput {
  readonly password?: unknown;
  readonly username?: unknown;
}

/** Subconjunto do usuário do banco que o login consome. */
export interface CredentialsUser {
  readonly id: string;
  readonly active: boolean;
  readonly email: string;
  readonly full_name: string;
  readonly guiche_id: string;
  readonly password_hash: string;
  readonly permissions: readonly PermissionRow[];
  readonly sector_id: null | string;
  readonly role: {
    readonly permissions: readonly { readonly permission: string }[];
  };
}

/**
 * Erro de rate limit com código legível no callback.
 *
 * O Auth.js serializa `CredentialsSignin` como
 * `?error=CredentialsSignin&code=<code>`, e o `signIn(..., { redirect: false })`
 * do client devolve `code` junto com `error` — é por aí que a tela de login
 * distingue bloqueio de credencial inválida.
 */
export class LoginRateLimitError extends CredentialsSignin {
  constructor(retryAfterSeconds: number) {
    super();
    this.code = `rate_limited:${retryAfterSeconds}`;
  }
}

/** Linha de override de permissão usada no cálculo efetivo. */
interface PermissionRow {
  readonly granted: boolean;
  readonly permission: string;
}

/**
 * O tipo de `credentials` é o da *config* do provider (`CredentialConfig`),
 * mas o Auth.js entrega strings na chamada. Coagir por `typeof` — e não por
 * `String()` — cobre as duas formas sem stringificar um objeto.
 */
function asCredential(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

let prismaPromise: Promise<PrismaClient> | undefined;

/**
 * Valida usuário/senha, aplicando rate limit antes de qualquer ida ao banco.
 *
 * Só falhas de credencial contam: erro de infraestrutura (banco fora) propaga
 * e não penaliza o usuário. Login bem-sucedido zera as chaves.
 */
export async function authorizeCredentials(
  credentials: CredentialsInput | undefined,
  request: Request,
  deps: AuthorizeCredentialsDeps = {},
): Promise<AuthorizedUser | null> {
  const username = asCredential(credentials?.username).trim().toLowerCase();
  const password = asCredential(credentials?.password);
  const now = deps.now?.() ?? Date.now();

  const keys = loginRateLimitKeys(username, clientIp(request));
  const limited = checkLoginRateLimit(keys, now);
  if (limited) throw new LoginRateLimitError(limited.retryAfterSeconds);

  if (!USERNAME_REGEX.test(username) || !password) {
    recordLoginFailure(keys, now);
    return null;
  }

  const user = await (deps.findUser ?? findUser)(username);

  if (!user || !user.active) {
    recordLoginFailure(keys, now);
    return null;
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    recordLoginFailure(keys, now);
    return null;
  }

  resetLoginRateLimit(keys);

  return {
    id: user.id,
    name: user.full_name,
    authAt: now,
    email: user.email,
    guiche: user.guiche_id || DEFAULT_GUICHE,
    permissions: computeEffectivePermissions(
      user.role.permissions.map((p) => p.permission),
      user.permissions,
    ),
    permsAt: now,
    sector: user.sector_id,
  };
}

async function findUser(username: string): Promise<CredentialsUser | null> {
  const prisma = await getPrisma();
  return prisma.users.findUnique({
    include: {
      permissions: true,
      role: { include: { permissions: true } },
    },
    where: { username },
  });
}

/** Client lazy: o único ponto que toca o banco é o login. */
function getPrisma(): Promise<PrismaClient> {
  prismaPromise ??= Promise.all([
    import('@/server/generated/prisma/client'),
    import('@prisma/adapter-pg'),
  ]).then(
    ([{ PrismaClient }, { PrismaPg }]) =>
      new PrismaClient({
        adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
      }),
  );
  return prismaPromise;
}
