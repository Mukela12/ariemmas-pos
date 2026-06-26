import { BrowserWindow } from 'electron'
import { execFile } from 'child_process'
import { randomBytes } from 'crypto'
import { writeFile, unlink } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import type { PrintableReceipt } from '../../shared/types'
import { formatMonguDateTime } from '../../shared/datetime'

// Thermal print width in characters (Font A): 80mm paper fits 48, 58mm fits 32.
// Chosen per till via the receipt_paper_width setting; this is the 80mm default.
const DEFAULT_LINE_WIDTH = 48

// --- ESC/POS control codes ---
const ESC = 0x1b
const GS = 0x1d
const INIT = Buffer.from([ESC, 0x40])
const ALIGN_LEFT = Buffer.from([ESC, 0x61, 0x00])
const ALIGN_CENTER = Buffer.from([ESC, 0x61, 0x01])
const BOLD_ON = Buffer.from([ESC, 0x45, 0x01])
const BOLD_OFF = Buffer.from([ESC, 0x45, 0x00])
const SIZE_DOUBLE = Buffer.from([GS, 0x21, 0x11])
const SIZE_NORMAL = Buffer.from([GS, 0x21, 0x00])
// Feed paper and partial cut (ignored harmlessly by printers without a cutter).
const FEED_AND_CUT = Buffer.from([GS, 0x56, 0x42, 0x00])
// ESC p m t1 t2 — fire the cash-drawer kick pulse on pin 2 (~50ms on / 500ms off).
const DRAWER_KICK = Buffer.from([ESC, 0x70, 0x00, 0x19, 0xfa])

function money(amount: number | string): string {
  return `K ${Number(amount).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`
}

function line(text = ''): Buffer {
  return Buffer.from(`${text}\n`, 'latin1')
}

// Build the width-aware text helpers for a given line width (chars per line).
function textHelpers(width: number): {
  lr: (left: string, right: string) => Buffer
  divider: () => Buffer
} {
  // Left/right justified within `width`. Truncates left side if it would collide.
  const lr = (left: string, right: string): Buffer => {
    const space = width - right.length
    const l = left.length > space - 1 ? left.slice(0, Math.max(0, space - 1)) : left
    const pad = Math.max(1, width - l.length - right.length)
    return line(l + ' '.repeat(pad) + right)
  }
  const divider = (): Buffer => line('-'.repeat(width))
  return { lr, divider }
}

export function buildReceiptBytes(r: PrintableReceipt, lineWidth = DEFAULT_LINE_WIDTH): Buffer {
  const { lr, divider } = textHelpers(lineWidth)
  const paymentLabel =
    r.paymentMethod === 'mobile_money' ? 'Mobile Money' : r.paymentMethod === 'cash' ? 'Cash' : 'Split'
  const timestamp = formatMonguDateTime(r.printedAt)

  const parts: Buffer[] = [INIT]

  // Header
  parts.push(ALIGN_CENTER, BOLD_ON, SIZE_DOUBLE, line(r.shopName), SIZE_NORMAL, BOLD_OFF)
  if (r.shopAddress) parts.push(line(r.shopAddress))
  if (r.shopPhone) parts.push(line(r.shopPhone))
  if (r.shopTpin) parts.push(line(`TPIN: ${r.shopTpin}`))
  if (r.receiptHeader) parts.push(line(r.receiptHeader))
  parts.push(ALIGN_LEFT, divider())

  // Meta
  parts.push(lr('Receipt:', r.receiptNumber))
  parts.push(lr('Cashier:', r.cashierName))
  if (r.cashierPerson) parts.push(lr('Served by:', r.cashierPerson))
  parts.push(lr('Printed:', timestamp))
  parts.push(divider())

  // Items: name on its own line, qty x unit -> line total below.
  for (const item of r.items) {
    parts.push(line(item.name))
    parts.push(lr(`  ${item.quantity} x ${money(item.unit_price)}`, money(item.total)))
  }
  parts.push(divider())

  // Totals (hide Subtotal/VAT when VAT is switched off)
  if (r.vatTotal > 0) {
    parts.push(lr('Subtotal', money(r.subtotal)))
    parts.push(lr('VAT', money(r.vatTotal)))
  }
  parts.push(BOLD_ON, SIZE_DOUBLE, lr('TOTAL', money(r.total)), SIZE_NORMAL, BOLD_OFF)
  parts.push(divider())

  // Payment
  parts.push(lr('Payment:', paymentLabel))
  if (r.paymentMethod === 'cash' && r.amountTendered !== null) {
    parts.push(lr('Tendered:', money(r.amountTendered)))
  }
  if (r.paymentMethod === 'cash' && r.changeGiven !== null) {
    parts.push(lr('Change:', money(r.changeGiven)))
  }
  if (r.paymentMethod === 'mobile_money' && r.mobileRef) {
    parts.push(lr('Reference:', r.mobileRef))
  }
  parts.push(divider())

  // Footer
  const itemCount = r.items.reduce((sum, item) => sum + item.quantity, 0)
  parts.push(ALIGN_CENTER)
  if (r.receiptFooter) parts.push(line(r.receiptFooter))
  parts.push(line(`Items sold: ${itemCount}`))
  parts.push(line(), line(), FEED_AND_CUT)

  return Buffer.concat(parts)
}

