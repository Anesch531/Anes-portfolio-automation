#!/usr/bin/env node
'use strict';
// Zero-dependency runner for order-to-courier pure logic.
const fs = require('fs');
const path = require('path');
const L = require('../lib/logic');

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

console.log('order-to-courier tests');

// ------------------------------------------------------------------- phones
run('phone: Arabic-Indic digits become a real number', () => {
  eq(L.normalizePhone('٠٥٥٥ ١٢ ٣٤ ٥٦', 'DZ').e164, '+213555123456');
});
run('phone: six written forms collapse to one E.164', () => {
  const forms = ['0555123456', '+213555123456', '00213555123456', '555123456',
    '0555 12 34 56', '+213-555-12-34-56'];
  const out = forms.map(f => L.normalizePhone(f, 'DZ').e164);
  eq(new Set(out).size, 1, 'all forms must agree');
  eq(out[0], '+213555123456');
});
run('phone: Algiers landline rejected as not mobile', () => {
  const p = L.normalizePhone('023 45 67 89', 'DZ');
  eq(p.ok, false); eq(p.reason, 'phone_not_mobile'); eq(p.e164, null);
});
run('phone: empty and truncated both fail with a code, never a partial', () => {
  eq(L.normalizePhone('', 'DZ').reason, 'phone_missing');
  eq(L.normalizePhone('0555 12', 'DZ').reason, 'phone_length');
  eq(L.normalizePhone('0555 12', 'DZ').e164, null);
});
run('phone: same string, different country table, different verdict', () => {
  eq(L.normalizePhone('01012345678', 'EG').e164, '+201012345678');
  eq(L.normalizePhone('01012345678', 'DZ').reason, 'phone_length');
  eq(L.normalizePhone('0512345678', 'SA').e164, '+966512345678');
});

// -------------------------------------------------------------------- cities
run('city: article, French and accents all resolve to wilaya 16', () => {
  const forms = ['الجزائر العاصمة', 'الجزائر', 'العاصمة', 'Alger', 'ALGIERS', ' alger '];
  const out = forms.map(f => L.resolveCity(f).code);
  eq(new Set(out).size, 1);
  eq(out[0], '16');
  eq(L.resolveCity('béjaïa').code, '06', 'accents folded');
  eq(L.resolveCity('بجايه').code, '06', 'ta marbuta folded');
});
run('city: all 58 wilayas are present and none is claimed twice', () => {
  // The index build in lib/logic.js throws on a duplicate, so importing the
  // module at all is half this assertion. The other half is coverage.
  const missing = [];
  for (let i = 1; i <= 58; i++) {
    const code = String(i).padStart(2, '0');
    if (!L.WILAYAS[code]) missing.push(code);
  }
  eq(missing, [], 'every wilaya code 01–58 must exist');
  eq(Object.keys(L.WILAYAS).length, 58);
  eq(L.resolveCity('تيبازة').code, '42', 'Tipaza is a real wilaya and must resolve');
  eq(L.resolveCity('touggourt').code, '55', 'a 2019 wilaya in Latin script');
  eq(L.resolveCity("el m'ghair").code, '57', 'apostrophe folded');
});
run('city: text that is not an Algerian wilaya is a hard stop, never a guess', () => {
  // Casablanca is a real city — in the wrong country. A guessed wilaya code
  // sends the parcel to the wrong depot and the store pays the return.
  const c = L.resolveCity('الدار البيضاء');
  eq(c.ok, false); eq(c.reason, 'city_unknown'); eq(c.code, null);
  eq(c.name, 'الدار البيضاء', 'the raw text is kept so a human can read it');
  eq(L.resolveCity('بابا حسن').reason, 'city_unknown', 'a commune is not a wilaya');
  eq(L.resolveCity('').reason, 'city_missing');
});


