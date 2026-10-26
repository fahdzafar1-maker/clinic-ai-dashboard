# Clinic OS — AI front desk for clinics (project status for Claude)

Read this first in every new session. Sensitive operational details (client names, phone numbers, demo IDs) are in `CLAUDE.local.md` (not in git). Internal pricing/costs are in `docs/private/PRICING.md` (not in git). The master plan is `docs/ROADMAP.md`.

## Working with the user
- The user (Fahd, Fahd AI Services) writes in **Roman Urdu**. Reply in Roman Urdu, keep technical names in English, give numbered click-by-click steps. He tests by phone and sends screenshots.
- He runs things Claude can't: Supabase SQL (separate Supabase account — no MCP access), **publishing n8n workflows** (publish is blocked for Claude), Vercel env vars, Vapi/Meta settings.
- Give SQL/messages via the Windows clipboard (PowerShell `Set-Clipboard`). **Taking a screenshot overwrites his clipboard** — re-copy if he says paste failed. Don't overwrite the clipboard while he is using it for something else.

## Product
A complete AI automation system for clinics (dental, aesthetic & skin, physio, general), sold globally. Sales motion: LinkedIn message → owner agrees → we build a **7-day branded demo kit** (demo page + AI phone receptionist + website chat; WhatsApp coming) → trial → paid plan. Run 3–4 prospect demos at a time; ended demos are auto-deleted.

## Stack & URLs
- Next.js 16 (App Router, TypeScript, plain CSS) + Supabase (Postgres, RLS, Realtime, pg_cron) + Vercel (auto-deploys on push to `main`) + n8n (Railway) + Vapi (voice) + OpenAI.
- Live: https://clinic-ai-dashboard-five.vercel.app · Repo: github.com/fahdzafar1-maker/clinic-ai-dashboard · Supabase project `qdnlpjvbelfibqthjwrz` (Mumbai).
- Commands: `npm run dev`, `npx next build`, `npx tsc --noEmit` (the `n8n/` folder is excluded from TS).

