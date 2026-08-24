'use strict';
// Canonical pure logic for token-research.
// The n8n Code nodes paste these function bodies verbatim (see README node map).
// Zero dependencies — runs in n8n Code nodes AND plain `node tests/run.js`.

const CHAIN_IDS = {
  ethereum: 1, bsc: 56, polygon_pos: 137, arbitrum: 42161, base: 8453, avalanche: 43114,
};

// /research PEPE | /demo SOL | optional $ prefix
function parseCommand(text) {
  const m = /^\s*\/(research|demo)[\s_]+\$?([A-Za-z0-9._-]{2,20})\s*$/.exec(String(text || ''));
  return m ? { symbol: m[2].toUpperCase(), isDemo: m[1] === 'demo' } : null;
}

function pickCoinId(search, symbol) {
  const coins = search && Array.isArray(search.coins) ? search.coins : [];
  const s = String(symbol).toLowerCase();
  const exact = coins.find(c => String(c.symbol || '').toLowerCase() === s);
  const c = exact || coins[0];
  return c ? { id: c.id, symbol: String(c.symbol || s).toUpperCase(), name: c.name || c.id } : null;
}

function normMarket(m) {
  if (!m || m.current_price == null) return null;
  return {
    id: m.id,
    symbol: String(m.symbol || '').toUpperCase(),
    name: m.name || m.id,
    rank: m.market_cap_rank || null,
    price: m.current_price,
    change24h: Math.round((Number(m.price_change_percentage_24h) || 0) * 100) / 100,
    marketCap: m.market_cap || null,
    volume24h: m.total_volume || null,
    ath: m.ath || null,
    athChangePct: m.ath_change_percentage == null ? null : Math.round(m.ath_change_percentage),
  };
}

function pickDex(pairs) {
  if (!Array.isArray(pairs) || pairs.length === 0) return null;
  const p = pairs.slice().sort((a, b) => ((b.liquidity && b.liquidity.usd) || 0) - ((a.liquidity && a.liquidity.usd) || 0))[0];
  return {
    chain: p.chainId || '',
    chainIdNumeric: CHAIN_IDS[p.chainId] || null,
    dex: p.dexId || '',
    pairUrl: p.pairAddress ? 'https://dexscreener.com/' + p.chainId + '/' + p.pairAddress : '',
    contract: (p.baseToken && p.baseToken.address) || null,
    liquidityUsd: Math.round((p.liquidity && p.liquidity.usd) || 0),
    volume24hUsd: Math.round((p.volume && p.volume.h24) || 0),
    txns24h: ((p.txns && p.txns.h24 && p.txns.h24.buys) || 0) + ((p.txns && p.txns.h24 && p.txns.h24.sells) || 0),
  };
}

// GoPlus result keyed by lowercase contract address
function riskFlags(goplusResult, contract) {
  const flags = [];
  if (!goplusResult || !contract) return flags;
  const t = goplusResult[String(contract).toLowerCase()];
  if (!t) return flags;
  if (t.is_honeypot === '1') flags.push('honeypot contract');
  if (t.is_mintable === '1') flags.push('owner can mint new supply');
  if (t.cannot_sell_all === '1') flags.push('selling restricted');
  if (Number(t.sell_tax) > 0.15) flags.push('high sell tax ' + Math.round(Number(t.sell_tax) * 100) + '%');
  if (Number(t.owner_percentage) > 0.05) flags.push('owner holds ' + (Number(t.owner_percentage) * 100).toFixed(1) + '% of supply');
  return flags;
}