// ------------------------------------------------------------------- orders
const happy = L.validateOrder(fx('happy-cod.json').input.order, 'DZ');
run('validate: COD order passes with every field normalised', () => {
  eq(happy.ok, true); eq(happy.errors, []);
  eq(happy.clean.phone, '+213555123456');
  eq(happy.clean.cityCode, '16');
  eq(happy.clean.cityName, 'الجزائر');
  eq(happy.clean.itemCount, 3, 'quantities summed, not line count');
  eq(happy.clean.orderName, '#1042');
});
run('validate: COD detected, amount is the order total', () => {
  eq(happy.clean.isCod, true);
  eq(happy.clean.codAmount, 12400);
  eq(happy.clean.currency, 'DZD');
});
run('validate: two independent defects are BOTH reported', () => {
  const v = L.validateOrder(fx('bad-city-and-phone.json').input.order, 'DZ');
  eq(v.ok, false);
  assert(v.errors.includes('city_unknown'), 'city');
  assert(v.errors.includes('phone_not_mobile'), 'phone');
  eq(v.errors.length, 2, 'and nothing invented');
});
const prepaid = L.validateOrder(fx('prepaid-latin.json').input.order, 'DZ');
run('validate: paid order dispatches as PREPAID with cod_amount 0', () => {
  eq(prepaid.ok, true);
  eq(prepaid.clean.isCod, false);
  eq(prepaid.clean.codAmount, 0, 'never collect money twice');
  eq(prepaid.clean.total, 8900);
  eq(prepaid.clean.cityCode, '31');
});

// ------------------------------------------------------------------- payment
run('payment: unpaid + a gateway that is not COD is a STOP, not a PREPAID guess', () => {
  const v = L.validateOrder(fx('unpaid-bank-transfer.json').input.order, 'DZ');
  eq(v.ok, false);
  eq(v.errors, ['payment_unclear'], 'the only defect in an otherwise valid order');
  // The bug this replaces: isCod false + paid false shipped as PREPAID, so the
  // courier collected nothing and the merchant was told "paid in advance".
  const pay = L.paymentOf(fx('unpaid-bank-transfer.json').input.order);
  eq(pay.paid, false); eq(pay.isCod, false); eq(pay.clear, false);
});
run('payment: blank and manual gateways still count as COD', () => {
  const base = { financial_status: 'pending', total_price: '100.00' };
  eq(L.paymentOf(Object.assign({}, base)).isCod, true, 'blank = COD theme default');
  eq(L.paymentOf(Object.assign({}, base, { gateway: 'manual' })).isCod, true);
  eq(L.paymentOf(Object.assign({}, base, { gateway: 'الدفع عند الاستلام' })).isCod, true);
  eq(L.paymentOf(Object.assign({}, base, { gateway: 'Baridimob' })).clear, false);
});
run('payment: a COD order for zero money is refused, not dispatched', () => {
  const o = JSON.parse(JSON.stringify(fx('happy-cod.json').input.order));
  o.total_price = '0.00';
  const v = L.validateOrder(o, 'DZ');
  eq(v.ok, false);
  eq(v.errors, ['cod_amount_zero'], 'a courier told to collect 0 hands the goods over free');
});


// ------------------------------------------------------------------- courier
run('parcel: courier payload carries code, E.164 and COD amount', () => {
  const p = L.buildParcel(happy.clean, 'Camex');
  eq(p.wilaya_code, '16');
  eq(p.phone, '+213555123456');
  eq(p.payment, 'COD');
  eq(p.cod_amount, 12400);
  eq(L.buildParcel(prepaid.clean, 'Camex').payment, 'PREPAID');
});
fx('courier-failures.json').input.responses.forEach(c => {
  run('courier reply: ' + c.label + ' → ' + c.expect, () => {
    const r = L.parseCourierResponse(c.res);
    if (c.expect === 'ok') { eq(r.ok, true); assert(r.tracking, 'tracking present'); }
    else { eq(r.ok, false); eq(r.reason, c.expect); eq(r.tracking, null); }
  });
});
run('courier: the happy reply yields the tracking number verbatim', () => {
  const r = L.parseCourierResponse(fx('happy-cod.json').input.courier);
  eq(r.ok, true); eq(r.tracking, 'CMX-7F3K9021');
});

