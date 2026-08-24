# Shot list — Token Research Report Bot (45–55s)

**Goal:** viewer believes "he typed one command and got an institutional-grade
research card — and it survives API failures."

| # | Sec | Screen | Action | Narration |
|---|-----|--------|--------|-----------|
| 1 | 0–5 | Telegram chat | Type `/research PEPE` | "One command." |
| 2 | 5–12 | Same | Report card arrives; scroll slowly through price → liquidity → flags | "Price, liquidity, contract safety, news — one message." |
| 3 | 12–22 | n8n canvas | Show execution, green nodes left→right | "Five data sources behind it." |
| 4 | 22–32 | Terminal | `curl` the demo endpoint; response appears | "Demo mode — isolated from real state." |
| 5 | 32–42 | Editor/tests | `node tests/run.js` all green, point at llm-failure line | "And if the AI dies mid-demo? Template verdict. Still ships." |
| 6 | 42–50 | Back to Telegram | Final card full-screen | "That's the product." |

## Screenshot checklist (fallback if video skipped)
- [ ] Telegram report card (full scroll), light background for contrast
- [ ] n8n canvas, latest exec green, zoomed out
- [ ] `node tests/run.js` output (14 ✓)
- [ ] curl demo response snippet
- Rules: no credentials UI open, no tokens visible, 2× scale captures
