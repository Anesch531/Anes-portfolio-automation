#!/usr/bin/env node
'use strict';
// Builds workflows/token-research.json FROM the tested pure logic in ../lib/logic.js.
// Code-node bodies = the SAME functions the fixture runner tests (single source of truth).
// Re-run after editing logic:  node build-workflow.js

const fs = require('fs');
const path = require('path');

const libSrc = fs.readFileSync(path.join(__dirname, 'lib', 'logic.js'), 'utf8');
const LIB_BODY = libSrc.slice(0, libSrc.indexOf('module.exports')).replace("'use strict';", '').trim();
const NAME = 'Token Research Report Bot';

const parseCmdBody = [
  "// Paste of lib/logic.js parseCommand (+ origin handling). Covered by tests/run.js",
  "function parseCommand(t){const m=/^\\s*\\/(research|demo)[\\s_]+\\$?([A-Za-z0-9._-]{2,20})\\s*$/.exec(String(t||''));return m?{symbol:m[2].toUpperCase(),isDemo:m[1]==='demo'}:null;}",
  "const src=$input.item.json;",
  "let text='',isDemo=false,chatId=null;",
  "if(src.body){text=String(src.body.text||src.body.symbol||'');isDemo=true;}",
  "else if(src.message){text=String(src.message.text||src.message.caption||'');chatId=(src.message.chat||{}).id||null;}",
  "const p=parseCommand(text);",
  "if(!p)return [];",
  "return [{json:Object.assign({},p,{isDemo:isDemo||p.isDemo,chatId})}];",
].join('\n');

const pickCoinBody = [
  "// Paste of lib/logic.js pickCoinId. Covered by tests/run.js",
  "function pickCoinId(search,symbol){const coins=search&&Array.isArray(search.coins)?search.coins:[];const s=String(symbol).toLowerCase();const exact=coins.find(c=>String(c.symbol||'').toLowerCase()===s);const c=exact||coins[0];return c?{id:c.id,symbol:String(c.symbol||s).toUpperCase(),name:c.name||c.id}:null;}",
  "const pc=$('Parse command').item.json;",
  "const coin=pickCoinId($input.item.json,pc.symbol);",
  "return [{json:{coinId:coin?coin.id:'',symbol:coin?coin.symbol:pc.symbol,isDemo:pc.isDemo,chatId:pc.chatId}}];",
].join('\n');

const prepBody = [
  "// Paste of lib/logic.js pickDex + CHAIN_IDS. Covered by tests/run.js",
  "function pickDex(pairs){if(!Array.isArray(pairs)||pairs.length===0)return null;const p=pairs.slice().sort((a,b)=>((b.liquidity&&b.liquidity.usd)||0)-((a.liquidity&&a.liquidity.usd)||0))[0];return {chain:p.chainId||'',chainIdNumeric:CHAIN_IDS[p.chainId]||null,dex:p.dexId||'',pairUrl:p.pairAddress?'https://dexscreener.com/'+p.chainId+'/'+p.pairAddress:'',contract:(p.baseToken&&p.baseToken.address)||null,liquidityUsd:Math.round((p.liquidity&&p.liquidity.usd)||0),volume24hUsd:Math.round((p.volume&&p.volume.h24)||0),txns24h:((p.txns&&p.txns.h24&&p.txns.h24.buys)||0)+((p.txns&&p.txns.h24&&p.txns.h24.sells)||0)};}",
  "const CHAIN_IDS={ethereum:1,bsc:56,polygon_pos:137,arbitrum:42161,base:8453,avalanche:43114};",
  "const raw=$input.item.json||{};",
  "const dex=pickDex(raw.pairs);",
  "return [{json:{pairsRaw:Array.isArray(raw.pairs)?raw.pairs:[],contract:dex?dex.contract:null,chainIdNumeric:dex?dex.chainIdNumeric:null}}];",
].join('\n');

const aggregateBody = [
  '/* ===== canonical logic from projects/token-research/lib/logic.js =====',
  '   synced by build-workflow.js — behavior proven by tests/run.js ===== */',
  LIB_BODY,
  '',
  '// ---- glue across sources; every grab is failure-tolerant ----',
  "const grab = (name) => { try { return $(name).item.json; } catch (e) { return null; } };",
  "const pc = grab('Parse command') || {};",
  "const search = grab('Fetch coin search');",
  "const mkts = grab('Fetch coin markets');",
  "const prep = grab('Prep enrichment refs') || {};",
  "const gp = grab('Fetch token security');",
  "let newsItems = [];",
  "try { newsItems = $('Fetch crypto headlines').all().map(i => i.json); } catch (e) {}",
  '',
  "const report = buildReport({",
  "  symbol: pc.symbol,",
  "  isDemo: !!pc.isDemo,",
  "  search,",
  "  markets: Array.isArray(mkts) ? mkts : (mkts && Array.isArray(mkts.data) ? mkts.data : null),",
  "  dexPairs: prep.pairsRaw || [],",
  "  goplus: gp && gp.result ? gp : null,",
  "  news: newsItems,",
  "});",
  '',
  "return [{ json: Object.assign({}, report, { chatId: pc.chatId || null }) }];",
].join('\n');

