#!/usr/bin/env node
'use strict';
// Builds workflows/support-chatbot.json FROM tested logic in lib/logic.js.
// Re-run after editing logic:  node build-workflow.js

const fs = require('fs');
const path = require('path');

const NAME = 'Support Chatbot (Telegram)';
const logicLib = require(path.join(__dirname, 'lib', 'logic.js'));

// Serialize constants straight from the tested module (always in sync).
const KB_CONST = 'const SAMPLE_KB=' + JSON.stringify(logicLib.SAMPLE_KB) + ';';
const STOPWORDS_CONST = 'const LIGHT_STOPWORDS=new Set(' +
  JSON.stringify(Array.from(logicLib.LIGHT_STOPWORDS).join(',')) + '.split(","));';

const libSrc = fs.readFileSync(path.join(__dirname, 'lib', 'logic.js'), 'utf8');
const FN = {};
['normalize', 'tokenize', 'retrieve', 'decide', 'shouldEscalate', 'groundOrFallback', 'formatAnswer', 'commandReply']
  .forEach(name => {
    const m = libSrc.match(new RegExp('function ' + name + '\\([\\s\\S]*?\\n}', 'm'));
    if (!m) throw new Error('fn not found: ' + name);
    FN[name] = m[0];
  });

const routeBody = [
  '// Paste of lib/logic.js shouldEscalate (+ command routing)',
  FN.shouldEscalate,
  "const msg=$('Listen for messages').item.json.message||{};",
  "const text=String(msg.text||'').trim();",
  'const chatId=(msg.chat||{}).id||null;',
  "let kind='question';",
  "if(/^\\/(start|help)$/i.test(text))kind='start';",
  "else if(/^\\/faq$/i.test(text))kind='faq';",
  "else if(/^\\/demo$/i.test(text))kind='demo';",
  "else if(/^\\/human$/i.test(text)||shouldEscalate(text))kind='escalate';",
  'return [{json:{kind,text,chatId,isDemo:false}}];',
].join('\n');

const composeBody = [
  '// Paste of lib/logic.js retrieval chain + commandReply (demo runs the REAL pipeline)',
  KB_CONST, STOPWORDS_CONST,
  FN.normalize, FN.tokenize, FN.retrieve, FN.decide, FN.formatAnswer, FN.commandReply,
  'const it=$json;',
  "const kb=($('Load knowledge base').item.json||{}).kb||[];",
  "if(it.kind==='demo'){",
  "  const d=decide(retrieve('how much does a project cost?',kb),null,kb);",
  "  const body=d.mode==='kb'?d.context:'Pricing lives in my FAQ — type /faq.';",
  "  return [{json:{replyText:formatAnswer(body,d.mode,true),chatId:it.chatId}}];",
  '}',
  "const r=commandReply(it.kind,kb,false);",
  'if(!r)return [];',
  'return [{json:{replyText:r,chatId:it.chatId}}];',
].join('\n');

const findBestBody = [
  '// Paste of lib/logic.js retrieval chain',
  STOPWORDS_CONST, FN.normalize, FN.tokenize, FN.retrieve, FN.decide,
  'const it=$json;',
  "const kb=($('Load knowledge base').item.json||{}).kb||[];",
  'const retrieved=retrieve(it.text,kb);',
  'const d=decide(retrieved,null,kb);',
  'return [{json:Object.assign({},it,{mode:d.mode,context:d.context,topScore:retrieved.length?retrieved[0].score:0})}];',
].join('\n');

const kbAnswerBody = [
  '// Paste of lib/logic.js formatAnswer',
  FN.formatAnswer,
  'const it=$json;',
  'return [{json:{replyText:formatAnswer(it.context,\'kb\',it.isDemo),chatId:it.chatId}}];',
].join('\n');

const groundFallbackBody = [
  '// Paste of lib/logic.js groundOrFallback + formatAnswer',
  FN.groundOrFallback, FN.formatAnswer,
  'const it=$json;',
  "let llm={ok:false,text:''};",
  'try{',
  "  const r=$('Ground with LLM').item.json;",
  "  const txt=r&&r.choices&&r.choices[0]&&r.choices[0].message?r.choices[0].message.content:'';",
  "  llm={ok:true,text:String(txt)};",
  '}catch(e){}',
  'const g=groundOrFallback(llm,it.text);',
  'return [{json:{replyText:formatAnswer(g.text,g.mode,it.isDemo),chatId:it.chatId}}];',
].join('\n');

const httpBase = { type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2 };

