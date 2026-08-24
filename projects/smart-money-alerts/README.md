# 🧠 Smart Money Alert Bot

> <i>The original bot that set this portfolio's engineering conventions — imported as-is, docs and test evidence included.</i>

> Real-time Telegram alerts when proven "smart money" wallets trade on Ethereum — built entirely on **$0/month free tiers** with an n8n + AI pipeline.

![status](https://img.shields.io/badge/status-live-brightgreen) ![cost](https://img.shields.io/badge/infra_cost-%240/month-success) ![chain](https://img.shields.io/badge/chain-Ethereum-blue)

## What it does

A curated watchlist of 8+ hand-vetted smart-money wallets is monitored **in real time via push webhooks** (not polling). The moment one of them makes a ≥$100K trade, an enriched alert lands in a private Telegram channel in ~10 seconds:

```
🟢 BUY — W2 ETH/XAUT whale · win-rate 65%
💵 $991.5k of PEPE (400.0 ETH)
🤖 W2 whale bought $991.5k worth of 42B PEPE (~400 ETH).
⚡ Detected moments ago
[📈 Chart] [🔍 Tx] [👤 Wallet]
```

- **📈 Chart** → Dexscreener · **🔍 Tx** → Etherscan · **👤 Wallet** → Arkham (inline buttons)
- AI-written one-liner (facts-only prompt — the model cannot invent information)
- Win-rate badge per wallet (owner-curated label)

## Why this architecture is different

| Weakness of typical whale bots | This bot |
|---|---|
| Polls every 1–2 min (late alerts) | **Alchemy Address Activity Webhook** — blockchain pushes the event the instant it's mined |
| Any big transfer = "whale alert" spam | **Leg-pairing trade classification** — a single transfer is NOT a trade; the bot pairs spend/receive legs inside one tx and drops airdrops, self-transfers, stable↔stable swaps, WETH wraps, and dust |
| Values tokens by price → fails on new tokens | **Quote-leg valuation** — trade size = what was *paid* (ETH/WETH/stables), so brand-new unlisted tokens are valued correctly |
| Breaks when an API hiccups | **Graceful degradation, proven under double-failure** — CoinGecko AND the LLM were killed simultaneously; the alert still delivered (stale price marked ≈, template sentence substituted) |
| Trusts any HTTP caller | **HMAC-SHA256 signature verification** (constant-time compare, raw-body hashing) + secret path + silent drop of forgeries |

## Architecture

```
Alchemy ADDRESS_ACTIVITY webhook (ETH mainnet, real-time push)
  → Webhook node (200-ack immediately, raw-body capture, secret path)
  → HMAC-SHA256 signature verification (pure-JS, sandbox-safe)
  → Trade classifier: group legs by txHash → BUY / SELL / drop-with-reason
      · quote set: ETH, WETH, USDC, USDT, DAI
      · router/pool allowlist (Uniswap V2/V3/UR, 1inch, 0x, CoW) as anti-spam gate
  → CoinGecko pricing (cached, stale-fallback marked ≈)
  → $100K size gate (per-wallet overrides) → 24h dedupe (txHash+wallet+token+direction)
  → AI sentence composer (facts-only prompt, 12s timeout)
  → MarkdownV2 Telegram alert + inline buttons (retry ×5)
Side paths: /demo trigger (sample alert, dedupe-bypassed) · template fallback at every step
```

## Verified test results

| Scenario | Result |
|---|---|
| BUY — 400 WETH → PEPE via Uniswap UR | ✅ alert: $991.5k valued from WETH leg |
| SELL — PEPE → 320k USDC | ✅ alert |
| Airdrop (received, gave nothing) | ✅ dropped in 38ms |
| Self-transfer between watched wallets | ✅ dropped in 36ms |
| Stablecoin ↔ stablecoin swap | ✅ dropped in 35ms |
| **Unlisted token** bought for 300 WETH | ✅ alert valued via quote leg |
| CoinGecko + LLM **both down** | ✅ alert still delivered (≈ stale price + template) |
| Forged signature | ✅ silently rejected |

Test harness in `/tests` — signed fixture payloads fired through the live pipeline.

## $0 cost stack

| Service | Free tier | Used for |
|---|---|---|
| Alchemy Notify | 5 webhooks, ~100k addresses | real-time push |
| n8n (self-hosted) | free Community Edition | orchestration |
| CoinGecko Demo | 10k calls/mo | ETH/token pricing |
| Telegram Bot API | free | delivery |
| LLM (pay-per-call, ~$0.001/alert) | signup credit | alert sentences |

## Repo layout
```
config/watchlist.json        # verified watchlist (source + on-chain evidence links)
docs/
  data-source-decisions.md   # per-tool limits, pay-triggers, sample payloads
  watchlist-playbook.md      # how wallets are found & vetted (Arkham/Nansen/Lookonchain/DeBank)
  watchlist-v1-notes.md      # research log: every candidate accepted/rejected & why
  build-plan.md              # milestones, risks, cost & scaling model
workflows/                   # n8n workflow export (secrets redacted)
tests/                       # signed-fixture test harness + results
```

## Disclaimer
Read-only on-chain monitoring. Reports facts about public blockchain activity. **Not financial advice.**
