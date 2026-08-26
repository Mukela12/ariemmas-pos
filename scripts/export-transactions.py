#!/usr/bin/env python3
"""Export all cloud transactions to a clean, analytics-ready CSV, and check
the UUID / receipt-number uniqueness the shop asked about."""
import urllib.request, json, csv, os

API = "https://api-production-b925.up.railway.app"

def daily(date):
    try:
        with urllib.request.urlopen(f"{API}/api/sales/daily?date={date}", timeout=12) as r:
            return json.load(r)
    except Exception:
        return {}

# Scan a wide window so we never miss a trading day.
scan = [f"2026-06-{d:02d}" for d in range(1, 31)] + [f"2026-07-{d:02d}" for d in range(1, 32)]

all_tx, per_date = [], {}
for date in scan:
    d = daily(date)
    tx = d.get("transactions") or []
    if tx:
        per_date[date] = (d.get("total_sales"), d.get("total_revenue"))
        for t in tx:
            all_tx.append(t)

# Map each distinct terminal to a friendly "Till N" label.
terminals = sorted({(t.get("terminal_id") or "unknown") for t in all_tx})
till_map, n = {}, 1
for term in terminals:
    if term == "unknown":
        till_map[term] = "Till (unknown)"
    else:
        till_map[term] = f"Till {n}"; n += 1

ids       = [t["id"] for t in all_tx]
receipts  = [t["receipt_number"] for t in all_tx]
composite = [f"{t.get('terminal_id') or 'unknown'}|{t['receipt_number']}" for t in all_tx]

print("=== TRADING DAYS ON THE CLOUD ===")
for date in sorted(per_date):
    print(f"  {date}: {per_date[date][0]} sales, K{per_date[date][1]}")
print(f"\nTOTAL transactions      : {len(all_tx)}")
print(f"Distinct sale UUIDs     : {len(set(ids))}   -> duplicate UUIDs: {len(ids)-len(set(ids))}")
print(f"Distinct receipt numbers: {len(set(receipts))}   -> receipt clashes: {len(receipts)-len(set(receipts))}")
print(f"Distinct terminal+recpt : {len(set(composite))}   -> duplicates: {len(composite)-len(set(composite))}")
print("\nTills detected:")
for term, lab in till_map.items():
    c = sum(1 for t in all_tx if (t.get('terminal_id') or 'unknown') == term)
    print(f"  {lab}: {c} sales   ({term})")

out = os.path.expanduser("~/Downloads/Ariemmas-Transactions.csv")
with open(out, "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["till","terminal_receipt_key","sale_id_uuid","receipt_number","terminal_id",
                "sale_date","sale_time","cashier","payment_method","total"])
    for t in sorted(all_tx, key=lambda x: (x.get("created_at") or "")):
        term = t.get("terminal_id") or "unknown"
        created = t.get("created_at") or ""
        date_part, _, time_part = created.partition(" ")
        cashier = t.get("shift_cashier_name") or t.get("display_name") or ""
        w.writerow([till_map[term], f"{term}-{t['receipt_number']}", t["id"], t["receipt_number"],
                    term, date_part, time_part, cashier, t.get("payment_method"), t.get("total")])
print(f"\nCSV written: {out}  ({len(all_tx)} rows)")
