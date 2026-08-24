# Automation Portfolio — n8n workflows that look like a business paid for them

Two surfaces, one story:

| Surface | What it is | Link |
|---|---|---|
| **Site** | Fast dark single-page portfolio with case studies + demos | TODO_LIVE_SITE_URL |
| **GitHub** | This repo — the auditable proof | https://github.com/Anesch531/anes-automation-portfolio |

## Projects

| # | Project | One-liner | Folder |
|---|---|---|---|
| 0 | Smart Money Alert bot (existing) | Push alerts on smart-money token movements | [TODO_SMART_MONEY_LINK] |
| 1 | Token Research Report Bot | `/research <coin>` → multi-source report card with LLM verdict + template fallback | [projects/token-research](projects/token-research/) |
| 2 | Lead Capture → Enriched CRM | Consent form → validate/dedupe/enrich → LLM-scored lead into Google Sheets + instant alert | [projects/lead-capture](projects/lead-capture/) |
| 3 | Review Summarizer | Paste raw product reviews → themed digest with sentiment split + suggested reply | [projects/review-summarizer](projects/review-summarizer/) |
| 4 | Support Chatbot (Telegram) | Client-facing FAQ bot: KB-first answers, LLM grounding with fallback, human escalation | [projects/support-chatbot](projects/support-chatbot/) |

## How to read this repo

- `/projects/<slug>/` — one folder per automation: exported n8n workflow JSON,
  fixtures + a zero-dependency test runner (`node tests/run.js`), README in plain
  language, demo assets.
- `/workflows/` — flat copies of every workflow JSON for quick import into n8n.
- `/docs/` — engineering conventions (n8n reliability rules, LLM fallback pattern).
- `projects/*/tests/` — every project's logic is proven against fixtures before it counts as done.

## Principles

- **$0 infrastructure** — free tiers only.
- **LLM with a seatbelt** — every LLM step has a deterministic template fallback;
  a live demo never dies on an API hiccup.
- **Reliability by default** — timeouts, retries, error branches, dedupe on natural keys.
- **Secrets never touch git** — n8n credentials / `.env` only (see `.env.example`).

## Run the tests

```
node <project>/tests/run.js
```

No dependencies, plain Node. Each project's fixtures include a happy path plus edge
cases (missing fields, upstream failure, duplicate events).
