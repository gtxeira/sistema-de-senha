# ── 1. Base com variáveis de ambiente padrão ──
FROM oven/bun:1-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# O processo roda em UTC. A exibição é convertida em BRT por
# `src/shared/time.ts` (que sempre passa o `timeZone` explícito), mas
# deixar o fuso do processo explícito evita que qualquer código legado
# formate data no fuso da máquina em vez do fuso do app.
ENV TZ=UTC

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
          node_modules/@unrs/resolver-binding-linux-x64-gnu && \
    bun -e 'const fs=require("fs"),path=require("path");const root=path.join(process.cwd(),"node_modules");const read=function(n){try{return JSON.parse(fs.readFileSync(path.join(root,n,"package.json"),"utf8"))}catch(e){return null}};const seen=new Set();const walk=function(n){if(seen.has(n))return;const p=read(n);if(!p)return;seen.add(n);Object.keys(p.dependencies||{}).forEach(walk);Object.keys(p.optionalDependencies||{}).forEach(walk)};["prisma","@prisma/adapter-pg"].forEach(walk);const slice=path.join(process.cwd(),".prisma-slice");fs.mkdirSync(path.join(slice,".bin"),{recursive:true});seen.forEach(function(n){const dst=path.join(slice,n);fs.mkdirSync(path.dirname(dst),{recursive:true});fs.cpSync(path.join(root,n),dst,{recursive:true,dereference:true})});const pp=read("prisma");const bin=pp?(typeof pp.bin==="string"?pp.bin:(pp.bin||{}).prisma):null;if(!bin){console.error("prisma: bin nao encontrado");process.exit(1)}fs.symlinkSync("../prisma/"+bin,path.join(slice,".bin","prisma"));console.log("slice ok:",seen.size,"pacotes")'

# ── 3. Build: compila o Next.js e monta o standalone de produção ──
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/src/server/generated ./src/server/generated
COPY . .
RUN --mount=type=cache,target=/app/.next/cache \
    bunx next build && \
    mkdir -p .next/standalone/.next/static .next/standalone/public && \
    cp -r .next/static/. .next/standalone/.next/static/ && \
    cp -r public/. .next/standalone/public/

# ── Desenvolvimento (Para uso com Docker Compose) ──
FROM base AS dev
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/src/server/generated ./src/server/generated
COPY . .
EXPOSE 3000
EXPOSE 9229
CMD ["bun", "run", "dev"]

# ── 4. Runtime: imagem enxuta de Produção (Next standalone) ──
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=build /app/.next/standalone ./.next/standalone
COPY --from=deps /app/.prisma-slice ./node_modules
COPY package.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
COPY --chmod=755 scripts/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["bun", "run", "start"]