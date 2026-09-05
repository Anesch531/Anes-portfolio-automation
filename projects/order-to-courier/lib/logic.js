'use strict';
// Canonical pure logic for order-to-courier. Pasted into n8n Code nodes via
// build-workflow.js; proven by tests/run.js. Zero dependencies.

// ------------------------------------------------------------------- phones

// Arabic-Indic (٠-٩) and Extended Arabic-Indic (۰-۹) digits. Arab shoppers type
// these into checkout forms constantly and every courier API rejects them.
const AR_DIGITS = {};
for (let i = 0; i < 10; i++) {
  AR_DIGITS[String.fromCharCode(0x0660 + i)] = String(i);
  AR_DIGITS[String.fromCharCode(0x06f0 + i)] = String(i);
}

// natLen = digits after the country code. mobile = allowed first digit.
const COUNTRIES = {
  DZ: { dial: '213', natLen: 9, mobile: /^[567]/ },
  MA: { dial: '212', natLen: 9, mobile: /^[67]/ },
  TN: { dial: '216', natLen: 8, mobile: /^[249]/ },
  SA: { dial: '966', natLen: 9, mobile: /^5/ },
  EG: { dial: '20', natLen: 10, mobile: /^1/ },
};

function asciiDigits(s) {
  return String(s == null ? '' : s).replace(/[٠-٩۰-۹]/g, c => AR_DIGITS[c]);
}

// Returns E.164 or a stable reason code. Never a partial number.
function normalizePhone(raw, cc) {
  const country = COUNTRIES[cc] || COUNTRIES.DZ;
  const text = asciiDigits(raw).trim();
  const bad = r => ({ ok: false, reason: r, e164: null, national: null });
  if (!text) return bad('phone_missing');

  let d = text.replace(/\D/g, '');
  if (!text.startsWith('+') && d.startsWith('00')) d = d.slice(2);
  if (d.startsWith(country.dial) && d.length === country.dial.length + country.natLen) {
    d = d.slice(country.dial.length);
  } else if (d.length === country.natLen + 1 && d.startsWith('0')) {
    d = d.slice(1);
  }
  if (d.length !== country.natLen) return bad('phone_length');
  if (!country.mobile.test(d)) return bad('phone_not_mobile');
  return { ok: true, reason: '', e164: '+' + country.dial + d, national: '0' + d };
}

// -------------------------------------------------------------------- cities

// Fold the spellings the same city arrives in: hamza forms, alef maqsura,
// ta marbuta, tashkeel, tatweel, accents, casing, double spaces.
// Marks are stripped BY CODE POINT, not by a regex with literal combining
// characters in it — those do not survive being pasted into an n8n Code node.
function stripMarks(s) {
  let out = '';
  for (const ch of String(s == null ? '' : s)) {
    const c = ch.codePointAt(0);
    const tashkeel = c >= 0x064b && c <= 0x065f;
    const tatweel = c === 0x0640;
    const combining = (c >= 0x0300 && c <= 0x036f) || c === 0x0670;
    if (!tashkeel && !tatweel && !combining) out += ch;
  }
  return out;
}

function normalizeArabic(s) {
  const folded = stripMarks(asciiDigits(s).normalize('NFD'))
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه');
  return folded.toLowerCase()
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .replace(/\s+/g, ' ').trim();
}

