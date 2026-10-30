// The two sales documents, rendered by the app's in-browser Typst renderer from
// the kit's fictional sample car, must match kit/reference within ±2 pt
// (kit/compare.py). Also checks that layout problems are reported.
import { expect, test, type Page } from '@playwright/test'
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const KIT = path.resolve(import.meta.dirname, '../../kit')
const OUT = path.resolve(import.meta.dirname, 'docs-out')
const PY = path.resolve(import.meta.dirname, '../../worker/.venv/bin/python')

type Problems = { code: string; slide?: number }[]
type Result = { pdf: string; pages: number; problems: Problems }

/** Sample data with its images mapped to virtual paths, plus those files (base64). */
function sample() {
  const data = JSON.parse(readFileSync(path.join(KIT, 'sample/sample-data.json'), 'utf8'))
  const files: Record<string, string> = {}
  const add = (src: string, virtual: string) => { files[virtual] = readFileSync(src).toString('base64'); return virtual }
  data.company.banner = add(path.join(KIT, 'assets/spec-header-banner.jpg'), '/assets/banner.jpg')
  data.company.watermark = add(path.join(KIT, 'assets/watermark-logo.png'), '/assets/watermark.png')
  data.photos.cover = add(path.join(KIT, 'sample', data.photos.cover), '/photos/cover.jpg')
  data.photos.pages = data.photos.pages.map((p: string, i: number) => add(path.join(KIT, 'sample', p), `/photos/${i + 1}.jpg`))
  return { data, files }
}

async function render(page: Page, kind: 'spec' | 'brochure', data: unknown, files: Record<string, string>): Promise<Result> {
  return page.evaluate(async ({ kind, data, files }) => {
    const m = await import('/src/docs/render.ts')
    const bin = Object.fromEntries(Object.entries(files).map(([k, b64]) => [k, Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))]))
    const r = kind === 'spec' ? await m.renderSpecSheet(data as never, bin) : await m.renderBrochure(data as never, bin)
    let s = ''
    for (let i = 0; i < r.pdf.length; i += 0x8000) s += String.fromCharCode(...r.pdf.subarray(i, i + 0x8000))
    return { pdf: btoa(s), pages: r.pages, problems: r.problems }
  }, { kind, data, files })
}

function compare(ref: string, mine: string) {
  const r = spawnSync(PY, [path.join(KIT, 'compare.py'), path.join(KIT, 'reference', ref), mine], { encoding: 'utf8' })
  return { ok: r.status === 0, out: (r.stdout + r.stderr).trim() }
}

test.beforeAll(() => mkdirSync(OUT, { recursive: true }))

test('sample car: both documents match the kit reference (compare.py PASS)', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto('/')
  const { data, files } = sample()

  const spec = await render(page, 'spec', data, files)
  writeFileSync(path.join(OUT, 'spec-sheet.pdf'), Buffer.from(spec.pdf, 'base64'))
  expect(spec.pages).toBe(1)
  expect(spec.problems).toEqual([])
  const cs = compare('spec-sheet.pdf', path.join(OUT, 'spec-sheet.pdf'))
  console.log('spec-sheet:', cs.out)
  expect(cs.out).toBe('PASS')

  const br = await render(page, 'brochure', data, files)
  writeFileSync(path.join(OUT, 'brochure.pdf'), Buffer.from(br.pdf, 'base64'))
  expect(br.pages).toBe(8)
  expect(br.problems).toEqual([])
  const cb = compare('brochure.pdf', path.join(OUT, 'brochure.pdf'))
  console.log('brochure:', cb.out)
  expect(cb.out).toBe('PASS')
})

test('layout problems are reported, long names shrink to one line', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto('/')
  const { data, files } = sample()
  const long = structuredClone(data)
  long.identity.brand = 'VALTREN EXTRAORDINARILY LONG COACHBUILT'
  long.identity.model = 'ORISA X5 GRAND TOURING EXECUTIVE EDITION'
  // Far too many bullets for one slide, and far too much text for one page.
  long.lists.smart_features = Array.from({ length: 40 }, (_, i) => ({ en: `Assistance feature number ${i + 1}`, ar: `ميزة مساعدة رقم ${i + 1}` }))
  long.company.disclaimer = Array.from({ length: 60 }, () => 'Specifications are indicative and may vary by version.').join(' ')

  const spec = await render(page, 'spec', long, files)
  writeFileSync(path.join(OUT, 'spec-sheet-long.pdf'), Buffer.from(spec.pdf, 'base64'))
  expect(spec.problems).toContainEqual({ code: 'specsheet_overflow' })

  const br = await render(page, 'brochure', long, files)
  writeFileSync(path.join(OUT, 'brochure-long.pdf'), Buffer.from(br.pdf, 'base64'))
  expect(br.problems).toContainEqual({ code: 'brochure_slide_overflow', slide: 2 })

  // The overlong title still sits on one line (it was shrunk, not wrapped).
  const t = spawnSync(PY, ['-c', `import pymupdf as f; d=f.open(${JSON.stringify(path.join(OUT, 'brochure-long.pdf'))}); print(sum(1 for b in d[1].get_text('dict')['blocks'] for l in b.get('lines', []) if 'COACHBUILT' in ''.join(s['text'] for s in l['spans'])))`], { encoding: 'utf8' })
  expect(t.stdout.trim()).toBe('1')
  expect(readdirSync(OUT)).toContain('brochure-long.pdf')
})
