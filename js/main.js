
// ---- start ----
state = load();
if (!state) state = presetState('classic');
hist = [JSON.stringify(state)]; lastSig = sigOf(state);
renderAll();
if ('ResizeObserver' in window) {
  new ResizeObserver(() => schedule()).observe(wrap);
  new ResizeObserver(() => arRender()).observe($('arStage'));
}
if ('IntersectionObserver' in window) new IntersectionObserver(entries => {
  ar.visible = entries[0].isIntersecting;
  if (ar.visible) arRender();
}, { rootMargin: '200px' }).observe($('ar'));
window.addEventListener('resize', schedule);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);
initDownloads();
initLiveAR();
// language menu and footer links: remember the choice, which the root page uses to pick a language
const rememberLang = code => { try { localStorage.setItem(LANG_KEY, code); } catch (_) { /* storage unavailable */ } };
const langSel = $('langSel');
if (langSel) langSel.addEventListener('change', () => { rememberLang(langSel.value); location.href = '../' + langSel.value + '/'; });
document.querySelectorAll('a[data-lang]').forEach(a => a.addEventListener('click', () => rememberLang(a.dataset.lang)));
