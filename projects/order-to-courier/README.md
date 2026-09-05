# Shopify Order → Courier Dispatch

A COD order lands in Shopify. Thirty seconds later the parcel is booked with the courier, the
order carries its tracking number, and the shop owner has a Telegram message in Arabic — or, if
something was wrong with the order, a message telling them exactly what.

Built for **Algerian** stores, where the checkout form is filled in Arabic, most orders are
**cash on delivery**, and the wilaya is typed by hand in one of six spellings. The country code is
hardcoded `DZ` — `lib/logic.js` carries phone tables for MA / TN / SA / EG, but this workflow never
reaches them. It is not a pan-Arab build.

| | |
| --- | --- |
| **Trigger** | Shopify `orders/create` webhook (push, not polling) |
| **Courier** | booked over HTTP — see *The courier is a mock*, below |
| **Writes back** | order note + tags, via the Shopify API |
| **Notifies** | Telegram, Arabic, HTML formatting |
| **Tests** | 39 assertions over `lib/logic.js`, `node tests/run.js` |
| **Proven by** | n8n executions 815 / 817 / 818 / 819 / 821 / 823 / 825 — see *What is actually proven* |

---

## What it handles that a naive version does not

| Real-world input | What happens |
| --- | --- |
| Phone typed `٠٥٥٥ ١٢ ٣٤ ٥٦` | Arabic-Indic digits folded to ASCII → `+213555123456` |
| Phone `00213555…`, `0555…`, `+213 555…` | all normalise to the same E.164 number |
| A landline, or 8 digits instead of 9 | rejected with a reason, not sent to the courier |
| City `الجزائر العاصمة`, `الجزائر`, `Alger`, `algiers`, `Algérie Centre` | all resolve to wilaya **16** |
| City with tashkeel, tatweel, hamza forms, `ة` vs `ه`, French accents | folded before matching |
| City not in the delivery table | **hard stop.** Never guessed — a wrong wilaya code sends the parcel to the wrong depot and the store pays the return |
| COD vs prepaid | read from `financial_status` + gateway name, incl. Arabic gateway labels like `الدفع عند الاستلام`. Prepaid parcels are booked with `cod_amount: 0` |
| Unpaid **and** the gateway is a bank transfer | **hard stop** (`payment_unclear`). Guessing PREPAID tells the courier to collect nothing; guessing COD bills someone who may already have paid |
| A COD order for 0.00 | refused (`cod_amount_zero`) — a courier told to collect 0 hands the goods over free |
| Merchant's own tags on the order | preserved. Shopify's tag write **replaces** the whole string, so anything hand-added is merged back in |
| The customer's own checkout note | preserved. Shopify's note write replaces the field too, so the dispatch block goes on top and the customer's text is kept below a separator |
| A fixed order re-sent | the `courier-failed`, `order-invalid` and `needs-review` tags are cleared on success, so it stops showing as broken |
| Courier returns HTTP 200 with an empty body | caught. The most common courier failure in this market |
| Courier returns a junk tracking number | caught by shape check before it reaches the customer |
| Courier is down (502) | caught as data, not as a dead workflow run |
| The courier's own refusal text | carried through to the merchant, escaped — not replaced by a generic guess |
| A pre-send defect | blamed on the **order** (`order-invalid`), never on the courier that was never called |
| The same order arriving twice | dropped, and the dedupe key is committed **only after Telegram confirms the message** — so an order booked at the courier but never announced stays retryable |

---

## The courier is a mock, and that is stated on purpose

Algerian couriers (Camex, Yalidine, ZR Express, Maystro) do not issue sandbox API keys without a
registered business account. So `Book With Courier` points at a second n8n workflow,
**Mock Courier API (Camex-shaped)**, which behaves like a real courier endpoint: it validates the
parcel, rejects bad ones with reasons, issues `CMX-XXXXXXXX` tracking numbers, and can be told to
fail on demand.

Swapping in the real courier is **one URL plus a field mapping** — and that mapping is the one
thing this repo cannot test for you. `buildParcel()` emits `recipient` / `wilaya_code` /
`cod_amount`; a real courier will name at least one of those differently.

That is not theoretical. It is the bug this project's first live run found: the mock required
`receiver`, `buildParcel()` emitted `recipient`, and execution 663 came back
`{"success": false, "error": "missing fields: receiver"}`. Note honestly how it was settled — the
**mock** was changed to match `buildParcel`, not the reverse. So the mock now checks the keys the
caller happens to send, and "the field contract is proven" is exactly the claim it cannot make.

