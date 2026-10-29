# Clinic OS — Master Plan

A complete AI automation system for clinics and hospitals, sold by Fahd AI Services.
Goal: **everything clinics have ever asked agencies or freelancers to automate, in one system, with no gaps.**
Sales motion: **a clinic owner asks for a demo → gets a demo kit branded as their own clinic (login, links, an AI receptionist number and a WhatsApp chatbot number) → uses it for 7 days → buys.**

---

## 1. The demo kit (what a prospect receives)

When a clinic owner asks for a demo, we put their clinic's details into the demo system and deliver:

| Item | What it is | Status |
|---|---|---|
| **Branded login** | Their own login to the dashboard, showing their clinic name, logo, colours, doctors and services | demo page ✅, login per demo 🔨 |
| **Links** | Dashboard link, public demo link, website chat widget link | ✅ / widget planned |
| **AI receptionist number** | Our shared demo phone number (Vapi). When the owner calls, the AI answers **as their clinic** | planned |
| **WhatsApp chatbot number** | Our shared demo WhatsApp number (+92 323 5102143, coexistence). The bot answers **as their clinic** | number being set up |
| **Live dashboard** | Every call and chat the owner makes appears in their dashboard within seconds | ✅ (Realtime) |

### How one shared number can act as many clinics
- When a demo is created we store the owner's phone number with that demo.
- When a call or WhatsApp message comes in, n8n looks up the caller's number → finds their demo clinic → loads that clinic's name, doctors, services, hours and language into the voice agent / chatbot for that conversation.
- Unknown number (e.g. the owner's staff) → the agent asks for the short **demo code** sent with the demo kit (e.g. `SMILE-24`) and continues as that clinic.
- Every conversation is logged to `activity` under that demo clinic, so it shows up live in the owner's dashboard.

### Separate numbers + coexistence
- The **voice receptionist** and the **WhatsApp chatbot** use separate numbers.
- WhatsApp runs in **coexistence mode**: the number is first registered on the **WhatsApp Business App**, then connected to the Cloud API through Meta's onboarding. Staff keep replying from the phone app, the AI replies through the API, and the chats stay in sync.
- Clinic owners often demand coexistence (they keep their existing number and app), so the paid product offers it for the clinic's own number too.
- Coexistence limits: some app features stop (e.g. broadcast lists, disappearing messages), it isn't available in every country, and the Business App must be opened at least every ~14 days.

## 2. How a clinic moves through the system

```
 Lead                      Demo kit (7 days)              Onboarding                      Paying client
 ───────────────────────► ─────────────────────────────► ─────────────────────────────► ──────────────────────────►
 Client Hunter, website,   /get-demo form, WhatsApp,     Clinic says yes → we ask about   All modules live on the
 Instagram/FB, referrals   or Fahd enters it manually →  local laws, hosting, their       clinic's own numbers
                           DEMO-01 builds the branded    existing software (integrate or  (coexistence), monthly
                           demo, login, demo code;       replace), then connect their     reports, support
                           owner calls/chats the demo    numbers and import real data
                           numbers and sees it live
 status: lead              status: demo                   status: trial                    status: active
```

Every clinic is one row in `clinics` (multi-tenant). One database and one app serve demos, trials and paying clinics; RLS keeps each clinic's data private.

## 3. Full feature catalogue

Everything below is in scope. Where a clinic already uses software (e.g. Hipokrat, Dampsoft, Dentally, Pabau, Doctolib), we integrate when it has an API, or offer our module as the replacement.

| # | Module | What gets automated |
|---|---|---|
| A | **AI phone receptionist** | Answers 24/7 in the caller's language, books/reschedules/cancels, FAQs, prices from clinic data, missed-call call-back, **live transfer to a human when the patient is unhappy or it's urgent**, call recording + summary, after-hours mode |
| B | **WhatsApp & chat** | WhatsApp chatbot (coexistence), **voice-note understanding and reply**, website chat widget, Instagram/Facebook DM bot, WhatsApp calling agent (where available), multilingual |
| C | **Appointments** | Calendar per doctor and room, online booking page, Google Calendar / Cal.com sync, reminders 24h + 2h, confirmations, no-show follow-up, **waitlist auto-fill** of cancelled slots, deposits for high-value bookings |
| D | **Patient journey** | Digital intake and consent forms before the visit, pre-visit instructions, post-visit care instructions, recall ("6-month check-up due"), treatment-plan follow-ups, birthday/anniversary messages, re-activation of patients who haven't come back |
| E | **Reviews & reputation** | Review requests after happy visits, unhappy feedback routed privately to the owner, Google Business replies, rating monitoring |
| F | **Lead generation & CRM** | Leads from ads, social, website and calls in one pipeline, AI qualification, automatic follow-up sequences, referral programme, source/ROI tracking |
| G | **Marketing & social media** | Content calendar, AI posts/carousels/reels per clinic, auto-publishing, Google Business posts, WhatsApp/email campaigns with consent, seasonal offers |
| H | **Accounts & finance** | Daily income, expense logging by photo of a receipt (AI reads it), categories, **daily and monthly P&L**, cash flow, doctor-wise revenue, tax/VAT summary, overdue-payment reminders |
| I | **Invoices & payments** | Invoices and receipts, payment links, instalment plans, insurance pre-approval and claim checklists |
| J | **Patient records (light)** | Patient profiles, visit history, documents and lab-result notifications (full medical records only where local law and the clinic's existing system allow) |
| K | **Inventory** | Consumables stock, low-stock alerts, expiry tracking, supplier re-order drafts |
| L | **Staff & operations** | Doctor schedules and leave, room/chair allocation, daily briefing to each doctor ("9 patients today"), task lists, multi-branch support |
| M | **Reports** | **Daily morning WhatsApp summary to the doctor/owner**, weekly email report, monthly business review (calls, bookings, revenue, profit, marketing ROI, AI quality) |
| N | **Support desk** | Complaints and tickets, escalation rules, SLA tracking |
| O | **Telehealth extras** | Video-consultation links, prescription-refill requests routed to the doctor |

## 4. Guardrails (applied to every AI agent)

- **No medical advice or diagnosis.** Symptoms → offer booking; red-flag words (chest pain, breathing difficulty, heavy bleeding, severe pain, suicide…) → emergency message + immediate transfer/forward to a human.
- **Grounded answers only.** Prices, services, timings come from the clinic's own data; if unknown → "I'll ask the team" and forward. No invented prices or doctors.
- **Privacy.** Phone numbers masked in DB and UI; no patient data in prompts beyond what the task needs; no data shared across clinics (RLS); demo data auto-deleted after 3 or 7 days.
- **Prompt-injection defence.** Patient messages and website text are data, never instructions; tool calls validated against a schema (e.g. booking only inside opening hours, only existing doctors/services).
- **Action limits.** AI can book/reschedule/cancel; refunds, discounts and anything financial need a human.
- **Human hand-off** always available ("talk to a person").
- **Accounts.** We never ask for a client's passwords; external services are connected with OAuth ("connect/share"). The clinic owns its accounts.
- **Rate limits & spam protection** on public webhooks and the demo form.

## 5. Evals (quality checks before and after go-live)

- **Eval set per module**: 50–100 realistic test conversations in English, Arabic, Urdu and the clinic's local language (booking, price question, emergency, angry patient, off-topic, injection attempt, wrong doctor name…).
- **Automatic scoring** by an LLM judge + hard rules: correct outcome, no medical advice, no hallucinated price, correct escalation, language matched, tone.
- **Pass gate**: a new prompt/agent version ships only if it scores ≥ the current version and has 0 safety failures.
- **Production monitoring**: random sample of real conversations scored daily; failures appear on an internal "Quality" page.
- Results stored in `eval_runs` / `eval_results` tables and charted.

## 6. Build phases (order is flexible — the complete product is what matters)

| Phase | Deliverable | Status |
|---|---|---|
| 0 | Dashboard (KPIs, calendar, feed, calls, WhatsApp, reports, settings), Supabase, Vercel | ✅ done |
| 1 | Multi-clinic database, `/get-demo`, branded `/demo/<clinic>` (7 days), DEMO-01 workflow, Leads & demos page | ✅ built — waiting for publish |
| 2 | **Demo kit**: login per demo, demo code, caller lookup, AI receptionist (Vapi) and WhatsApp chatbot acting as the demo clinic, every conversation logged live | next |
| 3 | Guardrails + eval sets for the voice agent and chatbot; human transfer; voice-note bot; daily morning summary | |
| 4 | Appointments & patient journey (reminders, waitlist, intake forms, recall, reviews) | |
| 5 | Accounts, invoices & payments, inventory | |
| 6 | Lead-gen CRM, marketing & social, staff & operations, support desk, telehealth extras | |

## 7. Compliance — handled per client at onboarding

The product is global: any clinic founder or owner, in any country, can request a demo.

- **Demo (7 days)** runs on sample data only, so no patient data is involved. Demo links expire automatically after 7 days.
- **When a client decides to go ahead**, we ask about their country's rules and set them up before their real data goes in. Typical questions:
  - Where must health data be stored? Some countries (e.g. the UAE) require local hosting; others need an EU region (GDPR).
  - Is a data processing agreement or privacy notice required?
  - Do AI phone calls need a recording-consent message?
  - Which messaging rules apply (WhatsApp opt-in, marketing consent)?
- Hosting is then chosen per client: the shared project for most clients, or a dedicated database in the required region when the law demands it.

## 8. Real-world problems to solve before the first paying client
Researched 30 Oct 2026 — full list, status and sources in [`CLIENT-PROBLEMS.md`](CLIENT-PROBLEMS.md). Practice order:
1. Real availability + booking tool (no invented free times, no double booking)
2. Human hand-off (transfer in opening hours) + callback tasks on the dashboard
3. Error alerts + daily health check (n8n, OpenAI credits, Vapi)
4. Monthly minute caps + spam guard per clinic
5. Consent / AI-disclosure / recording settings per clinic
6. Eval set: auto test questions before every demo and go-live
7. Reminders via WhatsApp templates (with DEMO-03, 24-hour window rules)
8. Google Calendar sync, later PMS integrations
9. Voice latency tuning (turn latency 2.4–3.1 s measured) + name spell-back + pronunciation of unusual doctor names
10. Emergency alert to the doctor on duty
