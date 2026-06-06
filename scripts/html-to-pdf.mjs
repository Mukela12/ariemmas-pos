import { chromium } from 'playwright'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const htmlPath = resolve('docs/training-guide/ariemmas-pos-training-guide.html')
const pdfPath = resolve('docs/training-guide/Ariemmas-POS-Training-Guide.pdf')

const browser = await chromium.launch()
const page = await browser.newPage()
await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle' })
await page.emulateMedia({ media: 'print' })
const footer = `
  <div style="width:100%; font-family: Inter, Arial, sans-serif; font-size:8px; color:#A1A1AA;
              padding:0 18mm; display:flex; justify-content:space-between; align-items:center;">
    <span>Ariemmas POS — Staff Training Guide</span>
    <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
  </div>`
await page.pdf({
  path: pdfPath,
  format: 'A4',
  printBackground: true,
  preferCSSPageSize: false,
  displayHeaderFooter: true,
  headerTemplate: '<span></span>',
  footerTemplate: footer,
  margin: { top: '8mm', bottom: '12mm', left: '0', right: '0' }
})
await browser.close()
console.log('PDF written:', pdfPath)
