import ExcelJS from 'exceljs'
import { dialog, app } from 'electron'
import path from 'path'
import dayjs from 'dayjs'
import { getDb, dateOf } from '../database/connection'

interface SaleRow {
  receipt_number: string
  created_at: string
  cashier: string
  payment_method: string
  subtotal: number
  vat_total: number
  total: number
  amount_tendered: number | null
  change_given: number | null
  mobile_ref: string | null
  status: string
}

interface SaleItemRow {
  receipt_number: string
  product_name: string
  barcode: string | null
  quantity: number
  unit_price: number
  vat_rate: number
  vat_amount: number
  line_total: number
}

export async function exportDailySalesToExcel(date: string): Promise<string | null> {
  const db = getDb()
  const dateExpr = dateOf('s.created_at', db.engine)

  const sales = await db.query<SaleRow>(`
    SELECT s.receipt_number, s.created_at, u.display_name as cashier,
      s.payment_method, s.subtotal, s.vat_total, s.total,
      s.amount_tendered, s.change_given, s.mobile_ref, s.status
    FROM sales s
    LEFT JOIN users u ON s.user_id = u.id
    WHERE ${dateExpr} = ? AND s.status = 'completed'
    ORDER BY s.created_at ASC
  `, [date])

  const items = await db.query<SaleItemRow>(`
    SELECT s.receipt_number, si.product_name, si.barcode, si.quantity,
      si.unit_price, si.vat_rate, si.vat_amount, si.line_total
    FROM sale_items si
    JOIN sales s ON si.sale_id = s.id
    WHERE ${dateOf('s.created_at', db.engine)} = ? AND s.status = 'completed'
    ORDER BY s.created_at ASC, si.product_name ASC
  `, [date])

  const dateFormatted = dayjs(date).format('DD-MMM-YYYY')
  const defaultName = `Ariemmas_Sales_${dayjs(date).format('YYYY-MM-DD')}.xlsx`

  const { filePath } = await dialog.showSaveDialog({
    title: `Export Sales — ${dateFormatted}`,
    defaultPath: path.join(app.getPath('documents'), defaultName),
    filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }]
  })

  if (!filePath) return null

  const wb = new ExcelJS.Workbook()
  wb.creator = 'Ariemmas POS'
  wb.created = new Date()

  // --- Sales Summary Sheet ---
  const ws = wb.addWorksheet('Sales Summary')

  ws.mergeCells('A1:H1')
  const titleCell = ws.getCell('A1')
  titleCell.value = `Ariemmas — Daily Sales Report (${dateFormatted})`
  titleCell.font = { size: 14, bold: true }
  titleCell.alignment = { horizontal: 'left' }

  ws.addRow([])

  const totalRevenue = sales.reduce((s, r) => s + Number(r.total), 0)
  const totalVat = sales.reduce((s, r) => s + Number(r.vat_total), 0)
  const cashSales = sales.filter(r => r.payment_method === 'cash').reduce((s, r) => s + Number(r.total), 0)
  const mobileSales = sales.filter(r => r.payment_method === 'mobile_money').reduce((s, r) => s + Number(r.total), 0)

  ws.addRow(['Total Transactions', sales.length])
  ws.addRow(['Total Revenue', totalRevenue])
  ws.addRow(['Total VAT', totalVat])
  ws.addRow(['Cash Sales', cashSales])
  ws.addRow(['Mobile Money Sales', mobileSales])
  ws.addRow([])

  const headerRow = ws.addRow([
    'Receipt #', 'Time', 'Cashier', 'Payment', 'Subtotal', 'VAT', 'Total', 'Status'
  ])
  headerRow.font = { bold: true }
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } }
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.border = { bottom: { style: 'thin' } }
  })

  for (const sale of sales) {
    ws.addRow([
      sale.receipt_number,
      dayjs(sale.created_at).format('HH:mm:ss'),
      sale.cashier || 'Unknown',
      sale.payment_method === 'mobile_money' ? 'Mobile Money' : 'Cash',
      Number(sale.subtotal),
      Number(sale.vat_total),
      Number(sale.total),
      sale.status
    ])
  }

  const currCols = [5, 6, 7]
  for (const col of currCols) {
    ws.getColumn(col).numFmt = '#,##0.00'
  }
  ws.getColumn(1).width = 18
  ws.getColumn(2).width = 10
  ws.getColumn(3).width = 18
  ws.getColumn(4).width = 14
  ws.getColumn(5).width = 12
  ws.getColumn(6).width = 12
  ws.getColumn(7).width = 12
  ws.getColumn(8).width = 10

  // --- Line Items Sheet ---
  const wsItems = wb.addWorksheet('Line Items')

  wsItems.mergeCells('A1:G1')
  const itemsTitle = wsItems.getCell('A1')
  itemsTitle.value = `Ariemmas — Items Sold (${dateFormatted})`
  itemsTitle.font = { size: 14, bold: true }

  wsItems.addRow([])

  const itemHeaderRow = wsItems.addRow([
    'Receipt #', 'Product', 'Barcode', 'Qty', 'Unit Price', 'VAT', 'Line Total'
  ])
  itemHeaderRow.font = { bold: true }
  itemHeaderRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } }
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.border = { bottom: { style: 'thin' } }
  })

  for (const item of items) {
    wsItems.addRow([
      item.receipt_number,
      item.product_name,
      item.barcode || '',
      Number(item.quantity),
      Number(item.unit_price),
      Number(item.vat_amount),
      Number(item.line_total)
    ])
  }

  wsItems.getColumn(1).width = 18
  wsItems.getColumn(2).width = 24
  wsItems.getColumn(3).width = 14
  wsItems.getColumn(4).width = 8
  wsItems.getColumn(5).width = 12
  wsItems.getColumn(6).width = 12
  wsItems.getColumn(7).width = 12
  for (const col of [5, 6, 7]) {
    wsItems.getColumn(col).numFmt = '#,##0.00'
  }

  await wb.xlsx.writeFile(filePath)
  return filePath
}
