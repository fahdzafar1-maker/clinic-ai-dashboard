# Problems clinics hit with AI front-desk automation, and our fixes

Research 30 Oct 2026 (Reddit/reviews, Vapi support forum, n8n community, WhatsApp API docs, compliance guides).
Goal: be ready before the first paying client. Status: ✅ done · 🟡 partial · ❌ missing.

| # | Problem (what clients complain about) | Our status | Fix plan |
|---|---|---|---|
| 1 | **Booking without a real calendar**: AI offers times that are already taken → double bookings | ❌ Sara invents "two free times" | n8n tool `check_slots` + `book_slot` called during the call/chat; reads booked appointments in `activity` (later Google Calendar / PMS); DB unique index per doctor+time |
| 2 | **No real hand-off to a human** (urgent, complaint, "real person") | 🟡 says "team will call back" only | Vapi `transferCall` to the clinic number in opening hours; after hours a **callback task** row on the dashboard + WhatsApp/email alert to the clinic |
| 3 | **Wrong or invented information** (team, prices, insurance) | 🟡 knowledge-only rules; fake team fixed 30 Oct | Eval set of ~30 test questions per clinic run before every demo/go-live; "not in knowledge → pass to team" already in prompt |
| 4 | **Slow replies / talking over the caller** (2–4 s feels broken) | 🟡 measured ~2.4 s turn latency | Shorter prompt, keep gpt-4.1-mini, tune endpointing per language, track `turnLatencyAverage` per call on the agency side |
| 5 | **Loops, repeating questions, misheard names** | 🟡 prompt rules | Spell-back of the name once, caller ID instead of asking the phone number, max 2 retries then hand-off (#2) |
| 6 | **No-shows** — reminders still done by staff | ❌ | Reminder flow: WhatsApp template 24 h before + confirm/reschedule reply; SMS/email fallback |
| 7 | **Integration with the clinic's calendar/PMS** (data typed twice) | ❌ | Phase 1 Google Calendar sync; phase 2 per-client PMS API (Dentally, Cliniko, etc.) at onboarding |
| 8 | **WhatsApp 24-hour window / template rejection** (error 131047) | ❌ (DEMO-03 not built) | Design DEMO-03 with approved utility templates for reminders/follow-ups; free text only inside 24 h |
| 9 | **Duplicate / double replies** (webhook retries, fast messages) | 🟡 web chat: DB unique index | WhatsApp: dedupe on message id + 5–10 s debounce per sender before the AI replies |
| 10 | **Spam calls and runaway costs** | 🟡 max 8 min, 30 s silence | Monthly minute cap per clinic (plan limit), block numbers with >N calls/hour, alert when 80 % used |
| 11 | **Consent & disclosure** (recording consent, AI disclosure, GDPR/HIPAA, EU AI Act Aug 2026) | 🟡 honest if asked; recordings hidden from dashboard | Per-clinic setting: "This call may be recorded / I'm the AI assistant" line in greeting; recording on/off; retention days; DPA template; HIPAA only with BAA vendors |
| 12 | **Emergencies handled by a bot** | 🟡 prompt tells caller to call emergency number | Real alert to the doctor on duty (WhatsApp/SMS) + flag on dashboard |
| 13 | **Automation silently stops** (n8n crash, webhook lost, OpenAI credits empty) | 🟡 seen once (credits) | n8n Error Workflow → email/WhatsApp alert; daily health check call; OpenAI auto-recharge; Railway memory alerts; backups |
| 14 | **Patients distrust a robot / owner fears losing patients** | 🟡 natural voice, short replies | Show call summaries + outcomes on dashboard (proof), easy "talk to a person", weekly report to the owner |

## Order of work (practice tasks before the first client)
1. #1 Real availability + booking tool (biggest risk: double booking)
2. #2 Human hand-off + callback tasks
3. #13 Error alerts / health check
4. #10 Minute caps + spam guard
5. #11 Consent/disclosure settings
6. #3 Eval set (auto test questions per demo)
7. #6 + #8 Reminders via WhatsApp templates (with DEMO-03)
8. #7 Google Calendar sync
9. #4 / #5 Voice latency + name spell-back tuning
10. #12 Emergency alert

## Sources
- AI receptionist complaints: https://s10.ai/blog/ai-receptionist-for-doctors-reddit-reviews-real-feedback-best-options-compared · https://www.allblogthings.com/2025/08/ai-dental-receptionists-and-what-to-look-out-for.html
- GP practice that dropped its AI receptionist: https://www.resultsense.com/news/2026-09-23-fakenham-gp-drops-emma-ai-receptionist/
- Voice agent latency/interruptions: https://assemblyai.com/blog/biggest-challenges-building-ai-voice-agents-how-assemblyai-vapi-are-solving-them · https://support.vapi.ai/t/27532450/high-latency-problem-in-vapi-what-could-be-the-reason · https://mo-cms.botica.it.com/blog/voice-ai-agents-vapi-retell-scaling
- Double booking / integrations / no-shows: https://www.simbo.ai/blog/?p=157605 · https://dev.to/aiyouimagine/ai-calendar-integration-for-healthcare-clinics-52ph
- WhatsApp 24 h window & templates: https://www.getmacha.com/blog/whatsapp-ai-agent-template-rejected-24-hour-window · https://pub.towardsai.net/whatsapp-business-api-conversation-design-building-llm-assistants-around-the-24-hour-window-and-71c58fca559c
- Duplicate replies / debounce: https://n8n.io/workflows/19116-debounce-and-buffer-whatsapp-ai-replies-with-redis-and-google-gemini/ · https://knowledge.bitbybit.studio/bitchat/troubleshooting-duplicate-bot-messages
- n8n production failures: https://hookdeck.com/webhooks/platforms/how-to-prevent-n8n-webhook-overload · https://station.railway.com/questions/n8n-worker-keeps-crashing-with-deploy-r-28db0624
- Spam/cost: https://community.retellai.com/t/request-for-fee-waiver-due-to-spam-calls-on-voice-agent/371 · https://justcall.io/troubleshoot/ai-voice-agent-high-cost/
- Compliance: https://futureagi.com/blog/voice-ai-regulatory-compliance-2026 · https://www.trillet.ai/blogs/voice-ai-compliance-requirements-2026 · https://www.retellai.com/learn/hipaa-compliance-for-ai-phone-agents-what-healthcare-teams-need-to-know
