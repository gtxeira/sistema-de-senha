# ── 1. Base com variáveis de ambiente padrão ──
FROM oven/bun:1-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# ── 2. Dependências dev/build (lint, testes, next build) ──
FROM base AS deps
COPY package.json bun.lock ./
COPY prisma/schema.prisma ./prisma/schema.prisma
RUN --mount=type=cache,id=bun,target=/root/.bun/install/cache \
    bun install --frozen-lockfile --ignore-scripts && \
    bunx prisma generate && \
    rm -rf node_modules/@next/swc-linux-x64-gnu \
          node_modules/@img/sharp-linux-x64 \
          node_modules/@img/sharp-libvips-linux-x64 \
          node_modules/lightningcss-linux-x64-gnu \
          node_modules/@rolldown/binding-linux-x64-gnu \
          node_modules/@unrs/resolver-binding-linux-x64-gnu

# ── 2b. Dependências de produção (sem devDeps para a imagem final) ──
FROM base AS deps-prod
COPY package.json bun.lock ./
COPY prisma/schema.prisma ./prisma/schema.prisma
RUN --mount=type=cache,id=bun,target=/root/.bun/install/cache \
    bun install --frozen-lockfile --ignore-scripts --omit=dev && \
    bunx prisma generate && \
    rm -rf node_modules/@next/swc-linux-x64-gnu \
          node_modules/@img/sharp-linux-x64 \
          node_modules/@img/sharp-libvips-linux-x64 \
          node_modules/lightningcss-linux-x64-gnu \
          node_modules/@rolldown/binding-linux-x64-gnu \
          node_modules/@unrs/resolver-binding-linux-x64-gnu

# ── 3. Build: compila o Next.js reutilizando as dependências do deps ──
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/src/generated ./src/generated
COPY . .
RUN --mount=type=cache,target=/app/.next/cache \
    bunx next build

# ── Desenvolvimento (Para uso com Docker Compose) ──
FROM base AS dev
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/src/generated ./src/generated
COPY . .
EXPOSE 3000
EXPOSE 9229
CMD ["bun", "run", "dev"]

# ── 4. Runtime: Imagem final enxuta de Produção ──
# TODO: FUTURO (consideração do plano): avaliar `output: "standalone"` no
# next.config.ts para embutir só o rastreamento do Next em vez de
# `node_modules` inteiro (~1GB). Obstáculo atual: o entrypoint roda
# `bun prisma migrate deploy`, e o standalone não rastreia o CLI do Prisma —
# seria preciso copiar `prisma` + `@prisma/client` + driver à mão.
FROM base AS runner
ENV NODE_ENV=production

COPY --from=deps-prod /app/node_modules ./node_modules
COPY --from=deps-prod /app/src/generated ./src/generated
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY package.json bun.lock ./
COPY prisma ./prisma
COPY prisma.config.ts ./
COPY next.config.ts ./
COPY --chmod=755 scripts/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["bun", "run", "start"]