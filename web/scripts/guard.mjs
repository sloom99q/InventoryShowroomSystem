// Keeps development scripts and tests away from the pilot instance (real data).
// The pilot's ports come from pilot/supabase/config.toml. Imported by every
// seed/bootstrap/verify script and by playwright.config.ts.
import { existsSync, readFileSync } from 'node:fs'

const PILOT_CONFIG = new URL('../../pilot/supabase/config.toml', import.meta.url)

export function pilotPorts() {
  if (!existsSync(PILOT_CONFIG)) return []
  const toml = readFileSync(PILOT_CONFIG, 'utf8')
  return [...toml.matchAll(/^\s*(?:port|shadow_port)\s*=\s*(\d+)/gm)].map((m) => Number(m[1]))
}

/** Throws if `url` points at the pilot instance (its API or DB port, or the pilot app port). */
export function refusePilot(url, what = 'This script') {
  if (!url) return
  let port
  try { port = Number(new URL(url).port) } catch { return }
  const blocked = new Set([...pilotPorts(), 5180])
  if (blocked.has(port)) {
    throw new Error(`${what} refuses to run against the PILOT instance (${url}). The pilot holds real data; use the dev instance (127.0.0.1:54321).`)
  }
}
