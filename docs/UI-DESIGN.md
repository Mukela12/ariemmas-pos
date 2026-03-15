# UI Design

## 1. Design Principles

- **Speed over beauty** — Cashiers need to process sales fast. Every click counts.
- **Large touch targets** — Buttons minimum 48px height, easy to tap on touchscreen.
- **High contrast** — Clear readability under shop lighting.
- **Minimal navigation** — Most actions happen on the POS screen. Maximum 2 clicks to any function.
- **Keyboard/scanner first** — Designed for barcode scanner + keyboard workflow.

## 2. Color Scheme

| Element | Color | Hex | Usage |
|---------|-------|-----|-------|
| Primary | Deep Blue | `#1E40AF` | Headers, primary buttons |
| Success | Green | `#16A34A` | PAY button, positive amounts |
| Danger | Red | `#DC2626` | Remove, void, errors |
| Warning | Amber | `#D97706` | Low stock, alerts |
| Background | Light Gray | `#F3F4F6` | App background |
| Surface | White | `#FFFFFF` | Cards, panels |
| Text | Dark Gray | `#1F2937` | Primary text |
| Muted | Gray | `#6B7280` | Secondary text, labels |

## 3. Screen Layouts

### 3.1 Login Screen

```
┌─────────────────────────────────────────────────┐
│                                                   │
│                                                   │
│              ┌─────────────────────┐              │
│              │    ARIEMMAS LOGO    │              │
│              │                     │              │
│              │  Independence Ave   │              │
│              │     Mongu           │              │
│              └─────────────────────┘              │
│                                                   │
│              ┌─────────────────────┐              │
│              │  Username           │              │
│              │  [________________] │              │
│              │                     │              │
│              │  PIN                │              │
│              │  [________________] │              │
│              │                     │              │
│              │  ┌───────────────┐  │              │
│              │  │    LOG IN     │  │              │
│              │  └───────────────┘  │              │
│              └─────────────────────┘              │
│                                                   │
│              v1.0.0 | Shift: Closed               │
│                                                   │
└─────────────────────────────────────────────────┘
```

**Behavior:**
- Username field auto-focused on load
- PIN field is masked (dots)
- Enter key submits the form
- Error message shown below form on failed login
- After login → Open Shift prompt (if no shift open) → POS Screen

### 3.2 POS Screen (Main Sale Screen)

This is the primary screen — where 95% of work happens.

```
┌──────────────────────────────────────────────────────────────────────┐
│  ARIEMMAS POS                                          Mary │ 14:32 │
│  Independence Ave Mongu │ 097 4542233                  [LOG OUT]    │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─ Scan / Search ──────────────────────────────────────────────┐   │
│  │  🔍 [Scan barcode or search product name...              ]   │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌─ Current Sale ───────────────────────────────────────────────┐   │
│  │                                                               │   │
│  │  #    SKU        Item                  Qty    Price    Total  │   │
│  │  ─────────────────────────────────────────────────────────── │   │
│  │  1    2324345    Apples                 1    K 55.89  K 55.89│   │
│  │  2    3121338    T-Bone Steak           1    K289.99  K289.99│   │
│  │                                                               │   │
│  │                                                               │   │
│  │                                                               │   │
│  │                                                               │   │
│  │                                                               │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌─ Totals ─────────────────────────────────────────────────────┐   │
│  │  Items: 2            Subtotal (excl VAT):          K 298.18  │   │
│  │                      VAT (16%):                     K 47.70  │   │
│  │                      ─────────────────────────────────────── │   │
│  │                      TOTAL:                        K 345.88  │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────────┐  │
│  │  REMOVE ITEM  │  │   HOLD SALE  │  │          PAY              │  │
│  │   (red)       │  │   (yellow)   │  │        (green, large)     │  │
│  └──────────────┘  └──────────────┘  └───────────────────────────┘  │
│                                                                      │
├──────────────────────────────────────────────────────────────────────┤
│  🟢 Printer   🟢 Scanner   🟡 Offline   │ Shift: Open 08:00       │
└──────────────────────────────────────────────────────────────────────┘
```

