# n8n workflow conventions (this repo)

Same house style as the existing Smart Money Alert bot. Every new workflow follows these.

## Structure
- Webhook/trigger first → fetch/enrich middle → format → deliver last.
- Node names: `Verb + Object` ("Fetch token security", "Score risk", "Format report").
- Sticky notes inside the workflow JSON labeling each section (trigger / data /
  intelligence / delivery). Reviewers read these first.

## Reliability checklist (every external call)
- `timeout`: ≤ 15000ms.
- `retryOnFail: true`, `maxTries: 2`, `waitBetweenTries: 5000`
  (3 tries allowed only for the primary data source of a workflow).
- Enrichment nodes (nice-to-have data): `onError: continueRegularOutput` and downstream
  Code nodes treat missing fields as absent — core output always ships.
- Primary data nodes: fail loudly into an Error Branch that still notifies the owner.

## Dedupe
- Natural key per domain (token address, listing id, email hash, event id).
- Store seen-keys in Workflow Static Data:
  ```javascript
  const s = $getWorkflowStaticData('global');
  s.seen ??= {};
  const key = $json.tokenAddress;
  if (s.seen[key]) return [];            // duplicate — stop here
  s.seen[key] = Date.now();
  ```
- Prune keys older than 7 days on each run to keep static data small.

## Demo trigger
- Every workflow accepts `?demo=1` (or a `/demo` command) which:
  - uses fixture-style sample input,
  - bypasses dedupe (so it ALWAYS fires),
  - marks output `[DEMO]` so real channels/state stay clean.

## Secrets
- Credentials ONLY via n8n Credentials UI (LLM key, Telegram token, etc.).
- Webhook paths contain no tokens/secrets (path slugs only).
- Exported JSON must contain zero credential values — before commit, grep the diff.

## Export ritual
1. Download workflow JSON from n8n.
2. Save to `/projects/<slug>/workflows/<slug>.json`.
3. Copy to `/workflows/<slug>.json` (flat mirror for quick import).
4. `node projects/<slug>/tests/run.js` green → commit.
