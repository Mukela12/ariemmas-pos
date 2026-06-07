import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'
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
const CATBG = {
  'cat-groceries': ['#ECFDF5', '#A7F3D0'], 'cat-meat': ['#FEF2F2', '#FECACA'],
  'cat-beverages': ['#EFF6FF', '#BFDBFE'], 'cat-household': ['#FAF5FF', '#E9D5FF'],
  'cat-clothing': ['#FFF7ED', '#FED7AA'], 'cat-electronics': ['#F1F5F9', '#CBD5E1'],
  'cat-other': ['#F0FDFA', '#99F6E4']
}
function emojiFor(n){for(const [re,e] of EMOJI) if(re.test(n)) return e; return '🛒'}
const API='https://api-production-b925.up.railway.app'
const products=(await fetch(`${API}/api/products?limit=500`).then(r=>r.json())).products
const browser=await chromium.launch()
const page=await browser.newPage({viewport:{width:240,height:240,deviceScaleFactor:2}})
const map={}
for(const p of products){
  const emoji=emojiFor(p.name)
  const [c1,c2]=CATBG[p.category_id]||['#F4F4F5','#E4E4E7']
  map[p.name]=await page.evaluate(async ({emoji,c1,c2})=>{
    const cv=document.createElement('canvas');cv.width=240;cv.height=240
    const ctx=cv.getContext('2d')
    const g=ctx.createLinearGradient(0,0,240,240);g.addColorStop(0,c1);g.addColorStop(1,c2)
    ctx.fillStyle=g;ctx.fillRect(0,0,240,240)
    ctx.font='130px "Apple Color Emoji","Noto Color Emoji",sans-serif'
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(emoji,120,128)
    return cv.toDataURL('image/webp',0.9)
  },{emoji,c1,c2})
}
await browser.close()
writeFileSync('src/main/database/product-images.json', JSON.stringify(map))
console.log('wrote', Object.keys(map).length, 'images, total', Math.round(JSON.stringify(map).length/1024), 'KB')
