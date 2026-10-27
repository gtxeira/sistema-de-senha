-- RBAC: cargos em tabela, permissões por cargo/usuário e refresh tokens.
--
-- A ordem importa: cria as tabelas e insere os cargos built-in ANTES de
-- referenciar `roles` em `users.role_id`, e só remove a coluna/enum antigos
-- depois do backfill das 3 linhas existentes.

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "built_in" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "permission" TEXT NOT NULL,
    "role_id" UUID NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission")
);

-- CreateTable
CREATE TABLE "user_permissions" (
    "permission" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL DEFAULT true,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_permissions_pkey" PRIMARY KEY ("user_id","permission")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "family_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_key_key" ON "roles"("key");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_family_id_idx" ON "refresh_tokens"("family_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- Cargos built-in: espelham exatamente o comportamento anterior do enum
-- `user_role` (admin = tudo; attendant = chamadas do próprio setor).
INSERT INTO "roles" ("id", "key", "name", "built_in") VALUES
    (gen_random_uuid(), 'admin', 'Administrador', true),
    (gen_random_uuid(), 'attendant', 'Atendente', true);

-- Permissões do cargo "admin": o registro completo de chaves
-- (src/lib/permissions.js). Protegido: a UI não permite removê-las.
INSERT INTO "role_permissions" ("role_id", "permission")
SELECT r."id", p."permission"
FROM "roles" r
CROSS JOIN (VALUES
    ('tela.home'),
    ('tela.painel'),
    ('tela.historico'),
    ('tela.monitor'),
    ('tela.admin'),
    ('tela.admin.filas'),
    ('tela.admin.noticias'),
    ('tela.admin.usuarios'),
    ('usuarios.ver'),
    ('usuarios.criar'),
    ('usuarios.editar'),
    ('usuarios.excluir'),
    ('cargos.gerenciar'),
    ('filas.chamar'),
    ('filas.reavancar'),
    ('filas.resetar'),
    ('filas.sincronizar'),
    ('noticias.criar'),
    ('noticias.excluir'),
    ('setores.todos.ver'),
    ('setores.todos.gerenciar')
) AS p("permission")
WHERE r."key" = 'admin';

-- Permissões do cargo "attendant": o que o atendente já podia antes
-- (telas próprias + chamar/repetir senha; sem admin, sem reset/sync,
-- sem escopo de outros setores).
INSERT INTO "role_permissions" ("role_id", "permission")
SELECT r."id", p."permission"
FROM "roles" r
CROSS JOIN (VALUES
    ('tela.home'),
    ('tela.painel'),
    ('tela.historico'),
    ('tela.monitor'),
    ('filas.chamar'),
    ('filas.reavancar')
) AS p("permission")
WHERE r."key" = 'attendant';

-- users.role (enum) → users.role_id (FK para roles), com backfill.
ALTER TABLE "users" ADD COLUMN "role_id" UUID;
UPDATE "users"
SET "role_id" = (
    SELECT r."id" FROM "roles" r
    WHERE r."key" = CASE WHEN "users"."role" = 'admin' THEN 'admin' ELSE 'attendant' END
);
ALTER TABLE "users" ALTER COLUMN "role_id" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey"
    FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey"
    FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RemoveColumn (legado) + DropEnum
ALTER TABLE "users" DROP COLUMN "role";
DROP TYPE "user_role";
