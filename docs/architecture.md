# Arquitetura

O projeto é um **monólito modular** em Next.js: uma única aplicação e um único
deploy, mas com o código de navegador, o de servidor e os contratos
compartilhados separados por pasta e por regras de dependência.

O objetivo não é criar dois apps (`web` + `api`), e sim deixar explícito o que
roda onde. As pastas `src/app`, `src/components`, `src/hooks` e `src/stores`
continuam sendo as do Next/React; o que mudou é que o runtime de servidor foi
para `src/server`, o de navegador para `src/client`, e os contratos puros para
`src/shared`.

## Mapa de pastas

```text
src/
├── app/                 # Rotas do Next (páginas, layouts e Route Handlers)
│   └── api/             # Borda HTTP — precisa ficar aqui
├── components/          # Componentes de UI
├── hooks/               # Hooks React (client)
├── stores/              # Estado de UI (client)
├── client/              # Runtime de navegador
│   ├── audio/           # Fala/áudio do monitor
│   ├── queue/           # Fila, eventos e SSE no cliente
│   └── session/         # Renovação de sessão no navegador
├── server/              # Backend
│   ├── auth/            # Configuração do Auth.js e refresh tokens
│   ├── db/              # Client Prisma
│   ├── generated/       # Prisma Client gerado (não editar)
│   ├── http/            # Helpers de borda (autorização e erros HTTP)
│   ├── realtime/        # Event manager do SSE
│   ├── repositories/    # Contratos e implementações de dados
│   ├── services/        # Regras de negócio (fila, notícias, usuários, …)
│   └── storage/         # Integração com S3
├── shared/              # Contratos puros (sem I/O e sem runtime de UI)
│   └── types/           # Tipos de domínio e da API
├── auth.ts              # Reexport fino do Auth.js para o Next
└── proxy.ts             # Middleware do Next (Edge-safe)
```

As rotas de `src/app/api` são adaptadores finos: resolvem autenticação,
permissão e escopo, leem o corpo/query e chamam um serviço. As regras de
negócio ficam em `src/server/services`.

## Regras de dependência

| Origem | Pode importar | Não pode importar |
| --- | --- | --- |
| `shared/` | bibliotecas puras e outros arquivos de `shared` | `server`, `client`, `app`, `components`, `hooks`, `stores` |
| `client/` | `shared`, `client` | `server` |
| `components/`, `hooks/`, `stores/` | `client`, `components`, `shared` | `server` |
| `app/` (páginas e layouts) | `components`, `client`, `hooks`, `stores`, `shared`, `@/auth` | `server` |
| `app/api/` (Route Handlers) | `server`, `shared`, `@/auth` | `components`, `hooks`, `stores`, `client` |
| `server/` | `server`, `shared` e `server/generated` | `app`, `components`, `hooks`, `stores`, `client` |
| `proxy.ts` | `@/auth` e `shared` (Edge-safe) | qualquer coisa que carregue Prisma/Node no module scope |

### Por que essas regras

- **`shared` é contrato.** Se um tipo ou função precisa ser usado nos dois
  lados, ele não pode depender de `window`, de `node:*`, de Prisma ou de
  React. `shared/time.ts`, por exemplo, é o único dono da formatação de datas
  no fuso do app.
- **`client` é navegador.** Reinclui o runtime que não é componente React:
  fila, eventos SSE, áudio e refresh de sessão. Nada aqui importa `server`.
- **`server` é o backend.** Pode importar `shared` e o Prisma gerado em
  `server/generated`, mas não componentes, hooks ou stores.
- **`app/api` é a borda.** As rotas continuam em `app/api` porque o Next exige
  esse caminho. Elas traduzem HTTP (request/response, status, cookies) para
  chamadas de serviço/repositório, e não contêm regra de negócio pesada.
- **`app` não fala com o banco.** Páginas e layouts usam `@/auth` para sessão
  e as APIs HTTP para dados. Isso evita que uma página server-side vire uma
  segunda porta de entrada para o banco.

## Backend: camadas alvo

```text
Route Handler (app/api)
        ↓
server/http        autorização, parsing e tradução de erro
        ↓
server/services    regra de negócio
        ↓
server/repositories acesso a dados
        ↓
Postgres / S3
```

