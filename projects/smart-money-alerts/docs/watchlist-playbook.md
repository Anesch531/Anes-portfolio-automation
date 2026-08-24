# Smart-Money Watchlist Playbook
_The watchlist IS the product edge. Tools above are commodities; nobody copies taste._
_Goal for v1: 10–15 Ethereum-mainnet wallets, each with documented evidence and a win-rate estimate._

## What qualifies as "smart money" (our bar)
A wallet that repeatedly made large, well-timed directional trades with **verifiable history** —
ideally bought before big moves AND distributed near tops. Size matters (>~$250K positions) because
it implies conviction and information. Activity matters (traded within last 30 days).

## Disqualifiers (exclude even famous addresses)
- Exchange hot/cold wallets (Binance, Coinbase, Bitfinex…) — flow is customer custody, not conviction.
- Market makers / HFT (Wintermute, DWF, Jump, GSR…) — they quote, they don't "believe".
- Bridge/vault/staking contracts, known deployer/treasury wallets.
- Insiders whose moves may be legal-front-running of unlocks/news you can't replicate (borderline: allow only with a "followable?" test — could a subscriber act on this in time and reasonably profit?).
- Wallets whose "wins" are one lucky cycle with no repeat evidence.

## Source-by-source hunting guide

### Arkham (arkham.intel) — primary label database
- Search a known trader/entity → get their labeled addresses + portfolio.
- Use **Profiles/Leaderboards** and "Smart Money"/"Profitable traders" style lists; open candidate
  profiles, inspect realized PnL and top positions.
- Follow the trail: find one alpha wallet → check who it trades with early (counterparty clustering
  surfaces other smart wallets).
- Record: address, entity label, PnL screenshot/link, notable calls.

### Nansen — mostly paid, mine the free surface
- Paid tiers hold the famous labels (Smart LP, Funds, Smart DeFi). At $0: use their public blog,
  X threads, and quarterly "smart money holdings" reports — they often cite specific addresses.
- Cross-check anything found against Arkham/DeBank before admitting.

### Lookonchain / Onchain Edge / Spot On Chain (free X accounts + sites)
- Post receipts: "Wallet 0xabc… bought $X of $TOKEN before rally". Each thread = a pre-vetted
  candidate + performance narrative.
- Harvest candidates into your tracker sheet, then VERIFY yourself (below) — never trust the
  influencer's math blindly.

### DeBank (debank.com) — free forensics workbench
- Paste any candidate address → full portfolio, debt, LP positions, and **history**.
- Verify: position sizes, entry timing vs price charts, current PnL, whether profits were realized.
- DeBank's "Rankings" (top balances/DeFi users) finds whales — filter for behavior, not size.

### Etherscan (free) — ground truth
- For finalists: eyeball `tokentx` history — consistent wins? exits near local tops?
- Check first-funded date (fresh wallets = possibly one person's burner; old + active = track record).
- Note recurring counterparties (DEX routers = organic trading; direct transfers from unlabeled
  wallets = maybe OTC/insider — flag it).

## Vetting rubric (score 0–5 each; admit ≥18/25, prioritize order)
| # | Dimension | 5 looks like | 0 looks like |
|---|---|---|---|
| 1 | Track record depth | 12+ months, multiple cycles | 1 trade, 1 month |
| 2 | Win consistency | ≥70% of large positions closed green | coin-flip outcomes |
| 3 | Position size discipline | regularly $250K+, sized sensibly | dust gambles |
| 4 | Timing quality | early entries/exits vs chart | chases green candles |
| 5 | Activity/followability | trades weekly; moves are actionable | dormant months, unactionable |

Evidence link REQUIRED for every admitted wallet (Arkham profile / Lookonchain thread /
Etherscan view) — stored in the watchlist file. If you can't defend it, don't ship it.

## Watchlist file schema (`config/watchlist.json`)
```json
[
  {
    "address": "0xCuratedChecksummedAddress",
    "label": "JOMO-hunter (pseudonym)",
    "winRate": 0.73,
    "avgPositionUsd": 400000,
    "tags": ["memecoin", "midcap"],
    "minUsdOverride": null,
    "evidence": ["https://etherscan.io/address/0x…", "https://lookonchain.com/…"],
    "addedAt": "2026-08-23",
    "lastReview": "2026-08-23",
    "active": true
  }
]
```
Rules: addresses EIP-55 checksummed (agent validates); `winRate` = owner's estimate, updated
monthly from the bot's own outcome log (closed feedback loop — after 90 days YOUR data beats
everyone's lists).

## Maintenance cadence
- Weekly (5 min): skim alerts for junk patterns → tune filters/thresholds.
- Monthly (30 min): re-score each wallet with rubric; demote <15 pts to `active:false`;
  promote bench candidates; update winRates from outcome log.
- Quarterly: refresh hunt pass (new cycles mint new smart money).

## Ethics/compliance guardrails (short version)
Public on-chain data only. The bot reports facts ("wallet with 73% tracked win-rate bought"),
never advice ("buy now"). Channel description states informational-not-financial-advice once,
plainly. That's the whole posture — no disclaimers spam inside alerts.
