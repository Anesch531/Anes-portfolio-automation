# Data-Source Decision Doc — Smart Money Alert Bot
_Limits verified August 2026. Re-check pricing pages before launch; these change._

Legend per tool: **Role** → what it does in OUR pipeline · **Free** → what $0 gets · **Limits** → hard numbers · **Pay trigger** → the exact moment you must pay + rough cost · **JSON** → real payload shapes we build against.

---

## 1) Alchemy Notify — Address Activity Webhook ⭐ (the real-time engine)

**Role:** Push notification the instant any watched wallet appears in a mined Ethereum transaction (native ETH, ERC-20, ERC-721, ERC-1155, internal txs). This is what kills the "n8n polls every 1–2 min" weakness.

**Free tier:** Notify included on the free plan. Up to **5 webhooks per account**, up to **~100,000 addresses per Address Activity webhook** (we use 10–15). Free teams share **~30M Compute Units/month** across RPC+webhooks; a typical address-activity event consumes roughly **40 CU**, so our volume is negligible.

**Limits / behavior:**
- Retries failed deliveries (non-200) with exponential backoff **up to ~10 min** on free/PAYG → duplicates are OUR job to prevent (dedupe + fast 200).
- Signature: every delivery carries `X-Alchemy-Signature` = HMAC-SHA256 (hex) of the **raw body**, keyed by a **per-webhook signing key** (not per-account!).
- Optional IP allowlist: `54.236.136.17`, `34.237.24.169`.
- Test mode: dashboard "Send Test" fires a synthetic payload (flagged test) — great for building before go-live.
- EVM only (ETH, Polygon, Arbitrum, OP, Base…). **No Solana** — would require Helius instead.

**Pay trigger:** exceed ~30M CU/mo or need >5 webhooks → Pay As You Go (~$0.45 per 1M CU). At 10–15 wallets you will likely stay free forever. Adding chains later = new webhooks (still within 5 until ~4 extra chains).

