This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, install dependencies and run the development server:

```bash
bun install
bun dev
```

## Docker

A segmentação de ambiente usa 3 arquivos no padrão moderno do Compose:

| Arquivo | Papel |
|---|---|
| `compose.yaml` | Base comum (Postgres, Garage, app) — porta 3000, sem portas de infra publicadas |
| `compose.override.yaml` | Dev — **carregado automaticamente** pelo `docker compose up` local |
| `compose.prod.yaml` | Produção — só entra com `-f` explícito |

### Dev (local)

```bash
docker compose up -d --build   # ou: bun run docker:up
```

- Aplicação (hot reload via bind mount): http://localhost:3001
- Postgres: `localhost:5432` · Garage S3: `http://localhost:3900` (API) / `http://localhost:3902` (público)

Se estiver desenvolvendo no Windows (sem WSL) ou Mac, defina um arquivo compose.local.yaml na raiz do projeto e adicione a configuração abaixo para isolar as pastas dentro do contêiner:

```yaml
services:
  app:
    volumes:
      - .:/app
      - app_dev_node_modules:/app/node_modules
      - app_dev_next:/app/.next
```

### Produção (servidor)

```bash
docker compose -f compose.yaml -f compose.prod.yaml up -d --build   # ou: bun run docker:up:prod
```

> ⚠️ **Nunca rode `docker compose up` sem `-f` no servidor** — o `compose.override.yaml` (dev) seria carregado junto.

Migrations do Prisma rodam automaticamente na inicialização do container da aplicação (`docker-entrypoint.sh`); para pulá-las, defina `SKIP_MIGRATES=1`. Fora do container: `bun run db:migrate:deploy`.

Imagem de produção: tag `sistema-de-senha` (a de dev usa `sistema-de-senha-app`).

## Supabase

Copy `.env.example` to `.env.local` and fill in the URL, anon key and service role key from the Supabase project. Then run `supabase/schema.sql` in the Supabase SQL Editor. The service role key is used only by server routes for creating users and storing news images; never expose it as a `NEXT_PUBLIC_` variable.

## Produção

1. Crie ou selecione o projeto Supabase de produção e execute `supabase/schema.sql` no SQL Editor. Para um banco que já existe, execute também `supabase/migrate.sql`. Confirme que o bucket público `news-images` e o Realtime de `queue_calls` estão ativos.
2. No provedor de hospedagem, cadastre estas variáveis para o ambiente de produção antes do build:
   - `DATABASE_URL`: conexão pooler do Supabase, normalmente com `pgbouncer=true`.
   - `DIRECT_URL`: conexão direta do Supabase, usada pelo Prisma.
   - `NEXT_PUBLIC_SUPABASE_URL`: URL do projeto de produção.
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: chave publicável/anon do projeto de produção.
   - `SUPABASE_SERVICE_ROLE_KEY`: chave secreta/service role do projeto de produção, sem o prefixo `NEXT_PUBLIC_`.

3. Faça o deploy com Bun (ou Node.js 22+):

   ```bash
   bun install --frozen-lockfile
   bun run build
   bun start
   ```

   Em Vercel, use `bun run build` como Build Command; o Start Command é gerenciado pela plataforma. Em outro servidor, mantenha `bun start` em execução e encaminhe a porta definida por `PORT`. As migrations de banco não rodam no build: use `bun run db:migrate:deploy` (ou o container Docker, que as executa no startup).

4. Crie os usuários no projeto de produção e confira o login, chamada de senha, monitoramento e upload de notícia. As variáveis `NEXT_PUBLIC_*` são incorporadas durante o build, portanto uma alteração nelas exige um novo deploy.

As credenciais que já tenham sido publicadas em qualquer cópia deste projeto devem ser revogadas no Supabase e substituídas por novas chaves. Nunca versione `.env`, `.env.local` ou chaves service role.

You can start editing the page by modifying `app/page.js`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

---

docker compose exec garage /garage bucket allow news-images --key GK50ee931dd2264d14daed5c63f5c3c824 --read --write

docker compose exec garage /garage bucket website news-images --allow

docker compose exec garage /garage bucket create news-images-test

docker compose exec garage /garage bucket allow news-images-test --key GK50ee931dd2264d14daed5c63f5c3c824 --read --write

docker compose exec garage /garage bucket website news-images-test --allow