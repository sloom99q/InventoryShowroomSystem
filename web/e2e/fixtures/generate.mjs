// Generates import fixtures for a FICTIONAL vehicle ("Valtren Orisa X5", model
// year 2024). Nothing here describes a real car, and no value from these files
// may appear in engine code.
//
//   cd web && node e2e/fixtures/generate.mjs
//
// Needs Playwright's Chromium (`npx playwright install chromium`). PDFs are
// printed by Chromium from HTML so Arabic shaping and text layers are real.
import { chromium } from '@playwright/test'
import { zipSync, strToU8 } from 'fflate'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as XLSX from 'xlsx'

const OUT = dirname(fileURLToPath(import.meta.url))
const out = (n) => join(OUT, n)

const CAR_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="700" viewBox="0 0 1200 700">
  <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfd8e3"/><stop offset="1" stop-color="#f4f6f8"/></linearGradient>
  <linearGradient id="body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b6fb6"/><stop offset="1" stop-color="#1d3f72"/></linearGradient></defs>
  <rect width="1200" height="700" fill="url(#sky)"/>
  <rect y="520" width="1200" height="180" fill="#9aa3ad"/>
  <path d="M170 470 Q190 380 330 360 L470 270 Q560 230 700 235 L860 245 Q960 260 1030 360 Q1090 380 1080 470 Z" fill="url(#body)"/>
  <path d="M480 290 Q560 255 690 258 L700 360 L420 360 Z" fill="#a9c6e8"/>
  <path d="M720 260 L850 268 Q910 290 960 360 L730 360 Z" fill="#a9c6e8"/>
  <circle cx="340" cy="480" r="80" fill="#1b1d21"/><circle cx="340" cy="480" r="38" fill="#b9c0c8"/>
  <circle cx="900" cy="480" r="80" fill="#1b1d21"/><circle cx="900" cy="480" r="38" fill="#b9c0c8"/>
  <rect x="1020" y="390" width="50" height="18" rx="6" fill="#ffe08a"/>
