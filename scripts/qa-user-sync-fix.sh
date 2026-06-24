#!/usr/bin/env bash
# QA: a sale/shift whose cashier's user row isn't on the cloud must still sync.
#
# Background: several tills seed the same usernames (cashier1…) with their own
# ids. The cloud's /api/sync/users replaces a same-username user and deletes the
# previous till's id — so that till's later sales referenced a deleted user id
# and /api/sync/sales rejected them with 422 "User not synced yet", stranding
# most of the shop's sales on the till. Fix: ensureUserRow() creates a placeholder
# so the FK resolves and the sale is never dropped (the real cashier still shows
# in reports via the shift's cashier name).
#
# Requires a local Postgres. Usage: bash scripts/qa-user-sync-fix.sh
set -u
DB=ariemmas_userfixqa; PORT=3019; API=http://localhost:$PORT
cd "$(dirname "$0")/.."
pkill -f "src/server/index.ts" 2>/dev/null; sleep 1
dropdb --if-exists $DB 2>/dev/null; createdb $DB 2>/dev/null
DATABASE_URL=postgres://localhost:5432/$DB PORT=$PORT npx tsx src/server/index.ts > /tmp/userfix-server.log 2>&1 &
for i in $(seq 1 40); do curl -sf $API/api/health >/dev/null 2>&1 && break; sleep 1; done

GHOST=ghost-cashier-001; SALE=ghost-sale-001; FAIL=0
CODE=$(curl -s -o /tmp/uf-resp.json -w '%{http_code}' -X POST $API/api/sync/sales -H 'Content-Type: application/json' \
  -d "{\"sale\":{\"id\":\"$SALE\",\"receipt_number\":\"GHOST-001\",\"user_id\":\"$GHOST\",\"shift_id\":null,\"subtotal\":10,\"vat_total\":0,\"total\":10,\"payment_method\":\"cash\",\"amount_tendered\":10,\"change_given\":0,\"mobile_ref\":null,\"status\":\"completed\",\"terminal_id\":\"till-ghost\",\"created_at\":\"2026-06-24T10:00:00.000Z\"},\"items\":[]}")
echo "sale by non-synced cashier -> HTTP $CODE $(cat /tmp/uf-resp.json)"
[ "$CODE" = "200" ] || FAIL=1
[ -n "$(psql -d $DB -tAc "SELECT id FROM sales WHERE id='$SALE'")" ] || { echo "FAIL: sale not stored"; FAIL=1; }
[ -n "$(psql -d $DB -tAc "SELECT id FROM users WHERE id='$GHOST'")" ] || { echo "FAIL: placeholder user not created"; FAIL=1; }

pkill -f "src/server/index.ts" 2>/dev/null; dropdb --if-exists $DB 2>/dev/null
[ "$FAIL" = "0" ] && echo "PASS: stranded-cashier sale now syncs" || { echo "QA FAILED"; exit 1; }
