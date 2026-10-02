/* AI connector: talks to any AI model over its API, with tool calling so the
 * model can read and change tasks.
 *
 * Two wire formats cover almost every provider:
 *   - "anthropic": Claude's Messages API
 *   - "openai":    the OpenAI Chat Completions format, which ChatGPT, Gemini,
 *                  OpenRouter, Groq, Ollama, LM Studio and most others speak.
 * Plain fetch (no SDK) keeps the app build-free and provider-neutral.
 */
window.TasksAI = (() => {
  'use strict';

  const PROVIDERS = {
    anthropic: { label: 'Claude (Anthropic)', format: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', model: 'claude-opus-5-5', needsKey: true, keyUrl: 'https://console.anthropic.com/settings/keys' },
    openai: { label: 'ChatGPT (OpenAI)', format: 'openai', baseUrl: 'https://api.openai.com/v1', model: '', needsKey: true, keyUrl: 'https://platform.openai.com/api-keys' },
    gemini: { label: 'Gemini (Google)', format: 'openai', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: '', needsKey: true, keyUrl: 'https://aistudio.google.com/apikey' },
    openrouter: { label: 'OpenRouter (hundreds of models)', format: 'openai', baseUrl: 'https://openrouter.ai/api/v1', model: '', needsKey: true, keyUrl: 'https://openrouter.ai/keys' },
    groq: { label: 'Groq', format: 'openai', baseUrl: 'https://api.groq.com/openai/v1', model: '', needsKey: true, keyUrl: 'https://console.groq.com/keys' },
    ollama: { label: 'Ollama (runs on your computer)', format: 'openai', baseUrl: 'http://localhost:11434/v1', model: '', needsKey: false, editableUrl: true },
    lmstudio: { label: 'LM Studio (runs on your computer)', format: 'openai', baseUrl: 'http://localhost:1234/v1', model: '', needsKey: false, editableUrl: true },
    custom: { label: 'Other (OpenAI-compatible API)', format: 'openai', baseUrl: '', model: '', needsKey: false, editableUrl: true },
  };

  const MAX_TOOL_ROUNDS = 8;
  const TIMEOUT_MS = 120000;
  const ANTHROPIC_VERSION = '2023-06-01';
  // Models that accept server-side refusal fallbacks.
  const FALLBACK_MODELS = /^claude-(opus-5(-5)?|fable-5-1|sonnet-5-5)$/;

  const provider = (cfg) => PROVIDERS[cfg.provider] || PROVIDERS.custom;
  const baseUrl = (cfg) => (cfg.baseUrl || provider(cfg).baseUrl || '').replace(/\/+$/, '');

  function isConfigured(cfg) {
    if (!cfg || !cfg.model || !baseUrl(cfg)) return false;
    return !provider(cfg).needsKey || !!cfg.apiKey;
  }

  class AIError extends Error {
    constructor(message, status) { super(message); this.status = status; }
  }

  async function request(url, { method = 'POST', headers = {}, body } = {}) {
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), TIMEOUT_MS) : null;
    let res;
    try {
      res = await fetch(url, {
        method,
        headers: body ? { 'content-type': 'application/json', ...headers } : headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl ? ctrl.signal : undefined,
      });
    } catch (e) {
      if (e && e.name === 'AbortError') throw new AIError('The AI took too long to answer. Try again.');
      throw new AIError('Could not reach the AI service. Check your internet connection and the server URL.');
    } finally {
      if (timer) clearTimeout(timer);
    }
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
    if (!res.ok) {
      const detail = (data && ((data.error && (data.error.message || data.error)) || data.message)) || text.slice(0, 200) || res.statusText;
      if (res.status === 401 || res.status === 403) throw new AIError(`The API key was rejected (${res.status}). Check it in Settings.`, res.status);
      if (res.status === 404) throw new AIError(`Not found (404): ${detail}. Check the model name and server URL.`, res.status);
      if (res.status === 429) throw new AIError('Rate limit or quota reached (429). Wait a moment, or check your plan/credits.', res.status);
      throw new AIError(`AI error ${res.status}: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`, res.status);
    }
    return data;
  }

  function authHeaders(cfg) {
    if (provider(cfg).format === 'anthropic') {
      return {
        'x-api-key': cfg.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'anthropic-dangerous-direct-browser-access': 'true',
      };
    }
    return cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {};
  }

  /* ---------- conversation format ----------
   * History is kept provider-neutral:
   *   { role: 'user', text }
   *   { role: 'assistant', text, toolCalls: [{ id, name, args }], raw }   (raw = Claude content blocks)
   *   { role: 'tool', id, name, result }                                    (result = JSON string)
   */

  function toAnthropic(history) {
    const out = [];
    for (const m of history) {
      if (m.role === 'user') out.push({ role: 'user', content: m.text });
      else if (m.role === 'assistant') {
        // Send Claude's own content blocks back unchanged (keeps thinking blocks valid).
        const content = m.raw || [
          ...(m.text ? [{ type: 'text', text: m.text }] : []),
          ...m.toolCalls.map((c) => ({ type: 'tool_use', id: c.id, name: c.name, input: c.args })),
        ];
        out.push({ role: 'assistant', content });
      } else if (m.role === 'tool') {
        const block = { type: 'tool_result', tool_use_id: m.id, content: m.result };
        if (m.isError) block.is_error = true;
        const last = out[out.length - 1];
        // All results for one assistant turn go in a single user message.
        if (last && last.role === 'user' && Array.isArray(last.content) && last.content.every((b) => b.type === 'tool_result')) last.content.push(block);
        else out.push({ role: 'user', content: [block] });
      }
    }
    return out;
  }

  function toOpenAI(system, history) {
    const out = [{ role: 'system', content: system }];
    for (const m of history) {
      if (m.role === 'user') out.push({ role: 'user', content: m.text });
      else if (m.role === 'assistant') {
        const msg = { role: 'assistant', content: m.text || '' };
        if (m.toolCalls.length) {
          msg.tool_calls = m.toolCalls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args) } }));
        }
        out.push(msg);
      } else if (m.role === 'tool') {
        out.push({ role: 'tool', tool_call_id: m.id, content: m.result });
      }
    }
    return out;
  }

  async function callAnthropic(cfg, system, history, tools) {
    const body = { model: cfg.model, max_tokens: 16000, system, messages: toAnthropic(history) };
    if (tools.length) body.tools = tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters }));
    const headers = authHeaders(cfg);
    const url = `${baseUrl(cfg)}/messages`;
    let data;
    if (FALLBACK_MODELS.test(cfg.model)) {
      // If the model declines for safety reasons, let the API retry on a fallback model.
      try {
        data = await request(url, { headers: { ...headers, 'anthropic-beta': 'server-side-fallback-2026-07-01' }, body: { ...body, fallbacks: 'default' } });
      } catch (e) {
        if (e.status !== 400) throw e;
        data = await request(url, { headers, body });
      }
    } else {
      data = await request(url, { headers, body });
    }
    const content = Array.isArray(data.content) ? data.content : [];
    let text = content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
    if (data.stop_reason === 'refusal' && !text) text = 'Sorry, the model declined to answer that.';
    const toolCalls = content.filter((b) => b.type === 'tool_use').map((b) => ({ id: b.id, name: b.name, args: b.input || {} }));
    return { text, toolCalls, raw: content };
  }

  function parseArgs(s) {
    if (s && typeof s === 'object') return s;
    try { return JSON.parse(s || '{}') || {}; } catch (e) { return { __invalid: String(s) }; }
  }

  async function callOpenAI(cfg, system, history, tools) {
    const body = { model: cfg.model, messages: toOpenAI(system, history) };
    if (tools.length) body.tools = tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }));
    let data;
    try {
      data = await request(`${baseUrl(cfg)}/chat/completions`, { headers: authHeaders(cfg), body });
    } catch (e) {
      // Some small/local models don't support tools: answer without them.
      if (!(tools.length && e.status === 400 && /tool|function/i.test(e.message))) throw e;
      delete body.tools;
      data = await request(`${baseUrl(cfg)}/chat/completions`, { headers: authHeaders(cfg), body });
    }
    const msg = (data && data.choices && data.choices[0] && data.choices[0].message) || {};
    const text = typeof msg.content === 'string' ? msg.content.trim()
      : Array.isArray(msg.content) ? msg.content.map((p) => p.text || '').join('').trim() : '';
    const toolCalls = (msg.tool_calls || []).map((c, i) => ({
      id: c.id || `call_${Date.now()}_${i}`,
      name: c.function && c.function.name,
      args: parseArgs(c.function && c.function.arguments),
    }));
    return { text, toolCalls, raw: null };
  }

  function callModel(cfg, system, history, tools) {
    return provider(cfg).format === 'anthropic'
      ? callAnthropic(cfg, system, history, tools)
      : callOpenAI(cfg, system, history, tools);
  }

  /** Runs the model, executing tool calls, until it gives a final answer.
   *  `history` is mutated (appended to). `onEvent` gets {type:'text'|'tool', ...}. */
  async function run({ config, system, history, tools = [], onEvent = () => {} }) {
    const byName = new Map(tools.map((t) => [t.name, t]));
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const res = await callModel(config, system, history, tools);
      history.push({ role: 'assistant', text: res.text, toolCalls: res.toolCalls, raw: res.raw });
      if (res.text) onEvent({ type: 'text', text: res.text, final: !res.toolCalls.length });
      if (!res.toolCalls.length) return res.text;
      for (const call of res.toolCalls) {
        const tool = byName.get(call.name);
        let result;
        let isError = false;
        try {
          if (!tool) throw new Error(`Unknown tool: ${call.name}`);
          if (call.args.__invalid !== undefined) throw new Error('Arguments were not valid JSON.');
          result = await tool.run(call.args);
        } catch (e) {
          isError = true;
          result = { error: e.message || String(e) };
        }
        onEvent({ type: 'tool', name: call.name, args: call.args, result, isError });
        history.push({ role: 'tool', id: call.id, name: call.name, result: JSON.stringify(result), isError });
      }
    }
    const note = 'I stopped after several steps. Ask me to continue if something is unfinished.';
    onEvent({ type: 'text', text: note, final: true });
    return note;
  }

  async function listModels(cfg) {
    const data = await request(`${baseUrl(cfg)}/models${provider(cfg).format === 'anthropic' ? '?limit=100' : ''}`, { method: 'GET', headers: authHeaders(cfg) });
    const items = (data && (data.data || data.models)) || [];
    return items.map((m) => String(m.id || m.name || '').replace(/^models\//, '')).filter(Boolean).sort();
  }

  async function test(cfg) {
    const history = [{ role: 'user', text: 'Reply with just the word: ready' }];
    const text = await run({ config: cfg, system: 'You are a connection test. Reply with one word.', history });
    return text || '(empty reply)';
  }

  return { PROVIDERS, isConfigured, run, listModels, test, baseUrl };
})();
