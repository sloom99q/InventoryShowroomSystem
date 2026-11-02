# Rebuild v3: manual-first

The pilot failed. The secretary gave up on importing from documents and wants to enter cars herself. She couldn't, because the screens are crowded and the flow is lost. An XPeng also showed BYD Seal photos, on her device too.

The product is now **manual-first**: chassis number first, everything editable instantly, and the car's journey (arrived → garage → RTA → sold → delivered) at the centre.

`index.html` in this folder is a **clickable prototype**. It's the design target: match its layout, hierarchy, wording and behaviour. `shots/` holds screenshots at desktop and phone width. Open the prototype at `index.html#car/specs`, `#car/acc`, `#car/exp`, `#car/jr` or `#add`.

Do PHASE 0 completely, report, then PHASE 1. Nothing else.

---

## PHASE 0: stop the damage (today)

1. **Find and fix the photo leak.** An XPeng showed another car's (BYD Seal) photos.
   - Find the **root cause**; don't just remove a feature. Suspects: storage paths built from filenames or page numbers instead of vehicle id + a random id; a reused import or staging folder; import-session state shared between imports; the copy-from-previous-car feature.
   - First write a failing test that reproduces it: two cars, each given different images through every path (upload, camera, import, copy). Each car must show only its own. Then fix it until the test passes.
   - Run a database check that lists any storage object referenced by more than one vehicle, and any vehicle_images row whose file path doesn't contain its own vehicle id. Report the results.
   - From now on every stored file path is `company_id/vehicle_id/<uuid>.<ext>`.
2. **Remove "Copy from a previous car"** (the "memory") completely: UI, code and tests.
3. **Remove "From documents"** from Add car and from the secretary's screens. Keep the importer code. It stays reachable only for admins, as "Import from file…" in the car's ⋯ menu.
4. **Permanent delete**, admins only, from the car's ⋯ menu (see the prototype's delete dialog).
   - She confirms by typing the last 6 characters of the chassis.
   - It deletes the car, all related rows **and their storage files** in one operation, and records an audit entry (who, when, chassis).
   - Archive stays as the normal option.
5. **Pilot reset:** back up first, then permanently delete all cars on the pilot. Report 0 vehicles and 0 orphan files.

## PHASE 1: rebuild the UI to the prototype

**General**
- Light theme with the prototype's tokens: background, cards, ink, Sinolink red accent, status colours.
- One "Add car" button, top right of the Cars page. Nowhere else.
- Every value is editable in place. Click it, type, then Enter or click away to save, with a small ✓ to confirm.
- Optimistic UI, with **Supabase Realtime** subscriptions, so a change on one device appears on the other within about a second.
- No modal forms for editing fields.

**Cars list** (`shots/1-cars.png`)
- The chassis number is the first and boldest column, in monospace. Brand, model, year and trim go under it.
- Status label, arrival date, days in stock, and attention tags (missing accessory, no photos, sold without delivery date).
- Status filter chips with counts.
- Search matches the full chassis number or any part of it, including the last 6.

**Add car: a 5-step stepper** (`2`, `3`, `4`)
1. Chassis: a big input with live checks — 17 characters, an I/O/Q warning, and a duplicate check with a link to the existing car.
2. Car: brand, model, year required; trim, colour, price optional.
3. Arrival: date, time, current location, mileage.
4. Arrival photos: camera or upload, skippable.
5. Done: a Lottie success animation, then "Open the car" or "Add another".

Specs are **not** part of adding a car. They're filled on the car page.

**Car page** (`5`–`9`, `11`)
- **Chassis hero:** the chassis number large and alone at the top, with a copy button. The name line goes under it. Status label, attention tags and "+ Label" for free labels such as "Tint pending" or "Export papers".
- **Journey:** stages Arrived → In garage → At RTA → Ready → Reserved → Sold → Delivered.
  - "Move to next stage" asks for the date and time (default now) and an optional note. She can also pick any stage, with a confirmation.
  - Each move is a vehicle_event. The car's status is its latest stage. Sold and Delivered require their date.
- **Tabs:** Specs · Photos · Accessories · Expenses · Journey · Documents. Each tab shows a count or alert, as in the prototype.
  - **Specs:** one clean sheet built from fields.json sections.
    - English value inline; Arabic is optional through "+ عربي".
    - "All fields / Only empty" toggle, and a progress bar showing how many are filled.
    - Enter saves and jumps to the next field.
    - Remove the separate Fill specs page and the paste box.
  - **Photos:** category chips (Arrival, Current, Garage), a grid, a star for the cover photo, the camera on phones, and drag to reorder.
  - **Accessories:** a tile for each item, with an icon, a −/+ quantity control, and Present (quantity above 0) or Missing (quantity 0).
    - A summary ring at the top: "7 of 8 present · Missing: NFC card".
    - Default catalogue: smart key, physical key, NFC card, portable charger, charging cable, floor mats, owner's manual, warning triangle. "Add item" for anything else.
  - **Expenses:** total card with a category bar, then one-tap quick-add chips (Garage, RTA/registration, Transport, Detailing, Tinting/PPF, Parts, Other).
    - A chip → amount → saved. Optional receipt photo, supplier and note. List below.
  - **Journey:** the timeline of stage events with date, time, who and note. The field-edit audit log moves to an admin-only "Edit log".
  - **Documents:** attachments plus "Spec sheet & brochure". The current PDF generation stays exactly as it is.

**Motion and illustrations**
- Use Lottie through `lottie-react` for: car added, PDF exported, and empty states (no cars, no photos, no expenses).
- Use free animations whose licence allows commercial use (LottieFiles "Lottie Simple License"). Record the source and licence of each in `public/lottie/LICENSES.md`.
- Keep each under 150 KB. Respect `prefers-reduced-motion`.
- Everything else uses subtle CSS transitions only.

**Phone** (`9`, `10`): she must be able to do everything on her phone. No horizontal scrolling except the journey track.

## Done when

1. Phase 0 report: the root cause of the photo leak, its test, the clean results from the database check, and a pilot with 0 cars.
2. In the running app, as the secretary, timed:
   - add a car (chassis, brand, model, year, arrival, 2 photos) in under 1 minute
   - move it to At RTA
   - set the NFC card to missing
   - add a 500 AED RTA expense with one chip
   - fill 5 specs with keyboard only
3. Open the same car on a second device: every change from point 2 appears there without a refresh.
4. Screenshots of every screen at desktop and phone width, side by side with `shots/`.
5. All tests pass, including new ones for delete-with-files, journey stages, accessories quantity and status, and the photo-isolation test.
6. Update the pilot the safe way (backup, `migration up`, restart) and commit.
