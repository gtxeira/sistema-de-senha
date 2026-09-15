-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('admin', 'attendant');

-- CreateEnum
CREATE TYPE "queue_type" AS ENUM ('normal', 'preferencial');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "role" "user_role" NOT NULL DEFAULT 'attendant',
    "sector_id" TEXT,
    "guiche_id" TEXT NOT NULL DEFAULT 'none',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sectors" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sectors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "queues" (
    "sector_id" TEXT NOT NULL,
    "current_number" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "queues_pkey" PRIMARY KEY ("sector_id")
);

-- CreateTable
CREATE TABLE "queue_counters" (
    "sector_id" TEXT NOT NULL,
    "current_number" INTEGER DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "queue_counters_pkey" PRIMARY KEY ("sector_id")
);

-- CreateTable
CREATE TABLE "queue_sequences" (
    "sector_id" TEXT NOT NULL,
    "call_type" "queue_type" NOT NULL,
    "current_number" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "queue_sequences_pkey" PRIMARY KEY ("sector_id","call_type")
);

-- CreateTable
CREATE TABLE "queue_calls" (
    "id" UUID NOT NULL,
    "sector_id" TEXT NOT NULL,
    "number_str" VARCHAR(4) NOT NULL,
    "number_int" INTEGER NOT NULL,
    "type" "queue_type" NOT NULL,
    "called_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "queue_calls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "user_id" UUID NOT NULL,
    "sound_enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "news" (
    "id" BIGSERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "image_url" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "news_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_sector_id_fkey" FOREIGN KEY ("sector_id") REFERENCES "sectors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queues" ADD CONSTRAINT "queues_sector_id_fkey" FOREIGN KEY ("sector_id") REFERENCES "sectors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queue_counters" ADD CONSTRAINT "queue_counters_sector_id_fkey" FOREIGN KEY ("sector_id") REFERENCES "sectors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queue_calls" ADD CONSTRAINT "queue_calls_sector_id_fkey" FOREIGN KEY ("sector_id") REFERENCES "sectors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queue_calls" ADD CONSTRAINT "queue_calls_called_by_fkey" FOREIGN KEY ("called_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings" ADD CONSTRAINT "settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
