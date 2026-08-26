import { chromium } from 'playwright'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { homedir } from 'node:os'

const htmlPath = resolve('docs/marketing/pos-overview.html')
const pdfPath = resolve(homedir(), 'Downloads/TillSync-POS-Overview.pdf')
const shotPath = resolve('docs/marketing/preview-full.png')

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 2 })
await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle' })
await page.emulateMedia({ media: 'print' })

// Full-page screenshot for visual QA
await page.screenshot({ path: shotPath, fullPage: true })

const footer = `
  <div style="width:100%; font-family: Inter, Arial, sans-serif; font-size:8px; color:#A1A1AA;
              padding:0 15mm; display:flex; justify-content:space-between; align-items:center;">
    <span>TillSync POS — Product &amp; Services Overview</span>
    <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
  </div>`
await page.pdf({
  path: pdfPath,
  format: 'A4',
  printBackground: true,
  displayHeaderFooter: true,
  headerTemplate: '<span></span>',
  footerTemplate: footer,
  margin: { top: '8mm', bottom: '12mm', left: '0', right: '0' }
})
await browser.close()
console.log('PDF :', pdfPath)
console.log('PNG :', shotPath)
