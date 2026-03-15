# ZRA (Zambia Revenue Authority) Compliance

## 1. Overview

Any business operating a POS system in Zambia must comply with ZRA regulations regarding Electronic Fiscal Devices (EFDs) and tax reporting. This document outlines what's required and how the Ariemmas POS will comply.

## 2. Legal Requirements

### VAT Registration

- Businesses with annual turnover **above ZMW 800,000** must register for VAT
- Once registered, all sales must include VAT calculations on receipts
- VAT returns filed monthly or quarterly (depending on turnover)

### VAT Rates in Zambia

| Rate | Applied To | Examples |
|------|-----------|----------|
| **16%** (standard) | Most goods and services | Clothing, electronics, processed food |
| **0%** (zero-rated) | Basic necessities, exports | Mealie meal, fresh fruits, vegetables, cooking oil, bread |
| **Exempt** | Specific services | Financial services, education, health, residential rent |

### How VAT Works on Receipts

Prices in Zambian retail are typically **VAT-inclusive**. The receipt must show:

```
Item                    K 116.00   (VAT-inclusive price)

Subtotal (excl. VAT):  K 100.00
VAT (16%):              K  16.00
Total:                  K 116.00
```

**VAT extraction formula:**
```
Price excluding VAT = Price including VAT / (1 + VAT rate)
VAT amount = Price including VAT - Price excluding VAT

Example: K 116.00 / 1.16 = K 100.00 (excl. VAT)
         K 116.00 - K 100.00 = K 16.00 (VAT)
```

## 3. Electronic Fiscal Device (EFD) Requirements

### What is an EFD?

ZRA requires businesses to use approved electronic systems that:
1. Record every sale transaction
2. Generate a unique fiscal receipt number
3. Report transaction data to ZRA electronically
4. Cannot be tampered with or have sales deleted

### EFD Options

**Option A: Hardware EFD (Traditional)**
- Physical device between POS and printer
- Signs each transaction cryptographically
- Stores data and transmits to ZRA
- Brands: Tremol, Datecs, Hugin
- Cost: $200-500 for the device

**Option B: Virtual/Software EFD — VSDC (Recommended)**
- Software-based fiscal solution
- Integrates directly with ZRA's Smart Invoice API
- No additional hardware needed
- The POS software itself becomes the fiscal device
- ZRA is promoting this approach for new systems

### Smart Invoice System

ZRA's **Smart Invoice** system is the modern approach:

1. Your POS registers with ZRA and receives API credentials
2. Each sale is reported to ZRA via API in real-time (or queued if offline)
3. ZRA returns a fiscal verification code
4. The verification code is printed on the receipt (and/or as QR code)
5. Customers can verify the receipt on ZRA's website

### Integration Architecture

```
┌──────────────┐    sale data     ┌────────────────┐
│  Ariemmas    │ ──────────────► │  ZRA Smart     │
│  POS App     │                  │  Invoice API   │
│              │ ◄────────────── │                │
│              │  fiscal code     │  vsdc.zra.org  │
└──────────────┘                  └────────────────┘
       │
       ▼
   [Receipt with fiscal code + QR]
```

### Offline Handling

Since internet in Mongu may be intermittent:

1. Sale completes normally (offline-first)
2. Sale data queued in `sync_queue` for ZRA submission
3. When internet is available, queued sales are submitted in batch
4. ZRA fiscal codes are received and stored against each sale
5. If a customer needs a verified receipt, reprint once fiscal code is received

**ZRA allows a grace period** for offline submissions — typically sales can be reported within 48 hours.

## 4. Receipt Requirements

### Mandatory Receipt Fields (per ZRA)

| Field | Example | Required? |
|-------|---------|-----------|
| Business name | Ariemmas | Yes |
| Business address | Independence Ave, Mongu | Yes |
| TIN (Taxpayer ID) | 1234567890 | Yes (if VAT registered) |
| Date and time | 13/03/2026 14:32:05 | Yes |
| Receipt/invoice number | 20260313-0142 | Yes |
| Item description | Apples | Yes |
| Item quantity | 2 | Yes |
| Item price (incl. VAT) | K 55.89 | Yes |
| VAT rate per item | 16% or 0% | Yes |
| Total VAT amount | K 47.70 | Yes |
| Total amount | K 345.88 | Yes |
| Payment method | Cash | Yes |
| Fiscal device number | FD-12345 | Yes (EFD) |
| Fiscal verification code | ABC123XYZ | Yes (Smart Invoice) |
| QR code (verification) | [QR] | Recommended |

### Receipt Template (ZRA Compliant)

