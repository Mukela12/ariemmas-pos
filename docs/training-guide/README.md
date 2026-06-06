# Ariemmas POS — Staff Training Guide

A printable training guide for cashiers and administrators, with real
screenshots captured from the live app.

## Files

- `Ariemmas-POS-Training-Guide.pdf` — the finished guide (share / print this).
- `ariemmas-pos-training-guide.html` — the source document.
- `img/` — screenshots used in the guide.

## Regenerating

The screenshots are captured from the production web build
(`https://ariemmas-pos.netlify.app`) and the PDF is rendered from the HTML.
Both use Playwright (a `devDependency`).

```bash
# 1. (once) install the headless browser
npx playwright install chromium

# 2. re-capture screenshots from production  (optional — only if the UI changed)
node scripts/capture-training.mjs

# 3. render the HTML to PDF
node scripts/html-to-pdf.mjs
```

The guide is excluded from the packaged desktop app (`!docs/*` in
`electron-builder.yml`), so it never ships inside the `.exe`.

## Editing

Edit `ariemmas-pos-training-guide.html` directly — it is a single,
self-contained file with print-friendly CSS — then re-run step 3.
Keep one large screenshot (or two ≤76 mm-tall) per page so figures
don't split across pages.
