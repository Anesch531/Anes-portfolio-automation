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
const KB = logic.SAMPLE_KB;

console.log('support-chatbot tests');

// known question → KB answer
{
  const r = logic.retrieve('how much does a project cost?', KB);
  run('retrieve: pricing question hits pricing entry', () => {
    assert(r.length && r[0].id === 'pricing' && r[0].score >= 0.34);
  });
  const d = logic.decide(r);
  eq(d.mode, 'kb');
  const out = logic.formatAnswer(d.context, 'kb', false);
  run('format: kb answer carries FAQ tag, no demo marker', () => {
    assert(out.includes('fixed-price') && out.includes('📖') && !out.includes('[DEMO]'));
  });
}

// unknown question → LLM path with grounding context
{
  const f = fx('unknown-question.json').input;
  const r = logic.retrieve(f.text, KB);
  const d = logic.decide(r, null, KB);
  run('decide: low confidence routes to LLM with full-KB grounding', () => {
    eq(d.mode, 'llm'); assert(d.context.includes('pricing')); // grounded w/ KB text
  });
  const g = logic.groundOrFallback(f.llm, f.text);
  run('ground: sane LLM reply adopted', () => { eq(g.mode, 'llm'); });
}

// llm failure on unknown question → honest fallback
{
  const f = fx('llm-failure.json').input;
  const d = logic.decide(logic.retrieve(f.text, KB), null, KB);
  eq(d.mode, 'llm');
  const g = logic.groundOrFallback(f.llm, f.text);
  run('fallback: honest unknown message ships (demo marked)', () => {
    eq(g.mode, 'template');
    const out = logic.formatAnswer(g.text, 'llm', true);
    assert(out.includes('/faq') && out.includes('[DEMO]'));
  });
}

// escalation
run('escalate: human-request detection', () => {
  const f = fx('escalate-human.json').input;
  assert(logic.shouldEscalate(f.text) === true);
  assert(logic.shouldEscalate('what are your support hours?') === false);
  const reply = logic.commandReply('escalate', KB, false);
  assert(reply.includes('flagging') && reply.includes('📮'));
});

// commands
run('commands: start/faq replies well-formed', () => {
  const s = logic.commandReply('start', KB, false);
  assert(s.includes("I'm the assistant") || s.includes('Hi!'));
  const faq = logic.commandReply('faq', KB, false);
  assert(faq.split('\n').length >= KB.length);
});

// retrieval hygiene
run('retrieve: empty/garbage queries return [] safely', () => {
  eq(logic.retrieve('', KB), []);
  eq(logic.retrieve('???', KB), []);
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