## What is built (all pushed)
- **Dashboard** (`components/pages/*`): Dashboard (KPIs, today's appointments by doctor, live feed, weekly chart, recent calls), Calendar, AI Calls, WhatsApp, Reports, Settings, Leads & demos (admin), Login.
- **Modes** (`components/ClinicProvider.tsx`): `app` (signed-in staff/admin, real data per clinic, Realtime), `demo` (public `/demo/<slug>`, sample data + the prospect's real calls via `get_demo_activity` polling), `offline` (no Supabase keys).
- **Multi-clinic DB** (`supabase/migrations/001…006`): `clinics` (status demo/trial/active/paused/expired, `config` jsonb, `expires_at`, `demo_code`), `clinic_members`, `platform_admins`, `leads`, `activity` (+ `clinic_id`, `event`, `service`). Phone numbers masked by DB trigger (`mask_phone`, per-clinic country code) and in UI.
- **Clinic config** (`lib/types.ts` `ClinicConfig`): preset, doctors, services, hours, timezone, countryCode, city, colours, and `receptionist` { name, greeting, languages, knowledge, voice, dedicatedNumber, callerNumbers }. Edited on Settings.
- **/get-demo** public form → n8n **DEMO-01** builds the demo (AI reads the clinic website for team/services), emails the lead + notifies Fahd.
- **Voice receptionist**: n8n **DEMO-02** is the Vapi Server URL. On `assistant-request` it finds the clinic (dedicated AI number called → demo code → extra caller numbers → lead phone → fallback `elite-clinic-dubai`) and returns a per-clinic assistant; on `end-of-call-report` it logs the call to `activity`.
- **Website chat**: `/chat/<slug>` page, `public/widget.js` one-line embed, floating "Try the website chat" button on demo pages, embed code on Settings; backend n8n **DEMO-04** (built, **not yet published**).
- **Active demos panel** (Leads page, `components/ActiveDemos.tsx`): time left, demo-line assignment from `lib/demoLines.ts`, +7 days / End now (via `admin_demo_action`, migration 006).
- Docs: `docs/ROADMAP.md` (modules A–O, guardrails, evals, phases, compliance), README (setup + n8n insert format).

## n8n workflows (Clinic OS, separate from all client projects)
| Workflow | ID | Status |
|---|---|---|
| DEMO-01 Instant Demo Builder | `TbpLgB7lXDkTW87A` | published |
| DEMO-02 Demo Receptionist (Vapi) | `bUKj3tQa2OUapuSF` | published (latest: idle re-prompt, shorter replies) |
| DEMO-04 Website Chat | `ezorXc8kMGCu4R19` | **built, waiting for the user to publish** |
- Repo copies live in `n8n/*.workflow.ts`. After changing a workflow in n8n, sync the repo copy with the **webhook secret replaced by `REPLACE_WITH_VAPI_WEBHOOK_SECRET`**.
- Credentials used: Supabase `dyGNoS79aELyAcvw` ("Supabase - Clinic Dashboard"), OpenAI `5xsS6XmNzgYy1Xn9`, Gmail `NGZWg5dlukDUfFs9` (fahdai.services). Never use other clients' credentials.

## Decisions
- **Global product.** Demos use sample data; each client's legal/hosting rules (UAE local hosting, EU/GDPR) are handled at onboarding.
- **Full feature catalogue stays** (CRM, invoicing, accounts/P&L, inventory, etc.). An outside "plan v2" note saying "no CRM/no invoicing" was wrong.
- **Never touch the existing client project (SUR-* workflows, its Vapi number) — see CLAUDE.local.md.** Reading SUR-24 for voice-tuning reference was fine; changes are not.
- **Separate numbers** for voice receptionist and WhatsApp chatbot. **WhatsApp = coexistence** (number on WhatsApp Business App first, then Cloud API).
- **Cheap voice stack by default**: Deepgram nova-3 `multi` + Vapi Voices. Gladia only when a clinic language is outside Deepgram multi (e.g. Arabic, Slovenian, Croatian); ElevenLabs only when the clinic's Settings voice = ElevenLabs (accent needs it).
- Dedicated demo lines for important prospects; the shared number is the showcase/fallback.
- Pricing: Starter/Growth/Clinic Pro with included minutes and top-up packs — details only in `docs/private/PRICING.md`.

## Rules & lessons (don't repeat these mistakes)
- **n8n blocks a field named `caller`** in expressions ("Cannot access caller due to security concerns"). Use `from_number` / `to_number`.
- **Vapi call analysis doesn't know today's date** (it wrote 2023). Ask for `appointment_day` + `appointment_clock` and compute the date in n8n in the clinic timezone. Constrain doctor/service to the clinic lists and fuzzy-match.
- Reports from calls that never connected (no duration, no analysis) must be skipped.
- Pin-data tests in n8n do **not** exercise HTTP-node expressions — the `caller` bug passed tests. Check real executions after the user tests.
- **Never commit secrets** (Vapi webhook key, service keys) or **internal costs/margins**; pushes containing them get blocked.
- LangChain prompt templates break on `{ }` in free text (clinic knowledge) — replace braces before the LLM node.
- Bash heredocs with quotes/backslashes break often on this Windows machine — write scripts/files with the Write tool, then run them.
- Supabase free tier pauses after ~1 week of no activity; Vapi recordings are now access-controlled (dashboard play button may not play them).
- Demo links/numbers: demo pages are public by slug — never send prospects the root admin URL.

## Pending (user side)
1. Publish **DEMO-04** in n8n.
2. Run **SQL 006** (`supabase/migrations/006_demo_management.sql`) if not done.
3. Create Vapi free numbers **Demo Line A/B/C** (Server URL `…/webhook/clinic-os/vapi` + header `x-clinic-os-key`, no assistant) and send the numbers → add them to `lib/demoLines.ts` (or `NEXT_PUBLIC_DEMO_LINES`).
4. WhatsApp chatbot number: connect to Cloud API in coexistence mode ~28 Oct 2026 or later.
5. Extend the active prospect demo before it expires if needed (SQL in `CLAUDE.local.md`).

## Next steps (Claude)
1. After DEMO-04 is published: run a real website-chat test on a demo page and check the execution + dashboard row.
2. **DEMO-03 WhatsApp bot** (coexistence) acting as each demo clinic, logging to `activity` (channel whatsapp); show the number via `NEXT_PUBLIC_DEMO_WHATSAPP_NUMBER`.
3. Recording playback: copy Vapi recordings into Supabase Storage (or a signed proxy) so the play button works.
4. Faster demo creation from a short brief (clinic name, city, website, languages, owner number) + ready-to-send client message.
5. Later phases from the roadmap: per-demo login / 7-day trial engine, Messenger/Instagram DMs, reminders & follow-ups, guardrail eval sets, accounts/CRM modules.