// Wilaya code → accepted spellings, all 58 wilayas of the post-2019 division.
// Adding a spelling is a data edit, not a code change — and the index build
// below throws if two codes ever claim the same normalised name, so a bad edit
// fails loudly instead of silently sending parcels to the wrong depot.
const WILAYAS = {
  '01': ['أدرار', 'adrar'],
  '02': ['الشلف', 'chlef'],
  '03': ['الأغواط', 'laghouat'],
  '04': ['أم البواقي', 'oum el bouaghi', 'oum el bouaki'],
  '05': ['باتنة', 'batna'],
  '06': ['بجاية', 'bejaia', 'béjaïa'],
  '07': ['بسكرة', 'biskra'],
  '08': ['بشار', 'bechar', 'béchar'],
  '09': ['البليدة', 'blida'],
  '10': ['البويرة', 'bouira'],
  '11': ['تمنراست', 'tamanrasset', 'tamanghasset'],
  '12': ['تبسة', 'tebessa', 'tébessa'],
  '13': ['تلمسان', 'tlemcen'],
  '14': ['تيارت', 'tiaret'],
  '15': ['تيزي وزو', 'tizi ouzou', 'tizi-ouzou'],
  '16': ['الجزائر', 'الجزائر العاصمة', 'العاصمة', 'alger', 'algiers', 'algérie centre'],
  '17': ['الجلفة', 'djelfa'],
  '18': ['جيجل', 'jijel'],
  '19': ['سطيف', 'setif', 'sétif'],
  '20': ['سعيدة', 'saida', 'saïda'],
  '21': ['سكيكدة', 'skikda'],
  '22': ['سيدي بلعباس', 'sidi bel abbes', 'sidi bel abbès'],
  '23': ['عنابة', 'annaba'],
  '24': ['قالمة', 'guelma'],
  '25': ['قسنطينة', 'constantine'],
  '26': ['المدية', 'medea', 'médéa'],
  '27': ['مستغانم', 'mostaganem'],
  '28': ['المسيلة', 'msila', "m'sila"],
  '29': ['معسكر', 'mascara'],
  '30': ['ورقلة', 'ouargla'],
  '31': ['وهران', 'oran'],
  '32': ['البيض', 'el bayadh'],
  '33': ['إليزي', 'illizi'],
  '34': ['برج بوعريريج', 'bordj bou arreridj', 'bordj bou arréridj'],
  '35': ['بومرداس', 'boumerdes', 'boumerdès'],
  '36': ['الطارف', 'el tarf'],
  '37': ['تندوف', 'tindouf'],
  '38': ['تيسمسيلت', 'tissemsilt'],
  '39': ['الوادي', 'el oued'],
  '40': ['خنشلة', 'khenchela'],
  '41': ['سوق أهراس', 'souk ahras'],
  '42': ['تيبازة', 'tipaza', 'tipasa'],
  '43': ['ميلة', 'mila'],
  '44': ['عين الدفلى', 'ain defla', 'aïn defla'],
  '45': ['النعامة', 'naama', 'naâma'],
  '46': ['عين تموشنت', 'ain temouchent', 'aïn témouchent'],
  '47': ['غرداية', 'ghardaia', 'ghardaïa'],
  '48': ['غليزان', 'relizane'],
  // The ten wilayas created in 2019, all in the south. A courier that still
  // uses the pre-2019 division files them under their parent wilaya — which is
  // why the code is what travels to the API, never the name.
  '49': ['تيميمون', 'timimoun'],
  '50': ['برج باجي مختار', 'bordj badji mokhtar'],
  '51': ['أولاد جلال', 'ouled djellal'],
  '52': ['بني عباس', 'beni abbes', 'béni abbès'],
  '53': ['عين صالح', 'in salah', 'ain salah'],
  '54': ['عين قزام', 'in guezzam', 'ain guezzam'],
  '55': ['تقرت', 'touggourt'],
  '56': ['جانت', 'djanet'],
  '57': ['المغير', 'el mghair', "el m'ghair"],
  '58': ['المنيعة', 'el meniaa', 'el menia'],
};


// Built once, and it THROWS on a duplicate. Two codes claiming the same
// normalised spelling is the one data error that would silently route parcels
// to the wrong depot — 58 wilayas share a lot of substrings, and the folding
// above makes near-misses collide (`عين صالح` / `ain salah`). A loud crash on
// import is the cheapest place to catch it: the 26 tests import this file, so
// a bad edit fails in `node tests/run.js` instead of in production.
const CITY_INDEX = {};
Object.keys(WILAYAS).forEach(code => {
  WILAYAS[code].forEach(name => {
    const key = normalizeArabic(name);
    if (!key) throw new Error('WILAYAS: empty spelling for code ' + code);
    if (CITY_INDEX[key] && CITY_INDEX[key] !== code) {
      throw new Error('WILAYAS: "' + name + '" claimed by both ' + CITY_INDEX[key] + ' and ' + code);
    }
    CITY_INDEX[key] = code;
  });
});

