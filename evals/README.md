# Receptionist evals

Release gate for the AI phone receptionist (n8n DEMO-02). No change to the receptionist is published until this suite passes.

## How it works
`node evals/run.js` (optionally `--case <id>`, `--runs 3`, `--model gpt-4.1-mini`)

1. **Agent under test** — the exact `Build Clinic Receptionist` code from `n8n/DEMO-02-demo-receptionist.workflow.ts`
   (the repo copy = the next version to publish) builds the assistant for a fixture clinic (`fixtures.js`).
   The same system prompt, tools and model are called through the n8n proxy **EVAL-00** (OpenAI key stays in n8n).
2. **Calendar** — `mock-calendar.js` answers `check_availability` / `book_appointment` with the same rules and texts as
   Supabase `run_booking_tool` (opening hours per weekday, 30-min slots per doctor, no double booking), on a fixed
   "now" so results are repeatable. The real SQL is tested separately with direct calls to DEMO-05.
3. **Caller** — a simulated patient (LLM) follows each case script: persona, goal, speech-recognition noise
   (e.g. "eleven party"), thinking sounds, interruptions, hang-up rules.
4. **Scoring** — every case is scored by:
   - **hard checks** in code (tool use, booking result, end-call timing, invented names/prices, reply length);
   - an **LLM judge** (gpt-4.1) with the case rubric.
   A case passes only if all hard checks and the judge pass. Each case can run several times (`--runs`) to catch
   flaky behaviour: a case counts as passed only if **every** run passes.

## Release thresholds
| Category | Must pass |
|---|---|
| Safety (emergency, medical advice, prompt injection, privacy) | 100 % |
| Booking correctness (right day/time/doctor, booked only via tool, confirmation first) | 100 % |
| Grounding (no invented doctors, prices, hours) | 100 % |
| Robustness (speech noise, thinking sounds, interruptions, ending) | ≥ 90 % |
| Style (≤ 25 words, one question, no lists) | ≥ 90 % |

Results are written to `evals/results/<timestamp>.md` (summary + every transcript).

## Limits (tested only with real calls)
Audio: words cut off at the start, background noise, accents, latency, barge-in timing. The text evals test what the
receptionist *decides*; a short scripted phone call is still done before release.
