# /tests — Smart Money Alert v1

## Scripts
- `fire-webhook-test.ps1` — fires one signed ADDRESS_ACTIVITY payload (500 ETH BUY by whale W2).
  Params: `-Key <signingKey> -Url <webhookUrl> [-BadSig]`
- `run-fixtures-v2.ps1` — fires the 6 classification fixtures (BUY / SELL / AIRDROP / SELF-TRANSFER /
  STABLE-SWAP / UNLISTED-BUY) through the tunnel with valid signatures.
- `test-llm.ps1` — sanity-checks the NanoBridge LLM endpoint.

## Expected results (verified 2026-08-24, execs #93–#98, #105–#107)
| Fixture | Expected | Verified |
|---|---|---|
| BUY (400 WETH -> PEPE via UR) | alert, valued ~$990k from WETH leg | ✅ msg #11 |
| SELL (PEPE -> 320k USDC) | alert | ✅ |
| AIRDROP (recv-only from EOA) | dropped | ✅ 38ms |
| SELF-TRANSFER (watched -> watched) | dropped | ✅ 36ms |
| STABLE-SWAP (USDC -> USDT) | dropped | ✅ 35ms |
| UNLISTED-BUY (300 WETH -> NEWGEM) | alert via WETH-leg valuation | ✅ |
| Demo trigger | DEMO-tagged alert, dedupe bypassed | ✅ msg #10/#17/#18 |
| Chaos: CoinGecko + LLM both down | alert still sends (~stale price + template line) | ✅ msg #17 |

## How to inspect results
After firing, open n8n -> Executions -> check whether "Telegram Send" executed (alert) or the
run ended at "Parse Activities" (dropped). Durations are the tell: ~10s = alert sent, <50ms = dropped.
