import 'server-only';
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';

import { authorizeCredentials } from '@/server/auth/credentials';
import { ACCESS_TOKEN_MAX_AGE, SIGN_IN_PATH } from '@/shared/constants';
import { initials } from '@/shared/format';

// Nome fixo do cookie de sessão (e `salt` do JWE do Auth.js). Fixá-lo no
// config garante que o `encode()` da rota de refresh derive a mesma chave
// de criptografia que o `decode()` do Auth.js — com nome dinâmico
// (prefixo __Secure- dependente da URL) os dois poderiam divergir.
// O prefixo __Secure- só impede cookies injetados por canal inseguro; aqui
// o cookie continua httpOnly + secure (a flag segue a URL da request).
export const SESSION_COOKIE_NAME = 'authjs.session-token';

// A verificação de credenciais (e o rate limit dela) mora em
// `server/auth/credentials.ts`. Este arquivo continua Edge-safe: o proxy
// importa `@/auth` a cada request e só decodifica o cookie de sessão; o
// Prisma é importado dinamicamente lá dentro, apenas quando `authorize()`
// roda (rota de login, runtime Node).

export const { auth, handlers, signIn, signOut } = NextAuth({
  cookies: {
    sessionToken: { name: SESSION_COOKIE_NAME },
  },
  pages: {
    signIn: SIGN_IN_PATH,
  },
  // Access token de curta duração: o JWT de sessão vale 15min e é
  // re-assinado a cada request de sessão (idle timeout). A permissão é
  // revalidada no máximo a cada PERMISSIONS_MAX_AGE via claim `perms_at`
  // (ver src/shared/permissions.ts) e o teto absoluto da sessão é o claim
  // `auth_at` (12h desde o login).
  callbacks: {
    authorized({ auth }) {
      return !!auth?.user;
    },
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
  },
  providers: [
    Credentials({
      async authorize(credentials, request) {
        return authorizeCredentials(credentials, request);
      },
      credentials: {
        password: { label: 'Senha', type: 'password' },
        username: { label: 'Usuário', type: 'text' },
      },
    }),
  ],
  session: {
    maxAge: ACCESS_TOKEN_MAX_AGE,
  },
});
