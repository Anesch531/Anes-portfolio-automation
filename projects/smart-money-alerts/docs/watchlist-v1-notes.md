# Watchlist v1 — Research Log & Rejection Ledger
_Date: 2026-08-23 · Method: docs/watchlist-playbook.md + owner's zero-hallucination rules_
_Rule enforced: an address enters the watchlist ONLY if (1) it appears VERBATIM in an accessible public source with a documented trade/win, (2) it passes on-chain verification (exists, EOA, real history, active within ~30 days on ETH mainnet), (3) it clears disqualifiers._

## Result: 1 admitted · 14 rejected/rejected-with-reasons
Honest outcome, as agreed: quality over quantity. Explanation of why the yield is low is at the bottom.

---

## ✅ ADMITTED (1)

### Whale 0x2684 — `0x268448f31594F4636D03cBB4E813b94801E47643`
- **Source/evidence:** Lookonchain post (Jul 30, 2026, via nitter mirror + arkm.com explorer link); BingX/AICoin republication (Aug 5, 2026)
- **Documented record:** Since Jun 30, 2026 accumulated ~79,216 ETH @ avg ~$1,777 and ~1,400 WBTC @ avg ~$63,887; positions up ~$10.8M as of Jul 30. Still buying into early August.
- **On-chain verification (Blockscout, Aug 23, 2026):** EOA ✓ · not a contract ✓ · last mainnet tx **today** ✓
- **Why qualifies:** textbook disciplined dip-accumulator, currently winning, highly active, large size ($100M+ positions)
- **Caveats:** pseudonymous (identity/entity unknown — could be an institution); winRate 0.65 is provisional single-cycle data

---

## ❌ FAILED ON-CHAIN VERIFICATION (address was real & published; failed our gates)

| # | Address | Who / evidence | Failure reason |
|---|---|---|---|
| 2 | `0x90B38C5728f184C87EF46479cf7B402d7B98B98a` | HYPE mega-whale: bought 1.02M HYPE @$18, unstaked 1.89M ($105.9M), routing to FalconX/Coinbase Prime to sell — Lookonchain Jul 31, 2026 (arkm link) | **Zero Ethereum-mainnet tx history** — operates on Hyperliquid L1 / CEX rails. v1 Alchemy mainnet webhook would never fire. PARKED for v2 multi-chain |
| 3 | `0xcEF1C075DBFe6B2D774C74A8B94E8350E9b42C25` | Same story/profile as #2, ~$56M paper win | Last mainnet activity Jan 23, 2026 → dormant >30 days on mainnet. PARKED for v2 |
| 4 | `0xd64a2d50f8858537188a24e0f50df1681ab07ed7` | Ethereum ICO participant selling $23M of ETH — The Block quoting Lookonchain, Mar 27, 2026 (full etherscan link in article) | Address itself dormant since Mar 28, 2026 — sales execute via a downstream wallet. Re-check if it reawakens |
| 5 | `0xcd40532686b94abc88b06b9705aacbc14c8364d6` | Nansen-labeled "token millionaire" DeFi whale (Nansen profiler link in Cryptorank piece) | **is_contract = TRUE** — smart contract (multisig/vault), disqualified by playbook rule "keep only individual trader wallets". (Active today, ironically.) |
| 6 | `0x68fdea13878d7ce741cc596db55564909d9ecc8a` | GMX-heavy altcoin whale, Bitget "eco-coin ambush experts" list (Jul 2024) | Dormant since Jan 12, 2025 |

## 🚫 DISQUALIFIED BEFORE VERIFICATION (real, published, but fails rules)

| # | Wallet | Reason |
|---|---|---|
| 7 | James Wynn — `0x5078C2fBeA2b2aD61bc840Bc023E35Fce56BeDb6` (widely published by Lookonchain/Hypurrscan/HyperDash) | Documented catastrophic risk record: liquidated 12× in one day (Jan 2026), entire portfolio wiped out (Oct 2025), 26+ liquidations in a month. Fails win-consistency rubric; also trades on Hyperliquid, not mainnet |
| 8 | Machi Big Brother — `0x020cA66C30beC2c4Fe3861a94E4DB4A498A35872` | Down **$22.5M all-time** on Hyperliquid, 145 liquidations since Oct 2025 crash. Famous ≠ profitable — negative-EV signal source |
| 9 | Multicoin Capital — `0xA9Db412084ff49018a378C4AdaCf62BB41Ca642F` | Institutional VC fund depositing to Coinbase Prime — excluded (institutions/treasuries) |
| 10 | MarsCoin trader — `0xd2abcef40a51c779c2a890dd40f041ab995ed3af` ($875→$797K) | BSC wallet — wrong chain for v1 |
| 11 | Ansem (Zion Thomas) — Solana `GV6UUmNxz2RpKxmNAPadYKb7uQpszwqQAu3qLJxVdC52` | Datawallet confirms his trackable wallet is Solana; older "Ansem" ETH addresses circulating are unconfirmed — refused to use |

## 🚫 COULD NOT VERIFY ADDRESS (documented winners whose full address never appeared in accessible sources)

_We refused to reconstruct truncated addresses (`0xBF31`, `0xF292`…) — that would be guessing._

