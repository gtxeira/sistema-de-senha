#!/bin/sh
set -e

# Aplica as migrações em modo DEV ou verifica o banco
echo "[entrypoint-dev] Aguardando banco e preparando ambiente..."
until bun prisma migrate dev; do
  echo "[entrypoint-dev] Banco indisponível, tentando em 3s..."
  sleep 3
done

# Se nenhum argumento for passado ($@ vazio), roda 'bun run dev' por padrão
if [ $# -eq 0 ]; then
  echo "[entrypoint-dev] Nenhum comando fornecido. Iniciando servidor dev padrão..."
  exec bun run dev
else
  echo "[entrypoint-dev] Executando comando: $*"
  exec "$@"
fi