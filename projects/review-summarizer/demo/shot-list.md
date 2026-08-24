# Shot list — Review Summarizer (35–45s)

**Goal:** viewer believes "paste messy reviews, get a manager-ready digest —
even with zero AI."

| # | Sec | Screen | Action | Narration |
|---|-----|--------|--------|-----------|
| 1 | 0–6 | Terminal | curl demo request | "Six raw reviews, mixed ratings." |
| 2 | 6–18 | Browser/curl output | Digest card renders; hover stars, themes, reply | "Average, sentiment split, themes — instant." |
| 3 | 18–26 | Editor | Show llm-failure fixture line | "Kill the AI mid-flight…" |
| 4 | 26–34 | Terminal again | Re-run with provider key disabled → same card, mode: template | "…same digest. Heuristics carry it." |
| 5 | 34–42 | n8n canvas | Green sweep | "One webhook, zero maintenance." |

## Screenshot checklist
- [ ] Digest card full view (★ row, ▲▼ themes, verdict, suggested reply)
- [ ] mode: template variant of the same card
- [ ] tests/run.js (9 ✓)
- [ ] usage-note response for empty payload (bonus)
