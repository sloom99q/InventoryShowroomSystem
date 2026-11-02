import { afterEach, expect, it, vi } from 'vitest'
import { uuid } from './uuid'

afterEach(() => vi.unstubAllGlobals())

it('works without crypto.randomUUID (plain http on the showroom Wi-Fi)', () => {
  const real = globalThis.crypto
  vi.stubGlobal('crypto', { getRandomValues: (a: Uint8Array) => real.getRandomValues(a as never) })
  expect(typeof crypto.randomUUID).toBe('undefined')
  const ids = new Set(Array.from({ length: 200 }, () => uuid()))
  expect(ids.size).toBe(200)
  for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
})
