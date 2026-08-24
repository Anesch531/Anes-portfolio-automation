# LLM fallback pattern (mandatory for every LLM node)

Every LLM call in every workflow assumes it WILL fail someday mid-demo. The pattern:

```
[Build prompt] ──► [Call LLM (onError: continueRegularOutput, timeout 12s)]
                              │
                    got clean JSON/text?
                       yes │        │ no/garbage/timeout
                           ▼        ▼
                  [Validate output] [Template fallback]
                           \        /
                            ▼      ▼
                      [Format report]
```

## Rules
1. **Validate, never trust.** Downstream Code node checks: field exists, type right,
   length sane (e.g. summary ≤ 2000 chars), no leaked prompt text.
2. **Fallback = deterministic template.** Plain string assembly from the raw data we
   already fetched. Slightly plainer wording, same structure, same links.
3. **Mark degraded output.** Template path appends `_mode: template` internally;
   delivery can show a subtle "offline summary" note — demos stay honest.
4. **Fixture proves it.** `tests/fixtures/llm-failure.json` simulates an empty/error
   LLM response; the runner asserts the template output still contains the core facts.

## Reference implementation (pure JS, works in n8n Code node AND node tests)

```javascript
function summarize(data, llmOut) {
  // llmOut: { ok: boolean, text?: string }
  const clean = llmOut && llmOut.ok &&
    typeof llmOut.text === 'string' && llmOut.text.length > 0 &&
    llmOut.text.length <= 2000
      ? llmOut.text.trim()
      : null;

  if (clean) return { mode: 'llm', text: clean };

  return {
    mode: 'template',
    text: [
      `${data.title}`,
      `Price: $${data.price} (${data.change24h}% 24h)`,
      `Liquidity: $${data.liquidity} | Holders: ${data.holders}`,
      `Risk flags: ${data.flags.length ? data.flags.join(', ') : 'none detected'}`,
      `Data: CoinGecko · GoPlus · DexScreener`
    ].join('\n')
  };
}
module.exports = { summarize };
```

The n8n Code node pastes the same function body — one source of truth, tested offline.

## Cost control
- Fallback ALSO fires when LLM output fails validation, so retries are never blind.
- Use cheap models (e.g. gpt-4o-mini class) for classification/summaries.
- Cache-friendly: dedupe upstream means repeated events cost $0 extra.
