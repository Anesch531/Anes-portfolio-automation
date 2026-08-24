# Shot list — Lead Capture → Enriched CRM (50–60s)

**Goal:** viewer believes "his lead pipeline reacts faster than a sales rep and
survives broken APIs."

| # | Sec | Screen | Action | Narration |
|---|-----|--------|--------|-----------|
| 1 | 0–6 | Live form (phone-width) | Fill name/email/company/message fast, tick consent | "Client hits submit." |
| 2 | 6–12 | Telegram | Owner alert lands instantly: Tier A 🔥 + why | "Scored, tiered, explained — instantly." |
| 3 | 12–20 | Google Sheet | New row appears; point at score/reason columns | "Clean CRM row, zero manual entry." |
| 4 | 20–30 | Terminal | curl the demo endpoint twice; second identical submit ignored | "Duplicates die. Demos write nothing." |
| 5 | 30–40 | Editor | Show llm-failure test line + rule-score code briefly | "LLM down? Rule score ships. Flagged honestly." |
| 6 | 40–55 | n8n canvas | Green execution sweep across all nodes | "Validation, dedupe, enrichment, scoring, delivery." |

## Screenshot checklist
- [ ] Form filled on phone width
- [ ] Telegram [NEW LEAD] Tier A card
- [ ] Sheet row zoomed on score/tier/reason/scoreMode
- [ ] Demo curl response ([DEMO] card)
- [ ] tests/run.js output (10 ✓)
- No credentials UI in frame; hide personal emails if asked