| # | Trader | Documented record | Blocker |
|---|---|---|---|
| 12 | **"7 Siblings"** ⭐ top candidate | Bought $126M ETH @$2,480 during Feb 2025 crash; sold 19,461 ETH @$4,532 near Aug 2025 top ($88M); sold 14,000 ETH @$2,346 on Aug 21, 2026. Multi-year, multi-cycle, two-sided — the archetype of our product | Arkham entity page (arkm.com/explorer/entity/7-siblings) is a JS app we can't scrape; every accessible article truncates the address |
| 13 | "EthereumOG" | Sold 60K ETH + 9,442 wstETH + 600 WBTC (~$188M) before Jun 2026 crash, rebought lower — Lookonchain: "one of the smartest traders I've seen lately" (Jun 8, 2026) | Address never printed in any article we could access |
| 14 | Others | SATO trader (+$443K), a16z-linked HYPE wallet (`0xb5E4…` truncated + institutional), LMTS seller `0xBF31`, CXMT whales `0xf292`/`0x9a80` (Hyperliquid), stETH seller `0xFD10` (Aug 21, 2026) | Truncated everywhere accessible; several also wrong venue |
| 15 | 10 DeBank profile URLs from search | None | Bare indexed profile links — no documented win, no evidence → auto-reject |

---

## Why the yield is low (honest structural analysis)
1. **The best-documented traders increasingly operate OFF mainnet** — Hyperliquid perps (Wynn, Machi, CXMT whales), Solana memecoins (Ansem), or CEX/OTC rails (FalconX/Coinbase Prime). Our v1 scope (ETH mainnet webhooks only) excludes exactly where Lookonchain publishes most.
2. **X posts truncate addresses** and X is where full strings live; search engines index the truncations. Arkham profiles hold full data behind a JS app.
3. **Strict 30-day mainnet recency + individual-EOA rules** correctly killed several otherwise-famous candidates (ICO whales, multisigs).

## Growth path to 10–15 (owner, ~45 min, then agent verifies in batch)
1. Owner opens Arkham in a browser (no scraping limits): pull member addresses of **7 Siblings** entity, plus labeled wallets of **Arthur Hayes, Erik Voorhees, Jeffrey Wilcke (ETH sales covered by Lookonchain Aug 2025)** and any Lookonchain-posted address of interest (their X posts embed full arkm/debank links — copy from the app).
2. Paste raw addresses back to the agent → agent runs the same Blockscout verification loop → survivors enter `config/watchlist.json`.
3. Optional v2 unlock: add a second Alchemy webhook for Arbitrum/Hyperliquid-relevant chains to admit the parked HYPE whales (#2, #3).
4. Monthly: re-score everyone against the rubric using OUR bot's own alert outcomes (closed feedback loop beats influencer lists).

---

# ROUND 2 — Owner-supplied Arkham batch (Aug 24, 2026)
Owner pasted 13 addresses from an Arkham browsing pass. All machine-verified via eth.blockscout.com.

## ✅ ADMITTED to watchlist.json (5)
| Address | Snapshot | Last activity |
|---|---|---|
| `0x9B864dDE6ED1c21608b1665a0ac0fAA4F7E36e6E` | 866 ETH + XAUT + PENDLE; 1inch user | Aug 24 |
| `0x28a55C4b4f9615FDE3CDAdDf6cc01FcF2E38A6b0` | ~109K aWETH Aave position + AAVE/COMP/WNXM | Aug 21 |
| `0x6cd66DbdFe289ab83d7311B668ADA83A12447e21` | 8,013 ETH + 28.4M ENA + ETHFI/sUSDe (~$15M) | Aug 22 |
| `0x350d49CA5442EA88049A727C9FdB2B0A1b962b93` | Small daily-active DeFi trader (Aave/stables/PAXG) | Aug 24 |
| `0xb99a2c4C1C4F1fc27150681B740396F6CE1cBcF5` | Small active trader (weETH + low-caps) — trial entry | Aug 24 |

**Total watchlist: 6** (incl. Whale 0x2684 from Round 1).

## ⚠️ FLAGGED — need owner's Arkham label before deciding
| Address | Observation | Concern |
|---|---|---|
| `0xEd0C6079229E2d407672a117c22b62064f4a4312` | **47,586 ETH (~$90M)** in LSTs (wstETH/weETH/aWETH) + ~$30M XAUT; interacts directly with Lido/Aave | Scale + structure suggests fund/custody/treasury, not an individual. If its Arkham label is a known institution → excluded by our rules; if individual mega-whale → prime admit. TELL ME THE LABEL |
| `0x6cc8dCbCA746a6E4Fdefb98E1d0DF903b107fd21` | 683 ETH but holds hundreds of MILLIONS of micro-caps (BTR 743M, PLPA 2.01B, TEL 701M, XPR 169M, FUN 200M) | Classic market-maker inventory / project distribution pattern → playbook disqualifier unless label says otherwise |

## ❌ REJECTED from the owner batch
| Address | Reason |
|---|---|
| `0x741AA7CFB2c7bF2A1E7D4dA2e3Df6a56cA4131F3` | Dormant since Apr 5, 2026 (>30-day rule) |
| `0xA813251e163766361adFb9700748397977A54ea0` | Zero mainnet transactions ever recorded |
| `0x7560B22b42B3E2596BD989764f1EB9bEC1896C8d` | Zero mainnet transactions (likely Hyperliquid/L2 wallet) |
| `0x868f027A5e3Bd1cD29606a6681C3ddb7D3dD9b67` | Zero mainnet transactions (likely Hyperliquid/L2 wallet) |
| `0x76801132a22801640284Cd67F7DD41fED2926B6a` | Zero mainnet transactions |
| `0x51C72848c68a965f66FA7a88855F9f7784502a7F` | **Smart contract** (likely Safe multisig) — excluded per "EOA individuals only". NOTE: very active + holds funds; if it's a tracked ENTITY's multisig (e.g., a fund you want alerts on), say so and we'll make a deliberate exception |

## TODO before go-live
- [ ] Owner replies with Arkham entity names/URLs for W1–W5 (+ verdicts for the 2 flagged, 1 contract) → agent fills labels/evidence links
- [ ] winRate values are null pending first month of OUR alert outcomes
- [ ] Optional: re-run dormant rejects monthly in case wallets reactivate
