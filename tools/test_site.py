#!/usr/bin/env python3
"""Static checks for the published vantflow.tech site.

    python tools/test_site.py

Lives outside portfolio/ on purpose: the Pages artifact is the whole
portfolio/ folder, so anything in there is served to the public.

Every check is named. Failures accumulate and are printed together; the
process exits 1 if any failed. Uses Python string search rather than grep:
assets/site.css is a single 15KB line and shell grep is unreliable on it.
"""
import json
import os
import re
import struct
import sys
import unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = os.path.join(ROOT, 'portfolio')
DOMAIN = 'https://vantflow.tech'

PAGES = ['index.html', 'privacy.html', 'terms.html', '404.html']
INDEXABLE = ['index.html', 'privacy.html', 'terms.html']
CANONICAL = {
    'index.html': DOMAIN + '/',
    'privacy.html': DOMAIN + '/privacy.html',
    'terms.html': DOMAIN + '/terms.html',
}
# Non-ASCII allowed per page. Everything else fails: this one allowlist is
# what enforces "no em dashes, no emoji icons, no curly quotes, no dingbats"
# and it also catches bidi controls and non-breaking spaces.
ALLOWED_NONASCII = {
    'index.html': {0x00A9, 0x00B7, 0x2192},
    'privacy.html': {0x00A9, 0x00B7},
    'terms.html': {0x00A9, 0x00B7},
    '404.html': set(),
}
PUBLISHABLE_EXT = {'.html', '.css', '.png', '.svg', '.ico', '.txt', '.xml'}
PUBLISHABLE_NAMES = {'CNAME'}
METRIC = '80 automated checks across five portfolio systems'

failures = []
count = 0


def check(ok, msg):
    global count
    count += 1
    if not ok:
        failures.append(msg)
    return bool(ok)


def read(rel, mode='r'):
    path = os.path.join(SITE, rel)
    if mode == 'rb':
        with open(path, 'rb') as fh:
            return fh.read()
    with open(path, encoding='utf-8') as fh:
        return fh.read()


HTML = {p: read(p) for p in PAGES}
CSS = read('assets/site.css')


def meta_name(html, name):
    m = re.search(r'<meta\s+name="%s"\s+content="([^"]*)"' % re.escape(name), html)
    return m.group(1) if m else None


def meta_prop(html, prop):
    m = re.search(r'<meta\s+property="%s"\s+content="([^"]*)"' % re.escape(prop), html)
    return m.group(1) if m else None


def links(html, rel):
    return re.findall(r'<link\s+rel="%s"[^>]*?href="([^"]*)"' % re.escape(rel), html)


def png_ihdr(rel):
    """(width, height, colour_type) from the IHDR chunk."""
    head = read(rel, 'rb')[:26]
    if head[:8] != b'\x89PNG\r\n\x1a\n':
        return None
    w, h = struct.unpack('>II', head[16:24])
    return w, h, head[25]


def ico_sizes(rel):
    data = read(rel, 'rb')
    n = struct.unpack('<H', data[4:6])[0]
    out = []
    for i in range(n):
        off = 6 + i * 16
        out.append((data[off] or 256, data[off + 1] or 256))
    return sorted(out)


def cp_name(cp):
    return unicodedata.name(chr(cp), 'UNNAMED')


# =====================================================================
# 1. Launch gates and binary assets
# =====================================================================
check(os.path.isfile(os.path.join(SITE, 'privacy.html')), 'launch gate: privacy.html missing')
check(os.path.isfile(os.path.join(SITE, 'terms.html')), 'launch gate: terms.html missing')
check(os.path.isfile(os.path.join(SITE, 'favicon.ico')), 'launch gate: favicon.ico missing')
check(os.path.isfile(os.path.join(SITE, '404.html')), '404.html missing')

cname = read('CNAME')
check(cname == 'vantflow.tech\n', 'CNAME must be exactly "vantflow.tech\\n", got %r' % cname)

sizes = ico_sizes('favicon.ico')
for want in [(16, 16), (32, 32), (48, 48)]:
    check(want in sizes, 'favicon.ico missing %dx%d (has %s)' % (want[0], want[1], sizes))