## The demo webhook has Header Auth. The mock's does not.

`order-to-courier/demo/…` uses **Header Auth** (n8n credential *Wolf Demo Webhook Key*) and returns
`403` without the header. It needs it: the endpoint publishes a real Telegram message into a real
group, so an open one lets anyone post a fabricated order under the shop's name — and the caller
controls the whole order object, including the Shopify `id` that gets written to.

`courier-mock/v1/…` stays open. It holds nothing and writes nothing; it only answers with a fake
tracking number.

**Delete both after recording the demo.**

---

## Flow

```
Shopify Trigger ─┐
                 ├─→ Validate Order ─→ Order Valid? ─true→ Book With Courier ─→ Read Courier Reply
Demo Order ──────┘                          │                                          │
                                            │                                       Booked?
                                            │                                     ┌────┴────┐
                                            │                                   true       false
                                            │                                     │          │
                                            │                        Tag Order Booked        │
                                            │                        Notify Booked           │
                                            │                             │                  │
                                            │                        Commit Dispatch         │
                                            └──────false──────────→ Tag Order Failed ←───────┘
                                                                    Alert Failure
```

Three things about this shape are deliberate:

**The Telegram nodes hang off the IF outputs, in parallel with the Shopify nodes — not after them.**
The Shopify write is best-effort (`onError: continueRegularOutput`), so when it fails its output
item becomes `{error: "…"}`. A Telegram node chained after it would read `$json.text` from that
error item and find nothing. Parallel branches mean a failed tag write cannot swallow the alert.
Execution 815 proves it: Shopify returned 404 for the fixture order and the alert still delivered.

**The Shopify write is best-effort; the Telegram send is not.** A tag that fails to write is an
annoyance. An alert that fails to send silently is the failure mode that hides everything else, so
`Notify Booked` and `Alert Failure` are `onError: stopWorkflow` with three retries.

**Dedupe is decided in `Validate Order` and committed in `Commit Dispatch`, after Telegram has
returned a `message_id`.** Until that node writes, the key does not exist — so an order that was
booked at the courier but never announced to the merchant stays retryable. Committing at the courier
step instead would mark such an order done forever.

## Files

| Path | What it is |
| --- | --- |
| `lib/logic.js` | every rule, as pure functions. Zero dependencies |
| `tests/run.js` | 39 assertions. `node tests/run.js` |
| `tests/fixtures/*.json` | five orders: happy COD, bad city + phone, unpaid bank transfer, prepaid Latin, courier failures |
| `tests/fixtures/*.demo.json` | the payloads the demo webhook is fired with — **generated** from the base fixtures above |
| `make-demo-fixtures.js` | generates them, so a fixture fixed for the tests cannot disagree with the one the camera sees |
| `build-workflow.js` | generates the workflow JSON, **inlining `lib/logic.js` verbatim** |
| `workflows/order-to-courier.json` | the importable workflow |
| `demo/shot-list.md` | what to record, in order |

`build-workflow.js` does not re-type the logic into strings by hand. It reads `lib/logic.js`,
strips the CommonJS wrapper, checks that all eleven named functions survived the slice, and pastes
the remaining 20,526 characters into both Code nodes. **So the n8n nodes run exactly what the 39
tests cover** — the two cannot drift apart. Re-run it after editing the logic:

```
node build-workflow.js && node tests/run.js
```

The generator is also the only thing enforcing that. Both Code nodes carry the full library, and a
hand-edit inside the n8n UI would fork the two copies silently — the build is the source of truth,
not the canvas.

---

## What is actually proven, and what is not

Seven real n8n executions, read node by node — not "the run was green". Every one of them delivered
a message to a real Telegram group.

