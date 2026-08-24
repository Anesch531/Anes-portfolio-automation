#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const logic = require('../lib/logic');

let pass = 0, fail = 0;
function run(name, fn) {
  try { fn(); console.log('  ✓ ' + name); pass++; }
  catch (e) { console.log('  ✗ ' + name + '\n      ' + e.message); fail++; }
}
function assert(c, m) { if (!c) throw new Error(m || 'assertion failed'); }
function eq(a, b, m) {
  assert(JSON.stringify(a) === JSON.stringify(b), (m || 'eq') +
    ' | got: ' + JSON.stringify(a) + ' want: ' + JSON.stringify(b));
}
const fx = f => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', f), 'utf8'));

console.log('review-summarizer tests');

// happy
{
  const f = fx('happy.json').input;
  const p = logic.parseReviews(f);
  run('parse: all valid reviews kept', () => { eq(p.reviews.length, 6); eq(p.skipped, 0); });
  const split = logic.sentimentSplit(p.reviews);
  run('split: math checks out', () => {
    eq(split.posPct, 50); eq(split.neuPct, 17); eq(split.negPct, 33); eq(split.avg, 3.3);
  });
  const themes = logic.keywordThemes(p.reviews, 5);
  run('themes: assembly ranks top and positive', () => {
    assert(themes[0].label === 'assembly' && themes[0].sentiment === 'positive');
  });
  run('themes: motor not positive; customer-service negative', () => {
    const m = themes.find(t => t.label === 'motor');
    const c = themes.find(t => t.label === 'customer');
    assert(m && m.sentiment !== 'positive');
    assert(c && c.sentiment === 'negative');
  });
  const heuristic = { split, themes };
  const merged = logic.mergeDigest(f.llm, heuristic);
  run('merge: valid LLM JSON adopted', () => { eq(merged.mode, 'llm'); assert(merged.themes.length === 3); });
  const html = logic.formatDigest({ product: p.product, split, digest: merged, isDemo: false });
  run('digest: rich card renders', () => {
    assert(html.includes('AuroraDesk') && html.includes('★☆☆☆☆'.slice(0, 0) + '★') && html.includes('Verdict'));
    assert(!html.includes('%%') && !html.includes('[DEMO]'));
  });
}

// llm failure → template
{
  const p = logic.parseReviews(fx('happy.json').input);
  const split = logic.sentimentSplit(p.reviews);
  const themes = logic.keywordThemes(p.reviews, 5);
  const merged = logic.mergeDigest({ ok: false, text: '' }, { split, themes });
  run('fallback: template verdict + reply reference loudest complaint', () => {
    eq(merged.mode, 'template');
    assert(merged.suggestedReply.includes('customer') && merged.verdict.includes('/5'));
  });
}

// empty
run('empty: graceful apology card, no crash', () => {
  const p = logic.parseReviews(fx('empty-list.json').input);
  const html = logic.formatDigest({ product: p.product, split: logic.sentimentSplit(p.reviews), digest: null, isDemo: true });
  assert(html.includes('No valid reviews') && html.includes('&lt;b&gt;')); // escaped, safe
});

// malformed
run('malformed: junk skipped, valid kept', () => {
  const p = logic.parseReviews(fx('malformed-entry.json').input);
  eq(p.reviews.length, 2); eq(p.skipped, 3);
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
