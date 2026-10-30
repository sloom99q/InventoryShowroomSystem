// Showroom document templates: Spec Sheet (A4) + Brochure (16:9).
// Pure functions: (data, fields, opts) -> complete HTML string. Render with headless Chromium
// (page.pdf with preferCSSPageSize) or the browser's print. All sizes are in pt and were
// measured from the showroom's original Word/PowerPoint PDFs.
//
// data shape: see sample-data.json. fields: fields.json.
// opts.assetBase: URL/path prefix for fonts/ (default './')

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const val = (d, key, lang = 'en') => {
  const id = d.identity || {};
  const v = (d.values || {})[key] ?? id[key];
  if (v == null) return '';
  if (typeof v === 'object') return (v[lang] ?? '').trim();
  return lang === 'en' ? String(v).trim() : '';
};
const fmtMoney = (n) => Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
const fmtDate = (iso) => {
  const d = iso ? new Date(iso + 'T12:00:00') : new Date();
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Dubai' });
};

function fontFaces(base) {
  const f = (family, file, weight = 400, style = 'normal') =>
    `@font-face{font-family:'${family}';src:url('${base}fonts/${file}');font-weight:${weight};font-style:${style};}`;
  return [
    f('DocSans', 'LiberationSans-Regular.ttf'), f('DocSans', 'LiberationSans-Bold.ttf', 700),
    f('DocSans', 'LiberationSans-Italic.ttf', 400, 'italic'),
    f('DocCal', 'Carlito-Regular.ttf'), f('DocCal', 'Carlito-Bold.ttf', 700),
    // Arabic: used automatically for Arabic characters (Latin fonts have no Arabic glyphs)
    f('DocAr', 'NotoNaskhArabic-Regular.ttf'), f('DocAr', 'NotoNaskhArabic-Bold.ttf', 700),
  ].join('\n');
}

