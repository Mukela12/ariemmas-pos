# Requirements Specification

## 1. Business Context

**Ariemmas** is a retail shop located on Independence Avenue in Mongu, Zambia. The shop sells general merchandise (groceries, clothing, household items). The owner needs a POS system to:

- Speed up checkout with barcode scanning
- Track daily sales accurately
- Print receipts for customers
- Manage cash drawer securely
- Monitor inventory levels
- Comply with ZRA (Zambia Revenue Authority) tax requirements

The system will run on a single Windows cash register PC with a barcode scanner, thermal receipt printer, and cash drawer.

---

## 2. Functional Requirements

### 2.1 Authentication

| ID | Requirement | Priority |
|----|-------------|----------|
| AUTH-01 | System displays a login screen on startup | Must |
| AUTH-02 | Users authenticate with username + PIN (4-6 digit) | Must |
| AUTH-03 | System records which user is logged in for every transaction | Must |
| AUTH-04 | Three failed login attempts locks the account (manager can unlock) | Should |
| AUTH-05 | Auto-logout after configurable idle timeout (default: 15 min) | Should |
| AUTH-06 | Users have roles: Cashier, Manager, Admin | Must |

**Role Permissions:**

| Action | Cashier | Manager | Admin |
|--------|---------|---------|-------|
| Process sales | Yes | Yes | Yes |
| Void a sale | No | Yes | Yes |
| Issue refunds | No | Yes | Yes |
| Apply discounts | Limited (up to 5%) | Yes (up to 100%) | Yes |
| View reports | Own shift only | All | All |
| Manage products | No | Yes | Yes |
| Manage users | No | No | Yes |
| Change settings | No | No | Yes |
| Open cash drawer (no sale) | No | Yes | Yes |

### 2.2 Point of Sale (Checkout)

| ID | Requirement | Priority |
|----|-------------|----------|
| POS-01 | Main sale screen shows: shop header, item list (SKU, Item, Amt), running total | Must |
| POS-02 | Barcode scanner input adds product to the sale (auto-lookup by SKU/barcode) | Must |
| POS-03 | Manual product search by name or SKU if barcode fails | Must |
| POS-04 | Quantity defaults to 1, can be adjusted before or after adding | Must |
| POS-05 | "Remove Item" button removes selected item from the sale | Must |
| POS-06 | Running total updates in real-time as items are added/removed | Must |
| POS-07 | "Pay" button initiates payment flow | Must |
| POS-08 | Cash payment: enter amount tendered, calculate and display change | Must |
| POS-09 | Mobile money payment: record reference number | Should |
| POS-10 | Split payment (part cash, part mobile money) | Could |
| POS-11 | On payment complete: print receipt, open cash drawer, clear screen | Must |
| POS-12 | "Log Out" button returns to login screen | Must |
| POS-13 | Sale items saved to daily sales record with date, time, cashier, all items | Must |
| POS-14 | Hold/park a sale and start a new one (recall later) | Should |
| POS-15 | Quick-add buttons for common items without barcodes (e.g., loose produce) | Could |

### 2.3 Receipt Printing

| ID | Requirement | Priority |
|----|-------------|----------|
| REC-01 | Receipt header: "Ariemmas", "Independence Ave Mongu", "097 4542233" | Must |
| REC-02 | Receipt body: line items with SKU, Item Name, Amount | Must |
| REC-03 | Receipt totals: Subtotal, VAT (16%), Total, Cash, Change | Must |
| REC-04 | Receipt footer: Cashier name, Date, Time, Receipt number | Must |
| REC-05 | Receipt uses 80mm thermal paper (48 chars per line) | Must |
| REC-06 | Auto-cut paper after printing | Must |
| REC-07 | Reprint last receipt option | Should |
| REC-08 | ZRA fiscal code / QR code on receipt (when ZRA integration is done) | Must (Phase 2) |

**Receipt Layout:**

```
========================================
           ARIEMMAS
    Independence Ave Mongu
        097 4542233
        TIN: XXXXXXXXX
========================================
Date: 13/03/2026        Time: 14:32:05
Cashier: Mary           Rcpt#: 000142
----------------------------------------
SKU       Item              Amt
2324345   Apples          K 55.89
3121338   T-Bone         K 289.99
----------------------------------------
Subtotal:               K 345.88
VAT (16%):               K 47.70
TOTAL:                  K 345.88
Cash:                   K 350.00
Change:                   K 4.12
----------------------------------------
        Thank you for shopping
            at Ariemmas!
        [ZRA QR Code Here]
========================================
```

### 2.4 Cash Drawer

| ID | Requirement | Priority |
|----|-------------|----------|
| CDR-01 | Cash drawer opens automatically after cash payment | Must |
| CDR-02 | "No Sale" drawer open requires manager PIN | Must |
| CDR-03 | Every drawer-open event logged with user, time, reason | Must |

