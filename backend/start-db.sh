#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
mkdir -p "$ROOT/.local/postgres-socket"
chmod 700 "$ROOT/.local" "$ROOT/.local/postgres-socket"
if [ ! -f "$ROOT/.local/postgres/PG_VERSION" ]; then
  initdb -D "$ROOT/.local/postgres" --auth-local=trust --auth-host=reject --encoding=UTF8 --locale=C
fi
if ! pg_ctl -D "$ROOT/.local/postgres" status >/dev/null 2>&1; then
  pg_ctl -D "$ROOT/.local/postgres" -l "$ROOT/.local/postgres.log" -o "-k '$ROOT/.local/postgres-socket' -h '' -p 55432" start
fi
if ! psql -h "$ROOT/.local/postgres-socket" -p 55432 -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = 'reca_barberia'" | grep -q 1; then
  createdb -h "$ROOT/.local/postgres-socket" -p 55432 reca_barberia
fi
printf '\nBase RECA lista. Conexión por socket privado, sin puerto TCP.\n'
