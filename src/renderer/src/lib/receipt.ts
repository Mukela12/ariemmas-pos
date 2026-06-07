import type { CartItem, PrintableReceipt, Sale } from '../../../shared/types'
import { formatZMW } from './currency'

export function buildPrintableReceipt({
  sale,
  items,
  settings,
  cashierName,
  cashierPerson
}: {
  sale: Pick<Sale, 'receipt_number' | 'subtotal' | 'vat_total' | 'total' | 'payment_method' | 'amount_tendered' | 'change_given' | 'mobile_ref' | 'created_at'>
  items: CartItem[]
  settings: Record<string, string>
  cashierName: string
  cashierPerson?: string | null
}): PrintableReceipt {
  return {
    receiptNumber: sale.receipt_number,
    shopName: settings.shop_name || 'Ariemmas',
    shopAddress: settings.shop_address || 'Independence Ave Mongu',
    shopPhone: settings.shop_phone || '',
    shopTpin: settings.shop_tpin || '',
    receiptHeader: settings.receipt_header || 'Welcome to Ariemmas!',
    receiptFooter: settings.receipt_footer || 'Thank you for shopping at Ariemmas!',
    items: items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unit_price: item.price,
      total: item.line_total
    })),
    subtotal: sale.subtotal,
    vatTotal: sale.vat_total,
    total: sale.total,
    paymentMethod: sale.payment_method,
    amountTendered: sale.amount_tendered,
    changeGiven: sale.change_given,
    mobileRef: sale.mobile_ref,
    cashierName,
    cashierPerson: cashierPerson || null,
    printedAt: sale.created_at || new Date().toISOString()
  }
}

export async function printReceiptInBrowser(receipt: PrintableReceipt): Promise<boolean> {
  if (typeof document === 'undefined') return false

  const frame = document.createElement('iframe')
  frame.style.position = 'fixed'
  frame.style.right = '0'
  frame.style.bottom = '0'
  frame.style.width = '0'
  frame.style.height = '0'
  frame.style.border = '0'
  document.body.appendChild(frame)

  const cleanup = () => {
    window.setTimeout(() => {
      frame.remove()
    }, 500)
  }

  try {
    const printWindow = frame.contentWindow
    const printDocument = printWindow?.document
    if (!printWindow || !printDocument) {
      cleanup()
      return false
    }

    printDocument.open()
    printDocument.write(renderReceiptHtml(receipt))
    printDocument.close()

    await new Promise<void>((resolve) => {
      const triggerPrint = () => {
        try {
          printWindow.focus()
          printWindow.print()
        } finally {
          resolve()
        }
      }

      if (printDocument.readyState === 'complete') {
        window.setTimeout(triggerPrint, 120)
      } else {
        frame.onload = () => window.setTimeout(triggerPrint, 120)
      }
    })

    cleanup()
    return true
  } catch {
    cleanup()
    return false
  }
}

