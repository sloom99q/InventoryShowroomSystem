// Rebuild v3, phase 0: real delete for admins (car, rows and files); the secretary adds cars by
// hand only — no "From documents", no import, no permanent delete on her screens.
import { expect, test } from '@playwright/test'
import path from 'node:path'
import { addCarByHand, FIXTURES, importInto, login, loginSecretary } from './helpers'

test('an admin deletes a car permanently: its rows and its stored files are gone', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  const url = await addCarByHand(page, { brand: 'Valtren', model: 'Orisa X5', year: '2024' })
  const id = url.split('/').pop()!
  await page.goto(`${url}?tab=photos`)
  await page.getByRole('button', { name: 'Add' }).first().click()
  await page.getByRole('dialog').locator('input[type=file]').first().setInputFiles(path.join(FIXTURES, 'd_listing_card.png'))
  await page.getByRole('dialog').getByRole('button', { name: 'Upload' }).click()
  await expect(page.getByRole('dialog')).toBeHidden({ timeout: 20_000 })
  await importInto(page, url, [path.resolve(import.meta.dirname, 'fixtures/hidden-photo.pdf')])

  const files = await page.evaluate(async (id) => {
    const { supabase } = await import('/src/lib/supabase.ts')
    const { data: imgs } = await supabase.from('vehicle_images').select('storage_path, thumbnail_path').eq('vehicle_id', id)
    const { data: docs } = await supabase.from('documents').select('storage_path').eq('vehicle_id', id)
    return [...(imgs ?? []).flatMap((i) => [i.storage_path, i.thumbnail_path]), ...(docs ?? []).map((d) => d.storage_path)].filter(Boolean) as string[]
  }, id)
  expect(files.length).toBeGreaterThanOrEqual(3)

  await page.goto(url)
  const chassis = (await page.locator('.vin').first().innerText()).trim()
  await page.getByRole('button', { name: 'More' }).click()
  await page.getByRole('menuitem', { name: 'Delete permanently…' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText(chassis)
  const go = dialog.getByRole('button', { name: 'Delete permanently' })
  await expect(go).toBeDisabled()
  await dialog.getByRole('textbox').fill('000000')
  await expect(go).toBeDisabled()
  await dialog.getByRole('textbox').fill(chassis.slice(-6).toLowerCase())
  await page.screenshot({ path: path.resolve(import.meta.dirname, '../../verify-out/18-delete-dialog.png') })
  await go.click()
  await page.waitForURL(/\/vehicles$/)
  await expect(page.getByText(`Deleted ${chassis} and all its files`)).toBeVisible()

  const left = await page.evaluate(async ([id, files]) => {
    const { supabase } = await import('/src/lib/supabase.ts')
    const { count } = await supabase.from('vehicles').select('id', { count: 'exact', head: true }).eq('id', id)
    let stillStored = 0
    for (const f of files) if (!(await supabase.storage.from('vehicle-files').download(f)).error) stillStored++
    return { rows: count, stillStored }
  }, [id, files] as const)
  expect(left).toEqual({ rows: 0, stillStored: 0 })
})

test('the secretary adds cars by hand only: no documents import, no permanent delete', async ({ page }) => {
  await loginSecretary(page)
  await page.goto('/vehicles/new')
  await expect(page.getByPlaceholder('LVVDB21B9PD012345')).toBeVisible()
  await expect(page.getByText('From documents')).toHaveCount(0)
  await expect(page.getByText('Drop files here, or click to choose')).toHaveCount(0)

  const url = await addCarByHand(page, { brand: 'Northwind', model: 'Tarsel' })
  await page.getByRole('button', { name: 'More' }).click()
  await expect(page.getByRole('menuitem', { name: 'Archive' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'Import from file…' })).toHaveCount(0)
  await expect(page.getByRole('menuitem', { name: 'Delete permanently…' })).toHaveCount(0)
  await page.goto(`${url}/import`)
  await expect(page.getByText('Drop files here, or click to choose')).toHaveCount(0)

  // The database refuses too, whatever the screen shows.
  const err = await page.evaluate(async (id) => {
    const { supabase } = await import('/src/lib/supabase.ts')
    const { error } = await supabase.rpc('delete_vehicle_permanently', { p_vehicle_id: id, p_confirm: 'xxxxxx' })
    return error?.code
  }, url.split('/').pop()!)
  expect(err).toBe('42501')
})
