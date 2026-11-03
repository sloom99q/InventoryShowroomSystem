# After-Sales: brief

**Prototype:** `aftersales.html`. Open `#home`, `#cust/customer`, `#cust/warranty`, `#cust/service`, `#cust/parts`, `#cust/offers`, or `#cust/service/service` for the WhatsApp preview. Screenshots are `shots/as-*.png`. Match the prototype's layout, wording and behaviour. It uses the same design system as the v3 rebuild.

**Decisions from the business:**
- The main user is the **sales manager**.
- The showroom **services cars itself**.
- **Spare parts:** no stock is kept. The **technician requests** a part, and it's ordered when needed.
- **Warranty is the showroom's own.** They have a warranty-certificate PDF template we don't have yet; leave a disabled "Generate" slot for it.
- **Customer data:** a minimal set for now.
- **Reminders:** shown in the app **and** sent by WhatsApp.

**WhatsApp v1 is free:** use click-to-chat (`https://wa.me/<number>?text=<message>`).
- The app writes the message in the customer's language. The manager can edit it, then taps "Open WhatsApp" and presses send.
- Every send is logged on the car.
- Automatic sending through the WhatsApp Business Platform is v2. It's paid per message and needs Meta business verification and approved templates. Do not build it now.

## Data (company_id on everything, RLS as usual)

- **`customers`:** name, phone (E.164), email, Emirates ID / licence, emirate, message language (ar/en), notes.
- **`vehicle_owners`:** vehicle_id, customer_id, from_date, to_date. This allows resale or a change of owner later. The current owner is the open row.
- **`warranties`:** vehicle_id, kind (vehicle | battery | extended), start_date (defaults to the Delivered stage date), years, km, terms.
  - "Covered until" is calculated.
  - Defaults per brand go in **Settings → Warranty**.
- **`service_visits`:** vehicle_id, date, odometer_km, work_done, technician (profile), cost (0 = free), notes.
  - Service plan per brand in **Settings → Service** (every N months or N km).
  - Next due = last visit + plan, by whichever of date or km comes first, using the latest odometer reading. The first one is counted from delivery.
- **`part_requests`:** vehicle_id, service_visit_id (optional), name, part_no, qty, supplier, cost, status (requested → ordered → arrived → fitted | cancelled), and a timestamp per status. Created by the technician or the manager.
- **`offers`:** vehicle_id, catalogue_item (Settings → Offer catalogue: name and default price), price, status (offered | accepted | declined), and dates.
- **`message_log`:** vehicle_id, customer_id, kind (service | warranty | part | offer | free), text, opened_at, opened_by.
- **Handover:** reuse accessories. When a car moves to Delivered, the app asks for "Checked at delivery" and stores who signed it off and when, plus an optional delivery photo (vehicle_images, category `delivery`).
- **Roles:**
  - add `sales_manager`, with full After-Sales access
  - add `technician`, who can log a service and request or update parts, but can't see customer phone numbers or prices
  - the secretary keeps her current access, and can also view After-Sales

## Screens

- **Sidebar "After-Sales"**, with the home page from the prototype:
  - 4 KPI cards
  - "Needs a message": service overdue or due within 30 days, warranty ending within 60 days, parts that have arrived. Each has a WhatsApp button.
  - "Recently delivered", flagging a missing customer or warranty
- **Customer car page:** it opens from any car at the Sold or Delivered stage, and from search by customer name or phone. It has the chassis hero, an owner card (WhatsApp, Call) and the 5 tabs from the prototype. Every field is edited in place, the same as the v3 specs.
- **The car page in Cars** gets a link to "After-Sales →" once the car is Sold.

## Done when

1. A Sold/Delivered car gets an owner: warranty is filled automatically from brand defaults, and the first service is calculated.
2. Logging a service moves the next due date forward.
3. A technician account can request a part, but sees no prices or phone numbers.
4. Moving a part to Arrived puts it in "Needs a message".
5. A WhatsApp button opens wa.me with the right number and an Arabic or English message, and the send is logged.
6. Tests cover the next-due maths (date versus km), warranty end dates, role restrictions, and the reminder lists.
7. Checked in the running app with screenshots next to the prototype. The pilot is updated the safe way (backup, `migration up`) and committed.
