# Showroom inventory

Vehicle inventory for a UAE car showroom. The **chassis number is the identity**: every
document, photo, accessory, expense and event hangs off one vehicle record.

```
web/        React + TypeScript + Vite + Tailwind app (the whole UI)
supabase/   Postgres schema, RLS, RPCs, storage policies, edge function, DB tests
worker/     Python Docling/OCR scanner — parked, not used by the app yet (see below)
```

## Architecture decisions (v1)

| Decision | Why |
|---|---|
| **No separate API server.** React talks to Supabase directly. | Postgres row-level security does the authorisation; multi-record actions (status change + event, document versioning, Excel import) are SQL functions that run in one transaction. One codebase instead of two. |
| **One edge function** (`manage-staff`) | Creating logins needs the service-role key, which must never reach the browser. |
| **`company_id` on every row, enforced by RLS + composite FKs** | Keeps the multi-showroom (SaaS) door open. A row can't even reference another company's vehicle. Nothing else SaaS is built. |
| **OCR deferred.** Digital PDFs are read in the browser (pdf.js text layer). | Docling needs GBs of models and an always-on server. Decide after seeing her real PDFs: if most are scans, wire up `worker/`. |
| **Excel import + export on day one** | Her existing sheet is the source of truth; she shouldn't retype 20 cars. |
| **Nothing important is hard-deleted** | Vehicles are archived; documents, photos, expenses are soft-deleted; replaced files become older versions. Every change is in `audit_logs`. |

### Data integrity rules (enforced in the database, not just the UI)

- `UNIQUE(company_id, chassis_normalized)` — `lvv-db21 b9…` and `LVVDB21B9…` are the same car.
- A chassis number is never auto-corrected. I/O/Q and check-digit problems are shown as warnings
  with a *suggestion*; a person decides. Non-17-character frame numbers are allowed.
- Only admin/secretary can change a chassis number; a change resets "checked against documents".
- `sold`/`delivered` require a sale/delivery date (check constraint). Status changes always write a
  timeline event (trigger), with the user and note.
- Money is `numeric(12,2)`; totals are computed in SQL or in integer fils.
- Timestamps are `timestamptz`; the UI shows and accepts UAE time (Asia/Dubai).
- Files: one **private** bucket, path `<company>/<vehicle>/<kind>/<uuid>.<ext>`, read only through
  1-hour signed URLs. Uploads are type-checked by magic bytes (not file name / browser MIME) and the
  bucket only accepts PDF/JPEG/PNG/WebP/HEIC up to 50 MB. Originals are never overwritten.
- Uploading a document whose text mentions a *different* chassis is blocked until a person confirms.

### Roles

| Role | Can |
|---|---|
| Admin | everything, plus staff accounts and settings |
| Secretary | add/edit vehicles, correct chassis numbers, archive, see change history |
| Staff / technician | photos, expenses, accessories, status changes |
| Read-only | view only |

## Document import (Vehicles → Add from documents, or "Import files" on a vehicle)

Drop every file for one car at once (PDF, DOCX, XLSX/XLS/CSV, photos). Everything is read in the
browser from the files' text layer — no OCR, no server. `web/src/lib/extract/`:

- `layout.ts` rebuilds lines from text positions and keeps side-by-side English/Arabic columns as
  separate streams; Arabic is put back in reading order and NFKC-normalised.
- `structure.ts` finds sections, `Label: value` lines, bullets and table rows → facts with source file/page.
- `core.ts` maps facts to vehicle fields with a generic English/Arabic **label** dictionary (no brand,
  model or value lists). A full date is a document date, never the model year. Brand/model split of a
  document title is only a suggestion (helped by Settings → *Brands you sell*).
- `index.ts` merges facts across files: equal values combine their sources, different values become a
  conflict the user must resolve. An Excel file listing many vehicles is routed to bulk import.

The review screen saves nothing until "Save to vehicle"; then originals, chosen pictures, vehicle
fields and every kept fact (as `vehicle_specs`) are written in one transaction (`save_vehicle_import`)
and audited. Chassis safety rules still apply: no auto-correction, exact-match only for picking a
vehicle automatically, and a confirmation when files mention a different chassis.
Test fixtures for a fictional car live in `web/e2e/fixtures/` (`node e2e/fixtures/generate.mjs`).

## The kit defines the app (`kit/`)

`kit/README.md` is the specification: `kit/fields.json` is the one field list (identity, six sections in
brochure order, EN+AR labels, spec-sheet rows, key features). The car page, the import mapping and both
PDFs use it (app copy: `web/src/lib/fields/fields.json`; a test keeps them identical).

- **Data:** `vehicle_specs` rows have `field_key` (a field, or a list with `position`), `value_en`,
  `value_ar`. Rows without a field are "Other (not printed)". One value per field per vehicle.
