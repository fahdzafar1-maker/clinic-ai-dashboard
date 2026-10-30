import { workflow, node, trigger, sticky, ifElse, expr } from '@n8n/workflow-sdk';

const llmRequest = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'LLM Request',
    position: [0, 300],
    parameters: { httpMethod: 'POST', path: 'clinic-os/llm', responseMode: 'responseNode', options: {} }
  },
  output: [{ headers: { 'x-clinic-os-key': 'REPLACE_WITH_VAPI_WEBHOOK_SECRET' }, body: { model: 'gpt-4.1-mini', messages: [{ role: 'user', content: 'Hi' }] } }]
});

const checkRequest = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Check Request',
    position: [220, 300],
    parameters: {
      mode: 'runOnceForEachItem',
      language: 'javaScript',
      jsCode: "// Only the eval runner (secret header) may use this proxy, and only for small chat-completion requests.\nconst SECRET = 'REPLACE_WITH_VAPI_WEBHOOK_SECRET';\nconst MODELS = ['gpt-4.1-mini', 'gpt-4.1'];\nconst h = $json.headers || {};\nconst b = $json.body || {};\nconst ok = h['x-clinic-os-key'] === SECRET && MODELS.includes(b.model) && Array.isArray(b.messages) && b.messages.length > 0 && b.messages.length <= 80;\nconst req = { model: b.model, messages: b.messages, temperature: typeof b.temperature === 'number' ? b.temperature : 0.4, max_tokens: Math.min(Number(b.max_tokens) || 600, 1500) };\nif (Array.isArray(b.tools) && b.tools.length) req.tools = b.tools;\nif (b.response_format) req.response_format = b.response_format;\nreturn { json: { ok: ok, req: req } };"
    }
  },
  output: [{ ok: true, req: { model: 'gpt-4.1-mini', messages: [{ role: 'user', content: 'Hi' }], temperature: 0.4, max_tokens: 600 } }]
});

const allowed = ifElse({
  version: 2.3,
  config: {
    name: 'Allowed?',
    position: [440, 300],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{ leftValue: expr('{{ $json.ok }}'), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and'
      }
    }
  }
});

const respondDenied = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Respond Denied',
    position: [660, 500],
    parameters: { respondWith: 'json', responseBody: '{"error":"denied"}', options: { responseCode: 403 } }
  }
});

const callOpenAi = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Call OpenAI',
    position: [660, 200],
    alwaysOutputData: true,
    onError: 'continueRegularOutput',
    parameters: {
      method: 'POST',
      url: 'https://api.openai.com/v1/chat/completions',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'openAiApi',
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify($json.req) }}'),
      options: { timeout: 60000 }
    },
    credentials: { openAiApi: { id: '5xsS6XmNzgYy1Xn9', name: 'OpenAI account' } }
  },
  output: [{ choices: [{ message: { role: 'assistant', content: 'Hello' } }] }]
});

const respondLlm = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Respond LLM',
    position: [880, 200],
    parameters: { respondWith: 'json', responseBody: expr('{{ JSON.stringify($json) }}'), options: { responseCode: 200 } }
  }
});

const overview = sticky(
  '## EVAL-00 LLM Proxy (evals only)\nLets the local eval runner (evals/run.js) call OpenAI chat completions through the n8n OpenAI credential, so the key never leaves n8n. Secret header x-clinic-os-key, models gpt-4.1-mini / gpt-4.1 only.',
  [llmRequest, checkRequest, allowed],
  { color: 5 }
);

export default workflow('eval-00-llm-proxy', 'EVAL-00 LLM Proxy (Clinic OS evals)')
  .add(llmRequest)
  .to(checkRequest)
  .to(allowed
    .onTrue(callOpenAi)
    .onFalse(respondDenied))
  .add(callOpenAi)
  .to(respondLlm)
  .add(overview);