### Setup, step by step (owner does clicks; agent verifies)
1. Create account at alchemy.com → Create App (network: Ethereum Mainnet). Copy **API key**.
2. Dashboard → **Notify** tab → **Create webhook → Address Activity**.
3. Network: ETH_MAINNET. You must add ≥1 address to create it (add wallet #1; full list synced later).
4. Paste the **Webhook URL** = your n8n PRODUCTION webhook URL (from the n8n Webhook node) including its secret path segment.
5. **Copy the Signing Key** shown on the webhook detail page → put into n8n credential/secret.
6. Click **Send Test Notification** → confirm n8n receives → check signature verification passes.
7. Later, bulk-manage addresses via dashboard or Notify API (`update-webhook-addresses`, idempotent).

### Sample payload (what n8n receives)
```json
{
  "webhookId": "wh_w5hbdmcvypjzstbq",
  "id": "ei_0948ca816e07c9d1",
  "createdAt": "2026-08-23T14:03:22.118Z",
  "type": "ADDRESS_ACTIVITY",
  "event": {
    "network": "ETH_MAINNET",
    "activity": [
      {
        "category": "erc20",
        "fromAddress": "0x28C6c06298d514Db089934071355E5743bf21d60",
        "toAddress": "0xYOURSARTSMARTMONEYWALLET00000000000000",
        "blockNum": "0x14a3f81",
        "hash": "0x9e1178fa…",
        "value": 850000,
        "asset": "USDC",
        "decimals": 6,
        "rawContract": {
          "rawValue": "0xcf0b4840",
          "address": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
          "decimals": 6
        }
      }
    ]
  },
  "version": 2,
  "status": "live"
}
```
Notes: `activity[]` can contain MULTIPLE entries in one delivery (batched block activity) — parse all, group by `hash`. Native ETH transfers have `category:"external"`, no `rawContract.address`. Test sends carry `"status":"test"`.

### Verifying the signature (n8n Code node sketch)
```javascript
// Requires Webhook node option "Raw Body" ON so we hash exact bytes.
const crypto = require('crypto');
const raw = $json.body ?? $json.rawBody;          // raw string per node config
const sig = $json.headers['x-alchemy-signature'];
const key  = $env.SIGNING_KEY ?? 'from-credential';
const expected = crypto.createHmac('sha256', key).update(raw).digest('hex');
const ok = sig && expected.length === sig.length &&
  crypto.timingSafeEqual(Buffer.from(expected,'hex'), Buffer.from(sig,'hex'));
if (!ok) throw new Error('bad signature');
return { json: JSON.parse(raw) };
```

---

## 2) CoinGecko API (Demo plan) — prices & token metadata

**Role:** convert token amounts → USD (size gate + alert text), get symbol/name/logo, 24h change.

**Free:** Demo plan, **10,000 call credits/month**, no card. Attribution required ("Data by CoinGecko").

**Limits:** rate limit reported between 30–100 calls/min depending on source — **design for ≤30/min**. Price freshness from 60s. History capped at 1 year. Errors count against rate limit. We burn ~1–2 calls per ALERT (not per webhook ping) + cache 60s → comfortably inside 10k/mo.

**Pay trigger:** >10k calls/mo → Basic **$35/mo** (100k calls, 300/min). Not expected at our scale; would signal success (many wallets/alerts).

**Key endpoints we use**
```
GET api.coingecko.com/api/v3/simple/price?ids=pepe&vs_currencies=usd&include_24hr_change=true
GET api.coingecko.com/api/v3/onchain/networks/eth/tokens/{contract}   # contract→symbol/price (GeckoTerminal data)
Header: x-cg-demo-api-key: CG-xxxx
```

**Sample JSON**
```json
{ "pepe": { "usd": 0.00001072, "usd_24h_change": 5.42 } }
```

---

## 3) Etherscan API V2 — transaction forensics (owner already HAS a key ✅)

**Role:** ground-truth checks — confirm direction/counterparty, fetch token decimals/name when Alchemy omits them, historical tokentx for "3rd buy this week"-style counters, labels.

**Free:** **3 calls/second**, **100,000 calls/day** (tightened in 2026 from 5/s), attribution required. Free tier covers Ethereum mainnet fully (multichain coverage reduced to ~90% of chains — irrelevant for v1). Max **1,000 records/request** (was 10k); "Internal Transactions by Block Range" endpoint removed from free — we don't need it (Alchemy supplies internal txs).

**V2 = one key, multichain:** base `https://api.etherscan.io/v2/api` + `chainid=1`.

**Pay trigger:** Lite **$49/mo** only if you add many chains or need 5+/s. Never at our volume.

**Endpoint we use most**
```
GET https://api.etherscan.io/v2/api?chainid=1
    &module=account&action=tokentx
    &contractaddress={token}&address={wallet}
    &page=1&offset=50&sort=desc&apikey=KEY
```

**Sample JSON (trimmed)**
```json
{ "status":"1", "message":"OK",
  "result":[{
    "blockNumber":"21004501",
    "timeStamp":"1724419200",
    "hash":"0x9e1178fa…",
    "from":"0xWALLET…", "to":"0xCOUNTERPARTY…",
    "value":"125000000000000000000",
    "tokenSymbol":"XYZ", "tokenDecimal":"18",
    "contractAddress":"0xToken…" }] }
```

---

## 4) Tavily — news/social context (the "📰 Context:" line)

**Role:** after an alert passes the size gate, search fresh news/social chatter about the token → feed the AI writer 3–5 snippets.

**Free:** Researcher plan — **1,000 API credits/month**, no card. Basic search = **1 credit**, advanced = **2**. Dev keys have modest rate limits; we do ≤1 call per alert so this never bites.

**Budget math:** 300 alerts/mo × 1 credit ≈ 300 credits → ~⅓ of free tier. Safe.

**Pay trigger:** exceed 1,000 credits → PAYG $0.008/credit or Project plan **$30/mo** (4,000 cr). Only relevant with many clients/wallets.

**Call shape**
```json
POST https://api.tavily.com/search
Authorization: Bearer tvly-xxx
{ "query": "\"$XYZ\" token OR contract 0xabc news", "topic": "news", "days": 3,
  "search_depth": "basic", "max_results": 5 }
```

**Sample JSON (trimmed)**
```json
{ "query":"\"$XYZ\" token news",
  "results":[
    { "title":"Exchange listing rumored for XYZ",
      "url":"https://…", "score":0.93,
      "content":"Sources say XYZ… published 2 hours ago" } ] }
```

---

## 5) GetXAPI — X/Twitter chatter (OPTIONAL, deferred at $0 budget)

**Role:** richer social proof ("CT is going crazy about XYZ"). Third-party X-data API; official X API free tier closed Feb 2026 and reads cost $0.005/post there.

**Free:** $0.10 signup credit (≈100 calls), no card, no subscription.

**Limits/prices:** $0.001/call standard search (≈20 tweets/call) ⇒ ~$0.05 per 1,000 tweets; DM/posting $0.002; top-ups from $10 (non-expiring). Uptime claim 99.9% but it's an unofficial provider — treat as best-effort garnish, never load-bearing.

**Pay trigger:** first real use = buy a $10 top-up. Skip entirely until a paying client asks for X-specific lines.

---

## 6) Apify "Whale Watcher" — fallback data source (evaluate, don't depend)

Actor: `leo_jhil/pk23os-whale-watcher` — scans recent txs of ONE wallet/run via Blockscout+CoinGecko (keyless data), returns movements above a USD threshold. **$0.10 per run** charged to Apify platform usage (free plan ≈ $5 credit/mo ⇒ ~50 runs free).

**Verdict for us:** it's POLLING (you schedule runs; latency = minutes-to-hours), single wallet per run, community actor with 2 total users (bus-factor/reliability risk). NOT a substitute for Alchemy push. Legit roles: (a) reconciliation sweep if we suspect missed webhooks, (b) bootstrap testing before Alchemy approval, (c) emergency Plan B. Needs an Apify account/token to run even though data sources are keyless.

**Sample output**
```json
{ "transaction_hash":"0xabc…", "from_address":"0x123…", "to_address":"0x456…",
  "value_eth":150.5, "value_usd":542000.00, "direction":"outflow",
  "block_number":19500000, "timestamp":"2026-05-16T04:00:00.000Z" }
```

---

## 7) n8n itself

- **Cloud trial:** ~14 days free, then Starter ≈ **$24–28/mo**. Public HTTPS webhook URL works out-of-the-box (needed for Alchemy).
- **Self-host (recommended end-state given $0 budget):** Community Edition free on a ~$5–8/mo VPS (Hetzner/Contabo/RackNerd) + free Let's Encrypt HTTPS. Trade-off: you own updates/backups (agent provides migration runbook at M10). Workflow JSON is portable either way.
- Telegram sending is FREE (BotFather bot → add to channel as admin with "Post Messages").
- **AI step at $0:** template-based sentences always work (no LLM). If owner wants LLM polish: Gemini free tier or any cheap OpenAI-compatible key — decision flagged in build plan.

---

## 8) Connecting the agent to n8n (MCP) — what the agent needs from owner
1. n8n base URL (e.g. `https://yourname.app.n8n.cloud`)
2. API key: n8n → **Settings → n8n API → Create an API key**
3. Agent wires `n8n-mcp` (community server, run via `npx n8n-mcp`) into opencode's MCP config with those two values → gains node docs, workflow create/update/validate/execute tools.
Safety rules: export a manual backup before agent edits; agent validates before activation; destructive ops disabled.
