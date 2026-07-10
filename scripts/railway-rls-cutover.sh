#!/usr/bin/env bash
set -euo pipefail

# ══════════════════════════════════════════════════════════════════════════════
# Cutover RLS en Railway (runbook de docs/BACKEND.md como comando único).
#
# ⚠️  CORRER SOLO EN VENTANA DE MANTENIMIENTO: el paso 3 (migraciones) añade
#     consultant_id NOT NULL a las tablas — el código VIEJO desplegado rompe
#     sus INSERTs a partir de ese momento. La secuencia completa (migrar +
#     rotar DATABASE_URL + redeploy del código nuevo) debe hacerse junta.
#
# Uso:
#   DATABASE_URL_SUPERUSER="postgres://..." ./scripts/railway-rls-cutover.sh --dry-run
#   DATABASE_URL_SUPERUSER="postgres://..." APP_PASSWORD=... MIGRATOR_PASSWORD=... \
#     ./scripts/railway-rls-cutover.sh --execute
#
# Pasos que ejecuta:
#   1. Verificación previa (conexión, versión, conteos de tablas legacy).
#   2. Crea roles brandme_app (NOBYPASSRLS) y brandme_migrator (BYPASSRLS).
#   3. Corre las migraciones 0000→última con el rol migrator (backfill con
#      asserts fail-fast: si algo queda NULL, ABORTA con rollback).
#   4. Imprime las DATABASE_URL nuevas para pegar en Railway (rotación manual
#      + redeploy: el script NO toca Railway).
#   5. Verificación posterior (RLS activo, políticas, conteos preservados).
#
# Rollback: cada migración corre en transacción (fallo = rollback automático).
# Tras el éxito del paso 3 el rollback es SOLO manual (docs/BACKEND.md §Runbook).
# ══════════════════════════════════════════════════════════════════════════════

MODE="${1:---dry-run}"
: "${DATABASE_URL_SUPERUSER:?Define DATABASE_URL_SUPERUSER (la URL actual de Railway, rol postgres)}"

psql_su() { psql "$DATABASE_URL_SUPERUSER" -v ON_ERROR_STOP=1 -tAc "$1"; }

echo "── Paso 1: verificación previa ──────────────────────────────────────────"
echo "Servidor: $(psql_su 'SELECT version();' | head -c 60)…"
echo "Base:     $(psql_su 'SELECT current_database();')"
for t in conversations generations leads subscriptions users user_sessions; do
  count=$(psql_su "SELECT count(*) FROM ${t};" 2>/dev/null || echo "n/a (no existe aún)")
  echo "  ${t}: ${count} filas"
done
roles=$(psql_su "SELECT count(*) FROM pg_roles WHERE rolname IN ('brandme_app','brandme_migrator');")
echo "  roles brandme_*: ${roles}/2 existentes"

if [ "$MODE" != "--execute" ]; then
  echo ""
  echo "DRY-RUN — nada se modificó. Para ejecutar de verdad:"
  echo "  DATABASE_URL_SUPERUSER=... APP_PASSWORD=... MIGRATOR_PASSWORD=... $0 --execute"
  exit 0
fi

: "${APP_PASSWORD:?Define APP_PASSWORD (password para el rol brandme_app)}"
: "${MIGRATOR_PASSWORD:?Define MIGRATOR_PASSWORD (password para el rol brandme_migrator)}"

echo ""
read -r -p "⚠️  ¿Estás en ventana de mantenimiento y con backup reciente? (escribe SI) " confirm
[ "$confirm" = "SI" ] || { echo "Abortado."; exit 1; }

echo "── Paso 2: roles ─────────────────────────────────────────────────────────"
psql "$DATABASE_URL_SUPERUSER" -v ON_ERROR_STOP=1 << SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'brandme_migrator') THEN
    CREATE ROLE brandme_migrator LOGIN PASSWORD '${MIGRATOR_PASSWORD}' BYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'brandme_app') THEN
    CREATE ROLE brandme_app LOGIN PASSWORD '${APP_PASSWORD}' NOBYPASSRLS;
  END IF;
END \$\$;
GRANT ALL ON SCHEMA public TO brandme_migrator;
GRANT USAGE ON SCHEMA public TO brandme_app;
SQL
echo "  roles listos."

echo "── Paso 3: migraciones (rol migrator; backfill con asserts fail-fast) ───"
host_part=$(echo "$DATABASE_URL_SUPERUSER" | sed -E 's|postgres(ql)?://[^@]+@||')
export DATABASE_URL_MIGRATIONS="postgres://brandme_migrator:${MIGRATOR_PASSWORD}@${host_part}"
npx tsx scripts/db-migrate.ts

echo "── Paso 4: rotación (MANUAL en Railway) ──────────────────────────────────"
echo "  Pega en las variables del servicio de Railway y REDEPLOYA el código nuevo:"
echo "    DATABASE_URL=postgres://brandme_app:***@${host_part}"
echo "    DATABASE_URL_MIGRATIONS=postgres://brandme_migrator:***@${host_part}"
echo "  (Los passwords son los que definiste en APP_PASSWORD/MIGRATOR_PASSWORD.)"

echo "── Paso 5: verificación posterior ────────────────────────────────────────"
rls=$(psql_su "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relrowsecurity AND c.relforcerowsecurity;")
echo "  tablas con RLS+FORCE: ${rls}"
nulls=$(psql_su "SELECT count(*) FROM conversations WHERE consultant_id IS NULL;" 2>/dev/null || echo 0)
echo "  conversations sin consultant_id: ${nulls} (debe ser 0)"
echo ""
echo "✅ Migración aplicada. Falta: rotar DATABASE_URL en Railway + redeploy (paso 4)."