// An unresolved city is a hard stop, never a guess: a wrong wilaya code sends
// the parcel to the wrong depot and the store eats the return fee.
function resolveCity(raw) {
  const key = normalizeArabic(raw);
  if (!key) return { ok: false, reason: 'city_missing', code: null, name: null };
  const code = CITY_INDEX[key];
  if (!code) return { ok: false, reason: 'city_unknown', code: null, name: String(raw).trim().slice(0, 60) };
  return { ok: true, reason: '', code, name: WILAYAS[code][0] };
}

// ------------------------------------------------------------------- payment

const COD_GATEWAY = /cash|cod|عند الاستلام|الدفع عند|contre remboursement/i;

// A gateway that is blank or literally "manual" is what every Arab COD theme
// leaves behind, so it counts as COD. Anything else that is still unpaid —
// bank transfer, CCP, Baridimob, a half-finished card payment — is NOT COD and
// is NOT prepaid. It is unknown, and saying either would be a lie: guess
// "prepaid" and the courier collects nothing; guess "COD" and the customer is
// asked to pay twice. Same principle as an unresolved city: hard stop.
function paymentOf(order) {
  const o = order || {};
  const status = String(o.financial_status || '').toLowerCase();
  const paid = status === 'paid' || status === 'refunded' || status === 'partially_refunded';
  const names = Array.isArray(o.payment_gateway_names) ? o.payment_gateway_names.join(' ') : '';
  const gateway = (names + ' ' + String(o.gateway || '')).trim();
  const total = Math.round(Number(o.total_price || 0) * 100) / 100;
  const codish = COD_GATEWAY.test(gateway) || /^manual$|^$/i.test(gateway);
  const isCod = !paid && codish;
  return {
    paid, isCod, gateway: gateway.slice(0, 60), total,
    // `clear` is the only field that decides whether this order may be sent.
    clear: paid || codish,
    amount: isCod ? total : 0,
    currency: String(o.currency || 'DZD').toUpperCase().slice(0, 3),
  };
}


// ------------------------------------------------------------------- reasons

// Codes are the contract; Arabic is only the rendering. A reason shown to a
// human asserts a fact, so it is never free text built at the call site.
const REASON_AR = {
  name_missing: 'اسم المستلم فارغ',
  address_missing: 'العنوان فارغ',
  no_items: 'الطلب لا يحتوي أي منتج',
  phone_missing: 'رقم الهاتف غير موجود',
  phone_length: 'عدد أرقام الهاتف غير صحيح',
  phone_not_mobile: 'الرقم ليس هاتفاً نقالاً',
  city_missing: 'لا توجد ولاية في العنوان',
  city_unknown: 'الولاية غير موجودة في جدول التوصيل',
  payment_unclear: 'طريقة الدفع غير محددة — لا نعرف إن كان المبلغ يُحصَّل عند الاستلام',
  cod_amount_zero: 'الدفع عند الاستلام والمبلغ صفر',
  courier_http: 'شركة التوصيل لم تستجب',
  courier_rejected: 'شركة التوصيل رفضت الطلب',
  tracking_missing: 'لم يرجع رقم تتبع',
  tracking_format: 'رقم التتبع بصيغة غير متوقعة',
};

function reasonAr(code) {
  return REASON_AR[code] || 'سبب غير معروف: ' + String(code || '');
}

// ------------------------------------------------------------------ the order

