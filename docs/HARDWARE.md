# Hardware Integration Guide

## 1. Overview

The Ariemmas POS system interfaces with three peripheral devices:

| Device | Connection | Protocol | Library |
|--------|-----------|----------|---------|
| Barcode Scanner | USB (HID keyboard emulation) | Keyboard events | None needed |
| Thermal Receipt Printer | USB | ESC/POS | `node-thermal-printer` |
| Cash Drawer | RJ11 via printer | ESC/POS kick pulse | `node-thermal-printer` |

```
┌──────────────┐     USB     ┌──────────────┐
│   Barcode    │────────────►│              │
│   Scanner    │             │              │
└──────────────┘             │   Windows    │
                             │     PC       │
┌──────────────┐     USB     │   (POS App)  │
│   Receipt    │◄───────────►│              │
│   Printer    │             │              │
│   ┌──────┐   │             └──────────────┘
│   │DK Port│  │
│   └──┬───┘   │
└──────┼───────┘
       │ RJ11
┌──────┴───────┐
│ Cash Drawer  │
└──────────────┘
```

## 2. Barcode Scanner

### How It Works

USB barcode scanners operate in **HID Keyboard Emulation** mode by default. This means:

1. Plug the scanner into any USB port — it's recognized as a keyboard
2. When a barcode is scanned, the scanner "types" the barcode digits rapidly
3. After the digits, it sends an Enter key (configurable terminator)
4. No drivers or special software needed

### Detecting Scanner Input vs. Human Typing

The key difference: scanners inject characters at 5-50ms intervals, while humans type at 100-300ms intervals.

**Implementation approach:**

```typescript
// src/renderer/hooks/useScanner.ts

interface ScannerOptions {
  onScan: (barcode: string) => void;
  minLength?: number;         // minimum barcode length (default: 4)
  maxDelay?: number;          // max ms between characters (default: 50)
  terminator?: string;        // key that ends the scan (default: 'Enter')
}

export function useScanner(options: ScannerOptions) {
  const {
    onScan,
    minLength = 4,
    maxDelay = 50,
    terminator = 'Enter'
  } = options;

  let buffer = '';
  let lastKeyTime = 0;

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      const now = Date.now();

      if (e.key === terminator) {
        if (buffer.length >= minLength) {
          onScan(buffer);      // valid barcode detected
        }
        buffer = '';
        return;
      }

      // Reset buffer if too much time between keys (human typing)
      if (now - lastKeyTime > maxDelay && buffer.length > 0) {
        buffer = '';
      }

      buffer += e.key;
      lastKeyTime = now;
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [onScan, minLength, maxDelay, terminator]);
}
```

**Usage in POS screen:**

```typescript
// src/renderer/pages/POS.tsx

useScanner({
  onScan: async (barcode) => {
    const product = await window.posAPI.getProduct(barcode);
    if (product) {
      addItemToSale(product);
      playBeepSound();         // audible feedback
    } else {
      showError(`Product not found: ${barcode}`);
    }
  }
});
```

### Handling Edge Cases

| Scenario | Solution |
|----------|----------|
| Scanner not connected | Show "Scanner disconnected" in status bar. Allow manual barcode entry. |
| Barcode not in database | Show "Product not found" error with option to add new product |
| Scanning while in text input | Only process scans when POS screen is active |
| Damaged/unreadable barcode | Manual SKU entry fallback |

### Recommended Scanners

**Budget (for Ariemmas):**
- **Netum NT-1228BL** — $20-30, wireless + USB, 1D barcodes. Available on AliExpress with Zambia shipping.

**Professional:**
- **Honeywell Voyager 1200g** — $50-80, wired USB, rugged. Industry workhorse.
- **Zebra DS2208** — $80-120, 1D + 2D (reads QR codes too).

### Scanner Configuration

Most scanners are configured by scanning special barcodes in the manual. Key settings:

| Setting | Recommended Value |
|---------|------------------|
| Mode | HID Keyboard Emulation (default) |
| Terminator | Enter / Carriage Return (default) |
| Preamble | None |
| Postamble | None |
| Scan beep | Enabled |

---

## 3. Thermal Receipt Printer

### ESC/POS Protocol

ESC/POS is the universal command language for thermal printers, created by Epson. All major brands support it (Epson, Star, Xprinter, Bixolon).

Commands are raw bytes sent to the printer:

