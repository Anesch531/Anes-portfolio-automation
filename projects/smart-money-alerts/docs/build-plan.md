# Build Plan — Smart Money Alert Bot
_Owner = "YOU" · Agent (ox-alpha/opencode) = "ME"_

## Milestones
| # | Milestone | Who | Done when |
|---|---|---|---|
| M0 | Accounts & keys collected (checklist below) | YOU | Keys stored in n8n credentials / password manager |
| M1 | MCP wired: agent connects to your n8n (URL + API key), health check | ME | I can list/create workflows in YOUR n8n |
| M2 | Watchlist v1 built via playbook (10–15 wallets + evidence + winRates) | YOU (ME validates format/checksums) | `config/watchlist.json` saved |
| M3 | Skeleton pipeline: Webhook → HMAC verify → parse → filter → dedupe → fast 200 | ME builds/tests; YOU imports/approves deploy | Test payload flows end-to-end; bad signatures rejected |
| M4 | Enrichment: direction classification + USD sizing (CoinGecko cached, Etherscan fallback) | ME | Fixture tx yields correct "$850K of $XYZ" fields |
| M5 | Context layer: Tavily behind size-gate, failure-tolerant | ME | Tavily disabled ⇒ alert still sends |
| M6 | Message composer: template default + optional LLM polish w/ fallback | ME (YOU approves tone) | Sample alert matches approved copy |
| M7 | Telegram delivery: bot posts to YOUR channel w/ hard retry | YOU creates bot/channel/admin; ME code | Post lands in channel <5s after test webhook |
| M8 | GO-LIVE: real Alchemy Address Activity webhook → production URL (doc §1 steps), end-to-end test | YOU clicks dashboard; ME verifies | First REAL movement → correct alert |
| M9 | Hardening: persistent dedupe, Error-Trigger admin DMs, hourly alert cap, logging | ME | Chaos tests pass (kill Tavily, replay dupes, 429 storms) |
| M10 | Uptime runbook: stable public HTTPS endpoint (Cloudflare Tunnel preferred / ngrok) for Alchemy webhooks + restart procedures; VPS migration optional later | ME writes; YOU executes | Webhook URL survives restarts; heartbeat proves pipeline alive |

## Decision ledger
**Locked:** ETH mainnet · private channel · 10–15 wallets · buys+sells · ≥$100K global · $0 start · n8n trial→VPS.

**YOURS (cannot be delegated):**
1. Final wallet selection + evidence (playbook guides; you decide)
2. Per-wallet win-rate labels + monthly updates
3. Thresholds: global $100K `[tunable]`, per-wallet overrides
4. Alert copy tone — approve samples at M6 before go-live
5. Channel identity (name/avatar/description)
6. Any spend beyond $0

**Proposed defaults — approve or edit:**
- Hourly alert cap 15/hour, overflow batched `[tunable]`
- Quiet hours OFF (crypto is 24/7) `[tunable]`
- Ignore WETH wrap/unwrap + stablecoin↔stablecoin; wallet→wallet between two tracked = one alert `[tunable]`
- DEX routers auto-labeled; exchange deposits/withdrawals labeled as context, not filtered
- LLM optional: template voice at $0; add free-tier LLM only if you dislike it

## YOUR acquisition checklist
- [ ] Alchemy account + app + Notify webhook created + **signing key** saved (data-source doc §1)
- [ ] Etherscan key ✅ (have)
- [ ] CoinGecko **Demo** key (free)
- [ ] Tavily key (free, no card)
- [ ] Telegram: @BotFather bot token; private channel; bot added as **admin with "Post Messages"**
- [x] n8n base URL + API key — ✅ DONE (self-hosted `localhost:5678`, MCP wired)
- [ ] Public HTTPS tunnel for webhooks: Cloudflare Tunnel (free, stable w/ domain) or ngrok free tier — needed by M8, not before
- [ ] Watchlist v1 per playbook
- [ ] Later/optional: Apify token, GetXAPI top-up, LLM key, VPS + domain

## Risks beginners miss (and our answers)
1. **Duplicate alerts** — Alchemy retries non-200 ~10 min; multi-activity batches; redeploys replay. Fix: respond-200-immediately + dedupe key `txHash+wallet+token+direction` (24h staticData window) + group by txHash + drop `status:"test"` in prod.
2. **Webhook security** — URL discovery = spoofed alerts. Fix: HMAC-SHA256 verify (constant-time) before parsing, secret path segment, HTTPS only, optional Alchemy IP allowlist (`54.236.136.17`, `34.237.24.169`), secrets only in credentials, no raw-body logging.
3. **Free-tier exhaustion** — silent quality decay. Fix: 60s price cache; Tavily strictly post-size-gate; batch CoinGecko ids; weekly usage-dashboard glance; pay-triggers pre-documented.
4. **Graceful degradation contract** — core alert survives every side-channel failure: Tavily down ⇒ skip 📰 line; CoinGecko down ⇒ cached price marked "≈"; LLM down ⇒ template; Telegram 429 ⇒ queue-retry + cap. Separate Error Trigger workflow DMs you on failures.
5. **Latency honesty** — detection ≈ block time + 1–3s enrichment. Say "near-instant", never promise front-running.
6. **Cost control** — all PAYG toggles OFF at $0; alert cap doubles as API damper; GetXAPI off until revenue.
7. **Operational blind spots** — local `npx n8n` stops when the machine/terminal closes ⇒ webhooks silently die ⇒ Alchemy retries ~10 min then drops events. Fixes: run n8n as a persistent service, stable tunnel URL (M10), weekly heartbeat post, export workflow JSON after every change. NOTE: n8n is now SELF-HOSTED LOCAL (`http://localhost:5678`) — no trial clock, $0 hosting forever, but YOU own uptime.

## Cost & scaling note (feeds your pricing)
**Today (trial): $0/mo.**
**Steady state solo — pick one:**
- Path A: n8n Cloud Starter ≈ **$25/mo** (zero ops)
- Path B: self-host Community Edition on VPS ≈ **$5–8/mo** + your ops time *(recommended for $0 budget)*
Everything else stays free at v1 scale. **Total ≈ $5–25/mo.**

**Marginal cost per extra client ≈ $0 infra** — clients subscribe to channels; infra scales with wallets×alerts, not clients.

**Where costs jump:**
| Jump point | Trigger | New cost |
|---|---|---|
| Hosting | trial ends (~day 14) | $5–25/mo fixed — biggest line |
| Tavily Project | >1,000 credits/mo (≈800+ alerts) | +$30/mo |
| CoinGecko Basic | >10k calls/mo (many wallets/tokens) | +$35/mo |
| Alchemy PAYG/Growth | >~30M CU or >5 webhooks (multi-chain expansion) | from ~$0.45/M CU |
| GetXAPI | X-chatter feature request | ~$0.001–0.002/alert-call |

Rule of thumb: infra stays trivial until hundreds of wallets; your real scaling costs are attention (watchlist curation) and support. Price clients on value, not cost-plus.