function validateOrder(order, cc) {
  const o = order || {};
  const ship = o.shipping_address || o.billing_address || {};
  const errors = [];

  const name = String(ship.name || [ship.first_name, ship.last_name].filter(Boolean).join(' ')).trim().slice(0, 120);
  const phone = normalizePhone(ship.phone || o.phone || (o.customer && o.customer.phone) || '', cc);
  const city = resolveCity(ship.city || ship.province || '');
  const address = [ship.address1, ship.address2].filter(Boolean).join(' - ').trim().slice(0, 200);
  const items = Array.isArray(o.line_items) ? o.line_items : [];
  const itemCount = items.reduce((n, i) => n + (Number(i && i.quantity) || 0), 0);
  const pay = paymentOf(o);

  if (!name) errors.push('name_missing');
  if (!phone.ok) errors.push(phone.reason);
  if (!city.ok) errors.push(city.reason);
  if (!address) errors.push('address_missing');
  if (!itemCount) errors.push('no_items');
  // Money is checked with the same severity as the address, because getting it
  // wrong costs the merchant the parcel: a "prepaid" guess on an unpaid order
  // means the courier hands the goods over and collects nothing.
  if (!pay.clear) errors.push('payment_unclear');
  else if (pay.isCod && !(pay.amount > 0)) errors.push('cod_amount_zero');

  return {
    ok: errors.length === 0,
    errors,
    clean: {
      orderId: String(o.id || ''),
      orderName: String(o.name || o.order_number || '').slice(0, 24),
      name,
      phone: phone.e164,
      phoneNational: phone.national,
      address,
      cityCode: city.code,
      cityName: city.name,
      rawCity: String(ship.city || '').trim().slice(0, 60),
      itemCount,
      products: items.map(i => String((i && i.title) || '').slice(0, 60)).filter(Boolean).slice(0, 10),
      isCod: pay.isCod,
      codAmount: pay.amount,
      total: pay.total,
      currency: pay.currency,
      gateway: pay.gateway,
      existingTags: String(o.tags || ''),
      // Read for the same reason as existingTags: the Shopify write REPLACES
      // the note field, so the customer's own note has to be carried through
      // or it is destroyed. Both are the snapshot from orders/create, which is
      // what makes re-running idempotent — and is also the limitation: an edit
      // the merchant made after the order was placed is not in this payload.
      existingNote: String(o.note || '').trim().slice(0, 400),
    },
  };
}

// ------------------------------------------------------------------- dispatch

// Shopify's order.tags write REPLACES every tag on the order, so anything the
// merchant added by hand has to be carried through or it is destroyed.
function mergeTags(existing, add, remove) {
  const drop = {};
  (remove || []).forEach(t => { drop[String(t).trim().toLowerCase()] = 1; });
  const out = [];
  const seen = {};
  const push = t => {
    const v = String(t || '').trim();
    if (!v) return;
    const k = v.toLowerCase();
    if (seen[k] || drop[k]) return;
    seen[k] = 1;
    out.push(v);
  };
  String(existing || '').split(',').forEach(push);
  (Array.isArray(add) ? add : [add]).forEach(push);
  return out.join(', ');
}

function buildParcel(clean, courier) {
  return {
    reference: clean.orderName || clean.orderId,
    courier: String(courier || 'Camex'),
    recipient: clean.name,
    phone: clean.phone,
    address: clean.address,
    wilaya_code: clean.cityCode,
    wilaya: clean.cityName,
    items: clean.itemCount,
    products: clean.products.join(' | ').slice(0, 200),
    payment: clean.isCod ? 'COD' : 'PREPAID',
    cod_amount: clean.codAmount,
    currency: clean.currency,
  };
}

// Courier APIs in this market answer in whatever shape they feel like, and a
// 200 with an empty body is the most common failure. Shape is checked, not trusted.
const TRACKING_RE = /^[A-Z]{2,5}-?[A-Z0-9]{4,24}$/i;