```
========================================
           ARIEMMAS
    Independence Ave Mongu
        097 4542233
      TIN: 1234567890
  Fiscal Device: VSDC-00001
========================================
Date: 13/03/2026       Time: 14:32:05
Cashier: Mary          Rcpt#: 0142
========================================
Item            Qty    VAT%       Amt
Apples            2   16%    K  55.89
T-Bone            1   16%    K 289.99
Mealie Meal       1    0%    K  85.00
========================================
Subtotal (excl VAT):       K 371.45
VAT (16%):                  K  47.70
Zero-rated:                 K  85.00
----------------------------------------
TOTAL:                     K 430.88
Cash:                      K 450.00
Change:                     K  19.12
========================================
  Fiscal Code: ABC123XYZ789
  Verify: vsdc.zra.org.zm

  [QR CODE: verification URL]

  Thank you for shopping
      at Ariemmas!
========================================
```

## 5. Implementation Plan

### Phase 1: VAT Compliance (Build Phase)

Implemented from day one:

- [x] Products have a `vat_rate` field (0.16 for standard, 0 for zero-rated)
- [x] Sale totals calculated with correct VAT breakdown
- [x] Receipts show all mandatory fields except ZRA fiscal code
- [x] TIN field in shop settings
- [x] VAT summary on receipts (standard-rated vs. zero-rated totals)

### Phase 2: ZRA Smart Invoice Integration

After core POS is working:

1. **Register with ZRA** — Apply for Smart Invoice / VSDC credentials
2. **Obtain API documentation** — ZRA provides technical specs
3. **Implement API client** — POST sale data, receive fiscal code
4. **Add offline queue** — Buffer sales when offline, sync when connected
5. **Update receipts** — Print fiscal code and QR on every receipt
6. **Testing** — ZRA provides a sandbox/test environment
7. **Certification** — ZRA may audit/certify the system before production use

### Phase 2 Code Structure

```
src/main/services/
├── zra/
│   ├── client.ts           # ZRA Smart Invoice API client
│   ├── types.ts            # ZRA request/response types
│   ├── queue.ts            # Offline queue management
│   └── fiscal-code.ts      # Fiscal code generation/validation
```

## 6. Tax Reporting

### Daily Z-Report (End of Day)

The Z-report is a mandatory end-of-day summary:

```
========================================
       ARIEMMAS - Z-REPORT
       Date: 13/03/2026
========================================
Total Transactions:          45
Total Sales:           K 12,450.00
Total VAT:              K 1,717.24
Zero-Rated Sales:       K  1,230.00
Total Refunds:            K   85.00
Net Sales:             K 12,365.00
----------------------------------------
Payment Breakdown:
  Cash:                K 10,200.00
  Mobile Money:         K  2,165.00
----------------------------------------
Opening Cash:           K    500.00
Expected Cash:         K 10,700.00
Actual Cash:           K 10,685.00
Variance:                K   -15.00
========================================
Cashier: Mary | Shift closed: 18:00
========================================
```

### Monthly VAT Return Data

The POS should be able to export monthly summary data for VAT returns:

| Field | Description |
|-------|-------------|
| Total standard-rated sales | All sales at 16% |
| Total zero-rated sales | All sales at 0% |
| Total exempt sales | If applicable |
| Output VAT (16% collected) | Total VAT on standard-rated |
| Input VAT (from purchases) | Entered manually or from stock receipts |
| Net VAT payable | Output - Input |

Export format: CSV or Excel, ready for the accountant.

## 7. Getting Started with ZRA

### Contacts and Resources

- **ZRA Head Office**: Stand 5099, 15th Floor, Revenue House, Kalambo Road, Lusaka
- **Phone**: +260 211 381111
- **Website**: www.zra.org.zm
- **Smart Invoice Portal**: vsdc.zra.org.zm (for registration and testing)
- **Provincial Office (Western)**: ZRA Mongu Office for local support

### Steps to Register

1. Ensure the business has a valid TIN (Taxpayer Identification Number)
2. Contact ZRA or visit the provincial office in Mongu
3. Apply for Smart Invoice / VSDC integration
4. Receive API credentials and technical documentation
5. Implement and test against ZRA sandbox
6. Apply for production certification
7. Go live with fiscal reporting

### Local IT Support

Consider working with a Zambian IT firm experienced in ZRA integration:
- They'll have current API documentation
- They can help with the certification process
- They may have existing libraries/SDKs
- Search for "ZRA EFD integration Zambia" or ask at ZRA office for recommended integrators

## 8. Important Notes

- **Do not delay ZRA compliance** — Operating without an EFD/fiscal device can result in fines
- **Keep all Z-reports** — ZRA may audit at any time; reports must be available for 5 years
- **Receipt reprinting** — Must be able to reprint any past receipt on demand
- **No sale deletion** — Once a sale is recorded, it can only be voided (not deleted). The void and the original must both be preserved.
- **Tax rates may change** — Build the VAT rate as a configurable setting, not a hardcoded value
