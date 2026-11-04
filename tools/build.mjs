#!/usr/bin/env node
// Builds the static site: one page per language (<lang>/index.html) from src/page.html and i18n/<lang>.json,
// the language picker at the root, 404.html, sitemap.xml and robots.txt. No dependencies.
//
//   node tools/build.mjs                 site address from site.json, CNAME or the git remote
//   node tools/build.mjs --url https://name.github.io/drawer_designer/
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const LANGS = ['zh', 'en', 'es', 'de', 'fr', 'ja', 'ko', 'ru', 'ar', 'pt', 'it', 'nl'];
const SOURCE = 'zh';      // the reference translation every other file is checked against
const DEFAULT = 'en';     // where the root page sends browsers whose language is not offered
const SCRIPTS = ['i18n', 'model', 'ar-math', 'drawing', 'panels', 'events', 'preview', 'live-ar', 'main'];
const LANG_KEY = 'drawer-divider-planner/lang';

// title and body fonts per script; Latin and Cyrillic pages share one set
const SANS = '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,system-ui,sans-serif';
const FONTS = {
  zh: { family: 'Noto+Serif+SC', title: '"Noto Serif SC","Songti SC","STSong","SimSun",serif', body: '-apple-system,BlinkMacSystemFont,"PingFang SC","Hiragino Sans GB","Noto Sans SC","Microsoft YaHei","Segoe UI",system-ui,sans-serif' },
  ja: { family: 'Noto+Serif+JP', title: '"Noto Serif JP","Hiragino Mincho ProN","Yu Mincho",serif', body: '-apple-system,BlinkMacSystemFont,"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic UI","Meiryo","Noto Sans JP",system-ui,sans-serif' },
  ko: { family: 'Noto+Serif+KR', title: '"Noto Serif KR","AppleMyungjo","Batang",serif', body: '-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",system-ui,sans-serif' },
  // Arabic letters must join: after the Latin mono font comes the proportional body font, never a monospaced Arabic fallback
  ar: { family: 'Noto+Naskh+Arabic', title: '"Noto Naskh Arabic","Geeza Pro","Traditional Arabic",serif', body: '-apple-system,BlinkMacSystemFont,"Segoe UI","Geeza Pro","Noto Sans Arabic",Tahoma,system-ui,sans-serif', mono: '"IBM Plex Mono","Geeza Pro","Segoe UI","Noto Sans Arabic",Tahoma,sans-serif' },
  latin: { family: 'Noto+Serif', title: '"Noto Serif",Georgia,"Times New Roman",serif', body: SANS },
};

const read = p => readFileSync(join(ROOT, p), 'utf8');
const write = (p, s) => { mkdirSync(join(ROOT, p, '..'), { recursive: true }); writeFileSync(join(ROOT, p), s); };
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const jsonInScript = o => JSON.stringify(o).replace(/</g, '\\u003c');
const stripTags = s => s.replace(/<[^>]+>/g, '');
const hash = p => createHash('sha1').update(readFileSync(join(ROOT, p))).digest('hex').slice(0, 8);
const errors = [], warnings = [];