- **Import:** facts are matched to fields by English/Arabic label plus `web/src/lib/fields/synonyms.json`
  (labels only); two files disagreeing on a field is a conflict to resolve; the rest goes to Other.
- **Car page:** header + "Documents X% ready" + six tabs (Specifications, Photos, Documents, Accessories,
  Expenses, History), per `kit/car-page-mockup`.
- **PDFs:** typeset in the browser with Typst (`web/src/docs/`), ported from `kit/templates/templates.js`
  and checked with `kit/compare.py` (PASS for both sample documents, ±2 pt):
  `cd web && npx playwright test e2e/docs-compare.spec.ts` (needs `worker/.venv` for pymupdf).
  Fonts: Liberation Sans, Carlito, Noto Naskh Arabic (from `kit/fonts`). Arabic is shaped correctly but
  not guaranteed searchable inside the PDF — matching the original's look was chosen over that.
- Export downloads the PDF and stores it with the vehicle (spec sheet as information card, brochure as a
  versioned "Brochure" document), audited. Inspection blocks on missing brand/model/year, a spec sheet
  over one page or an overflowing brochure slide; warns on no price, empty fields, missing Arabic, < 3 photos.

## Branding and languages

- **Per-company branding** (Settings → Branding, admins only): logo, optional logo for dark
  backgrounds, brand colour, sidebar colour, light/dark, default language. Applied app-wide through
  CSS variables (`web/src/lib/theme.ts`, tokens in `web/src/index.css`); low-contrast colours are flagged.
- **English and Arabic** with i18next (`web/src/i18n/`). One namespace per screen group, Arabic files
  are type-checked against English so no key can be missing. Full right-to-left layout; chassis
  numbers, numbers and dates always render left-to-right. Each user's language is saved on their
  profile; the company default applies otherwise. Terminology follows UAE showroom usage — loanwords
  and technical names (شاصي, كراج, VIN, NFC, PDF, Excel) are kept rather than force-translated.
  Western digits in both languages.

## Local development

Needs Node 24+, Docker (e.g. `brew install colima docker && colima start`) and the
Supabase CLI (`brew install supabase/tap/supabase`).

```sh
supabase start                       # Postgres, Auth, Storage, Studio on 5432x ports
supabase functions serve &           # staff-account function
cd web && npm install
cp .env.example .env.local           # local anon key from `supabase status`
# first company + admin login (service-role key from `supabase status`):
SUPABASE_SERVICE_ROLE_KEY=... node scripts/bootstrap.mjs "Showroom name" admin@example.com 'password' "Full Name"
# optional branding: ACCENT=#b3121a SIDEBAR=#ffffff MODE=light LOCALE=ar LOGO=logo.png LOGO_DARK=logo-dark.png
npm run dev                          # http://127.0.0.1:5173
```

After changing SQL: `supabase db reset` then
`supabase gen types typescript --local > web/src/lib/database.types.ts`.

## Tests

The suite covers what would hurt if it broke:

```sh
supabase test db                 # 27 pgTAP checks: duplicate chassis, tenant isolation, file
                                 # privacy, read-only role, exact expense totals, sale dates, audit
cd web && npm test               # VIN rules, candidate detection, money parsing
cd web && npx playwright test    # end-to-end: add → document check → expenses → sell → search,
                                 # PDF chassis reading, phone photo upload, Arabic/RTL, branding preview
                                 # (needs a bootstrapped admin)
```

## Deploying (private web app)

1. Create a Supabase project (region: closest to UAE, e.g. `ap-south-1` Mumbai / `eu-central-1`).
2. `supabase link --project-ref …` → `supabase db push` → `supabase functions deploy manage-staff`.
3. In the dashboard: Auth → disable sign-ups; set Site URL to the app's URL.
4. Run `scripts/bootstrap.mjs` once against the project URL with the service-role key.
5. Build `web` (`npm run build`) and host `web/dist` on any static host (Vercel, Netlify, Cloudflare
   Pages) with `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` set and SPA fallback to `index.html`.

### Backups

- Supabase Pro includes daily database backups (7 days) and optional point-in-time recovery.
  The free tier has **no** automatic backups — use Pro for production.
- Storage files are not included in database backups. Weekly, copy the bucket:
  `supabase storage cp -r ss:///vehicle-files ./backup/files --experimental` (or S3-compatible sync).
- Independent DB dump: `supabase db dump --data-only -f backup/data-$(date +%F).sql`.
- The Excel export on *Import & export* is a human-readable snapshot she can keep too.

## Not built yet (deliberately)

- **OCR for scanned documents** — `worker/` has a tested Docling + Apple Vision/RapidOCR pipeline and
  VIN candidate logic with fixtures. Wire it in only if her real files are mostly scans: it would
  poll `document_jobs`, write candidates to `extracted_data`, and the existing verify screen would
  show them. Until then scans are attached and verified by eye.
- Reports, notifications, information-card generation, bulk folder upload, SaaS billing.