| Command | Hex | Purpose |
|---------|-----|---------|
| Initialize | `1B 40` | Reset printer to defaults |
| Bold on | `1B 45 01` | Enable bold |
| Bold off | `1B 45 00` | Disable bold |
| Center align | `1B 61 01` | Center text |
| Left align | `1B 61 00` | Left align |
| Right align | `1B 61 02` | Right align |
| Double height | `1B 21 10` | Large text |
| Normal size | `1B 21 00` | Standard text |
| Feed lines | `1B 64 NN` | Feed NN lines |
| Cut paper | `1D 56 00` | Full cut |
| Partial cut | `1D 56 01` | Partial cut |
| Open drawer (pin 2) | `1B 70 00 19 FA` | Kick cash drawer |

### Implementation

```typescript
// src/main/hardware/printer.ts

import { ThermalPrinter, PrinterTypes } from 'node-thermal-printer';

let printer: ThermalPrinter | null = null;

export async function initPrinter(config: PrinterConfig): Promise<void> {
  printer = new ThermalPrinter({
    type: PrinterTypes.EPSON,
    interface: config.interface,    // e.g., 'printer:Xprinter' or 'tcp://192.168.1.100'
    characterSet: 'CHARCODE_PC437',
    removeSpecialCharacters: false,
    lineCharacter: '-',
    width: config.paperWidth === 80 ? 48 : 32,  // chars per line
  });

  const isConnected = await printer.isPrinterConnected();
  if (!isConnected) {
    throw new Error('Printer not connected');
  }
}

export async function printReceipt(receipt: Receipt): Promise<void> {
  if (!printer) throw new Error('Printer not initialized');

  // Header
  printer.alignCenter();
  printer.setTextDoubleHeight();
  printer.bold(true);
  printer.println(receipt.shopName);
  printer.bold(false);
  printer.setTextNormal();
  printer.println(receipt.shopAddress);
  printer.println(receipt.shopPhone);
  if (receipt.shopTIN) {
    printer.println(`TIN: ${receipt.shopTIN}`);
  }
  printer.drawLine();

  // Date, cashier, receipt number
  printer.alignLeft();
  printer.println(`Date: ${receipt.date}        Time: ${receipt.time}`);
  printer.println(`Cashier: ${receipt.cashier}     Rcpt#: ${receipt.receiptNumber}`);
  printer.drawLine();

  // Column headers
  printer.tableCustom([
    { text: 'Item', align: 'LEFT', width: 0.55 },
    { text: 'Qty', align: 'CENTER', width: 0.15 },
    { text: 'Amt', align: 'RIGHT', width: 0.30 },
  ]);
  printer.drawLine();

  // Line items
  for (const item of receipt.items) {
    printer.tableCustom([
      { text: item.name, align: 'LEFT', width: 0.55 },
      { text: `x${item.quantity}`, align: 'CENTER', width: 0.15 },
      { text: `K ${item.lineTotal.toFixed(2)}`, align: 'RIGHT', width: 0.30 },
    ]);
  }

  printer.drawLine();

  // Totals
  printer.tableCustom([
    { text: 'Subtotal:', align: 'LEFT', width: 0.55 },
    { text: `K ${receipt.subtotal.toFixed(2)}`, align: 'RIGHT', width: 0.45 },
  ]);
  printer.tableCustom([
    { text: 'VAT (16%):', align: 'LEFT', width: 0.55 },
    { text: `K ${receipt.vatTotal.toFixed(2)}`, align: 'RIGHT', width: 0.45 },
  ]);

  printer.bold(true);
  printer.tableCustom([
    { text: 'TOTAL:', align: 'LEFT', width: 0.55 },
    { text: `K ${receipt.total.toFixed(2)}`, align: 'RIGHT', width: 0.45 },
  ]);
  printer.bold(false);

  if (receipt.paymentMethod === 'cash') {
    printer.tableCustom([
      { text: 'Cash:', align: 'LEFT', width: 0.55 },
      { text: `K ${receipt.amountTendered!.toFixed(2)}`, align: 'RIGHT', width: 0.45 },
    ]);
    printer.tableCustom([
      { text: 'Change:', align: 'LEFT', width: 0.55 },
      { text: `K ${receipt.changeGiven!.toFixed(2)}`, align: 'RIGHT', width: 0.45 },
    ]);
  }

  printer.drawLine();

  // Footer
  printer.alignCenter();
  printer.println(receipt.footer);

  // ZRA fiscal code (Phase 2)
  if (receipt.zraFiscalCode) {
    printer.println('');
    printer.printQR(receipt.zraFiscalCode, { cellSize: 6, correction: 'M' });
  }

  // Cut and open drawer
  printer.newLine();
  printer.newLine();
  printer.cut();

  if (receipt.openDrawer) {
    printer.openCashDrawer();
  }

  await printer.execute();
  printer.clear();
}
```

### Paper Specifications

| Paper Width | Characters/Line | Use Case |
|------------|----------------|----------|
| **80mm** (recommended) | 48 | Standard POS receipt. Fits detailed line items. |
| 58mm | 32 | Budget/compact receipts. Less detail per line. |

**Paper cost in Zambia:** ~K 15-25 per roll (80mm), ~K 10-15 per roll (58mm). Available at any stationery or computer shop.

### Recommended Printers

**For Ariemmas (best value):**
- **Xprinter XP-Q200** — 80mm, USB, $40-60. Widely available in Africa via AliExpress or local electronics shops. Full ESC/POS compatible.

**If budget allows:**
- **Epson TM-T20III** — $150-200. Industry standard. Bulletproof reliability. 5+ year lifespan.

### Printer Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| Prints garbled text | Wrong printer type in config | Set `PrinterTypes.EPSON` or `PrinterTypes.STAR` |
| Prints blank | Paper loaded wrong way | Thermal paper has a coated side — flip the roll |
| Not detected | Driver issue | Install manufacturer USB driver on Windows |
| Partial printing | Buffer overflow | Add small delays between print commands |
| Faint printing | Low thermal head | Replace print head or printer |

---

## 4. Cash Drawer

### How It Works

The cash drawer connects to the receipt printer via an **RJ11 cable** (looks like a phone cord). The printer has a "DK" (Drawer Kick) port on the back.

When the software sends the drawer-open command to the printer, the printer sends an electrical pulse through the RJ11 cable, which triggers a solenoid in the drawer to pop it open.

### Implementation

```typescript
// src/main/hardware/cash-drawer.ts

