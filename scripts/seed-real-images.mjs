// Retries any missing image (Rice), then writes the real Commons images onto
// every product on the server (full PUT so price/stock/etc. are preserved) and
// keeps src/main/database/product-images.json in sync for the desktop seed.
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { chromium } from 'playwright'

const __dirname = dirname(fileURLToPath(import.meta.url))
const JSON_OUT = join(__dirname, '..', 'src', 'main', 'database', 'product-images.json')
const API = 'https://api-production-b925.up.railway.app'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const map = JSON.parse(await readFile(JSON_OUT, 'utf8'))

// Fill any gaps (e.g. Rice) with a fresh Commons fetch.
const RETRY = { 'Rice 5kg': 'cooked white rice bowl' }
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 256, height: 256 } })
await page.goto('https://commons.wikimedia.org/wiki/Main_Page', { waitUntil: 'domcontentloaded' }).catch(() => {})

async function commonsUrl(query) {
  const u = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrnamespace=6&gsrlimit=8&prop=imageinfo&iiprop=url|mime&iiurlwidth=400&format=json&origin=*`
  const r = await fetch(u, { headers: { 'User-Agent': 'AriemmasPOS/1.0' } })
  const t = await r.text(); let d; try { d = JSON.parse(t) } catch { return null }
  for (const p of Object.values(d?.query?.pages || {})) {
    const info = p.imageinfo?.[0]; if (info && /jpeg|png|webp/.test(info.mime || '')) return info.thumburl || info.url
  }
  return null
}
async function toSquareWebp(url) {
  return page.evaluate(async (u) => {
    const img = new Image(); img.crossOrigin = 'anonymous'
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = u })
    const S = 256, c = document.createElement('canvas'); c.width = S; c.height = S
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, S, S)
    const s = Math.max(S / img.width, S / img.height), w = img.width * s, h = img.height * s
    ctx.drawImage(img, (S - w) / 2, (S - h) / 2, w, h)
    return c.toDataURL('image/webp', 0.82)
  }, url)
}
for (const [name, q] of Object.entries(RETRY)) {
  if (map[name]) continue
  await sleep(1000)
  const url = await commonsUrl(q)
  if (url) { const du = await toSquareWebp(url).catch(() => null); if (du) { map[name] = du; console.log('FILLED', name) } }
}
await browser.close()
await writeFile(JSON_OUT, JSON.stringify(map, null, 0))

// Push to server with a full PUT per product.
const products = (await fetch(`${API}/api/products?limit=500`).then(r => r.json())).products
let ok = 0
for (const p of products) {
  const image_url = map[p.name]
  if (!image_url) { console.log('no image for', p.name); continue }
  const body = { barcode: p.barcode, name: p.name, category_id: p.category_id, price: p.price,
    cost_price: p.cost_price, vat_rate: p.vat_rate, stock_quantity: p.stock_quantity,
    min_stock_level: p.min_stock_level, unit: p.unit, is_weighted: p.is_weighted, image_url }
  const r = await fetch(`${API}/api/products/${p.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (r.ok) { ok++; console.log('SEEDED', p.name) } else console.log('FAIL', p.name, r.status)
}
console.log(`\nSeeded ${ok}/${products.length} products with real images. Map has ${Object.keys(map).length} images.`)
