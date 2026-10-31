# Clinic Kit — every clinic is a copy of the Surina project

Decision 31 Oct 2026. The Surina project (n8n folder **"client suri workflows"**, SUR-00…24) is the finished clinic product.
Each new clinic (first: BushyPark Dental) gets its own copy, changed only where needed. The Surina workflows themselves are never edited.

## Per clinic (nothing shared between clinics)
| Part | Per clinic | Why |
|---|---|---|
| Google account (e.g. `bushypark.demo@…`) | own | holds the clinic's Sheet CRM, Calendar and Gmail; is the 7-day login we give the clinic; can be handed over if the client leaves |
| Google Sheet CRM (`Pacienti`, `Sporocila`) | own | patient list + message log (same columns as Surina) |
| Google Calendar | own | bookings, free/busy, reminders; staff edit it directly |
| WhatsApp number (Cloud API) | own — Fahd provides a new number per demo | chatbot + reminder templates |
| Chat memory | own table / own database | no mixing with other clinics or other projects |
| Vapi voice | own assistant(s); keypad language menu (LANG-01) only when the clinic has more than one voice language | |
| n8n workflows | own copies `KIT-<CLINIC>-00…` in a folder per clinic | can be unpublished after the 7-day demo, or exported and handed over |

## Copy map (Surina → Kit)
| Surina | Kit | Change |
|---|---|---|
| SUR-01 AI Brain | KIT-01 | Client Config node holds everything clinic-specific (name, languages, hours, holidays, country code, knowledge, guardrails); guardrail checks before/after the agent |
| SUR-00 WhatsApp Inbound | KIT-00 | the clinic's own number; no "demo CODE" switching |
| SUR-02/03/04 Calendar tools | KIT-02/03/04 | **logic unchanged**; hours, holidays, timezone, slot length and country code come from the config |
| SUR-05 save_lead, SUR-10 CRM | KIT-05/10 | + separate **hot-lead alarm to the owner** (email + WhatsApp) |
| SUR-06 Reminders, SUR-08 After visit | KIT-06/08 | templates per clinic language |
| SUR-07 Website chat + demo page | KIT-07 | clinic branding from config |
| SUR-12 Weekly report, SUR-13 Dashboard | KIT-12/13 | owner email, key from config |
| SUR-20/21/24 Voice | KIT-20 + LANG-01 | English clinics: one assistant; multi-language clinics: keypad menu |
| SUR-99 Error handler | KIT-99 | alerts Fahd |

WhatsApp/web chat may answer in several languages in one bot (works in Surina). Only voice needs the language menu.

## Added on top of Surina
1. **Knowledge Builder** — input: website URL (all key pages), brochures / catalogues / price lists (PDF). Output: a knowledge draft (hours, team, services, prices "from", payment, policies, NOT KNOWN list) that Fahd or the clinic **approves** before the bot uses it.
2. **Guardrails in code** (not only in the prompt):
   - input: prompt-injection / role-change attempts, abuse, spam floods, other patients' data requests;
   - output: price or time that is not in the knowledge / tool result, medicine names or doses, diagnosis wording, wrong language, too long; a failed check replaces the reply with a safe answer + team call-back.
3. **Evals per clinic** — `evals/` framework, cases generated from the clinic config (prices, hours, team, languages) + the fixed safety set; release gate before the clinic gets the number.

## Demo lifecycle (7 days)
1. Prospect says yes → collect sources (website, brochure, price list) + owner email/phone.
2. Create the clinic's Google account, Sheet, Calendar; new WhatsApp number; copy the Kit; run Knowledge Builder; approve knowledge.
3. Evals + scripted test calls/chats pass → send the clinic: WhatsApp number, phone number, chat link, login (Google account) for their patient list.
4. Day 7: change the login password, unpublish the clinic's workflows (or convert to paid).
The Clinic OS dashboard (Vercel) stays as a showcase for prospects who don't want to share API keys.

## Build order
1. KIT config + tools KIT-02/03/04/05/10 (calendar + CRM) for BushyPark, tested with a test calendar.
2. KIT-01 AI Brain + guardrails + KIT-00 WhatsApp + KIT-07 web chat; evals.
3. Hot-lead alarm, KIT-06/08 reminders, KIT-12/13 report + dashboard, KIT-99.
4. KIT-20 voice (English), Knowledge Builder (website + PDF).
5. "New clinic" runbook: copy the whole kit for the next clinic in < 1 day.