// ---- site address and repository ----
function gitRemote() {
  try {
    const r = execSync('git remote get-url origin', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    const m = /github\.com[:/]([^/]+)\/(.+?)(\.git)?$/.exec(r);
    return m ? { user: m[1], repo: m[2] } : null;
  } catch (_) { return null; }
}
const withSlash = u => (u.endsWith('/') ? u : u + '/');
function site() {
  const cfg = existsSync(join(ROOT, 'site.json')) ? JSON.parse(read('site.json')) : {};
  const gh = gitRemote(), i = process.argv.indexOf('--url');
  const repo = cfg.repo || (gh ? `https://github.com/${gh.user}/${gh.repo}` : '');
  let url = i > 0 ? process.argv[i + 1] : cfg.url;
  if (!url && existsSync(join(ROOT, 'CNAME'))) url = 'https://' + read('CNAME').trim();
  if (!url && gh) {
    const user = gh.user.toLowerCase();
    url = gh.repo.toLowerCase() === user + '.github.io' ? `https://${user}.github.io/` : `https://${user}.github.io/${gh.repo}/`;
  }
  if (!url) {
    url = `https://USERNAME.github.io/${basename(ROOT)}/`;
    warnings.push(`no site address found; using ${url}. Set "url" in site.json (or add the GitHub remote) and build again.`);
  }
  return { url: withSlash(url), repo, verify: cfg.verify || {} };
}

// ---- translations ----
const placeholders = s => new Set([...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]));
const forms = v => (typeof v === 'string' ? { other: v } : v);
function check(code, data, ref) {
  for (const section of ['lang', 'meta', 'page', 'app']) {
    const a = ref[section], b = data[section] || {};
    for (const key of Object.keys(a)) {
      if (b[key] == null) { errors.push(`${code}: missing ${section}.${key}`); continue; }
      if (section === 'lang') continue;
      const want = new Set(Object.values(forms(a[key])).flatMap(s => [...placeholders(s)]));
      const f = forms(b[key]);
      if (f.other == null) { errors.push(`${code}: ${section}.${key} has plural forms but no "other"`); continue; }
      for (const [form, s] of Object.entries(f)) {
        const have = placeholders(s);
        for (const p of want) if (!have.has(p) && !(p === 'n' && form !== 'other')) errors.push(`${code}: ${section}.${key} (${form}) lacks {${p}}`);
        for (const p of have) if (!want.has(p)) errors.push(`${code}: ${section}.${key} (${form}) has unknown {${p}}`);
        const tags = x => (x.match(/<\/?\w+/g) || []).length;
        if (tags(s) !== tags(Object.values(forms(a[key]))[0])) warnings.push(`${code}: ${section}.${key} (${form}) has different markup from ${SOURCE}`);
      }
    }
    for (const key of Object.keys(b)) if (a[key] == null) warnings.push(`${code}: unused ${section}.${key}`);
  }
}

// ---- pages ----
function fill(tpl, dict, extra, code) {
  return tpl.replace(/\{\{\{(\w+)\}\}\}|\{\{(@?\w+)\}\}/g, (m, raw, key) => {
    if (raw) { if (dict[raw] == null) errors.push(`${code}: template needs page.${raw}`); return dict[raw] ?? ''; }
    if (key[0] === '@') return extra[key.slice(1)] ?? '';
    if (dict[key] == null) errors.push(`${code}: template needs page.${key}`);
    return esc(dict[key] ?? '');
  });
}
function alternates(S, all) {
  return [...LANGS.map(c => `<link rel="alternate" hreflang="${all[c].lang.hreflang}" href="${S.url}${c}/">`),
    `<link rel="alternate" hreflang="x-default" href="${S.url}">`];
}
function socialTags(S, all, code, url) {
  const d = all[code], img = `${S.url}og/${code}.png`;
  if (!existsSync(join(ROOT, 'og', code + '.png'))) warnings.push(`${code}: og/${code}.png is missing`);
  return [
    '<meta property="og:type" content="website">',
    `<meta property="og:site_name" content="${esc(d.page.h1)}">`,
    `<meta property="og:title" content="${esc(d.meta.title)}">`,
    `<meta property="og:description" content="${esc(d.meta.description)}">`,
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:image" content="${img}">`,
    '<meta property="og:image:width" content="1200">', '<meta property="og:image:height" content="630">',
    `<meta property="og:image:alt" content="${esc(d.page.h1)}">`,
    `<meta property="og:locale" content="${d.lang.ogLocale}">`,
    ...LANGS.filter(c => c !== code).map(c => `<meta property="og:locale:alternate" content="${all[c].lang.ogLocale}">`),
    '<meta name="twitter:card" content="summary_large_image">',
  ];
}
const verifyTags = S => [
  S.verify.google && `<meta name="google-site-verification" content="${esc(S.verify.google)}">`,
  S.verify.bing && `<meta name="msvalidate.01" content="${esc(S.verify.bing)}">`,
  S.verify.yandex && `<meta name="yandex-verification" content="${esc(S.verify.yandex)}">`,
  S.verify.baidu && `<meta name="baidu-site-verification" content="${esc(S.verify.baidu)}">`,
].filter(Boolean);
const themeTags = ['<meta name="theme-color" content="#ECEFEA" media="(prefers-color-scheme: light)">', '<meta name="theme-color" content="#121714" media="(prefers-color-scheme: dark)">', '<meta name="color-scheme" content="light dark">'];

