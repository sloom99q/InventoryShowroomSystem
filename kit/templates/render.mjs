// Usage: node render.mjs <data.json> <outDir>
// Renders spec-sheet.pdf and brochure.pdf with headless Chromium (Playwright).
// Also checks: spec sheet fits on one page; no brochure spec slide overflows.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { specSheetHTML, brochureHTML } from './templates.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const kit = path.resolve(here, '..');
const [dataPath, outDir = 'out'] = process.argv.slice(2);
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const fields = JSON.parse(fs.readFileSync(path.join(kit, 'fields.json'), 'utf8'));
const rel = (p) => (p ? pathToFileURL(path.resolve(path.dirname(dataPath), p)).href : p);
if (data.company) for (const k of ['banner', 'watermark']) data.company[k] = rel(data.company[k]);
if (data.photos) { data.photos.cover = rel(data.photos.cover); data.photos.pages = (data.photos.pages || []).map(rel); }
fs.mkdirSync(outDir, { recursive: true });
const opts = { assetBase: pathToFileURL(kit).href + '/' };

const browser = await chromium.launch();
const page = await browser.newPage();
const problems = [];

async function render(html, file, check) {
  const tmp = path.join(outDir, file.replace('.pdf', '.html'));
  fs.writeFileSync(tmp, html);
  await page.goto(pathToFileURL(path.resolve(tmp)).href, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  if (check) problems.push(...(await page.evaluate(check)));
  await page.pdf({ path: path.join(outDir, file), preferCSSPageSize: true, printBackground: true });
}

await render(specSheetHTML(data, fields, opts), 'spec-sheet.pdf', () => {
  const w = document.querySelector('.wrap').getBoundingClientRect();
  return w.bottom > 841.92 * 96 / 72 - 20 ? ['Spec sheet is longer than one page'] : [];
});
await render(brochureHTML(data, fields, opts), 'brochure.pdf', () =>
  [...document.querySelectorAll('.slide.spec')].flatMap((s, i) => {
    const b = s.getBoundingClientRect().bottom;
    return [...s.querySelectorAll('.en,.ar')].some((c) => c.getBoundingClientRect().bottom > b - 8)
      ? [`Brochure spec slide ${i + 1} overflows — move a section to a new slide or shorten text`] : [];
  }));
await browser.close();
console.log(problems.length ? 'PROBLEMS:\n- ' + problems.join('\n- ') : 'OK: both documents rendered, nothing overflows');
