// Section 6 in the RUNNING app: import the showroom's own spec sheet through
// Add vehicle → From documents, export it (document date from the expected file,
// fallback banner because an imported spec sheet has no photos), and compare the
// download with the original. Also screenshots the review screen for both real
// files together (not saved). Test inputs come from kit/real-fixtures only.
//
//   node scripts/verify-real-import.mjs [outDir]
import { chromium } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

const out = path.resolve(process.argv[2] ?? 'verify-out')
mkdirSync(out, { recursive: true })
const FX = path.resolve('../kit/real-fixtures')
const specPdf = path.join(FX, '14_VOYAH_FREE_Spec_Sheet.pdf')
const brochurePdf = path.join(FX, 'VOYAH_FREE.pdf')
const docDate = JSON.parse(readFileSync(path.join(FX, 'spec-sheet.expected.json'), 'utf8')).doc_date
const app = process.env.APP_URL ?? 'http://127.0.0.1:5173'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })

await page.goto(app)
await page.locator('input[type=email]').fill(process.env.EMAIL ?? 'admin@showroom.local')
await page.locator('input[type=password]').fill(process.env.PASSWORD ?? 'Showroom!2026')
await page.locator('button[type=submit]').click()
await page.locator('main').waitFor()

const fileInput = () => page.locator('input[type=file][multiple][accept*=".docx"]')

// 1) Both real files together: review screen with conflicts (not saved).
await page.goto(`${app}/vehicles/new?mode=documents`)
await page.getByText('Drop files here, or click to choose').waitFor()
await fileInput().setInputFiles([specPdf, brochurePdf])
await page.getByText(/details found/).nth(1).waitFor({ timeout: 120_000 })
await page.locator('[data-photo]').first().waitFor({ timeout: 120_000 })
await page.waitForTimeout(1500)
await page.screenshot({ path: path.join(out, '4-import-review-both-real-files.png'), fullPage: true })

// 2) Real spec sheet alone → new car → export → compare with the original.
await page.goto(`${app}/vehicles/new?mode=documents`)
await page.getByText('Drop files here, or click to choose').waitFor()
await fileInput().setInputFiles(specPdf)
await page.getByText(/details found/).first().waitFor({ timeout: 60_000 })
const chassis = page.locator('fieldset[data-field=chassis_number]')
await chassis.getByText('Type a value').click()
await chassis.getByPlaceholder('LVVDB21B9PD012345').fill(`TSTREAL${Date.now().toString().slice(-10)}`)
await page.getByRole('button', { name: 'Create vehicle and save' }).click()
await page.waitForURL(/\/vehicles\/[0-9a-f-]{36}$/, { timeout: 60_000 })
await page.getByText('ENGINE & PERFORMANCE').first().waitFor()
await page.waitForLoadState('networkidle')
await page.screenshot({ path: path.join(out, '5-car-page-from-real-spec-sheet.png'), fullPage: true })

await page.getByRole('link', { name: /Spec sheet & brochure/ }).first().click()
await page.locator('#doc-date').fill(docDate)
await page.waitForTimeout(1200)
await page.locator('img[data-page]').first().waitFor({ timeout: 60_000 })
const button = page.getByRole('button', { name: 'Export PDF' })
for (let i = 0; i < 60 && !(await button.isEnabled()); i++) await page.waitForTimeout(500)
await page.waitForTimeout(1500)
const dl = page.waitForEvent('download')
await button.click()
const file = path.join(out, 'exported-real-spec-sheet.pdf')
await (await dl).saveAs(file)
await browser.close()

let result
try { result = execFileSync(path.resolve('../worker/.venv/bin/python'), ['../kit/compare.py', specPdf, file], { encoding: 'utf8' }) } catch (e) { result = e.stdout }
console.log(`real spec sheet round trip: ${result.trim()}`)
