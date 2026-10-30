# Showroom document kit: read this first

The car page, the import screen and the two PDFs grew their own structure. The result is messy, and the PDFs don't match what the showroom actually sends.

From now on **the showroom's two documents define the app**. Everything in this kit was measured from the real spec sheet and brochure, and verified by overlaying them.

```
fields.json            THE field list: identity, 6 sections (brochure order), EN+AR labels,
                       spec-sheet rows, key features, printing rules
templates/templates.js Exact HTML/CSS of both documents (pt units, measured)
templates/render.mjs   Renders both PDFs with headless Chromium + overflow checks
sample/                Fictional test car (Valtren Orisa X5) + placeholder photos
reference/             Correct output for the sample car: spec-sheet.pdf, brochure.pdf
compare.py             Checks a generated PDF against the reference (±2 pt)
car-page-mockup/       Target design for the vehicle page (html + png)
assets/                Header banner + watermark (the watermark was rebuilt from how the
                       original actually renders; use this file, not an extracted one)
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

## 5. Done when

1. `compare.py` prints PASS for both sample documents, and the result looks identical to `reference/` by eye.
2. The car page matches the mockup's structure, using real data from the database.
3. Importing files fills the fixed fields; unmatched facts go to Other.
4. All existing tests still pass. Add tests for the field mapping and for the compare step.
5. No real showroom vehicle data appears in code or tests. The fictional sample car is the only test data.