function topNews(items, coinName, symbol, limit) {
  limit = limit || 3;
  const words = (coinName + ' ' + symbol).toLowerCase().split(/\W+/).filter(w => w.length > 2);
  return (Array.isArray(items) ? items : [])
    .filter(it => {
      const t = String((it && it.title) || '').toLowerCase();
      return words.some(w => t.includes(w));
    })
    .slice(0, limit)
    .map(it => ({ title: String(it.title), link: it.link || '' }));
}

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmtMoney(n) {
  if (n == null || isNaN(Number(n))) return '—';
  n = Number(n);
  const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (a >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  if (a >= 1) return n.toFixed(2);
  return n.toPrecision(3);
}

function buildLlmPrompt(ctx) {
  const bits = [];
  if (ctx.market) bits.push(ctx.market.name + ' (' + ctx.market.symbol + '), price $' + fmtMoney(ctx.market.price) + ', 24h change ' + ctx.market.change24h + '%, rank #' + (ctx.market.rank || '?'));
  if (ctx.dex) bits.push('Deepest pool $' + fmtMoney(ctx.dex.liquidityUsd) + ' liquidity, $' + fmtMoney(ctx.dex.volume24hUsd) + ' 24h volume on ' + ctx.dex.chain + '/' + ctx.dex.dex);
  if (ctx.flags.length) bits.push('Security flags: ' + ctx.flags.join('; '));
  else bits.push('Security check: no standard scam-pattern flags');
  if (ctx.news.length) bits.push('Headlines: ' + ctx.news.map(n => n.title).join(' | '));
  return 'Write a cautious 2-3 sentence trader brief about this token based ONLY on these facts. No financial advice, no invented facts:\n' + bits.join('\n');
}

// LLM-or-template verdict (see /docs/llm-fallback-pattern.md)
function summarize(ctx, llmOut) {
  const txt = llmOut && llmOut.ok !== false && typeof llmOut.text === 'string' ? llmOut.text.trim() : '';
  if (!ctx.market) {
    return { mode: 'template', text: "Live price data didn't come back from upstream just now — retry in a minute and this report fills itself in." };
  }
  if (txt.length >= 20 && txt.length <= 1200) return { mode: 'llm', text: txt };

  const parts = [];
  parts.push(ctx.market.name + ' (' + ctx.market.symbol + ') trades at $' + fmtMoney(ctx.market.price) + ' (' + (ctx.market.change24h >= 0 ? '+' : '') + ctx.market.change24h + '% / 24h).');
  if (ctx.market.rank) parts.push('Rank #' + ctx.market.rank + ' · $' + fmtMoney(ctx.market.marketCap) + ' cap · $' + fmtMoney(ctx.market.volume24h) + ' daily volume.');
  if (ctx.dex) parts.push('Deepest pool: ' + ctx.dex.chain + '/' + ctx.dex.dex + ' — $' + fmtMoney(ctx.dex.liquidityUsd) + ' locked, $' + fmtMoney(ctx.dex.volume24hUsd) + ' 24h volume across ' + ctx.dex.txns24h + ' txns.');
  parts.push(ctx.flags.length ? '⚠️ Risk flags: ' + ctx.flags.join('; ') + '.' : 'No standard scam-pattern flags found in the security check.');
  if (ctx.news.length) parts.push('In the news: ' + ctx.news.map(n => n.title).join(' | '));
  return { mode: 'template', text: parts.join('\n') };
}

// Rich Telegram-HTML report card. %%SUMMARY%% placeholder is swapped by the
// "Validate LLM or fall back" node so the template text ships even if the LLM dies.
function formatReport(ctx) {
  const L = [];
  L.push('<b>' + (ctx.degraded ? '🔍 Token research — partial data' : '🔍 Token research') + '</b>');
  if (ctx.degraded) L.push('<i>Some sources were unreachable — showing what we have.</i>');
  if (ctx.market) {
    const arrow = ctx.market.change24h >= 0 ? '▲' : '▼';
    L.push('');
    L.push('<b>' + esc(ctx.market.name) + ' (' + esc(ctx.market.symbol) + ')</b>' + (ctx.market.rank ? ' · rank #' + ctx.market.rank : ''));
    L.push('Price: <b>$' + fmtMoney(ctx.market.price) + '</b>  ' + arrow + ' ' + (ctx.market.change24h >= 0 ? '+' : '') + ctx.market.change24h + '% (24h)');
    L.push('Cap <b>$' + fmtMoney(ctx.market.marketCap) + '</b> · Vol <b>$' + fmtMoney(ctx.market.volume24h) + '</b> · ATH Δ ' + (ctx.market.athChangePct == null ? '—' : ctx.market.athChangePct + '%'));
  } else {
    L.push('<b>' + esc(ctx.symbol) + "</b> — couldn't match this symbol right now.");
  }
  if (ctx.dex) {
    L.push('');
    L.push('💧 Liquidity <b>$' + fmtMoney(ctx.dex.liquidityUsd) + '</b> · 24h vol <b>$' + fmtMoney(ctx.dex.volume24hUsd) + '</b> · ' + ctx.dex.txns24h + ' txns');
    L.push('Pool: ' + esc(ctx.dex.chain) + '/' + esc(ctx.dex.dex) + (ctx.dex.pairUrl ? ' — ' + ctx.dex.pairUrl : ''));
    if (ctx.dex.contract) L.push('Contract: <code>' + esc(ctx.dex.contract) + '</code>');
  }
  if (ctx.flags.length) L.push('\n🚨 <b>Risk flags:</b> ' + esc(ctx.flags.join('; ')));
  else if (ctx.securityChecked) L.push('✅ Security check: no standard scam-pattern flags.');
  if (ctx.news.length) {
    L.push('\n📰 <b>Headlines</b>');
    ctx.news.forEach(n => L.push('• ' + esc(n.title)));
  }
  L.push('\n🗣 <b>Verdict</b>\n<i>%%SUMMARY%%</i>');
  L.push('\nSources: CoinGecko · DexScreener · GoPlus' + (ctx.isDemo ? '\n🧪 [DEMO]' : ''));
  return L.join('\n');
}

// Full pipeline over raw API payloads — mirrors the "Aggregate research" node.
function buildReport(input) {
  input = input || {};
  const symbol = input.symbol || '';
  const coin = pickCoinId(input.search, symbol);
  let market = null;
  if (coin && Array.isArray(input.markets)) {
    market = normMarket(input.markets.find(m => m.id === coin.id) || input.markets[0]);
    if (market) market.name = coin.name;
  }
  const dex = pickDex(input.dexPairs);
  const goplusResult = input.goplus && input.goplus.result ? input.goplus.result : null;
  const flags = riskFlags(goplusResult, dex && dex.contract);
  const news = topNews(input.news, coin ? coin.name : '', symbol);
  const degraded = !market;

  const ctx = {
    symbol, market, dex, flags, news, degraded,
    securityChecked: !!dex && !!dex.contract,
    isDemo: !!input.isDemo,
  };
  ctx.llmPrompt = buildLlmPrompt(ctx);

  const summary = summarize(ctx, null); // template first — LLM swaps in later
  let html = formatReport(Object.assign({}, ctx));
  html = html.replace('%%SUMMARY%%', esc(summary.text));

  return {
    symbol, isDemo: ctx.isDemo, degraded,
    market, dex, flags, news,
    llmPrompt: ctx.llmPrompt,
    summaryTemplate: summary.text,
    html,
  };
}

// Swap the template verdict for a validated LLM verdict.
function applyLlmSummary(report, llmOut) {
  const ok = llmOut && typeof llmOut.text === 'string' && llmOut.text.trim().length >= 20 && llmOut.text.length <= 1200;
  const text = ok ? llmOut.text.trim() : report.summaryTemplate;
  return {
    finalHtml: report.html.replace('%%SUMMARY%%', esc(text)),
    mode: ok ? 'llm' : 'template',
  };
}

module.exports = {
  CHAIN_IDS, parseCommand, pickCoinId, normMarket, pickDex, riskFlags,
  topNews, fmtMoney, buildLlmPrompt, summarize, formatReport, buildReport, applyLlmSummary, esc,
};
