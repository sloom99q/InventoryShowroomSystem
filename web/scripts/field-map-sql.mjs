// Prints SQL rows (normalised label → field key) for mapping old spec rows onto
// the fixed fields. Used to write the migration; rerun if fields.json changes.
import { readFileSync } from 'node:fs'
const f = JSON.parse(readFileSync(new URL('../src/lib/fields/fields.json', import.meta.url)))
const syn = JSON.parse(readFileSync(new URL('../src/lib/fields/synonyms.json', import.meta.url)))
const norm = (s) => s.normalize('NFKC').toLowerCase().replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
  .replace(/[ً-ْـ]/g, '').replace(/\([^)]*\)/g, ' ').replace(/[–—]/g, '-').replace(/[^\p{L}\p{N}×]+/gu, ' ').replace(/\s+/g, ' ').trim()
const m = new Map()
const all = [...f.identity, ...f.sections.flatMap((s) => s.fields ?? [])]
for (const x of all) { m.set(norm(x.label_en), x.key); m.set(norm(x.label_ar), x.key) }
for (const r of f.spec_sheet_rows) { for (const l of [r.label_en, r.label_ar]) if (!m.has(norm(l))) m.set(norm(l), r.value) }
for (const [k, list] of Object.entries(syn)) for (const l of list) if (!m.has(norm(l))) m.set(norm(l), k)
const lists = new Map()
for (const s of f.sections.filter((s) => s.list)) { lists.set(norm(s.title_en), s.list); lists.set(norm(s.title_ar), s.list) }
const q = (s) => `'${s.replace(/'/g, "''")}'`
console.log([...m].map(([l, k]) => `(${q(l)}, ${q(k)}, false)`).concat([...lists].map(([l, k]) => `(${q(l)}, ${q(k)}, true)`)).join(',\n'))