// ---------------------------------------------------------------------- tags
run('tags: merchant tags survive the write-back', () => {
  const u = L.successUpdate(happy.clean, 'CMX-7F3K9021', 'Camex');
  assert(u.tags.split(',').map(s => s.trim()).includes('instagram'),
    'Shopify replaces the whole tag string, so existing tags must be carried');
  assert(u.tags.includes('tracking-CMX-7F3K9021'));
  assert(u.note.includes('CMX-7F3K9021') && u.note.includes('12400'));
});
run('tags: success clears every failure flag it promised to clear', () => {
  const dirty = Object.assign({}, happy.clean,
    { existingTags: 'instagram, courier-failed, order-invalid, needs-review' });
  const u = L.successUpdate(dirty, 'CMX-7F3K9021', 'Camex');
  L.FLAG_TAGS.forEach(t => assert(!u.tags.includes(t), t + ' must be gone'));
  assert(u.tags.includes('instagram'));
});
run('tags: re-running does not duplicate a tag or change its casing', () => {
  eq(L.mergeTags('sent-to-camex, instagram', ['sent-to-Camex']), 'sent-to-camex, instagram');
});
run('tags: a pre-send failure is NOT blamed on the courier', () => {
  // The courier never saw this order, so `courier-failed` would assert a fact
  // that did not happen — and so would "فشل الإرسال إلى شركة التوصيل".
  const f = L.failureUpdate(happy.clean, ['city_unknown'], 'order');
  assert(f.tags.includes('order-invalid'), 'order-invalid');
  assert(f.tags.includes('needs-review'), 'needs-review');
  assert(!f.tags.includes('courier-failed'), 'the courier was never called');
  assert(!f.note.includes('فشل الإرسال إلى شركة التوصيل'), 'no false claim in the note');
  assert(f.note.includes('يحتاج تصحيحاً قبل الإرسال'), 'says what actually happened');
  assert(f.note.includes('الولاية غير موجودة'), 'Arabic reason rendered from the code');
});
run('tags: a courier-stage failure is blamed on the courier, with its own words', () => {
  const f = L.failureUpdate(happy.clean, ['courier_rejected'], 'courier', 'missing fields: receiver');
  assert(f.tags.includes('courier-failed'), 'courier-failed');
  assert(!f.tags.includes('order-invalid'), 'the order itself was fine');
  assert(f.note.includes('فشل الإرسال إلى شركة التوصيل'));
  assert(f.note.includes('missing fields: receiver'), "the courier's own words are kept");
});

// ---------------------------------------------------------- the customer note
run('note: the customer\'s own note survives a successful dispatch', () => {
  const u = L.successUpdate(happy.clean, 'CMX-7F3K9021', 'Camex');
  assert(u.note.includes('التوصيل بعد الخامسة مساءً'), 'Shopify REPLACES note — carry it');
  assert(u.note.includes('CMX-7F3K9021'), 'and the dispatch block is still there');
  assert(u.note.indexOf('CMX-7F3K9021') < u.note.indexOf('التوصيل بعد'), 'dispatch block on top');
});
run('note: the customer\'s own note survives a failure too', () => {
  const v = L.validateOrder(fx('bad-city-and-phone.json').input.order, 'DZ');
  eq(v.clean.existingNote, 'الرجاء الاتصال قبل التوصيل');
  const f = L.failureUpdate(v.clean, v.errors, 'order');
  assert(f.note.includes('الرجاء الاتصال قبل التوصيل'), 'not destroyed on the failure path either');
});
run('note: writing twice produces the same string, never a stacked block', () => {
  const once = L.successUpdate(happy.clean, 'CMX-7F3K9021', 'Camex').note;
  const twice = L.successUpdate(happy.clean, 'CMX-7F3K9021', 'Camex').note;
  eq(once, twice, 'both reads come from the orders/create snapshot, so it is idempotent');
  eq((once.match(/ملاحظة العميل/g) || []).length, 1);
});
run('note: an order with no customer note gets the dispatch block alone', () => {
  const u = L.successUpdate(prepaid.clean, 'CMX-4A1B7C22', 'Camex');
  assert(!u.note.includes('ملاحظة العميل'), 'no empty separator');
});