function renderReceiptHtml(receipt: PrintableReceipt): string {
  const paymentLabel = receipt.paymentMethod === 'mobile_money' ? 'Mobile Money' : receipt.paymentMethod === 'cash' ? 'Cash' : 'Split'
  const printedAt = new Date(receipt.printedAt)
  const timestamp = Number.isNaN(printedAt.getTime()) ? receipt.printedAt : printedAt.toLocaleString('en-GB')

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Receipt ${escapeHtml(receipt.receiptNumber)}</title>
    <style>
      :root { color-scheme: light; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        padding: 24px;
        font-family: "SF Mono", "Menlo", "Consolas", monospace;
        background: #ffffff;
        color: #111827;
      }
      .receipt {
        width: 320px;
        margin: 0 auto;
        border: 1px solid #e5e7eb;
        padding: 20px 18px;
      }
      .center { text-align: center; }
      .muted { color: #6b7280; }
      .rule {
        border-top: 1px dashed #9ca3af;
        margin: 12px 0;
      }
      .row, .item-row, .item-head {
        display: grid;
        grid-template-columns: 1fr 56px 84px;
        gap: 8px;
        align-items: start;
      }
      .item-head {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        color: #6b7280;
        letter-spacing: 0.08em;
      }
      .item-row {
        font-size: 12px;
        padding: 6px 0;
      }
      .qty { text-align: center; }
      .amount { text-align: right; white-space: nowrap; }
      .summary {
        display: grid;
        gap: 6px;
        font-size: 12px;
      }
      .summary-line {
        display: flex;
        justify-content: space-between;
        gap: 12px;
      }
      .total {
        font-size: 16px;
        font-weight: 700;
      }
      .meta {
        display: grid;
        gap: 4px;
        font-size: 12px;
      }
    </style>
  </head>
  <body>
    <div class="receipt">
      <div class="center">
        <div style="font-size:18px;font-weight:700;">${escapeHtml(receipt.shopName)}</div>
        <div class="muted" style="font-size:12px;margin-top:4px;">${escapeHtml(receipt.shopAddress)}</div>
        <div class="muted" style="font-size:12px;">${escapeHtml(receipt.shopPhone)}</div>
        ${receipt.shopTpin ? `<div class="muted" style="font-size:12px;">TPIN: ${escapeHtml(receipt.shopTpin)}</div>` : ''}
        <div style="font-size:12px;margin-top:8px;">${escapeHtml(receipt.receiptHeader)}</div>
      </div>
      <div class="rule"></div>
      <div class="meta">
        <div><strong>Receipt:</strong> ${escapeHtml(receipt.receiptNumber)}</div>
        <div><strong>Cashier:</strong> ${escapeHtml(receipt.cashierName)}${receipt.cashierPerson ? ` (${escapeHtml(receipt.cashierPerson)})` : ''}</div>
        <div><strong>Printed:</strong> ${escapeHtml(timestamp)}</div>
      </div>
      <div class="rule"></div>
      <div class="item-head">
        <div>Item</div>
        <div class="qty">Qty</div>
        <div class="amount">Total</div>
      </div>
      ${receipt.items.map((item) => `
        <div class="item-row">
          <div>${escapeHtml(item.name)}</div>
          <div class="qty">${escapeHtml(String(item.quantity))}</div>
          <div class="amount">${escapeHtml(formatZMW(item.total))}</div>
        </div>
      `).join('')}
      <div class="rule"></div>
      <div class="summary">
        <div class="summary-line"><span>Subtotal</span><span>${escapeHtml(formatZMW(receipt.subtotal))}</span></div>
        <div class="summary-line"><span>VAT</span><span>${escapeHtml(formatZMW(receipt.vatTotal))}</span></div>
        <div class="summary-line total"><span>Total</span><span>${escapeHtml(formatZMW(receipt.total))}</span></div>
      </div>
      <div class="rule"></div>
      <div class="meta">
        <div><strong>Payment:</strong> ${escapeHtml(paymentLabel)}</div>
        ${receipt.paymentMethod === 'cash' && receipt.amountTendered !== null ? `<div><strong>Tendered:</strong> ${escapeHtml(formatZMW(receipt.amountTendered))}</div>` : ''}
        ${receipt.paymentMethod === 'cash' && receipt.changeGiven !== null ? `<div><strong>Change:</strong> ${escapeHtml(formatZMW(receipt.changeGiven))}</div>` : ''}
        ${receipt.paymentMethod === 'mobile_money' && receipt.mobileRef ? `<div><strong>Reference:</strong> ${escapeHtml(receipt.mobileRef)}</div>` : ''}
      </div>
      <div class="rule"></div>
      <div class="center muted" style="font-size:12px;">
        <div>${escapeHtml(receipt.receiptFooter)}</div>
        <div style="margin-top:6px;">Items sold: ${escapeHtml(String(receipt.items.reduce((sum, item) => sum + item.quantity, 0)))}</div>
      </div>
    </div>
  </body>
</html>`
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
