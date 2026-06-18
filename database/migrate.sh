#!/usr/bin/env bash
# =====================================================================
# HawkDot — runner de migrations
# Aplica os arquivos database/migrations/*.up.sql que ainda não foram
# aplicados, registrando cada um na tabela schema_migrations.
#
# Uso:
#   ./database/migrate.sh          # aplica migrations pendentes
#   ./database/migrate.sh status   # mostra o que já foi aplicado
# =====================================================================
set -euo pipefail

CONTAINER="hawkdot_postgres"
MIG_DIR="$(cd "$(dirname "$0")/migrations" && pwd)"

# Carrega variáveis do .env (POSTGRES_USER / POSTGRES_DB)
ENV_FILE="$(dirname "$0")/../.env"
[ -f "$ENV_FILE" ] && set -a && source "$ENV_FILE" && set +a

psql() {
  docker exec -i -e PGPASSWORD="$POSTGRES_PASSWORD" "$CONTAINER" \
    psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@"
}

# Garante a tabela de controle
psql -q -c "CREATE TABLE IF NOT EXISTS schema_migrations (
              version    TEXT PRIMARY KEY,
              applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );"

if [ "${1:-}" = "status" ]; then
  echo "Migrations aplicadas:"
  psql -c "SELECT version, applied_at FROM schema_migrations ORDER BY version;"
  exit 0
fi

for up in "$MIG_DIR"/*.up.sql; do
  version="$(basename "$up" .up.sql)"
  already="$(psql -tAc "SELECT 1 FROM schema_migrations WHERE version = '$version';")"
  if [ "$already" = "1" ]; then
    echo "= já aplicada: $version"
    continue
  fi
  echo "+ aplicando:   $version"
  psql -q -f - < "$up"
  psql -q -c "INSERT INTO schema_migrations (version) VALUES ('$version');"
done

echo "OK — banco atualizado."
