import 'server-only';

import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import {
  USERNAME_REGEX,
  DEFAULT_GUICHE,
  ACCESS_TOKEN_MAX_AGE,
  SIGN_IN_PATH,
} from '@/shared/constants';
import { computeEffectivePermissions } from '@/shared/permissions';
import { initials } from '@/shared/format';
import type { PrismaClient } from '@/server/generated/prisma/client';

// Nome fixo do cookie de sessão (e `salt` do JWE do Auth.js). Fixá-lo no
// config garante que o `encode()` da rota de refresh derive a mesma chave
// de criptografia que o `decode()` do Auth.js — com nome dinâmico
// (prefixo __Secure- dependente da URL) os dois poderiam divergir.
// O prefixo __Secure- só impede cookies injetados por canal inseguro; aqui
// o cookie continua httpOnly + secure (a flag segue a URL da request).
export const SESSION_COOKIE_NAME = 'authjs.session-token';

// O client gerado pelo Prisma 7 importa `node:path`/`node:url`, que não existem no
// Edge Runtime. `src/proxy.ts` importa este módulo antes de cada request: aqui dentro
// ele nunca é usado — o proxy só decodifica o cookie de sessão, e consultar o banco
// ali seria desnecessário. Carregá-lo sob demanda em `authorize()` (único ponto que
// usa o banco, chamado só na rota de login) também evita avaliar o client em qualquer
// runtime que não seja o Node: foi exatamente isso que devolveu 500 em toda a
// aplicação antes da migração `middleware` -> `proxy`.
// O cache evita recriar o client a cada tentativa de login.
// O `import type` abaixo é apagado em tempo de compilação — só serve para o
// `prismaPromise` acima ter tipo, sem puxar o client para o Edge.
let prismaPromise: Promise<PrismaClient> | undefined;

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

/**
 * O tipo de `credentials` é o da *config* do provider (`CredentialConfig`),
 * mas o Auth.js entrega strings na chamada. Coagir por `typeof` — e não por
 * `String()` — cobre as duas formas sem stringificar um objeto.
 */
function asCredential(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  pages: {
    signIn: SIGN_IN_PATH,
  },
  cookies: {
    sessionToken: { name: SESSION_COOKIE_NAME },
  },
  // Access token de curta duração: o JWT de sessão vale 15min e é
  // re-assinado a cada request de sessão (idle timeout). A permissão é
  // revalidada no máximo a cada PERMISSIONS_MAX_AGE via claim `perms_at`
  // (ver src/shared/permissions.ts) e o teto absoluto da sessão é o claim
  // `auth_at` (12h desde o login).
  session: {
    maxAge: ACCESS_TOKEN_MAX_AGE,
  },
  providers: [
    Credentials({
      credentials: {
        username: { label: 'Usuário', type: 'text' },
        password: { label: 'Senha', type: 'password' },
      },
      async authorize(credentials) {
        const username = asCredential(credentials?.username)
          .trim()
          .toLowerCase();
        const password = asCredential(credentials?.password);

        if (!USERNAME_REGEX.test(username) || !password) return null;

        const prisma = await getPrisma();
        const user = await prisma.users.findUnique({
          where: { username },
          include: {
            role: { include: { permissions: true } },
            permissions: true,
          },
        });

        if (!user || !user.active) return null;

        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) return null;

        const now = Date.now();
        return {
          id: user.id,
          name: user.full_name,
          email: user.email,
          sector: user.sector_id,
          guiche: user.guiche_id || DEFAULT_GUICHE,
          permissions: computeEffectivePermissions(
            user.role.permissions.map((p) => p.permission),
            user.permissions,
          ),
          authAt: now,
          permsAt: now,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.sector = user.sector;
        token.guiche = user.guiche;
        token.permissions = user.permissions;
        token.authAt = user.authAt;
        token.permsAt = user.permsAt;
      }
      // Claims não são recalculadas aqui de propósito: o callback roda em
      // todo request de sessão (inclusive no proxy, em Edge, sem banco).
      // Atualização de permissões acontece no login e no refresh
      // (/api/auth/refresh), que emite um JWT novo com perms_at atual.
      return token;
    },
    session({ session, token }) {
      const user = session.user;
      // Sem `user` não há claims a copiar — devolve a sessão como veio.
      if (!user) return session;
      // `sub` é o id gravado pelo Auth.js no login; o `??` mantém o valor
      // já presente caso algum token antigo não o tenha.
      user.id = token.sub ?? user.id;
      user.sector = token.sector;
      user.guiche = token.guiche;
      user.permissions = token.permissions ?? [];
      user.authAt = token.authAt;
      user.permsAt = token.permsAt;
      user.initials = user.name ? initials(user.name) : '';
      return session;
    },
    authorized({ auth }) {
      return !!auth?.user;
    },
  },
});