/* ------------------------------------------------------------------ SPEC SHEET (A4) */
const CHECK = '<svg viewBox="0 0 10 10"><path d="M1 5.6 L3.8 8.6 L9 1.4" fill="none" stroke="#B3001B" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
export function specSheetHTML(data, fields, opts = {}) {
  const base = opts.assetBase ?? './';
  const id = data.identity || {};
  const c = data.company || {};
  const rows = fields.spec_sheet_rows
    .map((r) => {
      let v = val(data, r.value);
      if (r.append) { const a = val(data, r.append); if (a) v = v ? v + r.joiner + a : a; }
      return v ? { ...r, v } : null;
    })
    .filter(Boolean);
  const kf = (data.lists?.key_features || []).filter(Boolean).slice(0, fields.key_features.max);
  const half = Math.ceil(kf.length / 2); // column-major, like the original
  const kfCols = [kf.slice(0, half), kf.slice(half)];
  const name = [id.brand, id.model].filter(Boolean).join(' ');
  const sub = [id.description, id.trim].filter(Boolean).join(' · ');
  const hasPrice = id.listing_price != null && id.listing_price !== '';
  const cur = id.currency || 'AED';

  return `<!doctype html><html><head><meta charset="utf-8"><style>
${fontFaces(base)}
@page{size:595.32pt 841.92pt;margin:0}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:595.32pt;height:841.92pt}
body{font-family:'DocSans','DocAr',sans-serif;color:#000;-webkit-print-color-adjust:exact;print-color-adjust:exact;position:relative;overflow:hidden}
.banner{position:absolute;top:11.5pt;left:0;width:595.32pt;height:114pt;object-fit:cover;display:block}
.wrap{position:absolute;top:133.3pt;left:42.5pt;width:510.5pt}
.topline{display:flex;justify-content:space-between;font-size:9pt;line-height:13pt}
.kicker{font-weight:700;color:#555;letter-spacing:3pt}
.title{margin-top:6.2pt;text-align:center;font-weight:700;font-size:32.04pt;line-height:36.5pt;color:#B3001B;white-space:nowrap}
.title .yr{color:#000}
.sub{text-align:center;font-size:11.04pt;line-height:12.5pt;color:#333}
.price{margin-top:9.6pt;height:38.7pt;display:flex}
.price .l{width:150pt;background:#151515;padding:5.7pt 0 0 12pt;color:#fff}
.price .l b{display:block;font-size:14.04pt;line-height:16pt;letter-spacing:1.6pt}
.price .l span{display:block;font-size:8.04pt;line-height:9.2pt;color:#cfcfcf}
.price .r{flex:1;background:#B3001B;color:#fff;font-weight:700;font-size:24pt;text-align:right;padding:6.3pt 15pt 0 0;line-height:27pt}
.bar{height:22.9pt;color:#fff;font-weight:700;font-size:12pt;letter-spacing:3.05pt;padding:4.4pt 0 0 10.1pt;line-height:14pt}
.bar.red{background:#B3001B;margin-top:23.0pt}
.bar.dark{background:#151515;margin-top:20.3pt}
table{width:510.5pt;border-collapse:collapse;table-layout:fixed}
td{height:16.5pt;font-size:9.96pt;font-weight:700;line-height:11.4pt;padding:0;border-top:0.5pt solid #E2E2E2;vertical-align:middle}
tr:first-child td{border-top:none}
tr:last-child td{border-bottom:0.5pt solid #E2E2E2}
tr:nth-child(even) td{background:#F2F2F2}
td.k{width:124.9pt;color:#555;padding-left:10.1pt}
td.v{width:262.2pt;color:#1a1a1a;text-align:center;padding:0 6pt}
td.a{width:123.4pt;color:#1a1a1a;text-align:right;direction:rtl;padding-left:4pt}
.kf{display:flex;margin-top:7pt}
.kf ul{list-style:none;width:255.2pt}
.kf li{font-size:9.96pt;line-height:16.4pt;padding-left:21pt;position:relative;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.kf li svg{position:absolute;left:6pt;top:4.6pt;width:7.4pt;height:7.4pt}
.foot{margin-top:34.8pt;font-size:9.96pt;line-height:11.45pt}
.disc{margin-top:5.8pt;font-size:8.04pt;line-height:9.3pt;font-style:italic;color:#555}
</style></head><body>
${c.banner ? `<img class="banner" src="${esc(c.banner)}">` : ''}
<div class="wrap">
  <div class="topline"><span class="kicker">VEHICLE SPEC SHEET</span><span>Date: ${esc(fmtDate(data.doc_date))}</span></div>
  <div class="title" data-fit>${esc(name)}&nbsp; <span class="yr">${esc(id.year)}</span></div>
  ${sub ? `<div class="sub">${esc(sub)}</div>` : ''}
  ${hasPrice ? `<div class="price"><div class="l"><b>PRICE</b><span>${esc(opts.currencyName || 'UAE Dirhams')} (${esc(cur)})</span></div><div class="r">${esc(cur)} ${fmtMoney(id.listing_price)}</div></div>` : ''}
  ${rows.length ? `<div class="bar red">SPECIFICATIONS</div><table>${rows.map((r) =>
    `<tr><td class="k">${esc(r.label_en)}</td><td class="v">${esc(r.v)}</td><td class="a">${esc(r.label_ar)}</td></tr>`).join('')}</table>` : ''}
  ${kf.length ? `<div class="bar dark">KEY FEATURES</div><div class="kf">${kfCols.map((col) =>
    `<ul>${col.map((t) => `<li>${CHECK}${esc(t)}</li>`).join('')}</ul>`).join('')}</div>` : ''}
  <div class="foot">${esc(c.signature || '')}<br>${esc(c.legal_name || '')}</div>
  ${c.disclaimer ? `<div class="disc">${esc(c.disclaimer)}</div>` : ''}
</div>
<script>/* shrink long titles to fit one line */
for (const el of document.querySelectorAll('[data-fit]')) { let fs = parseFloat(getComputedStyle(el).fontSize);
  el.style.whiteSpace = 'nowrap'; el.style.overflow = 'hidden';
  while (el.scrollWidth > el.clientWidth && fs > 10) { fs -= 1; el.style.fontSize = fs + 'px'; } }</script>
</body></html>`;
}

/* ------------------------------------------------------------------ BROCHURE (16:9) */
// Builds the bilingual bullet sections. Each section -> { title_en, title_ar, en:[...], ar:[...] }
export function brochureSections(data, fields) {
  return fields.sections.map((s) => {
    const en = [], ar = [];
    for (const f of s.fields || []) {
      if (f.in_brochure === false) continue;
      const ve = val(data, f.key, 'en'), va = val(data, f.key, 'ar');
      if (ve) en.push(`${f.label_en}: ${ve}`);
      if (va) ar.push(`${f.label_ar}: ${va}`);
    }
    if (s.list) {
      const items = data.lists?.[s.list] || [];
      if (s.key === 'drive_modes') {
        const e = items.map((i) => i.en).filter(Boolean), a = items.map((i) => i.ar).filter(Boolean);
        if (e.length) en.push(e.join(' / '));
        if (a.length) ar.push(a.join(' / '));
      } else {
        for (const i of items) { if (i.en) en.push(i.en); if (i.ar) ar.push(i.ar); }
      }
    }
    return { ...s, en, ar };
  }).filter((s) => s.en.length || s.ar.length);
}

