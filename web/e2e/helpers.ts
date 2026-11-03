import { expect, type Page } from '@playwright/test'
import path from 'node:path'

export const FIXTURES = path.resolve(import.meta.dirname, '../../worker/tests/fixtures')
export const ADMIN = { email: process.env.E2E_EMAIL ?? 'admin@showroom.local', password: process.env.E2E_PASSWORD ?? 'Showroom!2026' }

export async function login(page: Page) {
  await page.goto('/')
  await page.locator('input[type=email]').fill(ADMIN.email)
  await page.locator('input[type=password]').fill(ADMIN.password)
  await page.locator('button[type=submit]').click()
  await expect(page.locator('main')).toBeVisible()
  // Tests are written against the English UI; reset the account's language if a previous run left it in Arabic.
  if ((await page.locator('html').getAttribute('lang')) !== 'en') {
    const menu = page.locator('header button').first()
    if (!(await page.locator('aside button[lang=en]').first().isVisible())) await menu.click()
    await page.locator('aside button[lang=en]').last().click()
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  }
}

/** A random VIN-shaped chassis so tests can run repeatedly against the same database. */
export function randomChassis() {
  const a = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789'
  let s = 'TST'
  for (let i = 0; i < 14; i++) s += a[Math.floor(Math.random() * a.length)]
  return s.slice(0, 11) + String(Math.floor(Math.random() * 900000) + 100000)
}

export const SECRETARY = { email: 'e2e-secretary@showroom.local', password: 'Secretary!2026x' }

/** Log in as any role (the account is created once through Staff & access by the admin). */
export async function loginAs(page: Page, role: 'secretary' | 'sales_manager' | 'technician') {
  if (role === 'secretary') return loginSecretary(page)
  const acc = { email: `e2e-${role.replace('_', '-')}@showroom.local`, password: 'E2eRole!2026x', full_name: role === 'technician' ? 'Ravi Tech' : 'Khalid Manager' }
  await login(page)
  await page.evaluate(async ({ acc, role }) => {
    const { supabase } = await import('/src/lib/supabase.ts')
    await supabase.functions.invoke('manage-staff', { body: { ...acc, role } })
  }, { acc, role })
  await page.evaluate(async () => { const { supabase } = await import('/src/lib/supabase.ts'); await supabase.auth.signOut() })
  await page.goto('/')
  await page.locator('input[type=email]').fill(acc.email)
  await page.locator('input[type=password]').fill(acc.password)
  await page.locator('button[type=submit]').click()
  await expect(page.locator('main')).toBeVisible()
  if ((await page.locator('html').getAttribute('lang')) !== 'en') {
    await page.locator('aside button[lang=en]').last().click()
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  }
}

/** Log in as a secretary (created once through Staff & access by the admin). */
export async function loginSecretary(page: Page) {
  await login(page)
  await page.evaluate(async (s) => {
    const { supabase } = await import('/src/lib/supabase.ts')
    await supabase.functions.invoke('manage-staff', { body: { ...s, full_name: 'E2E Secretary', role: 'secretary' } })
  }, SECRETARY)
  await page.evaluate(async () => { const { supabase } = await import('/src/lib/supabase.ts'); await supabase.auth.signOut() })
  await page.goto('/')
  await page.locator('input[type=email]').fill(SECRETARY.email)
  await page.locator('input[type=password]').fill(SECRETARY.password)
  await page.locator('button[type=submit]').click()
  await expect(page.locator('main')).toBeVisible()
}

