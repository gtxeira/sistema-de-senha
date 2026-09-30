import { defineConfig } from "prisma/config";

// O CLI do Prisma 7 não carrega mais `.env` sozinho, e aqui ele é executado tanto
// pelo Node (bin `prisma`) quanto pelo Bun (`bunx prisma`). `process.loadEnvFile`
// (Node >= 20.12 / Bun) não sobrescreve variáveis já presentes no ambiente, então
// scripts com `dotenv -e .env.test` continuam mandando no banco de testes. A
// ausência de `.env` (ex.: build Docker, onde ele é ignorado) não é um erro.
try {
  process.loadEnvFile();
} catch {
  // sem `.env` no ambiente — nada a carregar
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "bun prisma/seed.js",
  },
  datasource: {
    // Usa process.env em vez do helper env() porque `prisma generate` também lê
    // este arquivo e precisa funcionar sem DATABASE_URL (build Docker).
    url: process.env.DATABASE_URL ?? "",
  },
});
