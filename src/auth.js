import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { USERNAME_REGEX, DEFAULT_GUICHE, ACCESS_TOKEN_MAX_AGE } from "./lib/constants.js";
import { computeEffectivePermissions } from "./lib/permissions.js";
import { initials } from "./lib/repositories/utils.js";

// Nome fixo do cookie de sessão (e `salt` do JWE do Auth.js). Fixá-lo no
// config garante que o `encode()` da rota de refresh derive a mesma chave
// de criptografia que o `decode()` do Auth.js — com nome dinâmico
// (prefixo __Secure- dependente da URL) os dois poderiam divergir.
// O prefixo __Secure- só impede cookies injetados por canal inseguro; aqui
// o cookie continua httpOnly + secure (a flag segue a URL da request).
export const SESSION_COOKIE_NAME = "authjs.session-token";

// O client gerado pelo Prisma 7 importa `node:path`/`node:url`, que não existem no
// Edge Runtime. `src/proxy.js` importa este módulo antes de cada request: aqui dentro
// ele nunca é usado — o proxy só decodifica o cookie de sessão, e consultar o banco
// ali seria desnecessário. Carregá-lo sob demanda em `authorize()` (único ponto que
// usa o banco, chamado só na rota de login) também evita avaliar o client em qualquer
// runtime que não seja o Node: foi exatamente isso que devolveu 500 em toda a
// aplicação antes da migração `middleware` -> `proxy`.
// O cache evita recriar o client a cada tentativa de login.
let prismaPromise;
function getPrisma() {
  prismaPromise ??= Promise.all([
    import("./generated/prisma/client"),
    import("@prisma/adapter-pg"),
  ]).then(
    ([{ PrismaClient }, { PrismaPg }]) =>
      new PrismaClient({
        adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
      })
  );
  return prismaPromise;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  pages: {
    signIn: "/login",
  },
  cookies: {
    sessionToken: { name: SESSION_COOKIE_NAME },
  },
  // Access token de curta duração: o JWT de sessão vale 15min e é
  // re-assinado a cada request de sessão (idle timeout). A permissão é
  // revalidada no máximo a cada PERMISSIONS_MAX_AGE via claim `perms_at`
  // (ver src/lib/permissions.js) e o teto absoluto da sessão é o claim
  // `auth_at` (12h desde o login).
  session: {
    maxAge: ACCESS_TOKEN_MAX_AGE,
  },
  providers: [
    Credentials({
      credentials: {
        username: { label: "Usuário", type: "text" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials) {
        const username = String(credentials?.username || "")
          .trim()
          .toLowerCase();
        const password = String(credentials?.password || "");

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
    async jwt({ token, user }) {
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
    async session({ session, token }) {
      session.user.id = token.sub;
      session.user.sector = token.sector;
      session.user.guiche = token.guiche;
      session.user.permissions = token.permissions ?? [];
      session.user.authAt = token.authAt;
      session.user.permsAt = token.permsAt;
      session.user.initials = session.user.name
        ? initials(session.user.name)
        : "";
      return session;
    },
    async authorized({ auth }) {
      return !!auth?.user;
    },
  },
});
