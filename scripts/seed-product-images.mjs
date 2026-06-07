import { chromium } from 'playwright'
const API = 'https://api-production-b925.up.railway.app'

// emoji by product-name keyword
const EMOJI = [
  [/t-?bone|steak|\bmeat\b/i, '🥩'], [/chicken/i, '🍗'], [/fish|bream/i, '🐟'],
  [/apple/i, '🍎'], [/tomato/i, '🍅'], [/onion/i, '🧅'],
  [/bread/i, '🍞'], [/mealie|maize/i, '🌽'], [/rice|nasi/i, '🍚'], [/sugar/i, '🍬'],
  [/cooking oil|oil/i, '🫗'], [/milk/i, '🥛'],
  [/coca|cola|fanta|juice|drink/i, '🥤'], [/lager|beer|castle|mosi/i, '🍺'],
  [/bar soap|soap/i, '🧼'], [/dish/i, '🧴'], [/washing|detergent/i, '🧺'],
  [/candle/i, '🕯️'], [/match/i, '🔥'], [/batter/i, '🔋'], [/charger|phone|usb/i, '🔌'],
  [/t-?shirt|shirt/i, '👕'], [/chitenge|fabric|cloth/i, '🧵'],
]
// soft background by category name
const CATBG = {
  'Groceries': ['#ECFDF5', '#A7F3D0'], 'Meat & Fish': ['#FEF2F2', '#FECACA'],
  'Beverages': ['#EFF6FF', '#BFDBFE'], 'Household': ['#FAF5FF', '#E9D5FF'],
  'Clothing': ['#FFF7ED', '#FED7AA'], 'Electronics': ['#F1F5F9', '#CBD5E1'],
  'Other': ['#F0FDFA', '#99F6E4']
}
function emojiFor(name) { for (const [re, e] of EMOJI) if (re.test(name)) return e; return '🛒' }

const products = (await fetch(`${API}/api/products?limit=500`).then(r => r.json())).products
const cats = await fetch(`${API}/api/categories`).then(r => r.json())
const catName = Object.fromEntries(cats.map(c => [c.id, c.name]))

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 240, height: 240, deviceScaleFactor: 2 } })

let done = 0
for (const p of products) {
  const emoji = emojiFor(p.name)
  const [c1, c2] = CATBG[catName[p.category_id]] || ['#F4F4F5', '#E4E4E7']
  const dataUrl = await page.evaluate(async ({ emoji, c1, c2 }) => {
    const cv = document.createElement('canvas'); cv.width = 240; cv.height = 240
    const ctx = cv.getContext('2d')
    const g = ctx.createLinearGradient(0, 0, 240, 240); g.addColorStop(0, c1); g.addColorStop(1, c2)
    ctx.fillStyle = g; ctx.fillRect(0, 0, 240, 240)
    ctx.font = '130px "Apple Color Emoji","Noto Color Emoji",sans-serif'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(emoji, 120, 128)
    return cv.toDataURL('image/webp', 0.9)
  }, { emoji, c1, c2 })

  const body = { ...p, image_url: dataUrl }
  const res = await fetch(`${API}/api/products/${p.id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  })
  done++
  console.log(`${done}/${products.length} ${p.name.padEnd(24)} ${emoji} ${res.status} (${Math.round(dataUrl.length/1024)}KB)`)
}
await browser.close()
console.log('all done')
