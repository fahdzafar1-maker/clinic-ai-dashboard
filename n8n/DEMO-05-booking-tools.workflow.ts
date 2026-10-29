import { workflow, node, trigger, sticky, ifElse, expr } from '@n8n/workflow-sdk';

const toolCalls = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'Tool Calls',
    position: [0, 300],
    parameters: { httpMethod: 'POST', path: 'clinic-os/tools', responseMode: 'responseNode', options: {} }
  },
  output: [{ headers: { 'x-clinic-os-key': 'REPLACE_WITH_VAPI_WEBHOOK_SECRET' }, query: { clinic: 'c2eb82fb-beb0-4863-9acd-60c9ef097e24' }, body: { message: { type: 'tool-calls', call: { id: 'call-1', customer: { number: '+923466998833' } }, toolCallList: [{ id: 'tc-1', function: { name: 'check_availability', arguments: { day: 'thursday', time: '12:00' } } }] } } }]
});

const readToolCalls = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Read Tool Calls',
    position: [220, 300],
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: "// Vapi sends the AI's tool calls (check_availability / book_appointment) here; the clinic id is in the URL.\nconst SECRET = 'REPLACE_WITH_VAPI_WEBHOOK_SECRET';\nconst first = $input.first().json;\nconst h = first.headers || {};\nconst q = first.query || {};\nconst m = (first.body && first.body.message) || {};\nconst call = m.call || {};\nconst clinic = String(q.clinic || '');\nconst authorized = h['x-clinic-os-key'] === SECRET && /^[0-9a-f-]{36}$/i.test(clinic);\nconst phone = (m.customer && m.customer.number) || (call.customer && call.customer.number) || '';\nlet list = Array.isArray(m.toolCallList) ? m.toolCallList : [];\nif (!list.length && Array.isArray(m.toolWithToolCallList)) list = m.toolWithToolCallList.map(function (t) { return t.toolCall; }).filter(Boolean);\nif (!authorized || !list.length) return [{ json: { authorized: false } }];\nreturn list.map(function (tc) {\n  const fn = tc.function || {};\n  let args = fn.arguments || tc.arguments || {};\n  if (typeof args === 'string') { try { args = JSON.parse(args); } catch (e) { args = {}; } }\n  return { json: { authorized: true, toolCallId: tc.id, tool: String(fn.name || tc.name || ''), args: args, clinic: clinic, phone: phone, call_id: String(call.id || '') } };\n});"
    }
  },
  output: [{ authorized: true, toolCallId: 'tc-1', tool: 'check_availability', args: { day: 'thursday', time: '12:00' }, clinic: 'c2eb82fb-beb0-4863-9acd-60c9ef097e24', phone: '+923466998833', call_id: 'call-1' }]
});

const authorizedCheck = ifElse({
  version: 2.3,
  config: {
    name: 'Authorized?',
    position: [440, 300],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{ leftValue: expr('{{ $json.authorized }}'), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and'
      }
    }
  }
});

const respondUnauthorized = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Respond Unauthorized',
    position: [660, 500],
    parameters: { respondWith: 'json', responseBody: '{"error":"unauthorized"}', options: { responseCode: 401 } }
  }
});

const runBookingTool = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Run Booking Tool',
    position: [660, 200],
    alwaysOutputData: true,
    onError: 'continueRegularOutput',
    parameters: {
      method: 'POST',
      url: 'https://qdnlpjvbelfibqthjwrz.supabase.co/rest/v1/rpc/run_booking_tool',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'supabaseApi',
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify({ p_clinic: $json.clinic, p_tool: $json.tool, p_args: $json.args, p_phone: $json.phone, p_call_id: $json.call_id, p_source: "call" }) }}'),
      options: { timeout: 8000 }
    },
    credentials: { supabaseApi: { id: 'dyGNoS79aELyAcvw', name: 'Supabase - Clinic Dashboard' } }
  },
  output: [{ ok: true, free: false, result: 'Thursday 5 November at 12:00 is NOT free. Nearest free times that day: 11:30, 12:30, 13:00.' }]
});

const buildResults = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Build Results',
    position: [880, 200],
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: "// One result per tool call, in the same order; if the calendar could not be reached the AI hands over to the team.\nconst calls = $('Read Tool Calls').all();\nconst results = $input.all().map(function (it, i) {\n  const r = it.json || {};\n  const text = typeof r.result === 'string' && r.result ? r.result : 'The calendar could not be checked just now. Do not promise a time: tell the caller the team will call back today to confirm the appointment.';\n  return { toolCallId: calls[i] ? calls[i].json.toolCallId : '', result: text };\n});\nreturn [{ json: { results: results } }];"
    }
  },
  output: [{ results: [{ toolCallId: 'tc-1', result: 'Thursday 5 November at 12:00 is NOT free.' }] }]
});

const respondResults = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Respond Results',
    position: [1100, 200],
    parameters: { respondWith: 'json', responseBody: expr('{{ JSON.stringify({ results: $json.results }) }}'), options: { responseCode: 200 } }
  }
});

const overview = sticky(
  '## DEMO-05 Booking Tools\nServer URL of the AI receptionist tools check_availability and book_appointment (Vapi function tools, URL ?clinic=<id>, header x-clinic-os-key).\nAll calendar logic lives in Supabase run_booking_tool (migration 008): opening hours, free 30-minute slots per doctor, no double booking, patient CRM row, doctor + patient messages in the outbox.',
  [toolCalls, readToolCalls, authorizedCheck],
  { color: 5 }
);

export default workflow('demo-05-booking-tools', 'DEMO-05 Booking Tools (Clinic OS)')
  .add(toolCalls)
  .to(readToolCalls)
  .to(authorizedCheck
    .onTrue(runBookingTool)
    .onFalse(respondUnauthorized))
  .add(runBookingTool)
  .to(buildResults)
  .to(respondResults)
  .add(overview)
  .group('Check and book', [runBookingTool, buildResults, respondResults], { description: 'Runs the calendar tool in Supabase for each tool call and returns the answers to the AI' });
