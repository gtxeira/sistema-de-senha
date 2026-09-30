#!/bin/sh
set -e

# Aplica as migrations do Prisma antes de subir o servidor.
# Pule com SKIP_MIGRATES=1 (ex.: quando múltiplas réplicas sobem em paralelo).
if [ "${SKIP_MIGRATES:-0}" != "1" ]; then
  echo "[entrypoint] Aplicando migrations do Prisma..."
  attempt=1
  until bunx prisma migrate deploy; do
    if [ "$attempt" -ge 5 ]; then
      echo "[entrypoint] Falha ao aplicar migrations após $attempt tentativas." >&2
      exit 1
    fi
    echo "[entrypoint] Banco indisponível (tentativa $attempt/5), tentando em 3s..."
    attempt=$((attempt + 1))
    sleep 3
  done
fi

echo "[entrypoint] Iniciando aplicação: $*"
exec "$@"
