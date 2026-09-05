# Demo shot list — Shopify Order → Courier Dispatch

90 seconds, silent, screen only. Captions in the video, no voiceover. Record at 1280×720 or larger,
browser zoom 110% so text is readable on a phone.

**Before you hit record**

- [ ] Telegram group "Courier Demo" open, bot added. The chat id is already baked into the build —
      nothing to paste.
- [ ] `export DEMO_KEY='<the header value>'` in the terminal you will record. **Never type the value
      on camera** — see *Keeping the key off camera* below.
- [ ] **Disable the `Shopify Trigger` node.** It is live on `orders/create` against a real dev-store
      credential; a genuine order mid-recording would be booked at a mock courier and written a
      fabricated tracking number. The demo webhook keeps working with the trigger disabled.
- [ ] Both workflows active
- [ ] n8n Executions list open in a second tab
- [ ] Clear the Telegram group of old messages
- [ ] Zoom the n8n canvas so all 12 nodes fit without scrolling (15 including the 3 sticky notes)

| # | Seconds | What is on screen | Caption |
| --- | --- | --- | --- |
| 1 | 0–8 | The n8n canvas, whole flow visible, nothing running | `Shopify order → courier, in 30 seconds. No one touches it.` |
| 2 | 8–16 | Zoom into `Validate Order`, scroll the Arabic phone/city rules | `Arabic phone digits. Six spellings of the same wilaya. All 58 wilayas.` |
| 3 | 16–26 | Fire the good order (command below). Canvas lights up left to right | `A real order arrives.` |
| 4 | 26–34 | Telegram group — the ✅ message appears with the tracking number | `Booked. Tracking number, wilaya, cash to collect.` |
| 5 | 34–40 | Back in n8n, open `Commit Dispatch`, show `committed: 1, messageId: …` | `The order is only marked done after the message is confirmed delivered.` |
| 6 | 40–50 | Fire the bad order. Watch it take the lower branch | `Now an order with a landline instead of a mobile, and a city we do not deliver to.` |
| 7 | 50–58 | Telegram — the 🚨 message with the two Arabic reasons | `It never reaches the courier. The owner is told exactly what is wrong.` |
| 8 | 58–68 | Fire the unpaid bank-transfer order. Show the single reason in the alert | `Unpaid, and the gateway is a bank transfer. It stops. Guessing here loses the goods or bills twice.` |
| 9 | 68–80 | Fire the courier-down order. Show the 502 arriving as data in `Book With Courier`, then the Telegram alert | `The courier's API goes down mid-order. The run does not die — the owner gets told.` |
| 10 | 80–90 | `node tests/run.js` in a terminal → `39 passed, 0 failed` | `39 tests cover every rule. The workflow runs that exact code, inlined by a build script.` |

## The four commands, in order

Run these from the project directory (`projects/order-to-courier`). Set once — the URL comes from
your gitignored `.env`, the auth header from an env var, so neither the host nor the key is ever on
screen:

```bash
set -a; . ./.env; set +a; U="$N8N_HOST/webhook/$DEMO_PATH"
```

**Shot 3 — the good COD order**

```bash
curl -s -X POST "$U" -H 'Content-Type: application/json' -H "X-Demo-Key: $DEMO_KEY" -d @tests/fixtures/happy-cod.demo.json
```

**Shot 6 — landline phone and unknown city**

```bash
curl -s -X POST "$U" -H 'Content-Type: application/json' -H "X-Demo-Key: $DEMO_KEY" -d @tests/fixtures/bad-city-and-phone.demo.json
```

**Shot 8 — unpaid, gateway is a bank transfer**

```bash
curl -s -X POST "$U" -H 'Content-Type: application/json' -H "X-Demo-Key: $DEMO_KEY" -d @tests/fixtures/unpaid-bank-transfer.demo.json
```

**Shot 9 — courier down**

```bash
curl -s -X POST "$U" -H 'Content-Type: application/json' -H "X-Demo-Key: $DEMO_KEY" -d @tests/fixtures/courier-down.demo.json
```

Optional extra take — the courier answers "no" instead of going down, and its own words are shown:

```bash
curl -s -X POST "$U" -H 'Content-Type: application/json' -H "X-Demo-Key: $DEMO_KEY" -d @tests/fixtures/courier-rejects.demo.json
```

The `_mock` field in those two files tells the mock courier how to misbehave. It is read **only**
when the order arrives through the demo webhook, so a real Shopify order can never set it.

## The Shopify tag shot is NOT recordable as-is

The old shot 8 showed the Shopify order page with `courier-failed` / `needs-review` and the note.
**Do not record it yet.** The fixture order ids are invented, so both Shopify write nodes return
`{error: "The resource you are requesting could not be found"}` — with a node status of `success`,
because they are `onError: continueRegularOutput`. Nothing is written.

To make it recordable:

1. Create **one** order in the dev store.
2. Copy its numeric id from the admin URL — the long number, not `#1042`.
3. Regenerate the demo payloads with it:

```bash
DEMO_ORDER_ID=1234567890123 node make-demo-fixtures.js
```

Only `happy-cod` picks up the real id. The failure takes keep their invented ids on purpose: they
must stay in separate dedupe buckets, and a failure take does not need a real order.

Until that is done, no caption may claim the order gets tagged in Shopify.

## Keeping the key off camera

The demo webhook uses Header Auth and returns `403` without it. Put the value in an env var **before**
you start recording, in a terminal window you are not filming:

```bash
export DEMO_KEY='paste-it-here'
```

Then only `$DEMO_KEY` ever appears on screen. Rotate the key in n8n Credentials after publishing the
video, and delete both demo webhooks.

## Three things that will trip you up

**One order fires once per clock hour.** The dedupe key is `demo:<hour>:<order id>`, so a second
identical order in the same hour is dropped on purpose — `Validate Order` emits 0 items and the run
ends in ~30 ms with **nothing on the canvas explaining why** (the reason is a `console.log`, visible
only in the VPS container log). If you fluff a take, either wait for the next hour or change `id` in
the fixture. This is correct behaviour, not a bug — but on camera it looks like nothing happened.

**`curl` returns before the workflow finishes.** The demo webhook answers
`{"message":"Workflow was started"}` in ~0.2 s while the run takes ~5 s. Read the execution, not the
curl timing.

**A green execution is not proof.** Both Shopify nodes report `success` while their only output item
is an error object. If you are going to show a node's output on camera, open the item and read it.
