# Showroom document kit: read this first

> **Kit v2. What changed since v1.** Sections 1–4 are already built. This round:
> - Section 5: banner per car.
> - Section 6: import round trip.
> - Template changes to port:
>   - heading bars: letter-spacing 2pt, no kerning
>   - disclaimer: wraps 3pt wider, word-spacing −0.11pt
>   - spec-sheet row `label_if` ("Range extender")
>   - `bannerHTML()`
> - `compare.py` now compares word by word, so line grouping no longer matters.
> - New reference PDFs. Re-run your compare tests against them.

The car page, the import screen and the two PDFs grew their own structure. The result is messy, and the PDFs don't match what the showroom actually sends.

From now on **the showroom's two documents define the app**. Everything in this kit was measured from the real spec sheet and brochure, and verified by overlaying them.

```
fields.json            THE field list: identity, 6 sections (brochure order), EN+AR labels,
                       spec-sheet rows, key features, printing rules
templates/templates.js Exact HTML/CSS of both documents (pt units, measured)
templates/render.mjs   Renders both PDFs with headless Chromium + overflow checks
sample/                Fictional test car (Valtren Orisa X5) + placeholder photos
reference/             Correct output for the sample car: spec-sheet.pdf, brochure.pdf
compare.py             Checks a generated PDF against the reference (±2 pt). Latin words only;
                       lines that contain Arabic (incl. Latin words inside them) are checked by eye
car-page-mockup/       Target design for the vehicle page (html + png)
assets/                banner-left.png + banner-text.png (layered per-car banner), fallback
                       spec-header-banner.jpg, watermark (rebuilt from how the original
                       renders; use this file, not an extracted one)
real-fixtures/         The showroom's two real files + what a correct import must produce
                       (TEST INPUT ONLY, see section 6)
fonts/                 Liberation Sans (=Arial metrics), Carlito (=Calibri metrics),
                       Noto Naskh Arabic. Embed these; no other fonts.
```

Try it: `cd templates && npm i playwright && node render.mjs ../sample/sample-data.json /tmp/out`

---

## 1. Data: fixed fields instead of a free-form spec dump

- Every vehicle has the fields in `fields.json`. Each value is `{ en, ar }`. Labels come from the file and are never typed by the secretary.
- Lists (`drive_modes`, `interior_features`, `smart_features`) are ordered items with `{ en, ar }`. `key_features` holds up to 10 English lines.
- Storage: keep `vehicle_specs` and add `field_key` (nullable), `value_en`, `value_ar`, and `position` for list items. A row whose `field_key` is null is "Other information (not printed)". Existing rows: map them by label where you can; everything else becomes Other. Do not delete any data.
- Keep RLS, company_id and the audit log exactly as they are.

## 2. Import: map onto the fixed fields

Keep the extraction engine. Change only where facts land:
- Match each extracted label against the field labels in `fields.json` (English and Arabic, with a small synonym list such as "Total output" ≈ "Combined Power", "Seats" ≈ "Seating Capacity"). A matched fact fills that field's `en` or `ar` value.
- The review screen shows the same sections as the car page, with the suggested value per field and its source. Unmatched facts go into a collapsed "Other" group.
- Two files giving different values for the same field is a conflict, as today.

## 3. Car page: rebuild to match `car-page-mockup/car-page.png`

- **Header:** cover photo, name and year, status, chassis, asking price, and a facts row (arrived, days in stock, mileage, expenses, missing accessories).
- **"Documents X% ready" bar:** counts empty fields and missing Arabic values. Clicking it lists them.
- **Six tabs only:** Specifications (default), Photos, Documents, Accessories, Expenses, History.
  - The old Overview content moves into the header.
  - Timeline and Activity merge into History.
  - The Information card moves into Documents, as "Generated documents".
- **Specifications tab:** the six sections in brochure order. Each row shows the label (with the Arabic label under it) and the value (with the Arabic value under it). Edit inline. Empty fields show "Not set · Add". Key Features sits in its own card. Other is collapsed at the bottom.
- Remove UI that isn't in the mockup, unless it's a feature that still has a home in one of the tabs. Nothing is deleted from the database.

## 4. PDFs: match the reference exactly

- `templates.js` is the specification: positions, sizes, colours, fonts and rules.
- **Renderer:** keep Typst if you want, but port these layouts exactly. Alternatively use the HTML templates directly, if you can export them to a file without a server.
  - Either way, `compare.py reference/X.pdf yours.pdf` must print **PASS** for both documents generated from `sample/sample-data.json`.
  - `compare.py` skips every line that contains Arabic, including Latin words inside it (".WLTP", "360"): engines order the runs of mixed-direction lines differently, so those are checked by eye like the Arabic itself.
  - Also compare Arabic and images by eye against the reference.
  - If you cannot get to PASS, stop and report the remaining differences. Do not loosen the tolerance.
- **Arabic font:** use Noto Naskh Arabic, which is what the reference uses. It is visually closest to the original's Arial Arabic.
  - The earlier requirement that Arabic text be searchable inside the PDF is dropped. Looking right beats searchability.
  - Amiri is no longer used.
