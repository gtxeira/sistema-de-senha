import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { USERNAME_REGEX, DEFAULT_GUICHE } from "./lib/constants.js";
import { initials } from "./lib/repositories/utils.js";

// O client gerado pelo Prisma 7 importa `node:path`/`node:url`, que só existem no
// runtime Node — e `src/middleware.js` importa este módulo, rodando no Edge Runtime
// do Next, onde eles não são suportados (todo request retornaria 500).
// O middleware apenas decodifica o cookie de sessão e nunca consulta o banco, então
// o Prisma é carregado sob demanda em `authorize()`, que só é chamado na rota de
// login (runtime Node). O cache evita recriar o client a cada tentativa de login.
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
        });

        if (!user || !user.active) return null;

        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) return null;

        return {
          id: user.id,
          name: user.full_name,
          email: user.email,
          role: user.role,
          sector: user.sector_id,
          guiche: user.guiche_id || DEFAULT_GUICHE,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.sector = user.sector;
        token.guiche = user.guiche;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.sub;
      session.user.role = token.role;
      session.user.sector = token.sector;
      session.user.guiche = token.guiche;
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