apple = png_ihdr('assets/apple-touch-icon.png')
check(apple is not None, 'apple-touch-icon.png is not a PNG')
if apple:
    check(apple[0] == 180 and apple[1] == 180,
          'apple-touch-icon.png must be 180x180, got %dx%d' % (apple[0], apple[1]))
    # iOS composites its own mask; an alpha channel renders as black.
    check(apple[2] not in (4, 6),
          'apple-touch-icon.png must be opaque, colour type %d has alpha' % apple[2])

og = png_ihdr('assets/og-image.png')
check(og is not None, 'og-image.png is not a PNG')
if og:
    check(og[0] == 1200 and og[1] == 630,
          'og-image.png must be 1200x630, got %dx%d' % (og[0], og[1]))

check(4000 < len(CSS) < 120000, 'site.css size %d looks wrong (CDN was 407279)' % len(CSS))
check('cdn.tailwindcss.com' not in CSS, 'site.css references the Play CDN')

# Nothing but web assets may sit under portfolio/: the Pages artifact
# publishes the whole folder, which is how test_site.py became public.
for base, dirs, files in os.walk(SITE):
    for fn in files:
        ext = os.path.splitext(fn)[1].lower()
        ok = ext in PUBLISHABLE_EXT or fn in PUBLISHABLE_NAMES
        rel = os.path.relpath(os.path.join(base, fn), SITE).replace('\\', '/')
        check(ok, 'portfolio/%s would be published (extension %r not allowed)' % (rel, ext))


# =====================================================================
# 2. House style: the things the owner said must never appear
# =====================================================================
for page in PAGES:
    allowed = ALLOWED_NONASCII[page]
    seen = {}
    for ch in HTML[page]:
        cp = ord(ch)
        if cp > 127 and cp not in allowed:
            seen[cp] = seen.get(cp, 0) + 1
    for cp, n in sorted(seen.items()):
        check(False, '%s: %d x U+%04X %s not allowed' % (page, n, cp, cp_name(cp)))

# The two arrows are pipeline notation in project names, nowhere else.
check(HTML['index.html'].count('→') == 2,
      'index.html must contain exactly 2 U+2192, found %d' % HTML['index.html'].count('→'))

BANNED_SUBSTRINGS = [
    'purple', 'violet', 'indigo', 'fuchsia',          # no purple gradients
    'rounded-full',                                    # no pill buttons
    'aggregateRating', 'reviewBody', 'ratingValue',    # no fake reviews
    'reviewCount', 'testimonial',
    '80+',                                             # no inflated metrics
    'cursor:none', 'cursor: none', 'cursor:url(', 'data-cursor',
    'cdn.tailwindcss.com', 'tailwind.config',
    'anesch531.github.io', 'http://vantflow.tech',
    'id="progress"', 'animate-bounce', 'animate-pulse',
    'animate-spin', 'animate-ping',
    'made with', 'built with ai', 'powered by', 'lovable',
    'v0.dev', 'framer.com', 'wix.com', 'vibe-coded',
    '<script src',                                     # no third-party JS
]
for page in PAGES:
    low = HTML[page].lower()
    for bad in BANNED_SUBSTRINGS:
        check(bad.lower() not in low, '%s contains banned string %r' % (page, bad))
for bad in ['purple', 'violet', 'indigo', 'fuchsia', 'rounded-full', 'cursor:none', 'cursor:url(']:
    check(bad not in CSS, 'site.css contains banned string %r' % bad)

check(METRIC in HTML['index.html'], 'index.html lost the verified metric wording %r' % METRIC)
check('prefers-reduced-motion' in CSS, 'site.css has no prefers-reduced-motion guard')
check('prefers-reduced-motion' in HTML['index.html'],
      'index.html reveal script does not check prefers-reduced-motion')
check('<noscript>' in HTML['index.html'],
      'index.html needs the noscript fallback or .reveal keeps the page blank without JS')
check('.btn{' in CSS and 'border-radius:.75rem' in CSS,
      '.btn must be a 12px rounded rectangle, not a pill')


