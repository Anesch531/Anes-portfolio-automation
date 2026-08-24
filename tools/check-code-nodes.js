#!/usr/bin/env node
'use strict';
// Syntax-compiles every Code-node body in a workflow JSON.
// Usage from anywhere: node tools/check-code-nodes.js <path-to-workflow.json>
const fs = require('fs');
const path = require('path');

const wf = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), process.argv[2]), 'utf8'));
let ok = 0, bad = 0;
for (const n of wf.nodes) {
  if (n.type !== 'n8n-nodes-base.code') continue;
  try { new Function('$input', '$', '$getWorkflowStaticData', n.parameters.jsCode); ok++; }
  catch (e) { bad++; console.log('SYNTAX FAIL:', n.name, '→', e.message); }
}
console.log(wf.name + ' → code nodes compiled:', ok, '| failed:', bad);
process.exit(bad ? 1 : 0);
