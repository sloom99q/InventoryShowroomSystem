import { expect, type Page } from '@playwright/test'
import path from 'node:path'

export const FIXTURES = path.resolve(import.meta.dirname, '../../worker/tests/fixtures')
export const ADMIN = { email: process.env.E2E_EMAIL ?? 'admin@showroom.local', password: process.env.E2E_PASSWORD ?? 'Showroom!2026' }

export async function login(page: Page) {
  await page.goto('/')
  await page.getByLabel('Email').fill(ADMIN.email)
  await page.getByLabel('Password').fill(ADMIN.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('navigation', { name: 'Main' }).or(page.getByRole('button', { name: 'Open menu' })).first()).toBeVisible()
}

/** A random VIN-shaped chassis so tests can run repeatedly against the same database. */
export function randomChassis() {
  const a = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789'
  let s = 'TST'
  for (let i = 0; i < 14; i++) s += a[Math.floor(Math.random() * a.length)]
  return s.slice(0, 11) + String(Math.floor(Math.random() * 900000) + 100000)
}