const nodes = [
  { parameters: { content: '## 💬 Support Chatbot (Telegram)\nKB-first answers (free, instant, deterministic) → LLM grounding for the rest → honest fallback.\n`/start` `/faq` `/demo` `/human`. Edit the KB in "Load knowledge base".', height: 220, width: 380 },
    name: 'Sticky overview', type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position: [-560, -260], id: 'c00' },
  { parameters: { content: '### Fallback\nLLM gets the FULL KB as grounding context.\nIf it fails/times out/garbles → honest "flagged for the team" template ships.\nNo hallucinated prices ever.', height: 170, width: 340 },
    name: 'Sticky fallback', type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position: [1560, -240], id: 'c001' },

  { parameters: { updates: ['message'], additionalFields: {} }, id: 'c01',
    name: 'Listen for messages', type: 'n8n-nodes-base.telegramTrigger', typeVersion: 1.1, position: [-80, 60] },

  {
    parameters: { jsCode: '/* Sample KB — edit to fit YOUR business (same as projects/support-chatbot/lib/logic.js) */\n' + KB_CONST + '\nreturn [{ json: { kb: SAMPLE_KB } }];' },
    id: 'c02', name: 'Load knowledge base', type: 'n8n-nodes-base.code', typeVersion: 2, position: [160, 60],
  },

  { parameters: { jsCode: routeBody }, id: 'c03',
    name: 'Route message', type: 'n8n-nodes-base.code', typeVersion: 2, position: [400, 60] },

  { parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
        conditions: [{ id: 'is-special', leftValue: '={{ $json.kind }}', rightValue: 'question',
          operator: { type: 'string', operation: 'notEquals' } }],
        combinator: 'and',
      }, options: {},
    }, id: 'c04',
    name: 'Is special command?', type: 'n8n-nodes-base.if', typeVersion: 2.2, position: [620, 60] },

  { parameters: { jsCode: composeBody }, id: 'c05',
    name: 'Compose command reply', type: 'n8n-nodes-base.code', typeVersion: 2, position: [840, -80] },

  { parameters: {
      chatId: "={{ $('Route message').item.json.chatId }}",
      text: '={{ $json.replyText }}',
      additionalFields: { appendAttribution: false, parse_mode: 'Markdown', disable_web_page_preview: true },
    }, id: 'c06',
    name: 'Send command reply', type: 'n8n-nodes-base.telegram', typeVersion: 1.2, position: [1060, -80],
    settings: { onError: 'continueRegularOutput' } },

  { parameters: { jsCode: findBestBody }, id: 'c07',
    name: 'Find best answers', type: 'n8n-nodes-base.code', typeVersion: 2, position: [840, 200] },

  { parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
        conditions: [{ id: 'is-kb', leftValue: "={{ $json.mode === 'kb' }}", rightValue: '',
          operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and',
      }, options: {},
    }, id: 'c08',
    name: 'Confident enough?', type: 'n8n-nodes-base.if', typeVersion: 2.2, position: [1060, 200] },

  { parameters: { jsCode: kbAnswerBody }, id: 'c09',
    name: 'Answer from knowledge base', type: 'n8n-nodes-base.code', typeVersion: 2, position: [1280, 120] },

  Object.assign({}, httpBase, {
    parameters: {
      method: 'POST',
      url: 'https://api.nanobridge.net/chat/completions',
      specifyBody: 'json',
      jsonBody: "={{ JSON.stringify({ model: 'deepseek-v4-flash', temperature: 0.5, max_tokens: 150, messages: [ { role: 'system', content: 'You are the support assistant for TODO_BUSINESS_NAME. Answer ONLY from the provided FAQ context, warm and brief, max 3 sentences. If it is not covered, say you will flag it for the team.' }, { role: 'user', content: ('Question: ' + $json.text + '\\n\\nFAQ context:\\n' + $json.context) } ] }) }}",
      options: { timeout: 12000 },
    },
    name: 'Ground with LLM', position: [1280, 300], id: 'c10',
    settings: { onError: 'continueRegularOutput' } }),

  { parameters: { jsCode: groundFallbackBody }, id: 'c11',
    name: 'Ground or fall back', type: 'n8n-nodes-base.code', typeVersion: 2, position: [1500, 300] },

  { parameters: {
      chatId: "={{ $('Route message').item.json.chatId }}",
      text: '={{ $json.replyText }}',
      additionalFields: { appendAttribution: false, parse_mode: 'Markdown', disable_web_page_preview: true },
    }, id: 'c12',
    name: 'Send answer', type: 'n8n-nodes-base.telegram', typeVersion: 1.2, position: [1740, 200],
    settings: { onError: 'continueRegularOutput' } },
];

const edge = to => ({ node: to, type: 'main', index: 0 });
const connections = {
  'Listen for messages': { main: [[edge('Load knowledge base')]] },
  'Load knowledge base': { main: [[edge('Route message')]] },
  'Route message': { main: [[edge('Is special command?')]] },
  'Is special command?': { main: [[edge('Compose command reply')], [edge('Find best answers')]] },
  'Compose command reply': { main: [[edge('Send command reply')]] },
  'Find best answers': { main: [[edge('Confident enough?')]] },
  'Confident enough?': { main: [[edge('Answer from knowledge base')], [edge('Ground with LLM')]] },
  'Answer from knowledge base': { main: [[edge('Send answer')]] },
  'Ground with LLM': { main: [[edge('Ground or fall back')]] },
  'Ground or fall back': { main: [[edge('Send answer')]] },
};

const names = new Set(nodes.map(n => n.name));
for (const [from, outs] of Object.entries(connections)) {
  if (!names.has(from)) throw new Error('connection source not a node: ' + from);
  for (const branch of outs.main) for (const e of branch)
    if (!names.has(e.node)) throw new Error('connection target not a node: ' + e.node);
}

const wf = { name: NAME, nodes, connections, active: false, settings: { executionOrder: 'v1' }, meta: { instanceId: 'portfolio-build' } };
JSON.parse(JSON.stringify(wf));

const outPath = path.join(__dirname, 'workflows', 'support-chatbot.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(wf, null, 2));
fs.writeFileSync(path.join(__dirname, '..', '..', 'workflows', 'support-chatbot.json'), JSON.stringify(wf, null, 2));
console.log('wrote', outPath, '(' + nodes.length + ' nodes)');