**Behavior:**
- Search bar is always focused (receives barcode scanner input)
- Scanning a barcode auto-adds the item (quantity 1)
- Scanning same barcode again increments quantity
- Click on item row to select it (for removal or quantity change)
- Arrow keys navigate item list
- F2 or Enter on search bar → manual product search
- PAY button opens payment dialog
- Keyboard shortcut: F12 = PAY

### 3.3 Payment Dialog

```
┌────────────────────────────────────────┐
│           PAYMENT                       │
│                                         │
│   Total Due:    K 345.88                │
│                                         │
│   Payment Method:                       │
│   ┌──────────┐  ┌──────────────────┐   │
│   │   CASH   │  │  MOBILE MONEY    │   │
│   │ (active) │  │                  │   │
│   └──────────┘  └──────────────────┘   │
│                                         │
│   Cash Received:                        │
│   ┌────────────────────────────────┐   │
│   │  K [350.00                   ] │   │
│   └────────────────────────────────┘   │
│                                         │
│   Quick amounts:                        │
│   [K 350] [K 400] [K 500] [K 1000]    │
│                                         │
│   ┌────────────────────────────────┐   │
│   │  Change:  K 4.12              │   │
│   └────────────────────────────────┘   │
│                                         │
│   ┌──────────┐  ┌─────────────────┐   │
│   │  CANCEL  │  │   COMPLETE SALE │   │
│   └──────────┘  └─────────────────┘   │
│                                         │
└────────────────────────────────────────┘
```

**Behavior:**
- Cash amount field auto-focused
- Quick amount buttons for common denominations
- Change calculated in real-time as you type
- Cannot complete if cash < total
- On "Complete Sale": save to DB → print receipt → open drawer → clear screen
- Mobile Money: shows reference number input instead of cash fields

### 3.4 Product Management Screen

```
┌──────────────────────────────────────────────────────────────────────┐
│  PRODUCTS                                              [+ ADD NEW]  │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  🔍 [Search products...                ]  Category: [All ▼]        │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Barcode     Name              Category    Price    Stock    │   │
│  │  ───────────────────────────────────────────────────────── │   │
│  │  2324345     Apples            Groceries   K 55.89   120   │   │
│  │  3121338     T-Bone Steak      Meat        K289.99    25   │   │
│  │  4810234     Mealie Meal 25kg  Groceries   K 85.00    48   │   │
│  │  5918273     Cooking Oil 2L    Groceries   K 65.00    ⚠ 3  │   │
│  │  ...                                                        │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  Page 1 of 12    [< Prev]  [Next >]    Showing 215 products        │
│                                                                      │
├──────────────────────────────────────────────────────────────────────┤
│  [← Back to POS]                                                    │
└──────────────────────────────────────────────────────────────────────┘
```

### 3.5 Reports Screen

```
┌──────────────────────────────────────────────────────────────────────┐
│  REPORTS                                                             │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Date: [13/03/2026 ▼]                                               │
│                                                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌───────────┐ │
│  │ Total Sales  │  │ Transactions│  │  Total VAT  │  │   Profit  │ │
│  │ K 12,450.00  │  │     45      │  │  K 1,717.24 │  │ K 3,200   │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └───────────┘ │
│                                                                      │
│  ┌─ Sales by Hour ──────────────────────────────────────────────┐   │
│  │  ▓▓▓▓                  08:00    K 890                         │   │
│  │  ▓▓▓▓▓▓▓               09:00    K 1,450                      │   │
│  │  ▓▓▓▓▓▓▓▓▓▓            10:00    K 2,100                      │   │
│  │  ▓▓▓▓▓▓▓▓▓▓▓▓▓         11:00    K 2,800                      │   │
│  │  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓      12:00    K 3,200 (peak)              │   │
│  │  ▓▓▓▓▓▓▓▓              13:00    K 1,600                      │   │
│  │  ...                                                          │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌─ Top Products Today ─────────────────────────────────────────┐   │
│  │  1. Mealie Meal 25kg    32 sold    K 2,720.00                 │   │
│  │  2. Cooking Oil 2L      28 sold    K 1,820.00                 │   │
│  │  3. Sugar 2kg           25 sold    K 1,125.00                 │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  [Print X-Report]  [Print Z-Report]  [Export CSV]                   │
│                                                                      │
├──────────────────────────────────────────────────────────────────────┤
│  [← Back to POS]                                                    │
└──────────────────────────────────────────────────────────────────────┘
```

