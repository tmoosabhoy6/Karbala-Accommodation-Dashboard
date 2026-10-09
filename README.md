# Karbala Rooms

The accommodation dashboard for the Amatullah and Qasr buildings in Karbala. It replaces the
"Krb Accomodation" Google Sheet: every room, who is in it, who is coming and who leaves at 08:00.

## What it does

- **Today**: occupancy tonight, both buildings floor by floor, who checks out and who arrives, free rooms by size, and a three-week forecast.
- **Floors**: each floor in 3D (taller means busier) or as a plan, with a day picker to see any of the next two weeks, and the check-outs on that floor.
- **Rooms**: every room with filters for building, floor, type, size, status and "free between dates". Exports to Excel.
- **Timeline**: rooms against days, like the sheet. Tap an empty day to book.
- **Allocate**: tour ID, group and pax in, the best set of free rooms out (one floor first, then one building, mattresses only when needed).
- **Month planner**: upload the ERP Pending Tours Report. Each trip is split between Najaf and Karbala (under 7 nights: 2 in Najaf; 7 nights: 3; 8 or more: 4; Karbala gets the rest), and the planner picks Karbala-first or Najaf-first and the rooms so the most people get a bed. Book the whole plan in one go, or tour by tour, and export the report to Excel.
- **Tours**: every group with its rooms, with check-out, check-in, extend and cancel for the whole group.
- **Activity**: every change, including the automatic 08:00 check-outs.

Statuses: red occupied, yellow leaving by 08:00 tomorrow, green free, blue booked for today or tomorrow, grey hatched blocked (Faiz rooms, maintenance, store).
Dates show in Gregorian and Hijri (Misri calendar, adjustable by a day in Settings). Everything runs on Karbala time (UTC+3).

## Running it

```bash
npm ci
cp .env.example .env   # add the Supabase URL and publishable key
npm run dev
```

Without a `.env` the app runs on a demo copy of the data kept in the browser. To make that copy from the sheet export:

```bash
python3 scripts/parse_sheet.py krb.xlsx public/demo-seed.json --since 2026-09-01
```

`public/demo-seed.json` is ignored by git, so guest data never lands in this public repository.

## How it is built

- React, Vite, Tailwind CSS 4, TanStack Query (cached in the browser so the page opens instantly), Supabase for data and live updates.
- The database rejects double bookings and over-full sharing rooms, writes the activity log itself, and checks people out at 08:00 every few minutes (`pg_cron`). The schema is in `supabase/schema.sql`.
- Hosted on Render as a static site. `.github/workflows/keep-alive.yml` stops the free Supabase project from pausing.
- There is no login, by choice: anyone with the link can view and edit.