/** Add a car with the 5-step Add car (photos skipped unless given). Returns its URL. */
export async function addCarByHand(page: Page, car: { brand?: string; model?: string; year?: string; chassis?: string; photos?: string[] } = {}) {
  await page.goto('/vehicles/new')
  await page.locator('#chassis-input').fill(car.chassis ?? randomChassis())
  await expect(page.getByText('Not in the system yet')).toBeVisible()
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByLabel('Brand').fill(car.brand ?? 'Valtren')
  await page.getByLabel('Model').fill(car.model ?? 'Orisa X5')
  if (car.year) await page.getByLabel('Year').selectOption(car.year)
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: 'Save car' }).click()
  await expect(page.getByRole('heading', { name: 'Arrival photos' })).toBeVisible()
  if (car.photos?.length) {
    await page.getByTestId('photo-input').setInputFiles(car.photos)
    await expect(page.locator('[data-photo-state=done]')).toHaveCount(car.photos.length, { timeout: 60_000 })
    await page.getByRole('button', { name: 'Continue' }).click()
  } else {
    await page.getByRole('button', { name: 'Skip' }).click()
  }
  await expect(page.getByRole('heading', { name: 'Car added' })).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: 'Open the car' }).click()
  await page.waitForURL(/\/vehicles\/[0-9a-f-]{36}$/)
  return page.url().replace(/\?.*$/, '')
}

/** Create a car straight in the database (for tests that need an incomplete car). */
export async function insertCar(page: Page, fields: Record<string, unknown>) {
  const id = await page.evaluate(async (f) => {
    const { supabase } = await import('/src/lib/supabase.ts')
    const { data, error } = await supabase.from('vehicles').insert(f as never).select('id').single()
    if (error) throw new Error(error.message)
    return data.id as string
  }, { chassis_number: randomChassis(), ...fields })
  return `/vehicles/${id}`
}

/** Import files into an existing car (admin: car ⋯ menu → Import from file…), resolving any choice with its first option. */
export async function importInto(page: Page, carUrl: string, files: string[]) {
  await page.goto(carUrl)
  await page.getByRole('button', { name: 'More actions' }).click()
  await page.getByRole('menuitem', { name: 'Import from file…' }).click()
  await expect(page.getByText('Drop files here, or click to choose')).toBeVisible()
  await page.locator('input[type=file][multiple][accept*=".docx"]').setInputFiles(files)
  await expect(page.getByText(/details found|picture/).first()).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('Still reading files')).toHaveCount(0, { timeout: 90_000 })
  for (const f of ['brand', 'model', 'year']) {
    const radios = page.locator(`fieldset[data-field=${f}] input[type=radio]:not([disabled])`)
    if ((await radios.count()) > 2) await radios.first().check()
  }
  for (const fs of await page.locator('fieldset').all()) {
    if (await fs.getByText('Choose one').isVisible()) await fs.locator('input[type=radio]:not([disabled])').first().check()
  }
  await expect(page.getByRole('button', { name: 'Save to vehicle' })).toBeEnabled({ timeout: 30_000 }).catch(async (e) => {
    throw new Error(`${e.message}\nBlocked by: ${await page.locator('div.fixed.bottom-0 p').first().innerText()}`)
  })
  await page.getByRole('button', { name: 'Save to vehicle' }).click()
  await page.waitForURL(new RegExp(`${carUrl.replace(/.*\/vehicles\//, '/vehicles/')}$`), { timeout: 30_000 })
  return carUrl
}

/** The fictional test car: added by hand, then its four documents imported (admin). Returns its URL. */
export async function importFictionalCar(page: Page, extraFiles: string[] = []) {
  const FX = path.resolve(import.meta.dirname, 'fixtures')
  const url = await addCarByHand(page)
  return importInto(page, url, [...['a-brochure-bilingual.pdf', 'b-spec-table.pdf', 'c-summary.docx', 'd-spec-sheet.xlsx'].map((f) => path.join(FX, f)), ...extraFiles])
}

/** Add photos on the car page (Photos tab), waiting until they show. */
export async function uploadPhotos(page: Page, carUrl: string, files: string[]) {
  await page.goto(`${carUrl}?tab=photos`)
  const before = await page.locator('[data-photo-id]').count()
  await page.getByTestId('photos-upload').setInputFiles(files)
  await expect(page.locator('[data-photo-id]')).toHaveCount(before + files.length, { timeout: 30_000 })
}
