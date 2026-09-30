# syntax=docker/dockerfile:1

# ── 1. Dependências (camada de cache: só muda com package.json/bun.lock) ──
FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# ── 2. Build: gera o client do Prisma e compila o Next.js ──
FROM deps AS build
COPY . .
RUN bunx prisma generate
RUN bun run build

# ── Desenvolvimento: todas as deps + hot reload (usado pelo compose.override.yaml) ──
# O código entra por bind mount na runtime; o COPY é para uso avulso com `docker run`.
FROM deps AS dev
COPY . .
# O Bun não roda o postinstall do Prisma (scripts não confiáveis) → gere explicitamente
RUN bunx prisma generate
EXPOSE 3000
CMD ["bun", "run", "dev"]

# ── 3. Runtime: só dependências de produção + artefatos do build ──
FROM oven/bun:1 AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Client do Prisma gerado para o schema versionado (migrations rodam no startup)
COPY prisma.config.mjs ./
COPY prisma ./prisma
RUN bunx prisma generate

COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/next.config.mjs ./
COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["bun", "run", "start"]