function parseCourierResponse(res) {
  const r = res || {};
  const status = Number(r.statusCode || r.status || 200);
  const body = (r.body && typeof r.body === 'object') ? r.body : r;

  // The courier's own words are kept and shown to the merchant. Throwing them
  // away is how "شركة التوصيل رفضت الطلب" got published for what was really
  // `missing fields: receiver` — a reason that blamed the courier for our bug.
  const errObj = (r.error && typeof r.error === 'object') ? r.error : {};
  const detail = String(
    body.error || body.message || body.reason || errObj.message ||
    (typeof r.error === 'string' ? r.error : '') || ''
  ).replace(/\s+/g, ' ').trim().slice(0, 120);

  const bad = code => ({ ok: false, reason: code, tracking: null, status, detail });

  if (r.error || status >= 400) return bad('courier_http');
  if (body.success === false || body.ok === false) return bad('courier_rejected');

  const d = (body.data && typeof body.data === 'object') ? body.data : {};
  const cand = [body.tracking, body.tracking_number, body.trackingNumber, body.awb, d.tracking, d.tracking_number]
    .map(v => (typeof v === 'string' ? v.trim() : ''))
    .filter(Boolean);

  if (!cand.length) return bad('tracking_missing');
  if (!TRACKING_RE.test(cand[0])) return Object.assign(bad('tracking_format'), { detail: cand[0].slice(0, 40) });
  return { ok: true, reason: '', tracking: cand[0], status, detail: '' };
}


// Every tag this workflow can add and must be able to take back. `order-invalid`
// and `courier-failed` are separate on purpose — see failureUpdate.
const FLAG_TAGS = ['courier-failed', 'order-invalid', 'needs-review'];

// Shopify's order.note write REPLACES the field, exactly like tags. So the
// dispatch block goes on top and the customer's own note is carried under it —
// never dropped. Both halves come from the orders/create snapshot, so writing
// twice produces the same string instead of stacking blocks.
const NOTE_SEP = '\n———\nملاحظة العميل:\n';

function composeNote(block, clean) {
  const own = String((clean && clean.existingNote) || '').trim();
  if (!own) return block;
  return block + NOTE_SEP + own;
}

// Success also CLEARS the failure flags, so a fixed-and-retried order stops
// showing as broken. The alert text promises this, so the code has to do it.
function successUpdate(clean, tracking, courier) {
  const c = String(courier || 'Camex');
  const block = [
    'شركة التوصيل: ' + c,
    'رقم التتبع: ' + tracking,
    'الولاية: ' + clean.cityName + ' (' + clean.cityCode + ')',
    'الهاتف: ' + clean.phoneNational,
    clean.isCod ? 'الدفع عند الاستلام: ' + clean.codAmount + ' ' + clean.currency : 'مدفوع مسبقاً',
  ].join('\n');
  return {
    note: composeNote(block, clean),
    tags: mergeTags(clean.existingTags, ['sent-to-' + c.toLowerCase(), 'tracking-' + tracking], FLAG_TAGS),
  };
}

// `stage` decides which fact is asserted. An order that failed validation was
// never sent anywhere, so writing "the courier rejected it" and tagging it
// `courier-failed` would blame a company that never saw the parcel. The two
// stages get different headers and different tags.
function failureUpdate(clean, codes, stage, detail) {
  const list = (Array.isArray(codes) ? codes : [codes]).filter(Boolean);
  const preSend = stage === 'order';
  const head = preSend
    ? 'لم يُرسل الطلب — يحتاج تصحيحاً قبل الإرسال:'
    : 'فشل الإرسال إلى شركة التوصيل:';
  const lines = [head].concat(list.map(c => '- ' + reasonAr(c)));
  const d = String(detail || '').trim().slice(0, 120);
  if (d && !preSend) lines.push('رد شركة التوصيل: ' + d);
  return {
    note: composeNote(lines.join('\n'), clean),
    tags: mergeTags(clean.existingTags, preSend ? ['order-invalid', 'needs-review'] : ['courier-failed', 'needs-review']),
  };
}


// --------------------------------------------------------------------- alert

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// The Telegram node is set to parse_mode HTML on purpose: leaving parse_mode
// unset makes n8n send Markdown, which breaks on any stray _ or * in a name.
// Which class a reason belongs to decides what the merchant is told to DO.
// One generic footer for all of them was wrong three ways: it told them to fix
// an order that had nothing wrong with it, it named the tag `courier-failed`
// on orders the courier never saw, and it promised that editing the order
// re-sends it. Only `orders/create` is subscribed, so an edit fires nothing.
const ORDER_FIXABLE = ['name_missing', 'address_missing', 'no_items', 'phone_missing',
  'phone_length', 'phone_not_mobile', 'city_missing', 'payment_unclear', 'cod_amount_zero'];
