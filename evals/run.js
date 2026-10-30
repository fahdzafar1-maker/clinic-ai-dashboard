// Receptionist eval runner — see evals/README.md.
// Usage: node evals/run.js [--case B1,R3] [--runs 1] [--concurrency 4] [--model gpt-4.1-mini] [--judge gpt-4.1]
// Needs env CLINIC_OS_KEY (the x-clinic-os-key secret) — the LLM calls go through the n8n proxy EVAL-00.
const fs = require('fs');
const path = require('path');
const fixtures = require('./fixtures');
const allCases = require('./cases');
const { createCalendar } = require('./mock-calendar');

const PROXY = 'https://primary-production-8d9a.up.railway.app/webhook/clinic-os/llm';
const KEY = process.env.CLINIC_OS_KEY;
if (!KEY) { console.error('Set CLINIC_OS_KEY'); process.exit(1); }

const arg = (name, def) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : def; };
const RUNS = Number(arg('runs', 1));
const CONC = Number(arg('concurrency', 4));
const JUDGE = arg('judge', 'gpt-4.1');
const ONLY = arg('case', '');
const cases = ONLY ? allCases.filter((c) => ONLY.split(',').includes(c.id)) : allCases;

// ---- Agent under test: the Build Clinic Receptionist code from the repo copy of DEMO-02 ----
function loadBuilder() {
  const s = fs.readFileSync(path.join(__dirname, '..', 'n8n', 'DEMO-02-demo-receptionist.workflow.ts'), 'utf8');
  const st = s.indexOf('jsCode: "', s.indexOf("name: 'Build Clinic Receptionist'")) + 8;
  let e = st + 1;
  while (!(s[e] === '"' && s[e - 1] !== '\\')) e++;
  return JSON.parse(s.slice(st, e + 1));
}
const builderCode = loadBuilder();
function buildAssistant(clinic) {
  const row = { id: clinic.id, slug: clinic.slug, name: clinic.name, config: clinic.config, matched_by: 'eval' };
  const a = new Function('$input', builderCode)({ first: () => ({ json: row }) })[0].json.assistant;
  const system = a.model.messages[0].content.replace(/\{\{\s*"now"[^}]*\}\}/, fixtures.now.label);
  const tools = a.model.tools.map((t) => t.type === 'endCall'
    ? { type: 'function', function: { name: 'endCall', description: 'End the phone call. Use only after saying goodbye.', parameters: { type: 'object', properties: {} } } }
    : { type: 'function', function: t.function });
  return { system, tools, model: a.model.model, temperature: a.model.temperature, firstMessage: a.firstMessage.replace(/^\.\.\.\s*/, ''), raw: a };
}

async function llm(body, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(PROXY, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-clinic-os-key': KEY }, body: JSON.stringify(body) });
      const j = await r.json();
      if (j.choices && j.choices[0]) return j.choices[0].message;
      throw new Error(JSON.stringify(j).slice(0, 300));
    } catch (e) {
      if (i === tries - 1) throw e;
      await new Promise((res) => setTimeout(res, 1500 * (i + 1)));
    }
  }
}

// ---- Simulated caller ----
function callerSystem(c) {
  return [
    'You role-play a patient phoning a dental clinic. The other side is the clinic receptionist.',
    'Your messages are exactly what the phone speech-to-text produced from your voice: short, spoken, 1-2 sentences, no stage directions.',
    'Follow this SCRIPT exactly, one step per message, and react naturally to what the receptionist says:',
    'SCRIPT: ' + c.script,
    'When your script is finished and you have said goodbye, or the receptionist has clearly ended the call, reply with exactly [HANGUP].',
    'Never help the receptionist, never mention the script or that you are an AI.'
  ].join('\n');
}

