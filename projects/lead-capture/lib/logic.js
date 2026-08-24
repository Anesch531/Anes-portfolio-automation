'use strict';
// Canonical pure logic for lead-capture. Pasted into n8n Code nodes via
// build-workflow.js; proven by tests/run.js. Zero dependencies.

const FREE_PROVIDERS = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com', 'proton.me', 'protonmail.com'];
const BUY_INTENT_WORDS = ['budget', 'quote', 'proposal', 'pricing', 'integrate', 'integration', 'automation', 'automate', 'team', 'company', 'asap', 'urgent'];

function emailHash(email) {
  const s = String(email || '').trim().toLowerCase();
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return 'h' + h.toString(16);
}

function validateLead(raw) {
  raw = raw || {};
  const errors = [];
  const name = String(raw.name || '').trim().slice(0, 120);
  const email = String(raw.email || '').trim().toLowerCase().slice(0, 200);
  const company = String(raw.company || '').trim().slice(0, 120);
  const message = String(raw.message || '').trim().slice(0, 2000);
  const consent = raw.consent === true || raw.consent === 'true';

  if (!name) errors.push('name missing');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) errors.push('email invalid');
  if (!consent) errors.push('consent not given');

  return {
    ok: errors.length === 0,
    errors,
    clean: { name, email, company, message, consent },
  };
}

function enrich(clean) {
  const domain = clean.email.split('@')[1] || '';
  const isFreeProvider = FREE_PROVIDERS.indexOf(domain) !== -1;
  const base = domain.split('.')[0] || '';
  const companyName = clean.company || (isFreeProvider ? '' : base.charAt(0).toUpperCase() + base.slice(1));
  const initials = clean.name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
  return { domain, isFreeProvider, companyName, initials };
}

// Deterministic scoring used when the LLM is unavailable — never guess blind.
function ruleScore(clean, enrichment) {
  let score = 40;
  const why = ['base 40'];
  if (!enrichment.isFreeProvider && enrichment.domain) { score += 25; why.push('work domain (+25)'); }
  if (clean.company) { score += 10; why.push('company given (+10)'); }
  if (clean.message.length > 80) { score += 15; why.push('detailed message (+15)'); }
  const lower = clean.message.toLowerCase();
  const hits = BUY_INTENT_WORDS.filter(w => lower.includes(w));
  if (hits.length) { score += Math.min(10, hits.length * 5); why.push('buy-intent words (' + hits.slice(0, 3).join(',') + ')'); }
  return { score: Math.max(0, Math.min(100, score)), reasons: why };
}

// LLM-or-template merge (see /docs/llm-fallback-pattern.md)
function mergeLlmScore(rule, llmOut) {
  let llmScore = null;
  let llmReason = '';
  try {
    if (llmOut && typeof llmOut.text === 'string') {
      const m = llmOut.text.match(/\{[\s\S]*\}/);
      if (m) {
        const j = JSON.parse(m[0]);
        const v = Math.round(Number(j.score));
        if (v >= 0 && v <= 100) { llmScore = v; llmReason = String(j.reason || '').slice(0, 160); }
      }
    }
  } catch (e) { /* fall through */ }

  const score = llmScore == null ? rule.score : llmScore;
  const reason = llmReason || rule.reasons.join(', ');
  const tier = score >= 75 ? 'A' : score >= 50 ? 'B' : 'C';
  return { score, reason, tier, mode: llmScore == null ? 'template' : 'llm' };
}

const SHEET_HEADERS = ['timestamp', 'name', 'email', 'company', 'message', 'score', 'tier', 'reason', 'scoreMode', 'domain'];

function sheetRow(clean, enrichment, merged) {
  const r = {
    timestamp: new Date().toISOString(),
    name: clean.name,
    email: clean.email,
    company: enrichment.companyName,
    message: clean.message,
    score: merged.score,
    tier: merged.tier,
    reason: merged.reason,
    scoreMode: merged.mode,
    domain: enrichment.domain,
  };
  // guarantee exact column order/keys for auto-mapping into the sheet
  const out = {};
  SHEET_HEADERS.forEach(h => { out[h] = r[h] == null ? '' : r[h]; });
  return out;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function notifyText(row, isDemo) {
  const tone = row.tier === 'A' ? '🔥' : row.tier === 'B' ? '⚡' : '🧊';
  return [
    tone + ' <b>[NEW LEAD · Tier ' + esc(row.tier) + ' · ' + esc(String(row.score)) + '/100]</b>' + (isDemo ? ' 🧪 [DEMO]' : ''),
    '<b>' + esc(row.name) + '</b>' + (row.company ? ' — ' + esc(row.company) : ''),
    '✉️ ' + esc(row.email),
    row.message ? '\n💬 <i>' + esc(row.message).slice(0, 300) + '</i>' : '',
    '\nWhy: ' + esc(row.reason) + ' <i>(' + esc(row.scoreMode) + ')</i>',
  ].filter(Boolean).join('\n');
}

module.exports = {
  FREE_PROVIDERS, emailHash, validateLead, enrich, ruleScore,
  mergeLlmScore, SHEET_HEADERS, sheetRow, notifyText, esc,
};