- **Rows and sections are fixed by `fields.json`.** Empty ones are left out automatically. Remove the "choose which spec rows appear and their order" UI.
  - Keep: editing key features (in the Specifications tab), the cover photo, and the order of brochure photos.
- **Long names:** a brand + model that doesn't fit shrinks until it fits on one line, as in the templates.
- **Inspection checklist:**
  - Blocking: brand, model or year missing; an unresolved conflict; spec sheet longer than one page; a brochure spec slide that overflows.
  - Warnings: no price; empty fields; missing Arabic; fewer than 3 photos.
- **Keep:** saving every export to the vehicle with versions, and the audit log.

## 5. The banner shows each car (NEW)

The spec sheet's header banner is Sinolink branding on the left and **that car's photo** on the right, darkened, with the slogans on top. It's no longer one fixed image.
- **Company assets** (Settings → Documents):
  - `assets/banner-left.png`: logo, tagline and the red diagonal, with the photo area transparent.
  - `assets/banner-text.png`: the white slogans and services list, transparent background.
  - Keep `spec-header-banner.jpg` only as a fallback.
- **Per vehicle:** `photos.banner` (defaults to the cover photo), `photos.banner_pos` (CSS object-position, default "50% 50%") and `photos.banner_zoom` (default 1).
  - On the inspection page, add a small "Banner photo" control: pick a photo from the gallery, drag to set the focus point, and a zoom slider.
  - The live preview updates as these change.
- **Exact layering, geometry and darkness:** see `bannerHTML()` in templates.js. Port it exactly.

## 6. Import must round-trip the showroom's own documents (NEW, the main problem now)

Importing the showroom's own spec sheet or brochure must fill the fields so that exporting reproduces that same document. Today it doesn't. The generic extractor is fine for other people's documents. For these two layouts, add a dedicated reader for each.

**Recognise the layout:**
- Spec sheet: has "VEHICLE SPEC SHEET", a SPECIFICATIONS table and KEY FEATURES.
- Brochure: 16:9 pages whose section headings match `fields.json` section titles.

**Spec sheet reader:**
- **Title:** the largest text is brand + model, and the 4-digit number after it is the year. "Date: …" is the document date, never the year.
- **Subtitle:** split on " · ". The last part is the trim; the rest is the description.
- **Price:** "AED 140,000" → listing_price 140000, currency AED.
- **Table rows:** the English label maps through `spec_sheet_rows` (including the `label_if` alternative, so "Range extender" → engine). The value column is the value. The Arabic column is a label only, never a value.
- **"Total output":** if the value ends in " / <number> Nm", split it into total_output and max_torque. Export joins them back.
- **KEY FEATURES:** read left column top to bottom, then the right column, into key_features in that order.
- **Footer and disclaimer:** company settings. Ignore them.

**Brochure reader:**
- **Page 1:** name on one line, year on the next.
- **Pages with no text:** photos (already done). Page 1's picture is the cover.
- **Columns:** English bullets on the left, Arabic on the right, both grouped under the section headings.
  - "Label: value" (or "Label : value") → field by English label, plus a small alias list.
  - Unlabelled bullets in list sections → list items.
  - DRIVE MODES: one bullet; split it on "/".
- **Arabic:** pair Arabic bullets with English bullets **by position within the same section** when the counts match. When they differ, pair in order and keep the extra Arabic item as an Arabic-only item.
  - A pair gives that field its `ar` value: the text after the Arabic label's colon, or the whole bullet if there is no label.
  - Normalise Arabic: NFKC, plus the lam-alef order fix you already have.
- **Wrapped lines:** a line with no bullet continues the previous bullet.

**Test fixtures** are in `real-fixtures/`: the two real files and `*.expected.json`. These are the showroom's own files, used ONLY as test inputs. **Not one value from them may appear in app code.** The code must work for the next car (Leopard, etc.) with no change.

**Tests:**
1. Import `14_VOYAH_FREE_Spec_Sheet.pdf` into a new car → the fields equal `spec-sheet.expected.json`.
   - Then export the spec sheet with document date 2026-10-19 and the fallback banner.
   - `compare.py real-fixtures/14_VOYAH_FREE_Spec_Sheet.pdf exported.pdf` must print **PASS**. Claude (outside the app) already confirmed that these exact values render to a PASS, so it is achievable.
2. Import `VOYAH_FREE.pdf` into a new car → the English values and lists equal `brochure.expected.json`, the Arabic values contain the listed tokens, the Arabic list counts match, and 17 photos plus the cover are offered.
3. Import both files together → conflicts appear only where the two files really disagree (for example "Combined Power"). After choosing, nothing is lost.
4. Round trip of the app's own output: export the sample car, import both exports into a new car → every field, list item and key feature is identical, and the Other group is empty.

## 7. Done when

1. `compare.py` prints PASS for both sample documents, and the result looks identical to `reference/` by eye.
2. The car page matches the mockup's structure, using real data from the database.
3. Importing files fills the fixed fields; unmatched facts go to Other.
4. All existing tests still pass. Add tests for the field mapping and for the compare step.
5. No real showroom vehicle data appears in app code. Real files are allowed only as test fixtures (`real-fixtures/`).
