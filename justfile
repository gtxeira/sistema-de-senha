set dotenv-load := true

_compose      := "docker compose"
_compose_prod := "docker compose -f compose.yaml -f compose.prod.yaml"
_exec         := _compose + " exec"
_exec_app     := _exec + " app"

# ── Docker 🐳 ────────────────────────────────────────────────────────────────

# Sobe os containers de desenvolvimento e cria os buckets do garage
up *args:
    {{ _compose }} --env-file .env --env-file .env.local up -d {{ args }}
    just garage-setup

# Sobe os containers de desenvolvimento com a flag --build e roda o seed do banco de dados
up-build *args:
    just up {{ args }} --build
    just db-seed

# Para os containers de desenvolvimento
down *args:
    {{ _compose }} down {{ args }}

# Para os containers de desenvolvimento e seus volumes
down-v *args:
    {{ _compose }} down -v {{ args }}

# Sobe os containers de produção
up-prod *args:
    {{ _compose_prod }} up -d --build {{ args }}

# Para os containers de produção
down-prod *args:
    {{ _compose_prod }} down {{ args }}

# ── Aplicação 🚀 ─────────────────────────────────────────────────────────────

# Roda comandos do Bun direto no container
bun *args:
    {{ _exec_app }} bun {{ args }}

# Inicia o servidor Next.js de desenvolvimento no container
dev:
    {{ _exec_app }} bun run dev

# Gera o cliente do Prisma e faz o build do Next.js
build:
    {{ _exec_app }} bun run build

# Inicia a aplicação em modo produção
start:
    {{ _exec_app }} bun run start

# ── Banco de Dados 🗄️ ───────────────────────────────────────────────────────

# Executa migrações do Prisma e atualiza o client
db-migrate *args:
    {{ _exec_app }} bun prisma migrate dev {{ args }}
    {{ _exec_app }} bun prisma generate

# Executa as seeds do banco de dados
db-seed:
    {{ _exec_app }} bun prisma db seed

# Reseta o banco de dados e roda as seeds novamente
db-reset:
    {{ _exec_app }} bun prisma migrate reset --force
    {{ _exec_app }} bun prisma db seed

# ── Testes ───────────────────────────────────────────────────────────────────

# Executa todos os testes da aplicação
test:
    {{ _exec_app }} bun run db:reset:test
    {{ _exec_app }} bun run test

# ── Garage ───────────────────────────────────────────────────────────────────

# Criar os buckets de dev e test
garage-setup:
    bun run garage:setup

# Listar buckets no garage
garage-bucket-list:
    {{ _exec }} garage /garage bucket list

# Remove/apaga os buckets de dev e test
garage-clear:
    bun run garage:clear

# ── Electron & Desktop 💻 ────────────────────────────────────────────────────

# Inicia o Electron localmente no host
electron-dev:
    bun run electron .

# Gera o instalador Windows (nsis) no host
dist:
    bun run electron-builder --win nsis