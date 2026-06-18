#!/usr/bin/env bash
# Roda os testes do backend contra o banco de teste hawkdot_test.
set -euo pipefail
cd "$(dirname "$0")"
source ../../.env
export PGHOST=localhost PGPORT="${POSTGRES_PORT:-5432}" PGUSER="$POSTGRES_USER" \
       PGPASSWORD="$POSTGRES_PASSWORD" PGDATABASE=hawkdot_test
node --test
