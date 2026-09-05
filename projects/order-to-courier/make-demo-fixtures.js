'use strict';
// Generates tests/fixtures/*.demo.json — the payloads the demo webhook is fired
// with — from the SAME base fixtures the 26 tests assert against.
//
// Why this is a script and not five hand-written files: the demo payloads used
// to be typed separately, so a fixture could be corrected for the tests while
// the file the camera actually sees kept the old value. That is the same failure
// as writing a mock's request body by hand — both sides pass their own check and
// disagree with each other. Deriving one from the other makes drift impossible.
//
//   node make-demo-fixtures.js
//
// The demo webhook expects the raw Shopify order under `order`, plus an optional
// `_mock` string that tells the mock courier how to misbehave. `_mock` is read
// ONLY on the demo path, so a real Shopify order can never set it.

const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, 'tests', 'fixtures');

// The fixture order ids are invented, so the two Shopify write nodes 404 on every
// demo — proven by execution 815, whose `Tag Order Booked` reported
// `executionStatus: success` while its only output item was
// `{ error: 'The resource you are requesting could not be found' }`. That is the
// green-execution trap: the node did not write anything and said nothing.
//
// To film the Shopify half, create ONE order in the dev store, copy its numeric
// id (the long number in the admin URL, not `#1042`) and regenerate:
//
//   DEMO_ORDER_ID=1234567890123 node make-demo-fixtures.js
//
// Only `happy-cod` gets the real id — the failure takes must keep distinct ids or
// they collide in the dedupe bucket, and a failure take does not need a real order
// (its Shopify write is expected to be visible only as `order-invalid`).
const REAL_ID = String(process.env.DEMO_ORDER_ID || '').trim();
if (REAL_ID && !/^\d{6,20}$/.test(REAL_ID)) {
  throw new Error('DEMO_ORDER_ID must be the numeric Shopify order id, got: ' + REAL_ID);
}

// out                       from                  overrides applied to the order
const TARGETS = [
  ['happy-cod',              'happy-cod',          {}],
  ['bad-city-and-phone',     'bad-city-and-phone', {}],
  ['unpaid-bank-transfer',   'unpaid-bank-transfer', {}],
  // Both courier-failure takes reuse the GOOD order on purpose: the order is
  // valid, so the only thing under test is the courier's reply. Distinct ids
  // keep them out of each other's dedupe bucket.
  ['courier-down',           'happy-cod',          { id: 5238104920008, name: '#1051', order_number: 1051 }, 'http502'],
  ['courier-rejects',        'happy-cod',          { id: 5238104920009, name: '#1052', order_number: 1052 }, 'reject'],
];

let wrote = 0;
for (const [out, from, overrides, mock] of TARGETS) {
  const base = JSON.parse(fs.readFileSync(path.join(DIR, from + '.json'), 'utf8'));
  const order = Object.assign({}, base.input.order, overrides);
  if (REAL_ID && out === 'happy-cod') order.id = Number(REAL_ID);
  const payload = mock ? { _mock: mock, order } : { order };
  const file = path.join(DIR, out + '.demo.json');
  fs.writeFileSync(file, JSON.stringify(payload, null, 2) + '\n');
  console.log('  ' + out + '.demo.json  ←  ' + from + '.json'
    + (mock ? '  [_mock: ' + mock + ']' : '')
    + (REAL_ID && out === 'happy-cod' ? '  [real order id ' + REAL_ID + ']' : ''));
  wrote++;
}
console.log(wrote + ' demo payloads written from ' + new Set(TARGETS.map(t => t[1])).size + ' base fixtures.');
if (!REAL_ID) {
  console.log('Shopify writes will 404 (invented order ids). Set DEMO_ORDER_ID to film that half.');
}