# =====================================================================
# 3. Per-page head, metadata and social cards
# =====================================================================
for page in PAGES:
    html = HTML[page]
    check(html.startswith('<!doctype html>'), '%s does not start with <!doctype html>' % page)
    check('<html lang="en"' in html, '%s missing <html lang="en">' % page)
    check('<meta charset="utf-8">' in html, '%s missing charset' % page)
    check('name="viewport"' in html, '%s missing viewport meta' % page)

    h1 = re.findall(r'<h1\b', html)
    check(len(h1) == 1, '%s must have exactly one <h1>, found %d' % (page, len(h1)))

    title = re.search(r'<title>([^<]*)</title>', html)
    check(title is not None, '%s missing <title>' % page)
    if title:
        t = title.group(1)
        check('VANTFLOW' in t, '%s title lacks the brand: %r' % (page, t))
        check(len(t) <= 65, '%s title is %d chars, keep it under 65' % (page, len(t)))

    desc = meta_name(html, 'description')
    check(desc is not None, '%s missing meta description' % page)
    if desc:
        check(50 <= len(desc) <= 160,
              '%s description is %d chars, target 50-160' % (page, len(desc)))

    # Favicon set and stylesheet, on every page including 404.
    icons = links(html, 'icon')
    check('/favicon.ico' in icons, '%s does not link /favicon.ico' % page)
    check('/assets/vantflow-icon.svg' in icons, '%s does not link the SVG icon' % page)
    check(links(html, 'apple-touch-icon') == ['/assets/apple-touch-icon.png'],
          '%s missing apple-touch-icon' % page)
    check('/assets/site.css' in links(html, 'stylesheet'),
          '%s does not link the compiled stylesheet' % page)

    # Social cards. The original bug was summary_large_image with no image,
    # which produced no link preview at all.
    if meta_name(html, 'twitter:card') == 'summary_large_image':
        check(meta_name(html, 'twitter:image') is not None,
              '%s declares summary_large_image but has no twitter:image' % page)
    for prop in ['og:title', 'og:description', 'og:image', 'og:url', 'og:site_name']:
        if page != '404.html':
            check(meta_prop(html, prop) is not None, '%s missing %s' % (page, prop))
    img = meta_prop(html, 'og:image')
    if img:
        check(img.startswith(DOMAIN + '/'), '%s og:image is not absolute: %r' % (page, img))
        local = img[len(DOMAIN) + 1:]
        check(os.path.isfile(os.path.join(SITE, local)),
              '%s og:image %r does not exist on disk' % (page, local))


# =====================================================================
# 4. Canonical, robots, structured data
# =====================================================================
for page in INDEXABLE:
    html = HTML[page]
    canon = links(html, 'canonical')
    check(canon == [CANONICAL[page]],
          '%s canonical should be %r, got %r' % (page, CANONICAL[page], canon))
    check(meta_prop(html, 'og:url') == CANONICAL[page],
          '%s og:url must equal the canonical URL' % page)
    robots = meta_name(html, 'robots') or ''
    check('noindex' not in robots, '%s is meant to be indexable but says %r' % (page, robots))

check('noindex' in (meta_name(HTML['404.html'], 'robots') or ''),
      '404.html must be noindex')

ld = re.search(r'<script type="application/ld\+json">(.*?)</script>', HTML['index.html'], re.S)
check(ld is not None, 'index.html has no JSON-LD block')
if ld:
    try:
        data = json.loads(ld.group(1))
    except ValueError as exc:
        data = None
        check(False, 'index.html JSON-LD does not parse: %s' % exc)
    if data:
        check(data.get('@type') == 'ProfessionalService',
              'JSON-LD @type should be ProfessionalService, got %r' % data.get('@type'))
        check('aggregateRating' not in json.dumps(data),
              'JSON-LD must not claim ratings we do not have')
        offer = data.get('makesOffer') or {}
        price = (offer.get('priceSpecification') or offer).get('price')
        check(str(price) == '200', 'JSON-LD offer price should be 200, got %r' % price)

robots_txt = read('robots.txt')
check('Sitemap: %s/sitemap.xml' % DOMAIN in robots_txt, 'robots.txt has no Sitemap line')
check('Disallow: /\n' not in robots_txt and not robots_txt.rstrip().endswith('Disallow: /'),
      'robots.txt disallows the whole site')
# 404.html is deliberately crawlable so its own noindex is what takes effect.
check('404' not in robots_txt, 'robots.txt should not mention 404.html')

sitemap = read('sitemap.xml')
locs = re.findall(r'<loc>([^<]+)</loc>', sitemap)
check(sorted(locs) == sorted(CANONICAL.values()),
      'sitemap.xml should list exactly %r, got %r' % (sorted(CANONICAL.values()), sorted(locs)))