### 3.6 Shift Management

```
┌────────────────────────────────────────┐
│        CLOSE SHIFT                      │
│                                         │
│  Shift opened: 08:00 by Mary            │
│  Duration: 10h 00m                      │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ Total Sales:     K 12,450.00    │   │
│  │ Cash Sales:      K 10,200.00    │   │
│  │ Mobile Money:     K  2,250.00   │   │
│  │ Transactions:     45            │   │
│  │ Voids:            2             │   │
│  │ Refunds:          K    85.00    │   │
│  └─────────────────────────────────┘   │
│                                         │
│  Opening Cash:      K    500.00         │
│  Expected Cash:     K 10,615.00         │
│                                         │
│  Count your cash drawer:                │
│  ┌────────────────────────────────┐    │
│  │  Actual Cash: K [___________ ] │    │
│  └────────────────────────────────┘    │
│                                         │
│  Variance:  K ___.__                    │
│                                         │
│  Notes: [________________________]      │
│                                         │
│  [CANCEL]          [CLOSE SHIFT]        │
└────────────────────────────────────────┘
```

## 4. Navigation

```
Login Screen
    │
    ▼
Open Shift (if not open)
    │
    ▼
POS Screen (home) ──────────┬── Products (manager/admin only)
    │                        ├── Reports (manager/admin only)
    │                        ├── Settings (admin only)
    │                        └── Close Shift
    │
    ▼
Payment Dialog → Receipt prints → Back to POS
```

### Keyboard Shortcuts

| Key | Action | Screen |
|-----|--------|--------|
| F1 | Help / Shortcut reference | All |
| F2 | Manual product search | POS |
| F4 | Hold current sale | POS |
| F5 | Recall held sale | POS |
| F8 | Remove selected item | POS |
| F12 | Open payment dialog | POS |
| Esc | Cancel / Go back | All |
| Enter | Confirm / Submit | All |
| Tab | Next field | Forms |

### Navigation Sidebar (Manager/Admin)

When logged in as Manager or Admin, a sidebar appears:

```
┌──────┐
│  POS │  ← Always visible (home)
│──────│
│ Prod │  ← Products
│ Rpts │  ← Reports
│ Shft │  ← Shifts
│ Sets │  ← Settings (admin only)
│──────│
│ Out  │  ← Log Out
└──────┘
```

Cashier role only sees: POS and Log Out.

## 5. Responsive Considerations

The POS will run on a fixed resolution cash register screen, but we design for flexibility:

| Resolution | Layout |
|-----------|--------|
| 1024x768 (common POS) | Compact layout, smaller fonts |
| 1280x800 (standard) | Default layout |
| 1920x1080 (Full HD) | Comfortable spacing |
| Touch screen | Large buttons (56px+), no hover-dependent interactions |

## 6. Error States

| Error | Display | Recovery |
|-------|---------|----------|
| Product not found | Toast: "No product with barcode XXXXX" | Manual search or add new product |
| Printer offline | Banner: "Printer disconnected. Sale saved, receipt pending." | Retry print when reconnected |
| Cash amount too low | Inline: "Cash must be at least K 345.88" | Enter valid amount |
| No shift open | Modal: "Please open a shift before processing sales" | Open shift dialog |
| Database error | Full-screen error with "Retry" button | Auto-retry, or restart app |
