// Fill specs on a phone: one column, no preview, same self-saving cells.
import { expect, test } from '@playwright/test'
import path from 'node:path'
import { login } from './helpers'

test('Fill specs on a phone', async ({ page }) => {
  await login(page)
  const id = await page.evaluate(async () => {
    const { supabase } = await import('/src/lib/supabase.ts')
    const { data } = await supabase.from('vehicles').select('id').eq('chassis_number', 'LVTDB21B9RD012345').single()
    return data!.id as string
  })
  await page.goto(`/vehicles/${id}/specs`)
  await expect(page.locator('#fill-engine-en')).toBeVisible()
  await expect(page.getByText('Spec sheet preview')).toBeHidden()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(1)
  await page.screenshot({ path: path.resolve(import.meta.dirname, '../../verify-out/12-fill-specs-phone.png') })
})
