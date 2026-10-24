# AI Front Desk – Clinic Dashboard

Next.js + Supabase dashboard showing what your AI front desk (phone receptionist, WhatsApp bot, website assistant) handled today. Rows come from n8n, and Supabase Realtime pushes them to the screen live.

- **Pages:** Dashboard, Calendar, AI Calls, WhatsApp, Reports, Settings
- **Presets:** Dental, Aesthetic & Skin, Physiotherapy, General Clinic. A preset sets the labels, team, services and sample data.
- **Privacy:** phone numbers are masked in the database (trigger) *and* in the UI (`+971 50 *** 4567`). Only signed-in staff can read data.
- **Demo mode:** a `settings` row with `retention_days` (3 or 7, enforced by a CHECK constraint), a daily `pg_cron` purge, and a banner in the app.

Without Supabase keys the app runs in **offline demo mode**: it generates sample data relative to today's date, simulates live activity, and saves Settings changes in the browser.

---

## 1. Run locally

```bash
npm install
cp .env.example .env.local   # optional: leave empty for offline demo mode
npm run dev                  # http://localhost:3000
```

## 2. Set up Supabase (free tier)

1. Create a project at supabase.com.
2. **SQL Editor** → run [`supabase/migrations/001_initial.sql`](supabase/migrations/001_initial.sql), then [`002_multi_clinic.sql`](supabase/migrations/002_multi_clinic.sql) (multi-clinic + instant demos, see below). 001 creates:
   - the `activity` table with CHECK constraints, indexes, and a phone-masking trigger
   - the `settings` table (single row: `demo_mode`, `retention_days` ∈ {3, 7}, `clinic` jsonb)
   - RLS policies (signed-in users can read, and can update settings), Realtime publication, and the `purge-old-activity` pg_cron job (daily, 03:00 UTC)
3. **Authentication → Sign In / Providers**: turn **off** "Allow new users to sign up". Then **Authentication → Users → Add user** for each staff member. The RLS policies trust any signed-in user, so open sign-ups would let anyone read patient data.
4. **Project Settings → API**: copy the Project URL and the **anon / publishable** key into `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...   (or sb_publishable_...)
   ```
   Never put the service_role / secret key in the web app. Only n8n uses it.

## 3. Deploy on Vercel (free)

1. Push this folder to a GitHub repo.
2. vercel.com → **Add New Project** → import the repo (framework is detected as Next.js).
3. Add the two `NEXT_PUBLIC_SUPABASE_*` environment variables → **Deploy**.

## Multi-clinic & instant demos (002)

- Every clinic is a row in `clinics` (`status`: demo · trial · active · paused · expired). Users see only clinics they are members of (`clinic_members`); agency staff in `platform_admins` see all, plus the **Leads & demos** page.
- `/get-demo` is a public form. It posts to the n8n **DEMO-01** webhook (`NEXT_PUBLIC_DEMO_WEBHOOK_URL`), which calls `public.create_demo(...)` and replies with the demo link.
- `/demo/<slug>` is a public, branded demo on sample data. It only works while the clinic’s status is `demo`; every open is counted on the lead (`demo_views`).
- Optional env: `NEXT_PUBLIC_BOOK_CALL_URL` (e.g. a `https://wa.me/…` link) for the “Start my 7-day free trial” buttons.

## 4. Configure the clinic

- **Defaults:** [`clinic.config.ts`](clinic.config.ts) holds the name (default "Elite Clinic Dubai"), tagline, logo, colours, preset, timezone, opening hours, doctors and services.
- **Settings page:** changes made here are saved to `settings.clinic` in Supabase and override the file for every user. "Reset to config file" restores the file defaults.
- **Timezone:** "today", the KPIs and the calendar all use the clinic timezone (`Asia/Dubai` by default), whatever timezone the viewer's browser is in.
- **Doctor names:** they must match the `doctor` value n8n sends, or the booking shows up in an extra column.

---

## 5. Sending rows from n8n

Add one node at the end of each workflow: the AI phone receptionist, the WhatsApp bot, and the website assistant.

### Endpoint

```
POST https://YOUR-PROJECT.supabase.co/rest/v1/activity
```

| Header | Value |
|---|---|
| `apikey` | your **service_role** key (legacy JWT) or **secret** key (`sb_secret_...`) |
| `Authorization` | `Bearer <service_role key>` — only with the legacy JWT key; omit it with an `sb_secret_` key |
| `Content-Type` | `application/json` |
| `Prefer` | `return=minimal` |

The service key bypasses RLS, so keep it in an n8n credential, not in the workflow JSON.

### Body

```json
{
  "clinic_id": "<this clinic’s ID — shown on Settings → n8n integration>",
  "channel": "call",
  "patient_name": "Ayesha Khan",
  "phone_masked": "+971501234567",
  "language": "English",
  "summary": "Booked a cleaning for tomorrow 10:30.",
  "outcome": "booked",
  "duration_sec": 134,
  "recording_url": "https://example.com/recordings/abc.mp3",
  "appointment_time": "2026-10-25T10:30:00+04:00",
  "doctor": "Dr. Ahmed Khan",
  "service": "Cleaning"
}
```