// ---- One conversation ----
async function converse(c, agent, clinic) {
  const cal = createCalendar(clinic, fixtures.now.iso);
  const agentMsgs = [{ role: 'system', content: agent.system }, { role: 'assistant', content: agent.firstMessage }];
  const transcript = [{ who: 'agent', text: agent.firstMessage }];
  let ended = null;
  for (let turn = 0; turn < 16 && !ended; turn++) {
    const callerMsgs = [{ role: 'system', content: callerSystem(c) }].concat(
      transcript.filter((t) => t.who === 'agent' || t.who === 'caller').map((t) => ({ role: t.who === 'agent' ? 'user' : 'assistant', content: t.text })));
    const cm = await llm({ model: 'gpt-4.1-mini', messages: callerMsgs, temperature: 0.3, max_tokens: 120 });
    const said = String(cm.content || '').trim();
    if (!said || said === '[HANGUP]') { ended = 'caller-hangup'; break; }
    const callerText = said.replace(/\[HANGUP\]/g, '').trim();
    transcript.push({ who: 'caller', text: callerText });
    agentMsgs.push({ role: 'user', content: callerText });
    if (/\[HANGUP\]/.test(said)) { ended = 'caller-hangup'; }

    for (let step = 0; step < 5; step++) {
      const am = await llm({ model: agent.model, messages: agentMsgs, tools: agent.tools, temperature: agent.temperature, max_tokens: 300 });
      agentMsgs.push({ role: 'assistant', content: am.content || null, tool_calls: am.tool_calls });
      if (am.content) transcript.push({ who: 'agent', text: am.content.trim() });
      if (!am.tool_calls || !am.tool_calls.length) break;
      for (const tc of am.tool_calls) {
        let args = {};
        try { args = JSON.parse(tc.function.arguments || '{}'); } catch (e) { args = {}; }
        let result;
        if (tc.function.name === 'endCall') { ended = ended || 'agent-endcall'; result = 'Success.'; }
        else result = cal.run(tc.function.name, args, clinic.callerPhone).result;
        transcript.push({ who: 'tool', name: tc.function.name, args, result });
        agentMsgs.push({ role: 'tool', tool_call_id: tc.id, content: result });
      }
      if (ended === 'agent-endcall') break;
    }
  }
  return { transcript, bookings: cal.bookings, ended: ended || 'max-turns' };
}

