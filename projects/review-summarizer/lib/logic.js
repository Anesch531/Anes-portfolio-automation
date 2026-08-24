'use strict';
// Canonical pure logic for review-summarizer. Pasted into n8n Code nodes via
// build-workflow.js; proven by tests/run.js. Zero dependencies.

const STOPWORDS = new Set(('a,an,and,are,as,at,be,but,by,for,from,has,have,had,i,in,is,it,its,of,on,or,' +
  'that,the,this,to,was,were,will,with,you,your,my,me,we,us,our,they,them,their,he,she,his,her,it\'s,' +
  'so,if,then,than,too,very,can,could,would,should,did,do,does,just,now,also,get,got,got\',one,two,' +
  'really,about,after,before,all,out,up,down,over,under,again,more,most,much,many,when,what,which,who,' +
  'how,why,not,no,yes,into,been,being,am,off,only,own,same,such,some,any,because,while,during,there').split(','));

const MAX_REVIEWS = 300;

function parseReviews(input) {
  input = input || {};
  const rawList = Array.isArray(input.reviews) ? input.reviews : [];
  const good = [];
  let skipped = 0;
  for (const r of rawList.slice(0, MAX_REVIEWS)) {
    const rating = Math.round(Number(r && r.rating));
    const text = String((r && r.text) || '').trim().slice(0, 2000);
    if (!(rating >= 1 && rating <= 5) || !text) { skipped++; continue; }
    good.push({ rating, text });
  }
  return {
    ok: true,
    product: String(input.product || 'Product').slice(0, 120),
    reviews: good,
    skipped,
  };
}

function sentimentSplit(reviews) {
  const n = (reviews || []).length;
  if (!n) return { total: 0, posPct: 0, neuPct: 0, negPct: 0, avg: 0 };
  let pos = 0, neu = 0, neg = 0, sum = 0;
  for (const r of reviews) {
    sum += r.rating;
    if (r.rating >= 4) pos++;
    else if (r.rating === 3) neu++;
    else neg++;
  }
  const pct = x => Math.round((x / n) * 100);
  return { total: n, posPct: pct(pos), neuPct: pct(neu), negPct: pct(neg), avg: Math.round((sum / n) * 10) / 10 };
}

function keywordThemes(reviews, limit) {
  limit = limit || 5;
  const counts = {};   // term -> {count,ratingSum}
  for (const r of reviews) {
    const seen = {};
    const words = r.text.toLowerCase().replace(/[^a-z0-9\s'-]/g, ' ').split(/\s+/)
      .filter(w => w.length > 2 && !STOPWORDS.has(w));
    for (const w of words) {
      if (seen[w]) continue; // once per review so one rant can't spam a theme
      seen[w] = true;
      counts[w] = counts[w] || { count: 0, sum: 0 };
      counts[w].count++;
      counts[w].sum += r.rating;
    }
  }
  return Object.keys(counts)
    .map(w => {
      const c = counts[w];
      const avgForTheme = c.sum / c.count;
      const sentiment = avgForTheme >= 4 ? 'positive' : avgForTheme <= 2.5 ? 'negative' : 'mixed';
      return { label: w, count: c.count, sentiment };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

function buildLlmPrompt(split, themes, worstQuote) {
  return [
    'Aggregate customer-review stats:',
    '- average rating ' + split.avg + '/5 from ' + split.total + ' reviews (' + split.posPct + '% positive, ' + split.negPct + '% negative)',
    '- frequent terms: ' + themes.map(t => t.label + '(' + t.sentiment + ')').join(', '),
    worstQuote ? '- representative critical quote: "' + worstQuote.slice(0, 160) + '"' : '',
    'Return STRICT JSON only:',
    '{"themes":[{"label":"short theme","sentiment":"positive|mixed|negative"}],"verdict":"max 40 words","reply":"suggested public reply to the main criticism, max 45 words"}',
  ].filter(Boolean).join('\n');
}

// LLM-or-template merge per docs/llm-fallback-pattern.md
function mergeDigest(llmOut, heuristic) {
  try {
    if (llmOut && typeof llmOut.text === 'string') {
      const m = llmOut.text.match(/\{[\s\S]*\}/);
      if (m) {
        const j = JSON.parse(m[0]);
        const themesOk = Array.isArray(j.themes) && j.themes.length > 0 &&
          j.themes.every(t => t && t.label && ['positive', 'mixed', 'negative'].includes(t.sentiment));
        const verdictOk = typeof j.verdict === 'string' && j.verdict.trim().length >= 10 && j.verdict.length <= 400;
        const replyOk = typeof j.reply === 'string' && j.reply.trim().length >= 10 && j.reply.length <= 500;
        if (themesOk && verdictOk && replyOk) {
          return {
            mode: 'llm',
            themes: j.themes.slice(0, 5),
            verdict: j.verdict.trim(),
            suggestedReply: j.reply.trim(),
          };
        }
      }
    }
  } catch (e) { /* fall through */ }

  const neg = heuristic.themes.find(t => t.sentiment === 'negative');
  return {
    mode: 'template',
    themes: heuristic.themes,
    verdict: 'Customers rate this ' + heuristic.split.avg + '/5 overall. ' +
      (neg ? 'The loudest complaint is "' + neg.label + '" (' + neg.sentiment + ', mentioned ' + neg.count + 'x).' : 'Feedback skews positive with no dominant complaint.'),
    suggestedReply: neg
      ? 'Thanks for the honest feedback about ' + neg.label + '! We take it seriously and are already working on a fix — reach out at our support page and we\'ll make it right.'
      : 'Thanks for all the kind reviews! We keep shipping improvements based on your feedback.',
  };
}

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function emptyCard(product) {
  return esc('<b>📊 Review digest</b>\nNo valid reviews in the payload — nothing to summarize yet.');
}

function formatDigest(ctx) {
  // ctx: {product, split, digest:{mode,themes,verdict,suggestedReply}, isDemo}
  if (!ctx.split.total) return emptyCard(ctx.product);
  const s = ctx.split;
  const stars = '★'.repeat(Math.round(s.avg)) + '☆'.repeat(5 - Math.round(s.avg));
  const icon = t => t.sentiment === 'positive' ? '▲' : t.sentiment === 'negative' ? '▼' : '◆';
  const L = [];
  L.push('<b>📊 Review digest — ' + esc(ctx.product) + '</b>');
  L.push(stars + ' <b>' + s.avg + '</b>/5 · ' + s.total + ' reviews');
  L.push('Sentiment: ' + s.posPct + '% positive · ' + s.neuPct + '% neutral · ' + s.negPct + '% negative');
  L.push('');
  L.push('<b>Top themes</b>');
  ctx.digest.themes.forEach(t => L.push(icon(t) + ' ' + esc(String(t.label)) + ' — ' + t.sentiment));
  L.push('');
  L.push('🗣 <b>Verdict</b>\n<i>' + esc(ctx.digest.verdict) + '</i>');
  L.push('');
  L.push('💬 <b>Suggested public reply</b>\n<i>' + esc(ctx.digest.suggestedReply) + '</i>');
  L.push('');
  L.push('LLM summary w/ template fallback · mode: ' + ctx.digest.mode + (ctx.isDemo ? '\n🧪 [DEMO]' : ''));
  return L.join('\n');
}

module.exports = {
  STOPWORDS, MAX_REVIEWS, parseReviews, sentimentSplit, keywordThemes,
  buildLlmPrompt, mergeDigest, esc, emptyCard, formatDigest,
};
