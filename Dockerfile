# ── 1. Base com variáveis de ambiente padrão ──
FROM oven/bun:1-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# ── 2. Dependências (Instala e gera o Prisma de uma só vez) ──
FROM base AS deps
COPY package.json bun.lock ./
COPY prisma ./prisma
RUN --mount=type=cache,id=bun,target=/root/.bun/install/cache \
    bun install --frozen-lockfile && \
    bunx prisma generate

# ── 3. Build: compila o Next.js reutilizando as dependências do deps ──
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/src/generated ./src/generated
COPY . .
RUN --mount=type=cache,target=/app/.next/cache \
    bun run build

# ── Desenvolvimento (Para uso com Docker Compose) ──
FROM base AS dev
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/src/generated ./src/generated
COPY . .
EXPOSE 3000
EXPOSE 9229
CMD ["bun", "run", "dev"]

# ── 4. Runtime: Imagem final enxuta de Produção ──
FROM base AS runner
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/src/generated ./src/generated
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY package.json bun.lock ./
COPY prisma ./prisma
COPY prisma.config.mjs ./
COPY next.config.mjs ./
COPY --chmod=755 scripts/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["bun", "run", "start"]