| Behaviour | Evidence |
| --- | --- |
| Arabic digits → E.164 | exec 815: `٠٥٥٥ ١٢ ٣٤ ٥٦` → `+213555123456` |
| Arabic city → wilaya code | exec 815: `الجزائر العاصمة` → `16` |
| Courier books, tracking parsed, **Telegram delivered** | exec 815: `CMX-7D1B4A4A`, message **10** |
| Merchant's tags preserved | exec 815: `instagram, sent-to-camex, tracking-CMX-7D1B4A4A` |
| **The customer's checkout note survives the write** | exec 815: dispatch block on top, `التوصيل بعد الخامسة مساءً` kept below the separator |
| **Bad order never reaches the courier, and is not blamed on it** | exec 817: `["phone_not_mobile","city_unknown"]`, tags `order-invalid, needs-review`, headline `طلب موقوف`, phone rendered `☎️ —` (no partial number), message **11** |
| **Unpaid bank transfer is a hard stop, not a PREPAID guess** | exec 818: `["payment_unclear"]` and nothing else, message **12** |
| **Courier down (real HTTP 502) → failure branch, run survives** | exec 819: `statusCode: 502` arrived as data, `courier_http`, detail `bad gateway`, tags `instagram, courier-failed, needs-review`, message **13** |
| **The courier's own words reach the merchant** | exec 821: HTTP 200 `courier_rejected`, alert carries `↳ wilaya not served` escaped, message **14** |
| **Dedupe commits only after Telegram confirms** | exec 823: `Commit Dispatch` → `{committed: 1, messageId: 15, tracking: CMX-FD6B139F, seenKeys: 2}` |
| **Dedupe then actually fires** | exec 825: 31 ms, 2 nodes, `Validate Order` emitted **0 items**, nothing reached the courier or Telegram |
| Demo webhook rejects an unauthenticated call | `curl` without the header → **HTTP 403** |
| Mock courier's nine cases | 9 curl calls: good COD, reject, empty 200, junk tracking, real 502, missing fields, prepaid with COD amount, prepaid clean, landline |

**Not proven, stated plainly:**

- **The Shopify write has never once succeeded.** The fixture order ids are invented, so every
  `Tag Order Booked` / `Tag Order Failed` returned
  `{error: "The resource you are requesting could not be found"}` — under a node status of
  `success`, because the node is `onError: continueRegularOutput`. What is proven is that the failure
  is handled and cannot swallow the alert. To prove the write itself: create one order in the dev
  store and regenerate the fixtures with its real numeric id —
  `DEMO_ORDER_ID=1234567890123 node make-demo-fixtures.js`.
- **The write is still a blind replace of the `orders/create` snapshot.** `existingTags` and
  `existingNote` come from the webhook payload, not from a fresh read of the order. Anything the
  merchant typed *between* order creation and the write is destroyed. The durable fix is to read the
  order first, or to write courier metadata into a metafield.
- **A real courier.** Every response so far came from the mock. `TRACKING_RE` has only met invented
  strings and `CMX-XXXXXXXX`.
- **A refunded order still ships.** `paymentOf()` counts `refunded` and `partially_refunded` as
  `paid`, so it dispatches as PREPAID.
- **Timeouts and retry counts** (15 s, 2–3 tries, 5 s apart) and the 7-day dedupe prune are chosen,
  not measured.
- **`Shopify Trigger` is live on `orders/create` against a real dev-store credential.** A genuine
  order today would be booked at a mock courier and written a fabricated tracking number. Disable
  the trigger node before demoing; the demo webhook keeps working without it.

## Known trap when recording

`Demo Fixture`'s dedupe key is bucketed by the clock hour, so the **second** demo fire in the same
hour is correctly suppressed: `Validate Order` emits 0 items, 2 nodes run, nothing is sent, and the
reason is `console.log` only — visible in the VPS container log, not on the canvas. That is the
expected result, not a bug. To shoot a take twice inside one hour, change `id` in the fixture.

## Setup

1. Import `workflows/order-to-courier.json`.
2. Attach a Shopify Access Token credential (needs `shopSubdomain`, `accessToken`, `appSecretKey`)
   to `Shopify Trigger`, `Tag Order Booked`, `Tag Order Failed`.
3. Attach a Telegram credential to `Notify Booked` and `Alert Failure`. The chat id is set in
   `build-workflow.js` (`CHAT_ID`) — change it there and rebuild, not in the canvas. Note that
   upgrading a basic group to a supergroup changes its id from `-123…` to `-100123…` and the send
   starts failing silently.
4. Attach a Header Auth credential to `Demo Order`.
5. Point `Book With Courier` at your courier's endpoint, or import the mock workflow and use its
   webhook URL — then fix the field names in `buildParcel()` to match what that courier documents.
6. Activate. Fire the demo webhook, or place a test order.