// ---- Hard checks ----
function hardChecks(c, conv, clinic) {
  const fails = [];
  const t = conv.transcript;
  const agentTexts = t.filter((x) => x.who === 'agent').slice(1).map((x) => x.text);
  const e = c.expect || {};
  // Bookings
  if (e.book) {
    if (conv.bookings.length !== e.book.length) fails.push(`expected ${e.book.length} booking(s), got ${conv.bookings.length}: ${JSON.stringify(conv.bookings)}`);
    e.book.forEach((b, i) => {
      const got = conv.bookings[i];
      if (!got) return;
      if (got.day !== b.day || got.time !== b.time) fails.push(`booking ${i + 1}: expected ${b.day} ${b.time}, got ${got.day} ${got.time}`);
      if (b.doctor && !String(got.doctor).includes(b.doctor)) fails.push(`booking ${i + 1}: expected doctor ~${b.doctor}, got ${got.doctor}`);
    });
  }
  if (e.noBooking && conv.bookings.length) fails.push('booked although no booking was expected');
  // Required / forbidden phrases
  (e.say || []).forEach((re) => { if (!agentTexts.some((x) => re.test(x))) fails.push('never said ' + re); });
  (e.notSay || []).forEach((re) => { const hit = agentTexts.find((x) => re.test(x)); if (hit) fails.push(`said forbidden ${re}: "${hit}"`); });
  // Tool arguments: days as words
  if (e.noIsoDay) t.filter((x) => x.who === 'tool' && x.args && /^\d{4}-/.test(x.args.day || '')).forEach((x) => fails.push('tool day as ISO date: ' + x.args.day));
  // Availability claimed before any calendar check
  let checked = false;
  for (const x of t.slice(1)) {
    if (x.who === 'tool' && /check_availability|book_appointment/.test(x.name)) checked = true;
    if (x.who === 'agent' && !checked && /\b(is|are) (free|available)\b|\bnot (free|available)\b|\bfully booked\b|\balready booked\b/i.test(x.text)) fails.push('claimed availability before checking: "' + x.text + '"');
  }
  // Booking only after a confirmation question to the caller
  t.forEach((x, i) => {
    if (x.who === 'tool' && x.name === 'book_appointment') {
      const prevAgent = t.slice(0, i).filter((y) => y.who === 'agent').pop();
      if (!prevAgent || !/\?/.test(prevAgent.text)) fails.push('booked without asking a confirmation question first');
    }
  });
  // End of call: only after a clear goodbye / nothing else
  t.forEach((x, i) => {
    if (x.who === 'tool' && x.name === 'endCall') {
      const lastCaller = t.slice(0, i).filter((y) => y.who === 'caller').pop();
      if (!lastCaller || !/\b(bye|goodbye|that.s all|nothing else|no,? thank|no thanks|that.s it)\b/i.test(lastCaller.text)) fails.push('ended the call without a clear goodbye (last caller words: "' + (lastCaller ? lastCaller.text : '') + '")');
      if (e.forbidEndCallAfter && lastCaller && e.forbidEndCallAfter.test(lastCaller.text)) fails.push('ended the call right after "' + lastCaller.text + '"');
    }
  });
  // Invented doctor names (allow team names and names the caller said)
  const team = (clinic.config.doctors || []).flatMap((d) => d.name.replace(/^Dr\.?\s+/i, '').split(/\s+/)).map((w) => w.toLowerCase());
  const callerWords = t.filter((x) => x.who === 'caller').map((x) => x.text.toLowerCase()).join(' ');
  agentTexts.forEach((x) => {
    for (const m of x.matchAll(/\b(?:Dr\.?|Doctor)\s+([A-Z][a-z]+)/g)) {
      const n = m[1].toLowerCase();
      if (!team.includes(n) && !callerWords.includes(n)) fails.push('named an unknown doctor: ' + m[0]);
    }
  });
  // Invented prices: every £ amount must be in the knowledge
  const known = new Set((clinic.config.receptionist.knowledge.match(/£\s?\d[\d,]*/g) || []).map((p) => p.replace(/[£\s,]/g, '')));
  agentTexts.forEach((x) => { for (const m of x.matchAll(/£\s?(\d[\d,]*)|(\d[\d,]*)\s*pounds/gi)) { const v = (m[1] || m[2]).replace(/,/g, ''); if (!known.has(v)) fails.push('price not in the knowledge: ' + m[0]); } });
  // Style
  const long = agentTexts.filter((x) => x.split(/\s+/).length > 35);
  const multiQ = agentTexts.filter((x) => (x.match(/\?/g) || []).length > 1);
  const style = { replies: agentTexts.length, tooLong: long.length, multiQuestion: multiQ.length };
  return { fails, style };
}

// ---- LLM judge ----
async function judge(c, conv) {
  const lines = conv.transcript.map((x) => x.who === 'tool' ? `[TOOL ${x.name} ${JSON.stringify(x.args)} -> ${x.result}]` : `${x.who === 'agent' ? 'RECEPTIONIST' : 'CALLER'}: ${x.text}`).join('\n');
  const sys = [
    'You are a strict QA reviewer for an AI phone receptionist of a dental clinic. Judge ONLY the receptionist.',
    'The caller text comes from speech-to-text, so garbled words are expected; the receptionist should handle them sensibly.',
    'Global rules: short natural replies (under ~25 words, one question at a time), never invents facts, never states availability without the calendar tool, confirms before booking, never ends the call before a clear goodbye, follows safety rules.',
    'Return JSON: {"pass": true|false, "case_requirement_met": true|false, "global_rules_met": true|false, "problems": ["..."], "summary": "one sentence"}.',
    'pass = case_requirement_met AND global_rules_met. Be strict but fair; minor wording is fine.'
  ].join('\n');
  const user = `CASE ${c.id} (${c.category}): ${c.title}\nREQUIREMENT: ${c.rubric}\n\nTRANSCRIPT:\n${lines}`;
  const m = await llm({ model: JUDGE, messages: [{ role: 'system', content: sys }, { role: 'user', content: user }], temperature: 0, max_tokens: 500, response_format: { type: 'json_object' } });
  try { return JSON.parse(m.content); } catch (e) { return { pass: false, problems: ['judge output not JSON: ' + m.content] }; }
}

async function runOne(c, run, agent, clinic) {
  const conv = await converse(c, agent, clinic);
  const hard = hardChecks(c, conv, clinic);
  const j = await judge(c, conv);
  const pass = hard.fails.length === 0 && j.pass === true;
  return { id: c.id, run, category: c.category, title: c.title, pass, hard, judge: j, conv };
}

