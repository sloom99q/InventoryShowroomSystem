// Open the sample car in the RUNNING app (npm run dev), screenshot the car page
// and the inspection page, click Export for both documents, and check the
// downloaded PDFs with kit/compare.py.
//
//   node scripts/verify-sample-export.mjs [outDir]
import { chromium } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

const out = path.resolve(process.argv[2] ?? 'verify-out')
mkdirSync(out, { recursive: true })
const app = process.env.APP_URL ?? 'http://127.0.0.1:5173'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 })

await page.goto(app)
await page.locator('input[type=email]').fill(process.env.EMAIL ?? 'admin@showroom.local')
await page.locator('input[type=password]').fill(process.env.PASSWORD ?? 'Showroom!2026')
await page.locator('button[type=submit]').click()
await page.locator('main').waitFor()

// Find the sample car through the app's own search.
await page.getByRole('combobox').fill('LVTDB21B9RD012345')
await page.getByRole('option').first().click()
await page.waitForURL(/\/vehicles\/[0-9a-f-]{36}$/)
await page.getByText('ENGINE & PERFORMANCE').first().waitFor()
await page.waitForLoadState('networkidle')
await page.screenshot({ path: path.join(out, '1-car-page.png'), fullPage: true })

async function exportDoc(kind) {
  await page.locator('img[data-page]').first().waitFor({ timeout: 60_000 })
  const button = page.getByRole('button', { name: 'Export PDF' })
  await button.waitFor()
  for (let i = 0; i < 60 && !(await button.isEnabled()); i++) await page.waitForTimeout(500)
  await page.screenshot({ path: path.join(out, kind === 'specsheet' ? '2-inspection-spec-sheet.png' : '3-inspection-brochure.png'), fullPage: true })
  const dl = page.waitForEvent('download')
  await button.click()
  const file = path.join(out, kind === 'specsheet' ? 'exported-spec-sheet.pdf' : 'exported-brochure.pdf')
  await (await dl).saveAs(file)
  await page.getByText(kind === 'specsheet' ? /Spec sheet downloaded/ : /Brochure downloaded/).waitFor({ timeout: 30_000 })
  return file
}

await page.getByRole('link', { name: /Spec sheet & brochure/ }).first().click()
const ss = await exportDoc('specsheet')
await page.getByRole('tab', { name: 'Brochure' }).click()
await page.waitForTimeout(800)
const br = await exportDoc('brochure')
await browser.close()

const py = path.resolve('../worker/.venv/bin/python')
for (const [ref, file] of [['spec-sheet.pdf', ss], ['brochure.pdf', br]]) {
  let result
  try { result = execFileSync(py, ['../kit/compare.py', `../kit/reference/${ref}`, file], { encoding: 'utf8' }) } catch (e) { result = e.stdout }
  console.log(`${ref}: ${result.trim()}`)
}
console.log(`Screenshots and PDFs in ${out}`)