</svg>`

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage()

  // Car picture as PNG.
  await page.setContent(`<body style="margin:0">${CAR_SVG}</body>`)
  const carPng = await page.locator('svg').screenshot({ type: 'png' })
  writeFileSync(out('car-photo.png'), carPng)
  const carData = `data:image/png;base64,${carPng.toString('base64')}`

  // (a) Bilingual two-column brochure: English left, Arabic right. No chassis.
  // Document date is 2023; the model year is 2024. Page 2 is a picture only.
  const brochure = `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 18mm }
    body { font-family: Arial, sans-serif; font-size: 12px; color: #111 }
    h1 { font-size: 26px; margin: 0 0 4px } .date { font-size: 11px; color: #555 }
    .cols { display: flex; gap: 70px; margin-top: 16px }
    .col { flex: 1 } .ar { direction: rtl; text-align: right }
    h2 { font-size: 15px; margin: 14px 0 6px } ul { margin: 0; padding-inline-start: 18px } li { margin: 3px 0 }
    .hero { width: 100%; height: auto; margin-top: 10px }
    .photo-page { page-break-before: always; } .photo-page img { width: 100% }
  </style></head><body>
    <h1>Valtren Orisa X5 2024</h1>
    <div class="date">Date: 14/03/2023</div>
    <img class="hero" src="${carData}">
    <div class="cols">
      <div class="col">
        <h2>Powertrain</h2>
        <ul><li>Motor power: 310 kW</li><li>Battery capacity: 82 kWh</li><li>Range: 540 km</li><li>Acceleration 0-100 km/h: 4.6 s</li></ul>
        <h2>Exterior</h2>
        <ul><li>Exterior colour: Glacier Teal</li><li>Wheels: 21 inch</li><li>Panoramic glass roof</li></ul>
        <h2>Pricing</h2>
        <ul><li>Price: AED 189,900</li></ul>
      </div>
      <div class="col ar">
        <h2>نظام الدفع</h2>
        <ul><li>قوة المحرك: 310 kW</li><li>سعة البطارية: 82 kWh</li><li>المدى: 540 كم</li><li>التسارع 0-100 كم/س: 4.6 ث</li></ul>
        <h2>الشكل الخارجي</h2>
        <ul><li>اللون الخارجي: أزرق جليدي</li><li>الجنوط: 21 inch</li><li>سقف زجاجي بانورامي</li></ul>
        <h2>السعر</h2>
        <ul><li>السعر: 189,900 درهم</li></ul>
      </div>
    </div>
    <div class="photo-page"><img src="${carData}"></div>
  </body></html>`
  await page.setContent(brochure, { waitUntil: 'load' })
  writeFileSync(out('a-brochure-bilingual.pdf'), await page.pdf({ format: 'A4', printBackground: true }))

  // (b) Word-style spec table: label | value | Arabic label. Range conflicts with (a).
  const rows = [
    ['Trim', 'Signature AWD', 'الفئة'],
    ['Model year', '2024', 'سنة الموديل'],
    ['Range', '525 km', 'المدى'],
    ['Interior colour', 'Sand Beige', 'اللون الداخلي'],
    ['Seats', '5', 'المقاعد'],
    ['Length', '4,860 mm', 'الطول'],
    ['Kerb weight', '2,140 kg', 'الوزن الفارغ'],
  ]
  const table = `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 20mm } body { font-family: 'Times New Roman', serif; font-size: 13px }
    h1 { font-size: 20px } h2 { font-size: 15px; margin-top: 18px }
    table { border-collapse: collapse; width: 100% } td { border: 1px solid #888; padding: 6px 10px }
    td.ar { direction: rtl; text-align: right }
  </style></head><body>
    <h1>Technical Specifications</h1>
    <h2>Vehicle details</h2>
    <table>${rows.map(([l, v, a]) => `<tr><td>${l}</td><td>${v}</td><td class="ar">${a}</td></tr>`).join('')}</table>
  </body></html>`
  await page.setContent(table, { waitUntil: 'load' })
  writeFileSync(out('b-spec-table.pdf'), await page.pdf({ format: 'A4' }))
  await browser.close()

  // (c) DOCX built by hand: title, labelled paragraphs (some Arabic), a table, an image.
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const para = (text, style) =>
    `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}<w:r><w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`
  const rtlPara = (text) => `<w:p><w:pPr><w:bidi/></w:pPr><w:r><w:rPr><w:rtl/></w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`
  const cell = (t) => `<w:tc><w:p><w:r><w:t xml:space="preserve">${esc(t)}</w:t></w:r></w:p></w:tc>`
  const docTable = (rs) => `<w:tbl>${rs.map((r) => `<w:tr>${r.map(cell).join('')}</w:tr>`).join('')}</w:tbl>`
  const image = `<w:p><w:r><w:drawing><wp:inline><wp:extent cx="3600000" cy="2100000"/><wp:docPr id="1" name="Car"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="1" name="car.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdImg1"/></pic:blipFill><pic:spPr/></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`
  const body = [
    para('Valtren Orisa X5 Signature', 'Title'),
    para('Vehicle summary', 'Heading1'),
    para('Model year: 2024'),
    para('Interior colour: Sand Beige'),
    rtlPara('اللون الخارجي: أزرق جليدي'),
    rtlPara('الممشى: 12 كم'),
    para('Charging', 'Heading1'),
    docTable([['DC fast charging', '150 kW'], ['AC charging', '11 kW'], ['Charge port', 'CCS2']]),
    para('Comfort features', 'Heading1'),
    para('• Heated front seats'),
    para('• Wireless phone charger'),
    image,
  ].join('')
  const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"'
  const docx = zipSync({
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`),
    'word/_rels/document.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdImg1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/></Relationships>`),
    'word/document.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${body}<w:sectPr/></w:body></w:document>`),
    'word/media/image1.png': new Uint8Array(carPng),
  })
  writeFileSync(out('c-summary.docx'), docx)

  // (d) Key/value spec sheet (one car).
  const spec = XLSX.utils.aoa_to_sheet([
    ['Specifications'],
    ['Brand', 'Valtren'],
    ['Model', 'Orisa X5'],
    ['Trim', 'Signature AWD'],
    ['Exterior colour', 'Glacier Teal', 'اللون الخارجي'],
    ['Range', '540 km', 'المدى'],
    ['Ground clearance', '185 mm'],
    ['Safety'],
    ['Airbags', '8'],
    ['Adaptive cruise control', 'Yes'],
  ])
  const wb1 = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb1, spec, 'Spec')
  writeFileSync(out('d-spec-sheet.xlsx'), XLSX.write(wb1, { type: 'buffer', bookType: 'xlsx' }))

  // (e) Inventory list: several vehicles, one per row (should go to bulk import).
  const inv = XLSX.utils.aoa_to_sheet([
    ['Chassis number', 'Brand', 'Model', 'Year', 'Colour', 'Status'],
    ['VLT0RX5A1RT000101', 'Valtren', 'Orisa X5', 2024, 'Glacier Teal', 'In stock'],
    ['VLT0RX5A1RT000102', 'Valtren', 'Orisa X5', 2024, 'Onyx', 'Reserved'],
    ['VLT0RX3A1RT000103', 'Valtren', 'Orisa X3', 2023, 'Pearl', 'In stock'],
    ['VLT0RX3A1RT000104', 'Valtren', 'Orisa X3', 2023, 'Sand', 'Sold'],
  ])
  const wb2 = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb2, inv, 'Stock')
  writeFileSync(out('e-inventory.xlsx'), XLSX.write(wb2, { type: 'buffer', bookType: 'xlsx' }))

  console.log('fixtures written to', OUT)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