### 2.5 Inventory Management

| ID | Requirement | Priority |
|----|-------------|----------|
| INV-01 | Add/edit/deactivate products (name, barcode, price, cost, category, VAT rate) | Must |
| INV-02 | Stock quantity tracked per product | Must |
| INV-03 | Stock decreases automatically on sale | Must |
| INV-04 | Low stock alerts (configurable threshold per product) | Should |
| INV-05 | Stock receiving (add incoming stock with date, supplier, quantity) | Should |
| INV-06 | Barcode label printing for products without barcodes | Could |
| INV-07 | Product categories (Groceries, Clothing, Household, etc.) | Should |
| INV-08 | Bulk product import from CSV/Excel | Could |

### 2.6 Shift Management

| ID | Requirement | Priority |
|----|-------------|----------|
| SHF-01 | Cashier opens a shift with an opening cash count | Must |
| SHF-02 | Cashier closes shift with a closing cash count | Must |
| SHF-03 | System calculates expected cash vs. actual (variance) | Must |
| SHF-04 | X-report: mid-day sales summary (does not close shift) | Should |
| SHF-05 | Z-report: end-of-day close-out (closes shift, finalizes totals) | Must |

### 2.7 Reporting

| ID | Requirement | Priority |
|----|-------------|----------|
| RPT-01 | Daily sales summary (total sales, total VAT, transaction count) | Must |
| RPT-02 | Sales by product (which items sold most today) | Should |
| RPT-03 | Sales by cashier | Should |
| RPT-04 | Sales by payment method | Should |
| RPT-05 | Inventory valuation report (stock on hand * cost price) | Could |
| RPT-06 | Profit margin report (selling price vs. cost price) | Could |
| RPT-07 | Export reports to PDF or Excel | Should |

### 2.8 Settings & Configuration

| ID | Requirement | Priority |
|----|-------------|----------|
| SET-01 | Shop details (name, address, phone, TIN) | Must |
| SET-02 | Receipt header/footer customization | Should |
| SET-03 | Default VAT rate configuration | Must |
| SET-04 | Printer configuration (port, paper width) | Must |
| SET-05 | Barcode scanner settings | Should |
| SET-06 | Auto-logout timeout | Should |
| SET-07 | Database backup (manual + scheduled) | Must |

---

## 3. Non-Functional Requirements

### 3.1 Performance

| ID | Requirement |
|----|-------------|
| PERF-01 | Barcode lookup returns product in < 100ms |
| PERF-02 | Receipt prints within 2 seconds of payment |
| PERF-03 | App starts and reaches login screen in < 5 seconds |
| PERF-04 | Handles 10,000+ products without performance degradation |

### 3.2 Reliability

| ID | Requirement |
|----|-------------|
| REL-01 | Works fully offline (no internet dependency for core functions) |
| REL-02 | Survives power outage — auto-saves draft sales, recovers on restart |
| REL-03 | Database uses WAL mode for crash resistance |
| REL-04 | Daily automated local backup of database |

### 3.3 Security

| ID | Requirement |
|----|-------------|
| SEC-01 | User PINs stored as bcrypt hashes, never plaintext |
| SEC-02 | All cash drawer events logged in audit trail |
| SEC-03 | Void/refund actions logged with reason and manager approval |
| SEC-04 | Database encrypted at rest (SQLCipher) |
| SEC-05 | No remote access to POS without explicit VPN/firewall setup |

### 3.4 Usability

| ID | Requirement |
|----|-------------|
| USE-01 | Touchscreen-friendly UI (large buttons, clear text) |
| USE-02 | Keyboard/scanner-driven workflow (minimal mouse usage) |
| USE-03 | Training new cashier should take < 30 minutes |
| USE-04 | Visual feedback on all actions (item added, payment success, errors) |
| USE-05 | Zambian English interface (simple, clear language) |

### 3.5 Deployment

| ID | Requirement |
|----|-------------|
| DEP-01 | Single .exe installer for Windows 10/11 |
| DEP-02 | SQL Server Express installed alongside or separately |
| DEP-03 | No manual configuration needed post-install (sensible defaults) |
| DEP-04 | Auto-update mechanism for future patches |

---

## 4. Out of Scope (Future Phases)

- Online/e-commerce integration
- Multi-branch sync
- Customer loyalty program
- Credit/tab management
- Card payment terminal integration
- Employee time tracking
- Accounting software integration (e.g., QuickBooks)

---

## 5. Assumptions

1. The shop has a single POS terminal (one cash register)
2. Internet connectivity is intermittent (mobile data via Airtel/MTN/Zamtel)
3. Power outages occur regularly (UPS is required hardware)
4. Staff have basic computer literacy (can type, use mouse/touchscreen)
5. Products will be barcoded by the supplier or barcoded in-house
6. The developer (Mukela) will handle installation, training, and maintenance remotely or in-person