export async function openCashDrawer(): Promise<void> {
  if (!printer) throw new Error('Printer not initialized');

  printer.openCashDrawer();
  await printer.execute();
  printer.clear();

  // Log the event (called from main process)
  await logAuditEvent({
    action: 'drawer_open',
    entityType: 'drawer',
    details: JSON.stringify({ trigger: 'sale_complete' }),
  });
}
```

### When the Drawer Opens

| Event | Drawer Action | Auth Required |
|-------|--------------|---------------|
| Cash sale completed | Auto-open | No (part of sale flow) |
| "No Sale" button | Open | Manager PIN |
| End-of-shift cash count | Open | Cashier (own shift) |
| Refund (cash) | Open | Manager PIN |

### Recommended Cash Drawers

- **Standard 4-bill / 5-coin RJ11 drawer** — $30-50. Generic brand is fine.
- Ensure the RJ11 connector matches your printer (most use 6P6C or RJ12).
- Test with the printer before deploying.

### Physical Wiring

```
[Receipt Printer]
    │
    │  Back panel has "DK" or "Cash Drawer" port
    │
    ├── RJ11 Cable (comes with drawer usually)
    │
    ▼
[Cash Drawer]
    │
    │  Drawer has a key lock for manual open
    │  (important if power is out and drawer needs opening)
    │
    └── Contains removable cash tray (bills + coins)
```

---

## 5. Hardware Setup Checklist

Before deploying at the shop:

- [ ] **Windows PC** — Windows 10/11, 4GB+ RAM, 2+ USB ports
- [ ] **Barcode Scanner** — Plug in USB, test scan → check if characters appear in Notepad
- [ ] **Receipt Printer** — Install USB driver, test print from Windows > Devices & Printers
- [ ] **Cash Drawer** — Connect RJ11 to printer DK port, test open via printer utility
- [ ] **UPS** — Connect PC + printer to UPS. Verify battery holds for 15+ minutes.
- [ ] **Test full flow** — Scan item → Add to sale → Pay → Receipt prints → Drawer opens

---

## 6. Peripheral Status Monitoring

The app should show hardware status in the UI:

```
┌─────────────────────────────────────┐
│  Status Bar (bottom of POS screen)  │
│                                     │
│  🟢 Printer: Connected              │
│  🟢 Scanner: Ready                  │
│  🟡 Internet: Offline               │
│  Shift: Open since 08:00            │
│  Cashier: Mary                      │
└─────────────────────────────────────┘
```

Printer connection is checked on app start and periodically (every 60 seconds). Scanner status is inferred from recent scan activity.
