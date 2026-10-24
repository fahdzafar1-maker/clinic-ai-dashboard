# Clinic OS — Master Plan

A complete AI business-automation system for clinics and small hospitals, sold by Fahd AI Services.
Sales motion: **lead asks for a demo → gets a demo branded with their own clinic within a minute → 7-day trial with their real data → buys.**

---

## 1. How a clinic moves through the system

```
 Lead found / lead asks          Instant demo                 7-day trial                     Paying client
 ───────────────────────► ─────────────────────────► ────────────────────────────► ──────────────────────────►
 Client Hunter, website,   /get-demo form or WhatsApp  Fahd clicks "Start trial":     Automations switched to
 Instagram/FB DM, WhatsApp  → DEMO-01 builds a branded  login created, real data       live, monthly reports,
                            demo (their name, logo,      imported, links + login        billing reminders
                            doctors, services) and       sent, daily usage nudges,
                            sends the link               day-6 "how useful was it?"
                                                         survey, day-7 expiry
 status: lead              status: demo                  status: trial                  status: active
```

Every clinic is one row in `clinics` (multi-tenant). One database and one app serve demos, trials and paying clinics; RLS keeps each clinic's data private.

## 2. Modules

| # | Module | What gets automated | Channel / tools |
|---|---|---|---|
| A | **Front desk** | AI phone receptionist (book, reschedule, cancel, FAQs), missed-call call-back, forward urgent cases to doctor | Vapi + n8n |
| B | **WhatsApp & website assistant** | Same brain as the phone agent on WhatsApp and website chat; voice-note transcription | WhatsApp Cloud API, web widget |
| C | **Appointments** | Calendar per doctor, reminders 24h + 2h, no-show follow-up, waitlist auto-fill of cancelled slots | Dashboard + n8n |
| D | **Patient follow-up** | Post-visit care instructions, recall ("6-month checkup due"), treatment-plan follow-ups, birthday messages | WhatsApp / email |
| E | **Reviews & reputation** | Ask happy patients for Google review, route unhappy ones privately to the owner | WhatsApp + Google |
| F | **Lead generation & CRM** | Capture leads from ads/social/website, AI qualification, pipeline, auto follow-up sequence | Meta, website, n8n |
| G | **Social media** | Weekly content calendar, AI posts/carousels/reels per clinic, auto-publish, monthly results | Olivia engine (adapted) |
| H | **Accounts & finance** | Daily income (from bookings/invoices), expense logging by WhatsApp photo of receipt (AI reads it), categories, **daily / monthly P&L**, cash flow, doctor-wise revenue, VAT summary, overdue payment reminders | Dashboard + n8n + OpenAI vision |
| I | **Invoices & payments** | Invoice/receipt generation, payment links, insurance-claim checklist | PDF + payment provider |
| J | **Inventory** | Stock levels for consumables, low-stock alerts, supplier re-order drafts | Dashboard + n8n |
| K | **Staff** | Doctor schedules, leave, daily briefing message to each doctor ("you have 9 patients today") | WhatsApp |
| L | **Reports** | Daily WhatsApp summary to owner, weekly email report, monthly business review (calls, bookings, revenue, profit, marketing ROI) | n8n + email/WhatsApp |
| M | **Support desk** | Patient complaints/tickets, escalation rules, SLA tracking | Dashboard |

## 3. Guardrails (applied to every AI agent)

- **No medical advice or diagnosis.** Symptoms → offer booking; red-flag words (chest pain, breathing difficulty, heavy bleeding, suicide…) → emergency message + immediate forward to doctor.
- **Grounded answers only.** Prices, services, timings come from the clinic's own data; if unknown → "I'll ask the team" and forward. No invented prices or doctors.
- **Privacy.** Phone numbers masked in DB and UI; no patient data in prompts beyond what the task needs; no data shared across clinics (RLS); logs auto-deleted in demo mode.
- **Prompt-injection defence.** Patient messages are data, never instructions; tool calls validated against a schema (e.g. booking only inside opening hours, only existing doctors/services).
- **Action limits.** AI can book/reschedule/cancel; refunds, discounts and anything financial need a human.
- **Human hand-off** always available ("talk to a person").
- **Rate limits & spam protection** on public webhooks and the demo form.

## 4. Evals (quality checks before and after go-live)

- **Eval set per module**: 50–100 realistic test conversations in English, Arabic, Urdu (booking, price question, emergency, angry patient, off-topic, injection attempt, wrong doctor name…).
- **Automatic scoring** by an LLM judge + hard rules: correct outcome, no medical advice, no hallucinated price, correct escalation, language matched, tone.
- **Pass gate**: a new prompt/agent version ships only if it scores ≥ the current version and has 0 safety failures.
- **Production monitoring**: random sample of real conversations scored daily; failures appear on an internal "Quality" page.
- Results stored in `eval_runs` / `eval_results` tables and charted.

## 5. Phases

| Phase | Deliverable | Status |
|---|---|---|
| 0 | Dashboard (KPIs, calendar, feed, calls, WhatsApp, reports, settings), Supabase, Vercel | ✅ done |
| **1** | **Multi-clinic database + Instant Demo** (`/get-demo`, `/demo/<clinic>` valid for 7 days, DEMO-01 workflow: build demo, enrich from website, send link by WhatsApp/email, notify Fahd, track demo views) | 🔨 in progress |
| 2 | **Trial engine**: Fahd starts a 7-day trial with one click → login created and sent, data import (CSV/Sheets), day-1/3/6 nudges, day-6 usefulness survey, auto-expiry | next |
| 3 | **Front desk live**: CD-01 activity logger, phone/WhatsApp/web agents as per-clinic templates, guardrails + first eval sets | |
| 4 | **Accounts & finance**: expenses (receipt photo → AI), income, daily/monthly P&L, reports | |
| 5 | Follow-ups, reviews, lead-gen CRM, social media | |
| 6 | Inventory, staff, support desk, billing | |

## 6. Compliance — handled per client at onboarding

The product is global: any clinic founder or owner, in any country, can request a demo.

- **Demo (7 days)** runs on sample data only, so no patient data is involved. Demo links expire automatically after 7 days.
- **When a client decides to go ahead**, we ask about their country's rules and set them up before their real data goes in. Typical questions:
  - Where must health data be stored? Some countries (e.g. the UAE) require local hosting; others need an EU region (GDPR).
  - Is a data processing agreement or privacy notice required?
  - Do AI phone calls need a recording-consent message?
  - Which messaging rules apply (WhatsApp opt-in, marketing consent)?
- Hosting is then chosen per client: the shared project for most clients, or a dedicated database in the required region when the law demands it.