const COURIER_SIDE = ['courier_http', 'courier_rejected', 'tracking_missing', 'tracking_format'];

function alertText(clean, codes, isDemo, opts) {
  const list = (Array.isArray(codes) ? codes : [codes]).filter(Boolean);
  const o = opts || {};
  const has = arr => list.some(c => arr.indexOf(c) !== -1);
  const courierStage = has(COURIER_SIDE);
  const detail = String(o.detail || '').trim().slice(0, 120);

  const out = [
    (courierStage
      ? '🚨 <b>شركة التوصيل لم تقبل الطلب</b>'
      : '🚨 <b>طلب موقوف — يحتاج تصحيحاً قبل الإرسال</b>') + (isDemo ? ' 🧪 [DEMO]' : ''),
    '🧾 الطلب: <b>' + esc(clean.orderName || clean.orderId || '—') + '</b>',
    '👤 ' + esc(clean.name || '—') + ' · ☎️ ' + esc(clean.phoneNational || clean.phone || '—'),
    '📍 ' + esc(clean.cityName || clean.rawCity || '—'),
    '💵 ' + esc(String(clean.isCod ? clean.codAmount : clean.total)) + ' ' + esc(clean.currency || ''),
    '',
    list.map(c => '❌ ' + esc(reasonAr(c))).join('\n'),
  ];
  // The courier's own words, verbatim and escaped. This is the line that turns
  // "the courier said no" into something a human can act on.
  if (detail && courierStage) out.push('↳ <code>' + esc(detail) + '</code>');
  out.push('');

  if (has(ORDER_FIXABLE)) {
    out.push('✏️ صحّح الطلب في Shopify ثم أعد إرساله يدوياً — تعديل الطلب وحده لا يُعيد المحاولة تلقائياً.');
  }
  if (list.indexOf('city_unknown') !== -1) {
    out.push('📍 نص الولاية غير معروف في جدول التوصيل (58 ولاية). تحقّق من العنوان مع العميل — الولاية لا تُخمَّن أبداً.');
  }
  if (courierStage) {
    out.push('🔁 بيانات الطلب سليمة. أعد المحاولة، وإن تكرّر الخطأ فتواصل مع شركة التوصيل.');
  }
  out.push('🏷️ الوسوم: <code>' + (courierStage ? 'courier-failed' : 'order-invalid') +
    '</code> · <code>needs-review</code> — تُرفع تلقائياً عند نجاح الإرسال.');
  return out.join('\n');
}


function successText(clean, tracking, courier, isDemo) {
  return [
    '✅ <b>تم إرسال الطلب</b>' + (isDemo ? ' 🧪 [DEMO]' : ''),
    '🧾 ' + esc(clean.orderName || clean.orderId) + ' · 📦 ' + esc(String(clean.itemCount)) + ' قطعة',
    '🚚 ' + esc(String(courier || 'Camex')) + ' · <code>' + esc(tracking) + '</code>',
    '📍 ' + esc(clean.cityName) + ' (' + esc(clean.cityCode) + ')',
    clean.isCod
      ? '💵 يُحصَّل عند الاستلام: <b>' + esc(String(clean.codAmount)) + ' ' + esc(clean.currency) + '</b>'
      : '💳 مدفوع مسبقاً',
  ].join('\n');
}

module.exports = {
  COUNTRIES, WILAYAS, CITY_INDEX, FLAG_TAGS, TRACKING_RE, REASON_AR,
  ORDER_FIXABLE, COURIER_SIDE, NOTE_SEP,
  asciiDigits, normalizePhone, stripMarks, normalizeArabic, resolveCity,
  paymentOf, reasonAr, validateOrder, mergeTags, buildParcel, composeNote,
  parseCourierResponse, successUpdate, failureUpdate, esc, alertText, successText,
};
