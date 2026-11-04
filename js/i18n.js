// ---- i18n: each page carries its language's messages as window.I18N (written by tools/build.mjs) ----
const I18N_DATA = (typeof window !== 'undefined' && window.I18N) || { lang: 'zh', dec: '.', msg: {} };
const LANG = I18N_DATA.lang, DEC = I18N_DATA.dec || '.';
const LANG_KEY = 'drawer-divider-planner/lang';
const PLURAL = new Intl.PluralRules(LANG);
// t('key', { n: 3, name: 'A' }) fills {name} placeholders; a message given as { one, few, other, … } picks its form by n
function t(key, p) {
  let m = I18N_DATA.msg[key];
  if (m == null) return key;
  if (typeof m === 'object') m = m[PLURAL.select(p && p.n != null ? p.n : 0)] ?? m.other;
  return p ? m.replace(/\{(\w+)\}/g, (s, k) => (p[k] != null ? String(p[k]) : s)) : m;
}