Os serviços atuais são `queue-service`, `news-service`, `users-service`,
`roles-service` e `stats-service`. Eles concentram normalização, emissão de
SSE, proteção contra auto-lockout e fallbacks — as rotas só traduzem HTTP.

### Responsabilidades

- `server/http/api-auth.ts`: `requirePermission`, `assertSectorAccess` e
  checagem de frescor da sessão.
- `server/http/errors.ts`: `RouteError`/`routeError`, o erro com status HTTP
  que a rota traduz.
- `server/services/`: use cases. A rota não conhece o singleton de dados.
- `server/repositories/types.ts`: contratos internos de persistência e inputs
  que não devem vazar para a UI (por exemplo, `CreateNewsInput` com `File`).
- `server/repositories/*.postgres.ts`: implementações Prisma/S3.
- `server/auth/config.ts`: configuração do Auth.js. `src/auth.ts` só reexporta.
  A configuração precisa continuar Edge-safe: o Prisma é importado
  dinamicamente, e `refresh.ts` não pode ser reexportado por um barrel.
- `server/auth/credentials.ts`: verificação de usuário/senha do login e claims
  devolvidos ao Auth.js. Importa o Prisma só dentro de `authorize()`.
- `server/auth/login-rate-limit.ts`: rate limit de login em memória (janela
  fixa, por username e por IP). Sem `node:*` — é carregado no Edge via
  `config.ts`.
- `server/realtime/event-manager.ts`: hub do SSE.
- `server/db/prisma-client.ts` e `server/storage/s3-client.ts`: clients de
  infraestrutura.
- `server/generated/prisma/`: Prisma Client produzido por `prisma generate`.
  Não é versionado nem editado à mão; fica fora do Oxlint e da cobertura.

## O que é compartilhado

Ficam em `shared/` os contratos que atravessam a fronteira HTTP/UI:

- `types/domain.ts`: `QueueCallRecord`, `QueueStats`, `UserRecord`,
  `RoleRecord`, `NewsItem` e os inputs de usuário/cargo usados pela API.
- `types/api.ts`: corpos de request/response das rotas.
- `constants.ts`, `permissions.ts`, `time.ts`, `json.ts`, `format.ts`,
  `validation.ts`, `errors.ts`, `queue-format.ts`, `sanitization.ts`,
  `page-title.ts`.

Se o tipo só existe para o banco (ex.: interface de repositório, input com
`File`), ele fica em `server/repositories/types.ts`. Se ele aparece na
resposta JSON ou no formulário, fica em `shared/types/domain.ts`.

## Como as regras são aplicadas

1. **Oxlint** (`oxlint.config.ts`): `no-restricted-imports` bloqueia
   imports entre camadas; o mesmo arquivo cobre o lint rápido e o type-aware
   (`bun run lint` e `bun run lint:type-aware`).
2. **`server-only`**: os módulos de runtime de `server/` importam
   `server-only`; se um Client Component tentar carregá-los, o build falha.
3. **Vitest** (`vitest.config.mjs`): alias de `server-only` para
   `tests/stubs/server-only.ts`, para os testes unitários continuarem
   importando os módulos de servidor.
4. **Typecheck, lint, testes e build** são a validação final:
   `bun run typecheck`, `bun run lint`, `bun run test:unit` e `bun run build`.
   Os testes de integração precisam rodar dentro do Docker
   (`docker compose exec -T app bun run test:run`), porque `.env.test` usa o
   hostname `postgres`.

## Fases

- **Fase 1 (concluída):** mover `lib` para `shared`/`client`/`server`, separar
  tipos e helpers, marcar backend com `server-only` e adicionar as regras de
  fronteira.
- **Fase 2 (concluída):** extrair os serviços de `queue`, `news`, `users`,
  `roles` e `stats`, deixar as rotas finas e remover o shim
  `server/queue-server.ts`.
- **Fase 3 (concluída):** mover `src/generated/prisma` para
  `src/server/generated/prisma`, ajustando schema, Dockerfile, imports e
  ignores. O client continua sendo gerado e não versionado.