function langPage(S, all, code, tpl) {
  const d = all[code], url = `${S.url}${code}/`, F = FONTS[code] || FONTS.latin;
  const langOptions = LANGS.map(c => `<option value="${c}" lang="${all[c].lang.htmlLang}"${c === code ? ' selected' : ''}>${esc(all[c].lang.name)}</option>`).join('');
  const langLinks = LANGS.map(c => `<a href="../${c}/" hreflang="${all[c].lang.hreflang}" lang="${all[c].lang.htmlLang}" data-lang="${c}"${c === code ? ' aria-current="page"' : ''}>${esc(all[c].lang.name)}</a>`).join('');
  const repoLink = S.repo ? `<p><a href="${esc(S.repo)}" rel="noopener">${esc(d.page.repoLink)}</a></p>` : '';
  const body = fill(tpl.replace(/^<!--[\s\S]*?-->\n/, ''), d.page, { langOptions, langLinks, repoLink }, code);
  const ld = {
    '@context': 'https://schema.org', '@type': 'WebApplication', name: d.page.h1, url, description: d.meta.description,
    inLanguage: d.lang.htmlLang, applicationCategory: 'DesignApplication', operatingSystem: 'Any',
    browserRequirements: d.meta.requirements, isAccessibleForFree: true, image: `${S.url}og/${code}.png`,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    featureList: ['aboutF1', 'aboutF2', 'aboutF3', 'aboutF4', 'aboutF5'].map(k => stripTags(d.page[k]).trim()),
    ...(S.repo ? { sameAs: S.repo } : {}),
  };
  return [
    '<!doctype html>',
    `<html lang="${d.lang.htmlLang}" dir="${d.lang.dir}">`,
    '<!-- Generated by tools/build.mjs from src/page.html and i18n/' + code + '.json. Edit those, then run the build. -->',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">',
    `<title>${esc(d.meta.title)}</title>`,
    `<meta name="description" content="${esc(d.meta.description)}">`,
    ...verifyTags(S),
    `<link rel="canonical" href="${url}">`,
    ...alternates(S, all),
    ...socialTags(S, all, code, url),
    ...themeTags,
    '<link rel="icon" href="../favicon.svg" type="image/svg+xml">',
    '<link rel="apple-touch-icon" href="../apple-touch-icon.png">',
    '<link rel="preconnect" href="https://fonts.googleapis.com">',
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
    `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=${F.family}:wght@600;700&display=swap">`,
    `<link rel="stylesheet" href="../css/style.css?v=${hash('css/style.css')}">`,
    `<style>:root{--f-title:${F.title};--f-body:${F.body}${F.mono ? `;--f-mono:${F.mono}` : ''}}</style>`,
    `<script type="application/ld+json">${jsonInScript(ld)}</script>`,
    '</head>',
    '<body>',
    '<!-- page:start -->',
    body.trimEnd(),
    '<!-- page:end -->',
    `<script>window.I18N=${jsonInScript({ lang: code, dec: d.lang.dec, msg: d.app })};</script>`,
    ...SCRIPTS.map(f => `<script src="../js/${f}.js?v=${hash(`js/${f}.js`)}"></script>`),
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

const PICKER_CSS = `:root{color-scheme:light dark;--bg:#ECEFEA;--panel:#FAFBF8;--ink:#1C2420;--muted:#5B6760;--line:#D5DBD4;--accent:#2B6A4C}
@media (prefers-color-scheme:dark){:root{--bg:#121714;--panel:#1A211D;--ink:#E2E8E3;--muted:#95A199;--line:#2D3731;--accent:#77C79C}}
*{box-sizing:border-box}html,body{margin:0;background:var(--bg);color:var(--ink)}
body{font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC","Hiragino Sans","Apple SD Gothic Neo","Noto Sans",Arial,sans-serif;padding:40px 16px}
main{max-width:760px;margin:0 auto;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:24px}
h1{font-size:22px;margin:0 0 4px;display:flex;gap:10px;align-items:center}h1 svg{color:var(--accent);flex:none}
p{margin:0 0 18px;color:var(--muted)}ul{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:8px}
a{display:block;padding:10px 12px;border:1px solid var(--line);border-radius:9px;color:var(--ink);text-decoration:none}a:hover{border-color:var(--accent)}
a b{display:block}a span{font-size:12.5px;color:var(--muted)}`;
const MARK = '<svg viewBox="0 0 28 28" width="30" height="30" aria-hidden="true"><rect x="2.5" y="4.5" width="23" height="19" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M2.5 11.5h23M10.5 11.5v12M17.5 11.5v12M14 4.5v7" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
const langList = (all, prefix) => `<ul>${LANGS.map(c => `<li><a href="${prefix}${c}/" hreflang="${all[c].lang.hreflang}" lang="${all[c].lang.htmlLang}" dir="${all[c].lang.dir}" data-lang="${c}"><b>${esc(all[c].lang.name)}</b><span>${esc(all[c].page.h1)}</span></a></li>`).join('')}</ul>`;

// the root: language picker that sends visitors to their saved or browser language (hreflang x-default)
function pickerPage(S, all) {
  const d = all[DEFAULT];
  return `<!doctype html>
<html lang="${d.lang.htmlLang}" dir="ltr">
<!-- Generated by tools/build.mjs. -->
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(d.meta.title)}</title>
<meta name="description" content="${esc(d.meta.description)}">
${[...verifyTags(S), `<link rel="canonical" href="${S.url}">`, ...alternates(S, all), ...socialTags(S, all, DEFAULT, S.url), ...themeTags].join('\n')}
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<script>
// saved choice first, then the browser's languages, else ${DEFAULT}
(function () {
  var L = ${JSON.stringify(LANGS)}, want = null;
  try { want = localStorage.getItem(${JSON.stringify(LANG_KEY)}); } catch (e) {}
  if (L.indexOf(want) < 0) want = null;
  (navigator.languages || [navigator.language || '']).some(function (l) { l = String(l).toLowerCase().split('-')[0]; if (!want && L.indexOf(l) >= 0) want = l; return !!want; });
  location.replace((want || ${JSON.stringify(DEFAULT)}) + '/' + location.hash);
})();
</script>
<style>${PICKER_CSS}</style>
</head>
<body>
<main>
<h1>${MARK}${esc(d.page.h1)}</h1>
<p>${esc(d.meta.description)}</p>
${langList(all, '')}
</main>
</body>
</html>
`;
}
function notFoundPage(S, all) {
  return `<!doctype html>
<html lang="en">
<!-- Generated by tools/build.mjs. -->
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>404 · ${esc(all[DEFAULT].page.h1)}</title>
<link rel="icon" href="${S.url}favicon.svg" type="image/svg+xml">
<style>${PICKER_CSS}</style>
</head>
<body>
<main>
<h1>${MARK}404</h1>
<p>This page does not exist. Pick a language to open the designer.</p>
${langList(all, S.url)}
</main>
</body>
</html>
`;
}
function sitemap(S, all) {
  const links = [...LANGS.map(c => `    <xhtml:link rel="alternate" hreflang="${all[c].lang.hreflang}" href="${S.url}${c}/"/>`),
    `    <xhtml:link rel="alternate" hreflang="x-default" href="${S.url}"/>`].join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${LANGS.map(c => `  <url>\n    <loc>${S.url}${c}/</loc>\n${links}\n  </url>`).join('\n')}
</urlset>
`;
}

// ---- run ----
const S = site();
const all = Object.fromEntries(LANGS.map(c => {
  try { return [c, JSON.parse(read(`i18n/${c}.json`))]; } catch (e) { errors.push(`${c}: i18n/${c}.json ${e.message}`); return [c, null]; }
}));
if (!all[SOURCE]) { console.error(errors.join('\n')); process.exit(1); }
LANGS.filter(c => c !== SOURCE && all[c]).forEach(c => check(c, all[c], all[SOURCE]));
if (errors.length) { console.error('Build stopped:\n  ' + errors.join('\n  ')); process.exit(1); }

const tpl = read('src/page.html');
LANGS.forEach(c => write(`${c}/index.html`, langPage(S, all, c, tpl)));
if (errors.length) { console.error('Build stopped:\n  ' + errors.join('\n  ')); process.exit(1); }
write('index.html', pickerPage(S, all));
write('404.html', notFoundPage(S, all));
write('sitemap.xml', sitemap(S, all));
write('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${S.url}sitemap.xml\n`);
warnings.forEach(w => console.warn('warning: ' + w));
console.log(`Built ${LANGS.length} languages for ${S.url}`);