for loc in locs:
    rel = loc[len(DOMAIN) + 1:] or 'index.html'
    check(os.path.isfile(os.path.join(SITE, rel)), 'sitemap lists %r which is not on disk' % loc)


# =====================================================================
# 5. Links, fragments, accessibility
# =====================================================================
def local_target(url):
    """Map a site-root URL onto a file under portfolio/, or None."""
    path = url.split('#')[0].split('?')[0]
    if not path.startswith('/'):
        return None
    if path == '/':
        return 'index.html'
    return path.lstrip('/')


IDS = {p: set(re.findall(r'\sid="([^"]+)"', HTML[p])) for p in PAGES}

for page in PAGES:
    html = HTML[page]
    for attr, url in re.findall(r'\b(href|src)="([^"]+)"', html):
        if url.startswith(('mailto:', 'tel:', 'http://', 'https://', 'data:')):
            continue
        if url.startswith('#'):
            frag = url[1:]
            check(frag in IDS[page], '%s links to #%s which does not exist on that page' % (page, frag))
            continue
        rel = local_target(url)
        check(rel is not None, '%s has a relative %s=%r; use root-absolute paths' % (page, attr, url))
        if rel:
            check(os.path.isfile(os.path.join(SITE, rel)),
                  '%s %s=%r resolves to missing file portfolio/%s' % (page, attr, url, rel))
            if '#' in url and rel in IDS:
                frag = url.split('#', 1)[1]
                check(frag in IDS[rel], '%s links to %s but #%s is not in %s' % (page, url, frag, rel))

    for tag in re.findall(r'<a\b[^>]*target="_blank"[^>]*>', html):
        check('rel="noopener"' in tag, '%s has target=_blank without rel=noopener: %s' % (page, tag[:70]))

    for tag in re.findall(r'<img\b[^>]*>', html):
        alt = re.search(r'\salt="([^"]*)"', tag)
        check(alt is not None and alt.group(1).strip() != '',
              '%s has an <img> with no usable alt: %s' % (page, tag[:70]))

    for tag, inner in re.findall(r'(<a\b[^>]*>)(.*?)</a>', html, re.S):
        text = re.sub(r'<[^>]+>', '', inner).strip()
        labelled = 'aria-label="' in tag
        check(text != '' or labelled, '%s has a link with no accessible text: %s' % (page, tag[:70]))

    # WCAG 2.4.1 applies to blocks repeated across pages. 404.html has no
    # fixed header or nav bar to bypass, so it is exempt while it stays that
    # way; if a header is ever added there, this check starts demanding one.
    skip = re.search(r'<a href="#([^"]+)" class="sr-only', html)
    if '<header' in html:
        check(skip is not None, '%s has a header but no skip link' % page)
    else:
        check(skip is None, '%s has a skip link but no header block to bypass' % page)
    if skip:
        check(skip.group(1) in IDS[page], '%s skip link targets missing #%s' % (page, skip.group(1)))

for target in ['/privacy.html', '/terms.html']:
    check('href="%s"' % target in HTML['index.html'], 'index.html footer does not link %s' % target)


# =====================================================================
# 6. Every class used in the HTML has a rule in the compiled stylesheet.
#     This is what proves the local Tailwind build replaced the Play CDN
#     without dropping a utility, which a browser-side build hid.
# =====================================================================
# Markers that intentionally emit no CSS of their own.
NO_RULE = {'group', 'peer'}


def tw_selector(cls):
    """Class name as Tailwind writes it in a selector (commas hex-escaped)."""
    out = []
    for ch in cls:
        if ch == ',':
            out.append('\\2c ')
        elif ch in ':[]().#!/%':
            out.append('\\' + ch)
        else:
            out.append(ch)
    return '.' + ''.join(out)


used = set()
for page in PAGES:
    for attr in re.findall(r'\sclass="([^"]*)"', HTML[page]):
        used.update(attr.split())

for cls in sorted(used):
    if cls in NO_RULE:
        continue
    pattern = re.escape(tw_selector(cls)) + r'(?![\w\\-])'
    check(re.search(pattern, CSS) is not None,
          'class %r is used in the HTML but has no rule in site.css' % cls)


if __name__ == '__main__':
    print('%d checks, %d failed' % (count, len(failures)))
    for f in failures:
        print('  FAIL ' + f)
    sys.exit(1 if failures else 0)
