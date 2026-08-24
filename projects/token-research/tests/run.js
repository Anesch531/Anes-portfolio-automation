#!/usr/bin/env node
'use strict';
// Zero-dependency runner: exercises the exact pure logic pasted into the n8n Code nodes.
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

console.log('token-research tests');

// ---------- happy ----------
{
  const f = fx('happy.json').input;
  const r = logic.buildReport(f);
  run('happy: parseCommand', () => eq(logic.parseCommand(f.text), { symbol: 'PEPE', isDemo: false }));
  run('happy: exact symbol match wins over first result', () => assert(r.market && r.market.id === 'pepe'));
  run('happy: deepest pool picked', () => { assert(r.dex && r.dex.dex === 'uniswap' && r.dex.chainIdNumeric === 1); });
  run('happy: no risk flags on clean contract', () => eq(r.flags, []));
  run('happy: news filtered to relevant', () => assert(r.news.length === 2));
  run('happy: report built', () => { assert(r.html.includes('Token research') && r.html.includes('▲ +6.42% (24h)') && r.html.includes('$4.70B')); });
}
{
  const f = fx('happy.json').input;
  const r = logic.buildReport(f);
  const out = logic.applyLlmSummary(r, f.llm);
  run('happy: LLM verdict applied', () => { assert(out.mode === 'llm' && !out.finalHtml.includes('%%SUMMARY%%')); });
}

// ---------- llm failure → template fallback ----------
{
  const bad = { ok: false, error: 'rate limited' };
  const r = logic.buildReport(fx('happy.json').input);
  const out = logic.applyLlmSummary(r, bad);
  run('fallback: LLM garbage → template verdict ships', () => {
    assert(out.mode === 'template' && out.finalHtml.includes('trades at $'));
  });
  const g = logic.buildReport(fx('upstream-failure.json').input);
  run('fallback: degraded card when markets upstream dies', () => {
    assert(g.degraded === true && g.html.includes('partial data'));
  });
  const m = logic.buildReport(fx('missing-field.json').input);
  run('fallback: missing dex/news still produces full report', () => {
    assert(m.dex === null && m.flags.length === 0 && m.html.includes('No standard scam-pattern flags'));
  });
}

// ---------- unknown symbol ----------
{
  const r = logic.buildReport(fx('unknown-symbol.json').input);
  run('unknown: graceful no-match card', () => {
    assert(r.degraded === true && r.html.includes("couldn't match"));
  });
}

// ---------- unit edges ----------
run('edge: parseCommand rejects junk', () => {
  eq(logic.parseCommand('hello'), null);
  eq(logic.parseCommand('/research'), null);
  eq(logic.parseCommand('/demo $sol'), { symbol: 'SOL', isDemo: true });
});
run('edge: fmtMoney scales', () => {
  eq(logic.fmtMoney(4700000000), '4.70B');
  eq(logic.fmtMoney(900000000), '900.00M');
  eq(logic.fmtMoney(0.00001123), '0.0000112');
  eq(logic.fmtMoney(null), '—');
});
run('edge: honeypot + mint flags surface', () => {
  const flags = logic.riskFlags({ '0xabc': { is_honeypot: '1', is_mintable: '1', sell_tax: '0.22' } }, '0xAbC');
  assert(flags.length === 3 && flags[0] === 'honeypot contract');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
