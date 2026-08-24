# Shot list — Smart Money Alert Bot (50–60s)

**Goal:** viewer believes "this is a real trading-desk tool — fast, filtered, and
it keeps working when everything else breaks."

| # | Sec | Screen | Action | Narration |
|---|-----|--------|--------|-----------|
| 1 | 0–6 | Telegram channel | Show a real alert card: BUY, $991.5k PEPE, win-rate badge, 3 buttons | "A tracked whale just bought." |
| 2 | 6–14 | Same | Tap Dexscreener / Etherscan buttons live | "Chart, transaction, wallet — one tap." |
| 3 | 14–24 | n8n canvas | Show pipeline: webhook → HMAC → classifier → gate → AI → send | "Signed webhooks, trade classification, $100K gate." |
| 4 | 24–32 | Terminal | `fire-webhook-test.ps1 -BadSig` → silently dropped | "Forged signature? Rejected without a trace." |
| 5 | 32–42 | Terminal | Demo webhook → [DEMO]-tagged alert lands | "Demo mode — isolated from real state." |
| 6 | 42–52 | tests output | Fixture table: 6 scenarios + chaos test green | "CoinGecko AND the AI both down — alert still ships." |

## Screenshot checklist
- [ ] Real alert card full-screen (buttons visible)
- [ ] n8n canvas green execution
- [ ] BadSig rejection output
- [ ] [DEMO] alert card
- [ ] tests/run-fixtures-v2.ps1 results
- Rules: hide channel name if private; no keys on screen