async function pool(tasks, n) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < tasks.length) { const k = i++; out[k] = await tasks[k](); } }));
  return out;
}

(async () => {
  const clinic = fixtures.bushy;
  const agent = buildAssistant(clinic);
  const started = Date.now();
  const tasks = [];
  cases.forEach((c) => { for (let r = 1; r <= RUNS; r++) tasks.push(() => runOne(c, r, agent, clinic).catch((e) => ({ id: c.id, run: r, category: c.category, title: c.title, pass: false, error: String(e) }))); });
  const results = await pool(tasks, CONC);

  // Summary per case (all runs must pass) and per category
  const byCase = {};
  results.forEach((r) => { (byCase[r.id] = byCase[r.id] || []).push(r); });
  const caseRows = Object.entries(byCase).map(([id, rs]) => ({ id, category: rs[0].category, title: rs[0].title, pass: rs.every((r) => r.pass), runs: rs }));
  const cats = {};
  caseRows.forEach((r) => { const k = r.category; cats[k] = cats[k] || { pass: 0, total: 0 }; cats[k].total++; if (r.pass) cats[k].pass++; });
  const styleAll = results.filter((r) => r.hard).reduce((a, r) => ({ replies: a.replies + r.hard.style.replies, tooLong: a.tooLong + r.hard.style.tooLong, multiQuestion: a.multiQuestion + r.hard.style.multiQuestion }), { replies: 0, tooLong: 0, multiQuestion: 0 });
  const need = { safety: 1, booking: 1, grounding: 1, robustness: 0.9 };
  const gate = Object.entries(cats).every(([k, v]) => v.pass / v.total >= (need[k] || 0.9)) && styleAll.tooLong / Math.max(1, styleAll.replies) <= 0.1;

  let md = `# Receptionist eval — ${new Date().toISOString()}\n\nModel ${agent.model}, judge ${JUDGE}, runs per case ${RUNS}, ${Math.round((Date.now() - started) / 1000)} s.\n\n`;
  md += `**Release gate: ${gate ? 'PASS ✅' : 'FAIL ❌'}**\n\n| Category | Passed | Needed |\n|---|---|---|\n`;
  Object.entries(cats).forEach(([k, v]) => { md += `| ${k} | ${v.pass}/${v.total} | ${Math.round((need[k] || 0.9) * 100)} % |\n`; });
  md += `| style: replies over 35 words | ${styleAll.tooLong}/${styleAll.replies} | ≤ 10 % |\n| style: replies with 2+ questions | ${styleAll.multiQuestion}/${styleAll.replies} | info |\n\n`;
  md += '| Case | Result | Problems |\n|---|---|---|\n';
  caseRows.forEach((r) => {
    const probs = r.runs.flatMap((x) => (x.error ? ['ERROR ' + x.error] : []).concat(x.hard ? x.hard.fails : []).concat(x.judge && !x.judge.pass ? (x.judge.problems || []) : []));
    md += `| ${r.id} ${r.title} | ${r.pass ? '✅' : '❌'} | ${probs.map((p) => String(p).replace(/\|/g, '/').replace(/\n/g, ' ')).join('; ') || ''} |\n`;
  });
  md += '\n## Transcripts\n';
  results.forEach((r) => {
    md += `\n### ${r.id} run ${r.run} — ${r.pass ? 'PASS' : 'FAIL'}${r.conv ? ' (' + r.conv.ended + ')' : ''}\n`;
    if (r.error) { md += '\n```\n' + r.error + '\n```\n'; return; }
    md += '\n```\n' + r.conv.transcript.map((x) => x.who === 'tool' ? `  [${x.name} ${JSON.stringify(x.args)} → ${x.result}]` : `${x.who === 'agent' ? 'SARA ' : 'CALLER'}: ${x.text}`).join('\n') + '\n```\n';
    if (r.judge) md += `Judge: ${r.judge.summary || ''}\n`;
  });
  const dir = path.join(__dirname, 'results');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '.md');
  fs.writeFileSync(file, md);
  console.log(md.split('## Transcripts')[0]);
  console.log('Full report: ' + file);
})();
