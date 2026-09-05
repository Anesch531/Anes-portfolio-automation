#!/usr/bin/env node
'use strict';
// Builds workflows/order-to-courier.json FROM the tested logic in lib/logic.js.
// The logic is INLINED VERBATIM, not re-typed by hand: whatever tests/run.js
// proved is byte-for-byte what the n8n Code nodes execute, so the two can never
// drift apart. Re-run after editing logic:  node build-workflow.js

const fs = require('fs');
const path = require('path');

// Dependency-free .env loader. Looks in this project dir, then the repo root.
// Values already in the environment win, so a one-off override on the command
// line still works. `--public` skips it: that is how the JSON committed to this
// repo is built, so a live endpoint can never be published by accident.
const PUBLIC_BUILD = process.argv.includes('--public');
(() => {
  if (PUBLIC_BUILD) return;
  for (const p of [path.join(__dirname, '.env'), path.join(__dirname, '..', '..', '.env')]) {
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (!m) continue;
      const v = m[2].trim().replace(/^['"]|['"]$/g, '');
      if (v && process.env[m[1]] === undefined) process.env[m[1]] = v;
    }
  }
})();

const NAME = 'Shopify Order → Courier Dispatch';

// Deployment-specific values. They are read from the environment so the exported
// JSON in this repo carries placeholders instead of a live endpoint: the mock
// courier's webhook is unauthenticated, and a URL that is public is an open
// endpoint on the host's VPS. Real values live in a gitignored `.env` — see
// `.env.example`. Without them the build still succeeds and produces an
// importable workflow whose URLs you fill in yourself.
//
//   N8N_HOST=https://n8n.example.com COURIER_PATH=courier-mock/v1/xxxx \
//   DEMO_PATH=order-to-courier/demo/xxxx TELEGRAM_CHAT_ID=-100123 node build-workflow.js
//
// Swap COURIER_PATH/COURIER_URL for the real courier's endpoint — nothing else
// in this workflow changes.
const N8N_HOST = (process.env.N8N_HOST || 'https://YOUR-N8N-HOST').replace(/\/+$/, '');
const COURIER_URL = process.env.COURIER_URL ||
  (N8N_HOST + '/webhook/' + (process.env.COURIER_PATH || 'courier-mock/v1/SET-COURIER-PATH'));
const DEMO_PATH = process.env.DEMO_PATH || 'order-to-courier/demo/SET-DEMO-PATH';
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || 'SET-TELEGRAM-CHAT-ID';
const COUNTRY = 'DZ';
const COURIER_NAME = 'Camex';

// Credential references. Ids and display names only — n8n resolves the values at
// run time, and no value ever enters this file or the exported JSON.
const DEMO_CRED = { id: 'beEDSGjYELDhAjkT', name: 'Wolf Demo Webhook Key' };
const SHOPIFY_CRED = { id: '47GAtweWCWCRQfkF', name: 'Shopify Dev Store' };
const TELEGRAM_CRED = { id: 'aagVEwMKDm8ShgQA', name: 'Wolf Demo Bot' };

// lib/logic.js verbatim, minus the CommonJS wrapper an n8n Code node cannot use.
const LOGIC = (() => {
  const src = fs.readFileSync(path.join(__dirname, 'lib', 'logic.js'), 'utf8');
  const body = src
    .replace(/^'use strict';\s*/, '')
    .replace(/module\.exports[\s\S]*$/, '')
    .trimEnd();
  // Guard rails: a bad slice must fail the build, not ship a broken Code node.
  if (/module\.exports|require\(/.test(body)) throw new Error('CommonJS left in the slice');
  for (const fn of ['validateOrder', 'buildParcel', 'parseCourierResponse',
    'successUpdate', 'failureUpdate', 'alertText', 'successText',
    'composeNote', 'paymentOf', 'resolveCity', 'normalizePhone']) {
    if (!body.includes('function ' + fn)) throw new Error('slice lost ' + fn);
  }
  return body;
})();

const shim = (title, lines) => [
  LOGIC,
  '',
  '// ===================== node: ' + title + ' =====================',
  ...lines,
].join('\n');

const validateBody = shim('Validate Order', [
  "const CC = '" + COUNTRY + "';",
  "const COURIER = '" + COURIER_NAME + "';",
  '',
  '// Two entry shapes. The Shopify Trigger emits the order object at the top',
  '// level; the demo webhook wraps it as { body: { order: {...} } }.',
  'const src = $input.first().json;',
  'const isDemo = !!(src && src.body);',
  'const order = isDemo ? ((src.body && (src.body.order || src.body)) || {}) : src;',
  '',
  'const v = validateOrder(order, CC);',
  '',
  '// Dedupe is DECIDED here and COMMITTED in `Commit Dispatch`, after Telegram',
  '// has confirmed the message — so an order that was booked but never announced',
  '// stays retryable. Demo keys live in their own namespace and carry an hour',
  '// bucket: that makes a duplicate demo testable, and it also means the SAME',
  '// demo order cannot be fired twice inside one clock hour. To re-shoot a take',
  '// sooner, change `id` in the fixture or wait for the next hour.',
  "const sd = $getWorkflowStaticData('global');",
  'sd.seen = sd.seen || {};',
  'const cutoff = Date.now() - 7 * 24 * 3600 * 1000;',
  'for (const k of Object.keys(sd.seen)) { if (sd.seen[k] < cutoff) delete sd.seen[k]; }',
  "const key = (isDemo ? 'demo:' + Math.floor(Date.now() / 3600000).toString(36) + ':' : 'live:')",
  "  + (v.clean.orderId || v.clean.orderName || 'no-id');",
  'if (sd.seen[key]) {',
  "  console.log('[validate] duplicate, dropped: ' + key);",
  '  return [];',
  '}',

  '',
  'const out = {',
  '  isDemo, dedupeKey: key, courier: COURIER,',
  '  ok: v.ok, errors: v.errors, clean: v.clean,',
  '  parcel: v.ok ? buildParcel(v.clean, COURIER) : null,',
  '};',
  '// Demo-only passthrough so the courier-down and courier-rejects branches can be',
  '// filmed. Gated on isDemo, so a real Shopify order can never inject it.',
  'if (isDemo && out.parcel && src.body._mock) {',
  '  out.parcel._mock = String(src.body._mock).slice(0, 16);',
  '}',
  'if (!v.ok) {',
  '  // stage "order": the courier was never called, so nothing here may blame it.',
  "  const f = failureUpdate(v.clean, v.errors, 'order');",
  '  out.tagsToWrite = f.tags;',
  '  out.noteToWrite = f.note;',
  '  out.text = alertText(v.clean, v.errors, isDemo);',
  '}',

  "console.log('[validate] ' + (out.clean.orderName || '?') + ' ok=' + out.ok +",
  "  ' errors=' + (out.errors.join(',') || '-') + ' demo=' + isDemo);",
  'return [{ json: out }];',
]);

const readReplyBody = shim('Read Courier Reply', [
  '// The HTTP node runs with fullResponse + neverError, so this always receives',
  '// { statusCode, headers, body } — the exact shape parseCourierResponse expects,',
  '// and a 502 arrives as data instead of killing the run.',
  'const res = $input.first().json;',
  "const p = $('Validate Order').first().json;",
  'const clean = p.clean;',
  "const courier = p.courier || '" + COURIER_NAME + "';",
  '',
  'const r = parseCourierResponse(res);',
  'const out = {',
  '  isDemo: p.isDemo, clean, courier,',
  '  // dedupeKey rides along so `Commit Dispatch` can write it AFTER Telegram',
  '  // confirms. Nothing is committed in this node.',
  '  dedupeKey: p.dedupeKey || null,',
  '  ok: r.ok,',
  '  errors: r.ok ? [] : [r.reason],',
  "  detail: r.detail || '',",
  '  tracking: r.tracking,',
  '  httpStatus: Number(res && res.statusCode) || null,',
  '};',
  '',
  'if (r.ok) {',
  '  const s = successUpdate(clean, r.tracking, courier);',
  '  out.tagsToWrite = s.tags;',
  '  out.noteToWrite = s.note;',
  '  out.text = successText(clean, r.tracking, courier, p.isDemo);',
  '} else {',
  '  // stage "courier": the parcel was really refused, and the refusal text the',
  '  // courier sent is carried through instead of being replaced by a guess.',
  "  const f = failureUpdate(clean, [r.reason], 'courier', r.detail);",
  '  out.tagsToWrite = f.tags;',
  '  out.noteToWrite = f.note;',
  '  out.text = alertText(clean, [r.reason], p.isDemo, { detail: r.detail });',
  '}',
  "console.log('[courier] http=' + out.httpStatus + ' ok=' + out.ok +",
  "  ' reason=' + (out.errors[0] || '-') + ' tracking=' + (out.tracking || '-'));",
  'return [{ json: out }];',
]);

// `Commit Dispatch` needs none of lib/logic.js — it only writes state — so it is
// NOT built with shim(). Keeping the slice out of it makes the node readable on
// camera and means a logic change cannot invalidate the commit.
const commitBody = [
  '// ===================== node: Commit Dispatch =====================',
  '// Runs only after `Notify Booked` returned a message. Until this node writes,',
  '// the dedupe key does not exist — so an order that was booked at the courier',
  '// but never announced stays retryable. That split (decide in `Validate Order`,',
  '// commit here) is the whole reason this node exists.',
  '//',
  '// The guard is `message_id`, NOT the workflow finishing. Shape, verified by',
  '// execution 815: `n8n-nodes-base.telegram` v1.2 returns Telegram\'s envelope',
  '// **wrapped** — `{ ok: true, result: { message_id, chat, ... } }`. An earlier',
  '// version of this node read `$json.message_id` off the top level, found',
  '// undefined on a send that had genuinely delivered, and committed nothing.',
  '// So `result` is unwrapped when present and the top level is the fallback,',
  '// which keeps this correct if a future typeVersion flattens the response.',
  'const sends = $input.all();',
  "const replies = $('Read Courier Reply').all();",
  "const sd = $getWorkflowStaticData('global');",
  'sd.seen = sd.seen || {};',
  '',
  'const out = [];',
  'for (let i = 0; i < sends.length; i++) {',
  '  const j = (sends[i] && sends[i].json) || {};',
  "  const rsp = (j.result && typeof j.result === 'object') ? j.result : j;",
  '  const msgId = Number(rsp.message_id);',
  '  // itemMatching walks n8n\'s paired-item trail, so a filtered branch cannot',
  '  // misalign the two lists. Index is only the fallback.',
  '  let p = {};',
  "  try { p = (($('Read Courier Reply').itemMatching(i) || {}).json) || {}; }",
  '  catch (e) { p = (replies[i] && replies[i].json) || {}; }',
  '',
  '  if (!(msgId > 0)) {',
  "    console.log('[commit] no message_id — nothing committed, order stays retryable');",
  "    out.push({ json: { committed: 0, reason: 'no_message_id' } });",
  '    continue;',
  '  }',
  '  if (p.dedupeKey) sd.seen[p.dedupeKey] = Date.now();',
  '  out.push({ json: {',
  '    committed: p.dedupeKey ? 1 : 0,',
  '    messageId: msgId,',
  '    tracking: p.tracking || null,',
  '    seenKeys: Object.keys(sd.seen).length,',
  '  } });',
  "  console.log('[commit] msg=' + msgId + ' key=' + (p.dedupeKey || '-') +",
  "    ' keys=' + Object.keys(sd.seen).length);",
  '}',
  'return out;',
].join('\n');

const sticky = (id, content, position, width, height) => ({
  id, name: 'Note ' + id, type: 'n8n-nodes-base.stickyNote', typeVersion: 1,
  position, parameters: { content, width, height },
});

const isTrue = (id, field) => ({
  conditions: {
    options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
    conditions: [{
      id, leftValue: '={{ ' + field + ' }}', rightValue: '',
      operator: { type: 'boolean', operation: 'true', singleValue: true },
    }],
    combinator: 'and',
  },
  looseTypeValidation: true,
  options: {},
});

const shopifyUpdate = (id, name, position) => ({
  id, name, type: 'n8n-nodes-base.shopify', typeVersion: 1, position,
  parameters: {
    authentication: 'accessToken',
    resource: 'order',
    operation: 'update',
    orderId: '={{ $json.clean.orderId }}',
    updateFields: { note: '={{ $json.noteToWrite }}', tags: '={{ $json.tagsToWrite }}' },
  },
  credentials: { shopifyAccessTokenApi: SHOPIFY_CRED },
  // Best-effort on purpose: the merchant needs the parcel booked and the alert
  // sent even if the tag write fails. The alert rides a parallel branch, so it
  // is not downstream of this node and cannot be swallowed by its error item.
  onError: 'continueRegularOutput',
  retryOnFail: true, maxTries: 2, waitBetweenTries: 5000,
});

const telegram = (id, name, position) => ({
  id, name, type: 'n8n-nodes-base.telegram', typeVersion: 1.2, position,
  parameters: {
    chatId: CHAT_ID,
    text: '={{ $json.text }}',
    additionalFields: { appendAttribution: false, parse_mode: 'HTML', disable_web_page_preview: true },
  },
  credentials: { telegramApi: TELEGRAM_CRED },
  // Never continueRegularOutput: a send that silently fails is the one failure
  // mode that hides everything downstream of it.
  onError: 'stopWorkflow',
  retryOnFail: true, maxTries: 3, waitBetweenTries: 5000,
});

const nodes = [
  sticky('s1', '## 🚚 Shopify Order → Courier Dispatch\n'
    + 'A COD order arrives, gets checked, gets booked with the courier, and the shop owner\n'
    + 'hears about it either way. Arabic phone digits, all 58 wilaya spellings and\n'
    + 'COD-vs-prepaid are handled in `Validate Order`.\n\n'
    + '**Every rule in the two Code nodes is inlined from `lib/logic.js`, which 39 tests cover.**\n'
    + 'Re-run `node build-workflow.js` after editing the logic — the nodes are generated,\n'
    + 'never hand-typed, so the tested code and the running code cannot drift.',
    [-120, -300], 620, 220),
  sticky('s2', '### The courier is a mock\n'
    + 'Algerian couriers do not issue sandbox keys without a registered business, so\n'
    + '`Book With Courier` points at the *Mock Courier API* workflow.\n\n'
    + '**Swapping in a real courier is a URL change plus a field mapping.** `buildParcel`\n'
    + 'emits `recipient` / `wilaya_code` / `cod_amount`; a real API will name those\n'
    + 'differently, and that mapping is the one thing this repo cannot test for you.\n\n'
    + '`fullResponse: true` + `neverError: true` means a 502 arrives as **data**, so\n'
    + '`Read Courier Reply` classifies it instead of the run dying. That also disables\n'
    + '`retryOnFail` for HTTP statuses — it only fires on DNS/TCP/timeout, which is why\n'
    + 'this node needs `onError: continueRegularOutput` as well.',
    [620, -320], 460, 300),
  sticky('s3', '### Before this can run\n'
    + '1. Both Telegram nodes post to chat `' + CHAT_ID + '`. If that group is ever upgraded to\n'
    + '   a supergroup the id changes to the `-100…` form and the send starts failing.\n'
    + '2. The demo webhook uses **Header Auth** (credential *Wolf Demo Webhook Key*). It is\n'
    + '   not a secret-free endpoint: it publishes a real Telegram message. Keep the key in\n'
    + '   an env var when firing it on camera, and delete the webhook after recording.\n'
    + '3. `Shopify Trigger` is live on `orders/create` against a real store. Disable it\n'
    + '   before demoing, or a genuine order gets a fabricated tracking number.',
    [1300, 620], 520, 220),

  { id: 'n01', name: 'Shopify Trigger', type: 'n8n-nodes-base.shopifyTrigger', typeVersion: 1,
    position: [-40, 0],
    parameters: { authentication: 'accessToken', topic: 'orders/create' },
    credentials: { shopifyAccessTokenApi: SHOPIFY_CRED } },

  { id: 'n02', name: 'Demo Order', type: 'n8n-nodes-base.webhook', typeVersion: 2.1,
    position: [-40, 220],
    // Header Auth, not just a long random path. The path was "secret enough"
    // right up until it appears in a recording — and this endpoint posts a
    // $-figure alert into a real Telegram chat, so an open one lets anyone
    // publish a fake order under the shop's name. The header name and value
    // live in n8n Credentials ("Wolf Demo Webhook Key") and nowhere else.
    parameters: {
      httpMethod: 'POST',
      path: DEMO_PATH,
      responseMode: 'onReceived',
      authentication: 'headerAuth',
      options: {},
    },
    credentials: { httpHeaderAuth: { id: DEMO_CRED.id, name: DEMO_CRED.name } } },

  { id: 'n03', name: 'Validate Order', type: 'n8n-nodes-base.code', typeVersion: 2,
    position: [200, 100], parameters: { jsCode: validateBody } },

  { id: 'n04', name: 'Order Valid?', type: 'n8n-nodes-base.if', typeVersion: 2.3,
    position: [420, 100], parameters: isTrue('order-ok', '$json.ok') },

  { id: 'n05', name: 'Book With Courier', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2,
    position: [660, -20],
    parameters: {
      method: 'POST',
      url: COURIER_URL,
      sendBody: true,
      specifyBody: 'json',
      jsonBody: '={{ JSON.stringify($json.parcel) }}',
      options: { timeout: 15000, response: { response: { fullResponse: true, neverError: true } } },
    },
    // `neverError: true` turns every HTTP status into data, so `retryOnFail` can
    // never see a 502 — it only ever fires on a network-level failure (DNS,
    // TCP, the 15s timeout). Without `onError` those killed the run silently:
    // no Telegram, no tag, and an execution the merchant never hears about.
    // `continueRegularOutput` hands the error item to `Read Courier Reply`,
    // where `r.error` classifies it as `courier_http` and the merchant is told.
    onError: 'continueRegularOutput',
    retryOnFail: true, maxTries: 2, waitBetweenTries: 5000 },

  { id: 'n06', name: 'Read Courier Reply', type: 'n8n-nodes-base.code', typeVersion: 2,
    position: [880, -20], parameters: { jsCode: readReplyBody } },

  { id: 'n07', name: 'Booked?', type: 'n8n-nodes-base.if', typeVersion: 2.3,
    position: [1100, -20], parameters: isTrue('booked', '$json.ok') },

  shopifyUpdate('n08', 'Tag Order Booked', [1360, -160]),
  telegram('n09', 'Notify Booked', [1360, 20]),
  { id: 'n12', name: 'Commit Dispatch', type: 'n8n-nodes-base.code', typeVersion: 2,
    position: [1600, 20], parameters: { jsCode: commitBody } },
  shopifyUpdate('n10', 'Tag Order Failed', [1360, 260]),
  telegram('n11', 'Alert Failure', [1360, 440]),
];

const edge = to => ({ node: to, type: 'main', index: 0 });
const FAILED = [edge('Tag Order Failed'), edge('Alert Failure')];

const connections = {
  'Shopify Trigger': { main: [[edge('Validate Order')]] },
  'Demo Order': { main: [[edge('Validate Order')]] },
  'Validate Order': { main: [[edge('Order Valid?')]] },
  'Order Valid?': { main: [[edge('Book With Courier')], FAILED] },
  'Book With Courier': { main: [[edge('Read Courier Reply')]] },
  'Read Courier Reply': { main: [[edge('Booked?')]] },
  // Only the success branch commits. A failed order writes no dedupe key, so the
  // merchant can fix it and re-send it — and `Commit Dispatch` sits AFTER the
  // Telegram node so a booked-but-unannounced parcel stays retryable too.
  'Notify Booked': { main: [[edge('Commit Dispatch')]] },
  'Booked?': { main: [[edge('Tag Order Booked'), edge('Notify Booked')], FAILED] },
};

const names = new Set(nodes.map(n => n.name));
for (const [from, outs] of Object.entries(connections)) {
  if (!names.has(from)) throw new Error('connection source not a node: ' + from);
  for (const branch of outs.main) for (const e of branch) {
    if (!names.has(e.node)) throw new Error('connection target not a node: ' + e.node);
  }
}

const wf = {
  name: NAME, nodes, connections, active: false,
  settings: { executionOrder: 'v1', timezone: 'Africa/Algiers' },
  meta: { instanceId: 'portfolio-build' },
};
JSON.parse(JSON.stringify(wf));

// Nothing in here may carry a credential value. Ids and names are fine; values are not.
const dump = JSON.stringify(wf);
for (const bad of ['shpat_', 'shpss_', 'shpca_', 'bot1', 'bot2', 'bot5', 'bot6', 'bot7', 'bot8']) {
  if (dump.includes(bad)) throw new Error('possible secret in the export: ' + bad);
}
// A `--public` build must not carry a live host, webhook path or chat id: this
// file is what gets committed, and the mock courier's webhook has no auth.
// Three checks, because the first two each missed a real leak on their own:
//   a) every placeholder survived, so no env var leaked in through the shell;
//   b) no value from `.env` appears anywhere in the dump — this is the one that
//      catches a live value hardcoded somewhere the placeholders never reach
//      (a sticky note did exactly that);
//   c) pattern checks, so a fresh clone with no `.env` is still guarded.
if (PUBLIC_BUILD) {
  const missing = ['YOUR-N8N-HOST', 'SET-COURIER-PATH', 'SET-DEMO-PATH', 'SET-TELEGRAM-CHAT-ID']
    .filter((s) => !dump.includes(s));
  if (missing.length) throw new Error('--public build is not placeholder-clean, missing: ' + missing.join(', '));

  for (const p of [path.join(__dirname, '.env'), path.join(__dirname, '..', '..', '.env')]) {
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (!m) continue;
      const v = m[2].trim().replace(/^['"]|['"]$/g, '');
      if (v.length >= 6 && dump.includes(v)) {
        throw new Error('--public build leaks the real ' + m[1] + ' (from ' + path.basename(p) + ')');
      }
      const host = v.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
      if (host.length >= 6 && host.includes('.') && dump.includes(host)) {
        throw new Error('--public build leaks the hostname from ' + m[1]);
      }
    }
  }

  const leaks = [
    [/-\d{9,}/, 'a real Telegram chat id'],
    [/https?:\/\/(?!YOUR-N8N-HOST)[A-Za-z0-9][A-Za-z0-9.-]*\.[A-Za-z]{2,}\/webhook\//, 'a live webhook URL'],
  ].filter(([re]) => re.test(dump)).map(([, what]) => what);
  if (leaks.length) throw new Error('--public build contains ' + leaks.join(' and '));
}

const out = path.join(__dirname, 'workflows', 'order-to-courier.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(wf, null, 2));
const mirror = path.join(__dirname, '..', '..', 'workflows', 'order-to-courier.json');
fs.mkdirSync(path.dirname(mirror), { recursive: true });
fs.writeFileSync(mirror, JSON.stringify(wf, null, 2));
console.log('wrote ' + out);
console.log('wrote ' + mirror);
console.log(nodes.length + ' nodes, logic slice ' + LOGIC.length + ' chars');
