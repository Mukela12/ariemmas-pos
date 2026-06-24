#!/usr/bin/env bash
# QA: sale sync must be idempotent and multi-till-receipt-safe.
#
# 1) A re-sent sale (same uuid) must return 200, not 500 — the old non-atomic
#    "if (!existing)" guard let a retry hit "duplicate key sales_pkey", 500, and
#    loop forever, clogging the queue. Fix: INSERT ... ON CONFLICT (id) DO NOTHING.
# 2) Receipt numbers are per-till sequences, so 3 tills all generate 20260623-0001.
#    The old single "-D" suffix 500'd on the 3rd collision. Fix: disambiguate with
#    a slice of the globally-unique sale id.
#
# Requires a local Postgres. Usage: bash scripts/qa-sale-idempotency.sh
set -u
DB=ariemmas_idemqa; PORT=3021; API=http://localhost:$PORT
cd "$(dirname "$0")/.."
pkill -f "src/server/index.ts" 2>/dev/null; sleep 1
dropdb --if-exists $DB 2>/dev/null; createdb $DB 2>/dev/null
DATABASE_URL=postgres://localhost:5432/$DB PORT=$PORT npx tsx src/server/index.ts > /tmp/idem-server.log 2>&1 &
for i in $(seq 1 40); do curl -sf $API/api/health >/dev/null 2>&1 && break; sleep 1; done
U=$(psql -d $DB -tAc "SELECT id FROM users LIMIT 1" | tr -d ' ')
post(){ curl -s -o /dev/null -w "%{http_code}" -X POST $API/api/sync/sales -H 'Content-Type: application/json' \
  -d "{\"sale\":{\"id\":\"$1\",\"receipt_number\":\"$2\",\"user_id\":\"$U\",\"shift_id\":null,\"subtotal\":10,\"vat_total\":0,\"total\":10,\"payment_method\":\"cash\",\"amount_tendered\":10,\"change_given\":0,\"mobile_ref\":null,\"status\":\"completed\",\"terminal_id\":\"t1\",\"created_at\":\"2026-06-23T10:00:00Z\"},\"items\":[]}"; }
FAIL=0
[ "$(post sale-A R1)" = "200" ] || FAIL=1
[ "$(post sale-A R1)" = "200" ] || { echo "FAIL: re-sent sale not idempotent"; FAIL=1; }   # same id again
[ "$(post sale-B R1)" = "200" ] || { echo "FAIL: 2nd receipt collision"; FAIL=1; }
[ "$(post sale-C R1)" = "200" ] || { echo "FAIL: 3rd receipt collision"; FAIL=1; }
[ "$(psql -d $DB -tAc "SELECT count(*) FROM sales" | tr -d ' ')" = "3" ] || { echo "FAIL: expected 3 sales"; FAIL=1; }
[ "$(grep -c 'duplicate key' /tmp/idem-server.log)" = "0" ] || { echo "FAIL: duplicate-key errors logged"; FAIL=1; }
pkill -f "src/server/index.ts" 2>/dev/null; dropdb --if-exists $DB 2>/dev/null
[ "$FAIL" = "0" ] && echo "PASS: idempotent re-send + multi-till receipts" || { echo "QA FAILED"; exit 1; }