// -------------------------------------------------------------------- alerts
run('alert: every defect listed in Arabic, HTML-escaped, demo-free', () => {
  const v = L.validateOrder(fx('bad-city-and-phone.json').input.order, 'DZ');
  const t = L.alertText(v.clean, v.errors, false);
  assert(t.includes('الولاية غير موجودة في جدول التوصيل'), 'city reason');
  assert(t.includes('الرقم ليس هاتفاً نقالاً'), 'phone reason');
  assert(!t.includes('[DEMO]'), 'not a demo');
  eq((t.match(/❌/g) || []).length, 2, 'one line per defect, no invented third');
});
run('alert: injected markup cannot break out of the message', () => {
  const evil = Object.assign({}, happy.clean, { name: '<b>x</b> & <script>alert(1)</script>' });
  const t = L.alertText(evil, ['city_unknown'], true);
  assert(!t.includes('<script>'), 'tags escaped');
  assert(t.includes('&lt;script&gt;') && t.includes('&amp;'));
  assert(t.includes('[DEMO]'));
});
run('alert: unknown reason codes degrade loudly, never silently', () => {
  eq(L.reasonAr('not_a_real_code'), 'سبب غير معروف: not_a_real_code');
});
run('alert: a pre-send failure never claims the courier refused it', () => {
  const v = L.validateOrder(fx('unpaid-bank-transfer.json').input.order, 'DZ');
  const t = L.alertText(v.clean, v.errors, false);
  assert(t.includes('طلب موقوف'), 'headline says stopped, not refused');
  assert(!t.includes('شركة التوصيل لم تقبل'), 'the courier was never called');
  assert(t.includes('طريقة الدفع غير محددة'), 'the money reason in Arabic');
  assert(t.includes('order-invalid'), 'names the tag it actually wrote');
  assert(!t.includes('courier-failed'), 'and not the one it did not');
});
run('alert: the footer never promises a resend that does not exist', () => {
  // Only orders/create is subscribed, so editing an order fires nothing. The
  // old footer said the tags lift automatically "when you re-send" and implied
  // the edit itself would trigger it. It does not.
  const v = L.validateOrder(fx('bad-city-and-phone.json').input.order, 'DZ');
  const t = L.alertText(v.clean, v.errors, false);
  assert(t.includes('يدوياً'), 'the merchant is told the retry is manual');
  assert(t.includes('لا يُعيد المحاولة تلقائياً'), 'and told the edit alone does nothing');
});
run('alert: a courier-side failure carries the courier\'s own words', () => {
  const r = L.parseCourierResponse({ statusCode: 200, body: { success: false, error: 'wilaya not served' } });
  eq(r.reason, 'courier_rejected');
  eq(r.detail, 'wilaya not served', 'the real cause is kept, not thrown away');
  const t = L.alertText(happy.clean, [r.reason], false, { detail: r.detail });
  assert(t.includes('شركة التوصيل لم تقبل الطلب'), 'headline blames the right party');
  assert(t.includes('wilaya not served'), 'and shows why');
  assert(t.includes('بيانات الطلب سليمة'), 'tells the merchant not to hunt for a defect');
  assert(!t.includes('صحّح الطلب في Shopify'), 'there is nothing to correct');
});
run('alert: the courier\'s words are escaped like every other field', () => {
  const t = L.alertText(happy.clean, ['courier_http'], false, { detail: '<b>502</b> & down' });
  assert(!t.includes('<b>502</b>'), 'markup escaped');
  assert(t.includes('&lt;b&gt;502&lt;/b&gt;') && t.includes('&amp;'));
});

run('success text: tracking, wilaya code and COD amount all present', () => {
  const t = L.successText(happy.clean, 'CMX-7F3K9021', 'Camex', false);
  assert(t.includes('CMX-7F3K9021') && t.includes('16') && t.includes('12400'));
  assert(L.successText(prepaid.clean, 'CMX-4A1B7C22', 'Camex', false).includes('مدفوع مسبقاً'));
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
