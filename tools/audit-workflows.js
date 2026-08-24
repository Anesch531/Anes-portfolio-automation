#!/usr/bin/env node
'use strict';
// Structural audit: catches missing required parameters that syntax checks can't see
// (e.g. httpRequest sendBody, webhook/response pairing, IF condition shapes).
// Usage: node tools/audit-workflows.js <workflow.json> [more.json...]

const fs = require('fs');
let problems = 0;

function audit(file) {
  const wf = JSON.parse(fs.readFileSync(file, 'utf8'));
  const byName = Object.fromEntries(wf.nodes.map(n => [n.name, n]));
  const tag = wf.name;
  const bad = msg => { problems++; console.log('  ✗ [' + tag + '] ' + msg); };

  for (const n of wf.nodes) {
    const p = n.parameters || {};
    const name = n.name;

    if (n.type === 'n8n-nodes-base.httpRequest') {
      const isPost = (p.method || 'GET') === 'POST';
      const wantsBody = p.sendBody === true;
      if (isPost && !wantsBody) bad(name + ': POST but sendBody !== true');
      if (wantsBody && !p.specifyBody) bad(name + ': sendBody without specifyBody');
      if (p.specifyBody === 'json' && !p.jsonBody) bad(name + ': json body mode but no jsonBody');
      if (!p.url) bad(name + ': no url');
      const t = (((p.options || {}).timeout));
      if (!t || t > 15000) bad(name + ': timeout missing or >15s (' + t + ')');
    }

    if (n.type === 'n8n-nodes-base.webhook') {
      if (!p.httpMethod || !p.path) bad(name + ': webhook missing method/path');
      if (p.responseMode === 'responseNode' &&
          !Object.values(byName).some(x => x.type === 'n8n-nodes-base.respondToWebhook'))
        bad(name + ': responseNode mode but no Respond to Webhook node');
    }

    if (n.type === 'n8n-nodes-base.respondToWebhook') {
      if (!p.respondWith) bad(name + ': no respondWith');
      if (p.respondWith === 'text' && !p.responseBody) bad(name + ': text mode but no responseBody');
    }

    if (n.type === 'n8n-nodes-base.if') {
      const conds = (((p.conditions || {}).conditions) || []);
      if (!conds.length) bad(name + ': IF with zero conditions');
      conds.forEach((c, i) => {
        if (!c.leftValue || !c.operator || (!c.rightValue && !['true', 'false', 'empty', 'notEmpty'].includes(c.operator.operation)))
          bad(name + ' cond#' + i + ': incomplete condition');
      });
    }

    if (n.type === 'n8n-nodes-base.telegram' || n.type === 'n8n-nodes-base.telegramTrigger') {
      if (n.type.includes('telegramTrigger')) {
        if (!Array.isArray(p.updates) || !p.updates.length) bad(name + ': trigger with no update types');
      } else {
        if (!p.chatId) bad(name + ': no chatId');
        if (!p.text) bad(name + ': no text');
        const af = p.additionalFields || {};
        if (!af.parse_mode) bad(name + ': no parse_mode (HTML formatting will break)');
      }
    }

    if (n.type === 'n8n-nodes-base.code') {
      if (!p.jsCode || !String(p.jsCode).trim()) bad(name + ': empty jsCode');
    }
  }

  // orphan check: every non-sticky node must be wired
  for (const n of wf.nodes) {
    if (n.type === 'n8n-nodes-base.stickyNote') continue;
    const incoming = Object.values(wf.connections).some(o =>
      (o.main || []).some(br => br.some(e => e.node === n.name)));
    const outgoing = !!wf.connections[n.name];
    if (!incoming && !outgoing) bad(n.name + ': completely unwired island');
  }

  console.log('  ✓ [' + tag + '] audited: ' + wf.nodes.length + ' nodes');
}

(process.argv.slice(2)).forEach(audit);
console.log(problems ? '\nAUDIT FAILED: ' + problems + ' problem(s)' : '\nALL WORKFLOWS CLEAN');
process.exit(problems ? 1 : 0);
