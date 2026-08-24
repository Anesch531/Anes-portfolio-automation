'use strict';
// Canonical pure logic for support-chatbot. Pasted into n8n Code nodes via
// build-workflow.js; proven by tests/run.js. Zero dependencies.

// Sample knowledge base — edit these entries to fit YOUR business.
// Keep answers short (they go straight into chat bubbles).
const SAMPLE_KB = [
  {
    id: 'services',
    q: 'What services do you offer?',
    a: 'I build business automations with n8n: lead pipelines, reporting bots, AI summaries, and integrations between the tools you already use.',
    tags: ['services', 'offer', 'build', 'automations', 'what can you do'],
  },
  {
    id: 'pricing',
    q: 'How much does an automation project cost?',
    a: 'Projects start around TODO_PRICE for a single workflow and scale with complexity. Every quote is fixed-price after a free scoping call.',
    tags: ['price', 'pricing', 'cost', 'how much', 'quote', 'budget', 'rates'],
  },
  {
    id: 'timeline',
    q: 'How long does a typical build take?',
    a: 'Most automations ship within TODO_DAYS days of the scoping call. You get a staging demo before anything goes live.',
    tags: ['timeline', 'how long', 'delivery', 'fast', 'deadline'],
  },
  {
    id: 'support',
    q: 'What support do I get after delivery?',
    a: 'Every project includes 30 days of free fixes, plus documentation so your team owns it. Ongoing monitoring plans are available.',
    tags: ['support', 'maintenance', 'after', 'warranty', 'help', 'broken'],
  },
  {
    id: 'contact',
    q: 'How do I reach a human?',
    a: 'Type "human" here and I flag this chat for immediate follow-up, or email TODO_EMAIL.',
    tags: ['contact', 'email', 'human', 'agent', 'phone', 'call'],
  },
  {
    id: 'security',
    q: 'How do you handle credentials and data?',
    a: 'Secrets live encrypted in n8n credentials, never in code or chats. Flows are read-only/report-only wherever money is involved.',
    tags: ['security', 'credentials', 'safe', 'data', 'privacy'],
  },
];

const LIGHT_STOPWORDS = new Set(('a,an,and,are,as,at,be,but,by,for,from,i,in,is,it,its,of,on,or,that,the,' +
  'this,to,was,were,will,with,you,your,me,we,us,our,they,them,their,so,if,then,than,too,very,can,could,' +
  'would,should,did,do,does,just,now,about,there,have,has,had,he,she,his,her').split(','));

function normalize(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function tokenize(text) {
  return normalize(text).split(' ').filter(w => w.length > 1 && !LIGHT_STOPWORDS.has(w));
}

// Fraction-of-query scoring + tag bonus. Returns top-k [{id,score,confidence,entry}]
function retrieve(query, kb, k) {
  k = k || 2;
  const qt = tokenize(query);
  if (!qt.length || !Array.isArray(kb)) return [];
  const results = kb.map(entry => {
    const bag = new Set(tokenize(entry.q).concat((entry.tags || []).map(t => tokenize(t)).flat()));
    let matched = 0;
    qt.forEach(t => { if (bag.has(t)) matched++; });
    let score = qt.length ? matched / qt.length : 0;
    const lowerQ = normalize(query);
    if ((entry.tags || []).some(tag => lowerQ.includes(normalize(tag)))) score = Math.min(1, score + 0.15);
    return { id: entry.id, score: Math.round(score * 100) / 100, entry };
  })
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
  return results;
}

function decide(retrieved, threshold, kb) {
  threshold = threshold == null ? 0.34 : threshold;
  const top = retrieved && retrieved[0];
  const fullContext = Array.isArray(kb)
    ? kb.map(e => e.q + ' [' + (e.tags || []).join(', ') + ']: ' + e.a).join('\n')
    : '';
  if (!top) return { mode: 'llm', context: fullContext };
  return top.score >= threshold
    ? { mode: 'kb', context: top.entry.a }
    : { mode: 'llm', context: retrieved.map(r => r.entry.q + ': ' + r.entry.a).join('\n') + '\n' + fullContext };
}

function shouldEscalate(text) {
  return /\b(human|agent|real person|someone real|talk to (a )?(person|someone)|speak to (a )?(person|someone))\b/i.test(String(text || ''));
}

// LLM-or-fallback per docs/llm-fallback-pattern.md
function groundOrFallback(llmOut, userText) {
  const txt = llmOut && typeof llmOut.text === 'string' ? llmOut.text.trim() : '';
  // simple sanity: length window only — the prompt is already grounded with KB context
  if (txt.length >= 20 && txt.length <= 600) {
    return { mode: 'llm', text: txt };
  }
  void userText;
  return {
    mode: 'template',
    text: "I don't have that one in my knowledge base yet — I've flagged it for the team. Type /faq to see what I can answer, or say \"human\" to reach a person.",
  };
}

function formatAnswer(body, modeTag, isDemo) {
  const tag = modeTag === 'kb' ? '📖 from the FAQ'
    : modeTag === 'llm' ? '🤖 AI-assisted'
    : '📮 forwarded to a human';
  return body.trim() + '\n\n_ ' + tag + (isDemo ? ' · 🧪 [DEMO]' : '');
}

function commandReply(kind, kb, isDemo) {
  if (kind === 'escalate') {
    return formatAnswer("Got it — flagging this conversation for a human right now. Someone will follow up shortly.", 'escalate', isDemo);
  }
  if (kind === 'start' || kind === 'help') {
    return formatAnswer(
      "👋 Hi! I'm the assistant for TODO_BUSINESS_NAME.\nAsk me about pricing, timelines, services, or support — or type /faq.",
      'kb', isDemo);
  }
  if (kind === 'faq') {
    const lines = (kb || []).map(e => '• ' + e.q);
    return formatAnswer('Here\'s everything I know:\n' + lines.join('\n'), 'kb', isDemo);
  }
  return null; // unknown kind → caller decides
}

module.exports = {
  SAMPLE_KB, LIGHT_STOPWORDS, normalize, tokenize, retrieve, decide,
  shouldEscalate, groundOrFallback, formatAnswer, commandReply,
};