export function brochureHTML(data, fields, opts = {}) {
  const base = opts.assetBase ?? './';
  const id = data.identity || {};
  const c = data.company || {};
  const name = [id.brand, id.model].filter(Boolean).join(' ');
  const secs = brochureSections(data, fields);
  const slideNos = [...new Set(secs.map((s) => s.brochure_slide))].sort();
  const photos = data.photos || {};

  const col = (s, lang) => {
    const items = s[lang];
    const title = s.title_en; // the original uses English headings on both sides
    return `<div class="sec"><h3>${esc(title)}</h3><ul>${items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>`;
  };
  const specSlides = slideNos.map((n) => {
    const ss = secs.filter((s) => s.brochure_slide === n);
    return `<section class="slide spec">
      ${c.watermark ? `<img class="wm" src="${esc(c.watermark)}">` : ''}
      <h1 data-fit>${esc(name)} ${esc(id.year)}</h1>
      <div class="cols"><div class="en">${ss.map((s) => s.en.length ? col(s, 'en') : '').join('')}</div>
      <div class="ar" dir="rtl">${ss.map((s) => s.ar.length ? col(s, 'ar') : '').join('')}</div></div>
    </section>`;
  }).join('');

  return `<!doctype html><html><head><meta charset="utf-8"><style>
${fontFaces(base)}
@page{size:960pt 540pt;margin:0}
*{box-sizing:border-box;margin:0;padding:0}
body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
.slide{width:960pt;height:540pt;position:relative;overflow:hidden;page-break-after:always;break-after:page;background:#fff}
.slide:last-child{page-break-after:auto;break-after:auto}
.photo img,.cover img.bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.cover .t{position:absolute;left:7.2pt;top:12pt;font-family:'DocCal';font-size:54pt;line-height:64.8pt;color:${esc(c.cover_title_color || '#C5E0B4')};
  text-shadow:0 0 14pt rgba(0,0,0,.4),0 0 28pt rgba(0,0,0,.25)}
.spec{font-family:'DocCal','DocAr',sans-serif;color:#767171}
.spec .wm{position:absolute;left:64.2pt;top:16.9pt;width:810pt;height:523.1pt;object-fit:contain}
.spec h1{position:relative;text-align:center;font-weight:700;font-size:66pt;line-height:66pt;color:#7F7F7F;padding-top:49.6pt;height:109.5pt}
.spec .cols{position:relative;display:flex;justify-content:space-between;padding:1pt 54.7pt 0 41.2pt}
.spec .en{width:378pt}
.spec .ar{width:390pt;text-align:right;padding-top:3.9pt}
.spec .ar .sec{margin-bottom:11.2pt}
.spec .sec{margin-bottom:16.9pt}
.spec h3{font-size:14.04pt;line-height:14.6pt;font-weight:700}
.spec .en h3{margin-bottom:1.3pt}
.spec .en li{list-style:none;font-size:12.96pt;line-height:15.6pt;padding-left:25.6pt;position:relative}
.spec .en li:before{content:'\\2022';position:absolute;left:0;font-family:'DocSans'}
.spec .ar li{list-style:none;font-family:'DocAr','DocCal';font-size:12pt;line-height:14.4pt;padding-right:25pt;position:relative}
.spec .ar li:before{content:'\\2022';position:absolute;right:0;font-family:'DocSans'}
.spec .ar h3{margin-bottom:6pt}
</style></head><body>
<section class="slide cover">
  ${photos.cover ? `<img class="bg" src="${esc(photos.cover)}">` : ''}
  <div class="t">${esc(name)}<br>${esc(id.year)}</div>
</section>
${specSlides}
${(photos.pages || []).map((p) => `<section class="slide photo"><img src="${esc(p)}"></section>`).join('')}
<script>/* shrink long titles to fit one line */
for (const el of document.querySelectorAll('[data-fit]')) { let fs = parseFloat(getComputedStyle(el).fontSize);
  el.style.whiteSpace = 'nowrap'; el.style.overflow = 'hidden';
  while (el.scrollWidth > el.clientWidth && fs > 10) { fs -= 1; el.style.fontSize = fs + 'px'; } }</script>
</body></html>`;
}
