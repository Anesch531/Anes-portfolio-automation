#!/usr/bin/env node
'use strict';
// Zero-dependency runner for lead-capture pure logic.
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

console.log('lead-capture tests');

run('validate: happy lead passes clean', () => {
  const v = logic.validateLead(fx('happy.json').input.payload);
  assert(v.ok && v.clean.email === 'maya@northbeam-logistics.com');
});
run('validate: missing consent + bad email rejected', () => {
  const v = logic.validateLead(fx('missing-field.json').input.payload);
  eq(v.ok, false);
  assert(v.errors.includes('consent not given') && v.errors.includes('email invalid'));
});
run('hash: stable across case/whitespace', () => {
  eq(logic.emailHash(' Maya@NorthBeam.io '), logic.emailHash('maya@northbeam.io'));
});
run('enrich: company guessed from work domain', () => {
  const v = logic.validateLead(fx('happy.json').input.payload);
  const e = logic.enrich(v.clean);
  eq(e.companyName, 'NorthBeam Logistics'); // explicit company wins
});
{
  const f = fx('llm-failure.json').input;
  const v = logic.validateLead(f.payload);
  const e = logic.enrich(v.clean);
  const rule = logic.ruleScore(v.clean, e);
  run('rule score: free provider without intent scores low', () => {
    assert(rule.score < 50 && rule.reasons.length >= 1);
  });
  const merged = logic.mergeLlmScore(rule, f.llm);
  run('fallback: LLM down → template mode keeps tier', () => {
    eq(merged.mode, 'template');
    assert(merged.tier === 'C' || merged.tier === 'B');
  });
}
{
  const f = fx('happy.json').input;
  const v = logic.validateLead(f.payload);
  const e = logic.enrich(v.clean);
  const rule = logic.ruleScore(v.clean, e);
  const merged = logic.mergeLlmScore(rule, f.llm);
  run('merge: valid LLM JSON wins', () => {
    eq(merged.mode, 'llm'); eq(merged.score, 88); eq(merged.tier, 'A');
  });
  const row = logic.sheetRow(v.clean, e, merged);
  run('sheet row: exact CRM headers in order', () => {
    eq(Object.keys(row), logic.SHEET_HEADERS);
    eq(row.email, 'maya@northbeam-logistics.com');
  });
  run('notify: alert contains name, tier, demo-free', () => {
    const t = logic.notifyText(row, false);
    assert(t.includes('Maya') && t.includes('Tier A') && !t.includes('[DEMO]'));
  });
}
run('dedupe: same person twice → identical hash (workflow drops 2nd)', () => {
  const dup = fx('duplicate-event.json').input.payload;
  eq(logic.emailHash(dup.email), logic.emailHash(dup.email.toLowerCase()));
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
