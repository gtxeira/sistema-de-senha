# Sistema de Senhas

## Docker

A segmentação de ambiente usa 3 arquivos no padrão moderno do Compose:

| Arquivo                 | Papel                                                                           |
|-------------------------|---------------------------------------------------------------------------------|
| `compose.yaml`          | Base comum (Postgres, Garage, app) — porta 3000, sem portas de infra publicadas |
| `compose.override.yaml` | Dev — **carregado automaticamente** pelo `docker compose up` local              |
| `compose.prod.yaml`     | Produção — só entra com `-f` explícito                                          |

### Dev (local)

```bash
docker compose up -d --build
bun run garage:setup
bun run db:seed
```

ou

```bash
just up-build
```

- Aplicação (hot reload via bind mount): http://localhost:3001
- Postgres: `localhost:5432` · Garage S3: `http://localhost:3900` (API) / `http://localhost:3902` (público)

> [!TIP]
> Se estiver desenvolvendo no Windows, considere utilizar o ` WSL 2` (não utilizar impacta diretamente na performance do mapeamento de volumes).

### Produção (servidor)

```bash
docker compose -f compose.yaml -f compose.prod.yaml up -d --build   # ou: just up-prod
```

> ⚠️ **Nunca rode `docker compose up` sem `-f` no servidor** — o `compose.override.yaml` (dev) seria carregado junto.

Migrations do Prisma rodam automaticamente na inicialização do container da aplicação (`scripts/docker-entrypoint.sh`); para pulá-las, defina `SKIP_MIGRATES=1`. Fora do container: `bun run db:migrate:deploy`.

Imagem de produção: tag `sistema-de-senha` (a de dev usa `sistema-de-senha-app`).