export function buildTestBytes(lineWidth = DEFAULT_LINE_WIDTH): Buffer {
  const { divider } = textHelpers(lineWidth)
  return Buffer.concat([
    INIT,
    ALIGN_CENTER,
    BOLD_ON,
    SIZE_DOUBLE,
    line('Ariemmas POS'),
    SIZE_NORMAL,
    BOLD_OFF,
    line('Printer test page'),
    ALIGN_LEFT,
    divider(),
    line('If you can read this, the printer'),
    line('is connected and working.'),
    divider(),
    line(formatMonguDateTime(new Date().toISOString())),
    line(),
    line(),
    FEED_AND_CUT
  ])
}

export interface PrinterInfo {
  name: string
  displayName: string
  isDefault: boolean
}

export async function listPrinters(): Promise<PrinterInfo[]> {
  const win = BrowserWindow.getAllWindows()[0]
  if (!win) return []
  const printers = await win.webContents.getPrintersAsync()
  return printers.map((p) => ({
    name: p.name,
    displayName: p.displayName || p.name,
    isDefault: p.isDefault
  }))
}

// Resolve which printer to use: the saved name if it still exists, else the OS default.
export async function resolvePrinter(savedName: string): Promise<PrinterInfo | null> {
  const printers = await listPrinters()
  if (printers.length === 0) return null
  if (savedName) {
    const match = printers.find((p) => p.name === savedName)
    if (match) return match
  }
  return printers.find((p) => p.isDefault) ?? printers[0]
}

const RAW_PRINT_SCRIPT = `
$ErrorActionPreference = 'Stop'
$printer = $env:POS_PRINTER
$file = $env:POS_FILE
$bytes = [System.IO.File]::ReadAllBytes($file)
$sig = @'
using System;
using System.Runtime.InteropServices;
public class RawPrinterHelper {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct DOCINFOW { [MarshalAs(UnmanagedType.LPWStr)] public string pDocName; [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile; [MarshalAs(UnmanagedType.LPWStr)] public string pDataType; }
  [DllImport("winspool.Drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode, ExactSpelling = true)] public static extern bool OpenPrinter(string p, out IntPtr h, IntPtr pd);
  [DllImport("winspool.Drv", EntryPoint = "ClosePrinter", SetLastError = true, ExactSpelling = true)] public static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode, ExactSpelling = true)] public static extern bool StartDocPrinter(IntPtr h, int level, ref DOCINFOW di);
  [DllImport("winspool.Drv", EntryPoint = "EndDocPrinter", SetLastError = true, ExactSpelling = true)] public static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.Drv", EntryPoint = "StartPagePrinter", SetLastError = true, ExactSpelling = true)] public static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.Drv", EntryPoint = "EndPagePrinter", SetLastError = true, ExactSpelling = true)] public static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.Drv", EntryPoint = "WritePrinter", SetLastError = true, ExactSpelling = true)] public static extern bool WritePrinter(IntPtr h, IntPtr buf, int count, out int written);
}
'@
Add-Type -TypeDefinition $sig
$h = [IntPtr]::Zero
if (-not [RawPrinterHelper]::OpenPrinter($printer, [ref]$h, [IntPtr]::Zero)) { throw "OpenPrinter failed for '$printer'" }
try {
  $di = New-Object RawPrinterHelper+DOCINFOW
  $di.pDocName = 'Ariemmas POS'
  $di.pDataType = 'RAW'
  if (-not [RawPrinterHelper]::StartDocPrinter($h, 1, [ref]$di)) { throw 'StartDocPrinter failed' }
  [RawPrinterHelper]::StartPagePrinter($h) | Out-Null
  $buf = [System.Runtime.InteropServices.Marshal]::AllocHGlobal($bytes.Length)
  try {
    [System.Runtime.InteropServices.Marshal]::Copy($bytes, 0, $buf, $bytes.Length)
    $written = 0
    if (-not [RawPrinterHelper]::WritePrinter($h, $buf, $bytes.Length, [ref]$written)) { throw 'WritePrinter failed' }
  } finally {
    [System.Runtime.InteropServices.Marshal]::FreeHGlobal($buf)
  }
  [RawPrinterHelper]::EndPagePrinter($h) | Out-Null
  [RawPrinterHelper]::EndDocPrinter($h) | Out-Null
} finally {
  [RawPrinterHelper]::ClosePrinter($h) | Out-Null
}
`

// Sends raw bytes to a Windows print queue via the spooler (winspool WritePrinter).
// On non-Windows (dev) it logs and resolves true so the POS flow keeps working.
export async function sendRaw(printerName: string, data: Buffer): Promise<boolean> {
  if (process.platform !== 'win32') {
    console.log(`[DEV] Would send ${data.length} raw bytes to "${printerName}"`)
    return true
  }

  const tmpFile = join(tmpdir(), `ariemmas-pos-${Date.now()}-${randomBytes(4).toString('hex')}.bin`)
  await writeFile(tmpFile, data)

  const encoded = Buffer.from(RAW_PRINT_SCRIPT, 'utf16le').toString('base64')

  try {
    await new Promise<void>((resolve, reject) => {
      execFile(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
        { env: { ...process.env, POS_PRINTER: printerName, POS_FILE: tmpFile }, timeout: 15000, windowsHide: true },
        (error, _stdout, stderr) => {
          if (error) reject(new Error(stderr?.trim() || error.message))
          else resolve()
        }
      )
    })
    return true
  } finally {
    await unlink(tmpFile).catch(() => {})
  }
}

export function getDrawerKickBytes(): Buffer {
  return DRAWER_KICK
}
