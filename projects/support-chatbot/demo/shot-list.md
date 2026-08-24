# Shot list — Support Chatbot (40–55s)

**Goal:** viewer believes "clients get instant correct answers at $0, and the
bot knows its limits."

| # | Sec | Screen | Action | Narration |
|---|-----|--------|--------|-----------|
| 1 | 0–6 | Telegram | Type "how much does it cost?" → instant 📖 FAQ answer | "Knowledge-base fast. Zero AI cost." |
| 2 | 6–12 | Same | Ask something weird ("do you sponsor chess teams?") → 🤖 grounded reply | "Outside the KB? The AI grounds in my docs." |
| 3 | 12–20 | Editor | Show llm-failure test + fallback text | "AI down? Honest fallback, flagged for me." |
| 4 | 20–28 | Telegram | Type "I want a real person" → 📮 escalation | "It knows when to hand off." |
| 5 | 28–38 | n8n canvas | Green sweep incl. both branches | "One flow, three brains: FAQ, AI, human." |
| 6 | 38–50 | Terminal | `node tests/run.js` green | "Tested like production software." |

## Screenshot checklist
- [ ] 📖 KB answer bubble
- [ ] 🤖 AI-assisted bubble
- [ ] 📮 escalation bubble
- [ ] /faq list bubble
- [ ] tests/run.js (8 ✓)