const validateBody = [
  '/* kept in sync with lib/logic.js applyLlmSummary + esc — covered by tests/run.js */',
  "function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}",
  "function applyLlmSummary(report,llmOut){const ok=llmOut&&typeof llmOut.text==='string'&&llmOut.text.trim().length>=20&&llmOut.text.length<=1200;const text=ok?llmOut.text.trim():report.summaryTemplate;return {finalHtml:report.html.replace('%%SUMMARY%%',esc(text)),mode:ok?'llm':'template'};}",
  "let out={ok:false,text:''};",
  'try{',
  "  const r=$('Call summary LLM').item.json;",
  "  const txt=r&&r.choices&&r.choices[0]&&r.choices[0].message?r.choices[0].message.content:'';",
  '  out={ok:!!(txt&&txt.trim().length>=20&&txt.length<=1200),text:String(txt||\'\')};',
  '}catch(e){}',
  "const rep=$('Aggregate research').item.json;",
  'const res=applyLlmSummary(rep,out);',
  'return [{json:Object.assign({},rep,{finalHtml:res.finalHtml,verdictMode:res.mode})}];',
].join('\n');

const httpBase = { type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2 };

const nodes = [
  { parameters: { content: '## 🔍 Token Research Report Bot\n`/research <SYMBOL>` (Telegram) or POST `/webhook/token-research/demo` with `{\"text\":\"/demo PEPE\"}`.\nPrimary sources get retries; enrichments degrade gracefully; LLM verdict has a template fallback.', height: 240, width: 380 },
    name: 'Sticky overview', type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position: [-560, -260], id: 'n00' },
  { parameters: { content: '### Fallback pattern\nLLM node: no retry (cost control), onError=continue, 12s timeout.\nNext Code node validates the reply; garbage ⇒ template verdict already baked into the report ships.', height: 180, width: 340 },
    name: 'Sticky fallback', type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position: [1920, -220], id: 'n001' },

  { parameters: { updates: ['message'], additionalFields: {} }, id: 'n01',
    name: 'Listen for research command', type: 'n8n-nodes-base.telegramTrigger', typeVersion: 1.1, position: [-80, 60] },

  { parameters: { httpMethod: 'POST', path: 'token-research/demo', responseMode: 'responseNode', options: {} }, id: 'n02',
    name: 'Demo research request', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [-80, 300] },

  { parameters: { jsCode: parseCmdBody }, id: 'n03',
    name: 'Parse command', type: 'n8n-nodes-base.code', typeVersion: 2, position: [160, 180] },

  Object.assign({}, httpBase, {
    parameters: { url: '=https://api.coingecko.com/api/v3/search?query={{ $json.symbol }}', options: { timeout: 15000 } },
    name: 'Fetch coin search', position: [380, 180], id: 'n04',
    settings: { retryOnFail: true, maxTries: 3, waitBetweenTries: 5000 } }),

  { parameters: { jsCode: pickCoinBody }, id: 'n05',
    name: 'Pick coin id', type: 'n8n-nodes-base.code', typeVersion: 2, position: [600, 180] },

  Object.assign({}, httpBase, {
    parameters: { url: '=https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&sparkline=false&price_change_percentage=24h&ids={{ $json.coinId }}', options: { timeout: 15000 } },
    name: 'Fetch coin markets', position: [820, 180], id: 'n06',
    settings: { retryOnFail: true, maxTries: 3, waitBetweenTries: 5000, onError: 'continueRegularOutput' } }),

  Object.assign({}, httpBase, {
    parameters: { url: "=https://api.dexscreener.com/latest/dex/search?q={{ $('Pick coin id').item.json.symbol }}", options: { timeout: 15000 } },
    name: 'Fetch dex pairs', position: [1040, 40], id: 'n07',
    settings: { retryOnFail: true, maxTries: 2, waitBetweenTries: 5000, onError: 'continueRegularOutput' } }),

  { parameters: { jsCode: prepBody }, id: 'n08',
    name: 'Prep enrichment refs', type: 'n8n-nodes-base.code', typeVersion: 2, position: [1260, 40] },

  Object.assign({}, httpBase, {
    parameters: { url: "=https://api.gopluslabs.com/api/v1/token_security/{{ $('Prep enrichment refs').item.json.chainIdNumeric }}?contract_addresses={{ $('Prep enrichment refs').item.json.contract }}", options: { timeout: 15000 } },
    name: 'Fetch token security', position: [1480, 40], id: 'n09',
    settings: { retryOnFail: true, maxTries: 2, waitBetweenTries: 5000, onError: 'continueRegularOutput' } }),

  { parameters: { url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', options: { timeout: 15000 } }, id: 'n10',
    name: 'Fetch crypto headlines', type: 'n8n-nodes-base.rssFeedRead', typeVersion: 3, position: [1040, 320],
    settings: { onError: 'continueRegularOutput' } },

  { parameters: { jsCode: aggregateBody }, id: 'n11',
    name: 'Aggregate research', type: 'n8n-nodes-base.code', typeVersion: 2, position: [1720, 180] },

  Object.assign({}, httpBase, {
    parameters: {
      method: 'POST',
      url: 'https://api.nanobridge.net/chat/completions',
      specifyBody: 'json',
      jsonBody: "={{ JSON.stringify({ model: 'deepseek-v4-flash', temperature: 0.4, max_tokens: 200, messages: [ { role: 'system', content: 'You are a cautious crypto research assistant. Use ONLY the facts provided. Maximum 3 sentences. Never give financial advice.' }, { role: 'user', content: $json.llmPrompt } ] }) }}",
      options: { timeout: 12000 },
    },
    // After import: attach an httpHeaderAuth credential (Authorization: Bearer <LLM key>).
    // The key lives ONLY in n8n Credentials — never in this JSON.
    name: 'Call summary LLM', position: [1940, 180], id: 'n12',
    settings: { onError: 'continueRegularOutput' } }),

  { parameters: { jsCode: validateBody }, id: 'n13',
    name: 'Validate LLM or fall back', type: 'n8n-nodes-base.code', typeVersion: 2, position: [2160, 180] },

  { parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
        conditions: [{ id: 'is-demo', leftValue: '={{ $json.isDemo }}', rightValue: '',
          operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and',
      },
      options: {},
    }, id: 'n14',
    name: 'Is demo?', type: 'n8n-nodes-base.if', typeVersion: 2.2, position: [2380, 180] },

  { parameters: {
      respondWith: 'text',
      responseBody: '={{ $json.finalHtml }}',
      options: { responseHeaders: { entries: [{ name: 'Content-Type', value: 'text/html; charset=utf-8' }] } },
    }, id: 'n15',
    name: 'Reply demo report', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1, position: [2620, 60] },

  { parameters: {
      chatId: "={{ $('Parse command').item.json.chatId }}",
      text: '={{ $json.finalHtml }}',
      additionalFields: { appendAttribution: false, parse_mode: 'HTML', disable_web_page_preview: true },
    }, id: 'n16',
    name: 'Send research report', type: 'n8n-nodes-base.telegram', typeVersion: 1.2, position: [2620, 300] },
];

const edge = to => ({ node: to, type: 'main', index: 0 });
const connections = {
  'Listen for research command': { main: [[edge('Parse command')]] },
  'Demo research request': { main: [[edge('Parse command')]] },
  'Parse command': { main: [[edge('Fetch coin search')]] },
  'Fetch coin search': { main: [[edge('Pick coin id')]] },
  'Pick coin id': { main: [[edge('Fetch coin markets')]] },
  'Fetch coin markets': { main: [[edge('Fetch dex pairs'), edge('Fetch crypto headlines')]] },
  'Fetch dex pairs': { main: [[edge('Prep enrichment refs')]] },
  'Prep enrichment refs': { main: [[edge('Fetch token security')]] },
  'Fetch token security': { main: [[edge('Aggregate research')]] },
  'Fetch crypto headlines': { main: [[edge('Aggregate research')]] },
  'Aggregate research': { main: [[edge('Call summary LLM')]] },
  'Call summary LLM': { main: [[edge('Validate LLM or fall back')]] },
  'Validate LLM or fall back': { main: [[edge('Is demo?')]] },
  'Is demo?': { main: [[edge('Reply demo report')], [edge('Send research report')]] },
};

// ---- integrity checks before writing ----
const names = new Set(nodes.map(n => n.name));
for (const [from, outs] of Object.entries(connections)) {
  if (!names.has(from)) throw new Error('connection source not a node: ' + from);
  for (const branch of outs.main) for (const e of branch)
    if (!names.has(e.node)) throw new Error('connection target not a node: ' + e.node);
}
const wf = { name: NAME, nodes, connections, active: false, settings: { executionOrder: 'v1' }, meta: { instanceId: 'portfolio-build' } };
JSON.parse(JSON.stringify(wf)); // serialize sanity

const outPath = path.join(__dirname, 'workflows', 'token-research.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(wf, null, 2));

// mirror for quick import (repo-root /workflows)
const mirrorDir = path.join(__dirname, '..', '..', 'workflows');
fs.mkdirSync(mirrorDir, { recursive: true });
fs.writeFileSync(path.join(mirrorDir, 'token-research.json'), JSON.stringify(wf, null, 2));

console.log('wrote', outPath, '(' + nodes.length + ' nodes)');