| Field | Required | Values / notes |
|---|---|---|
| `clinic_id` | ✅ | UUID of the clinic (Settings → n8n integration). Rows without it are rejected |
| `channel` | ✅ | `call` · `whatsapp` · `voice_note` · `web` |
| `outcome` | ✅ | `booked` · `forwarded` · `info` · `cancelled` |
| `patient_name` | | null if unknown (the masked phone is shown instead) |
| `phone_masked` | | You may send the raw number; the database masks it before storing |
| `language` | | free text, e.g. `English`, `Arabic` |
| `summary` | | one sentence, shown in the feed and tables |
| `duration_sec` | | integer, for calls and voice notes |
| `recording_url` | | a URL the browser can play (mp3/wav). A signed URL that expires will stop playing |
| `appointment_time` | for bookings | ISO 8601 **with offset** (`+04:00`), or the time will be read as UTC |
| `doctor` | for bookings | must match a name on the Settings page |
| `service` | | must match a service name; sets the calendar block length |
| `event` | | `conversation` (default) · `missed_call_recovered` · `reminder` |
| `id`, `created_at` | | leave out; filled automatically |

`event` and `service` are two optional columns added to your schema. Without `event` the "Missed calls recovered" and "No-show reminders sent" KPIs have nothing to count:
- After the AI calls back a missed call: send `"event": "missed_call_recovered"` with `"channel": "call"`.
- After a reminder goes out: send `"event": "reminder"`, `"channel": "whatsapp"`, `"outcome": "info"`.

### How the KPIs are counted

| KPI | Rule |
|---|---|
| Calls handled by AI | `event = conversation`, `channel` in (call, voice_note), `outcome ≠ forwarded` |
| Forwarded to doctor | `outcome = forwarded` |
| Appointments booked | `outcome = booked` |
| Cancellations / reschedules | `outcome = cancelled` |
| WhatsApp chats | `event = conversation`, `channel = whatsapp` |
| Missed calls recovered | `event = missed_call_recovered` |
| Reminders sent | `event = reminder` |

Each KPI compares today so far with yesterday up to the same clock time.

### Option A: HTTP Request node (recommended)

1. In n8n, create a **Supabase API** credential: Host = your project URL, Service Role Secret = your service_role / secret key.
2. Copy the contents of [`n8n/log-activity-node.json`](n8n/log-activity-node.json) and paste them onto your workflow canvas (Ctrl+V).
3. Set the URL to your project, pick the credential, and change `"channel"` per workflow (`call`, `whatsapp`, `voice_note`, `web`).
4. Change the `$json.…` expressions to match the field names your workflow produces. `JSON.stringify(...)` escapes quotes in summaries safely.

The node is set to *continue on error*, so a dashboard outage never breaks the patient-facing workflow.

### Option B: Supabase node

Use **Supabase → Row → Create**, Table `activity`, then map each field by hand. This is easier to set up, but more clicking per workflow.

### Test with curl

```bash
curl -X POST "https://YOUR-PROJECT.supabase.co/rest/v1/activity" \
  -H "apikey: $SUPABASE_SERVICE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=minimal" \
  -d '{"channel":"whatsapp","patient_name":"Test Patient","phone_masked":"+971501234567","language":"English","summary":"Test row from curl","outcome":"info"}'
```

The row should appear in Live AI Activity within a second. An invalid `channel` or `outcome` returns HTTP 400 (`violates check constraint`).

---

## Demo mode

- Toggle it and choose 3 or 7 days on **Settings → Demo mode**. The values live in the `settings` table, and the database refuses anything other than 3 or 7.
- While it's on, the `purge-old-activity` cron job deletes `activity` rows older than `retention_days` every day at 03:00 UTC, and every page shows "Demo mode – data auto-deletes after X days".
- To run the purge now: `select public.purge_old_activity();` (returns the number of rows deleted).
- To check the job: `select * from cron.job;` and `select * from cron.job_run_details order by start_time desc limit 5;`

While the `activity` table is empty, the dashboard shows sample data with a notice. It switches to live data when the first real row arrives.

## Project layout

```
clinic.config.ts          clinic defaults (the one config file)
lib/presets.ts            the 4 presets: labels, team, services, sample phrases
lib/metrics.ts            KPI / chart / calendar calculations
lib/demo.ts               sample data generator
lib/phone.ts              phone masking (mirrors public.mask_phone in SQL)
components/ClinicProvider.tsx   config, settings, auth, data loading, Realtime
components/widgets.tsx    KPI cards, calendar, feed, chart, calls table
app/*/page.tsx            the pages
supabase/migrations/      001 initial schema, 002 multi-clinic + demos (run in order)
docs/ROADMAP.md           master plan: modules, guardrails, evals, phases
n8n/log-activity-node.json  paste-able n8n HTTP Request node
```
