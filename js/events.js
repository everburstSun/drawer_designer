// ---- drawing interactions ----
function toMM(e) { const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; return p.matrixTransform(svg.getScreenCTM().inverse()); }
const snapGrid = v => { const s = state.snap || 0.5; return Math.round(v / s) * s; };
function snapTo(v, cands) { let best = null, bd = 8 / k; for (const c of cands) { const d = Math.abs(v - c); if (d < bd) { bd = d; best = c; } } return best; }
function alongCands(g) {
  const h = g.orient === 'h', out = [0, alongExt(state, g)];
  R.boards.forEach(b => { if (b.gid !== g.id && b.orient !== g.orient) { if (h) out.push(b.x0, b.x1); else out.push(b.y0, b.y1); } });
  return out;
}
let drag = null;
svg.addEventListener('pointerdown', e => {
  if (e.button !== 0) return;
  const ae = document.activeElement;
  if (ae && ae !== document.body && ae.blur) ae.blur();
  const el = e.target.closest('[data-act]');
  if (!el) { ui.sel = null; ui.comp = null; renderCards(); renderCtx(); schedule(); return; }
  const act = el.dataset.act;
  if (act === 'comp') { ui.sel = null; ui.comp = toMM(e); renderCards(); renderCtx(); schedule(); return; }
  const g = byId(Number(el.dataset.g)); if (!g) return;
  e.preventDefault();
  const changed = ui.sel !== g.id;
  ui.sel = g.id; ui.comp = null;
  drag = { act, g, end: Number(el.dataset.end), start: toMM(e), s0: g.s, L0: g.L, pos0: positions(g)[0], pid: e.pointerId, moved: false, links: act === 'board' ? computeLinks(g) : [] };
  try { svg.setPointerCapture(e.pointerId); } catch (_) { /* capture unsupported */ }
  if (changed) { renderCards(); renderCtx(); }
  schedule();
});
svg.addEventListener('pointermove', e => {
  if (!drag || e.pointerId !== drag.pid) return;
  const pt = toMM(e), dx = pt.x - drag.start.x, dy = pt.y - drag.start.y, g = drag.g, h = g.orient === 'h';
  if (!drag.moved) {
    if (Math.hypot(dx, dy) * k < 3) return;
    drag.moved = true; document.body.classList.add('dragging');
    if (drag.act === 'board' && g.mode === 'even') { setMode(g, 'manual'); renderCards(); renderCtx(); }
  }
  const dA = h ? dx : dy, dP = h ? dy : dx, A = alongExt(state, g), cands = alongCands(g);
  if (drag.act === 'board') {
    const base = g.base || 0; // grid-snap the distance from the reference, not the wall
    movePerp(g, base + snapGrid(drag.pos0 + dP - base), drag.links);
    let s = drag.s0 + dA;
    const c1 = snapTo(s, cands), c2 = snapTo(s + g.L, cands);
    if (c1 != null && (c2 == null || Math.abs(c1 - s) <= Math.abs(c2 - s - g.L))) s = c1;
    else if (c2 != null) s = c2 - g.L;
    else s = snapGrid(s);
    g.s = clamp(s, 0, Math.max(0, A - g.L));
  } else if (drag.end === 0) {
    const endPos = drag.s0 + drag.L0, v = drag.s0 + dA, c = snapTo(v, cands);
    g.s = clamp(c != null ? c : snapGrid(v), 0, endPos - 5); g.L = endPos - g.s;
  } else {
    const v = drag.s0 + drag.L0 + dA, c = snapTo(v, cands);
    g.L = clamp(c != null ? c : snapGrid(v), drag.s0 + 5, A) - drag.s0;
  }
  schedule();
});
function endDrag(e) {
  if (!drag || (e && e.pointerId !== drag.pid)) return;
  const moved = drag.moved; drag = null;
  document.body.classList.remove('dragging');
  if (moved) { commit(); R = analyze(state); renderCards(); }
  schedule();
}
svg.addEventListener('pointerup', endDrag);
svg.addEventListener('pointercancel', endDrag);

// ---- rail ----
groupsEl.addEventListener('click', e => {
  const btn = e.target.closest('[data-a]'); if (!btn) return;
  const card = btn.closest('.grp'), g = card && byId(Number(card.dataset.g)); if (!g) return;
  const a = btn.dataset.a;
  if (a === 'select') { ui.sel = ui.sel === g.id ? null : g.id; ui.comp = null; renderCards(); renderCtx(); schedule(); return; }
  if (a === 'del') { deleteGroup(g.id); return; }
  if (a === 'orient') { if (g.orient === btn.dataset.v) return; setOrient(g, btn.dataset.v); }
  else if (a === 'cnt') g.count = clamp(g.count + Number(btn.dataset.d), 1, 40);
  else if (a === 'full') { g.s = 0; g.L = alongExt(state, g); }
  else if (a === 'fit') fitGroup(g);
  else if (a === 'mode') setMode(g, btn.dataset.v);
  else if (a === 'auto') autoRange(g);
  commit(); R = analyze(state); renderCards(); renderCtx(); schedule();
});
groupsEl.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.grp-head')) { e.preventDefault(); e.target.click(); }
});
groupsEl.addEventListener('input', e => {
  const inp = e.target.closest('input[data-f]'); if (!inp) return;
  const g = byId(Number(inp.closest('.grp').dataset.g)); if (!g) return;
  let v = parseFloat(inp.value); if (!Number.isFinite(v)) return;
  const f = inp.dataset.f;
  if (f === 'count') v = clamp(Math.round(v), 1, 40);
  else if (f === 't') v = clamp(v, 1, 100);
  else if (f === 'L') v = Math.max(1, v);
  else if (f === 's' || f === 'gap' || f === 'a' || f === 'b' || f === 'off') v = Math.max(0, v);
  g[f] = v;
  if (f === 'count') { const gapIn = inp.closest('.grp').querySelector('input[data-f="gap"]'); if (gapIn) gapIn.disabled = g.count < 2; }
  schedule();
});
groupsEl.addEventListener('change', e => {
  const sel = e.target.closest('select[data-ref]');
  if (sel) {
    const g = byId(Number(sel.closest('.grp').dataset.g)); if (!g) return;
    setRef(g, sel.dataset.ref, sel.value);
    commit(); R = analyze(state); renderCards(); renderCtx(); schedule();
    return;
  }
  if (e.target.matches('input[data-f]')) { commit(); R = analyze(state); syncCards(true); }
});
document.querySelectorAll('[data-add]').forEach(b => b.addEventListener('click', () => addInLargest(b.dataset.add)));
// a tap anywhere on the drawing panel outside the drawing and its controls clears the selection (click, so a scroll does not)
document.querySelector('.stage-inner').addEventListener('click', e => {
  if (e.target.closest('svg, button, select, input, label, a') || (ui.sel == null && !ui.comp)) return;
  ui.sel = null; ui.comp = null; renderCards(); renderCtx(); schedule();
});

// ---- drawer + processing inputs ----
$('inW').addEventListener('change', e => { resizeDrawer(clampN(e.target.value, 100, 2400, state.W), state.D); commit(); renderAll(); });
$('inD').addEventListener('change', e => { resizeDrawer(state.W, clampN(e.target.value, 100, 2400, state.D)); commit(); renderAll(); });
[['inH', 'H', 10, 300], ['inGap', 'gap', 0, 5], ['inStock', 'stockLen', 200, 6000], ['inKerf', 'kerf', 0, 10]].forEach(([id, f, lo, hi]) => {
  $(id).addEventListener('input', e => { const v = parseFloat(e.target.value); if (Number.isFinite(v) && v >= lo && v <= hi) { state[f] = v; schedule(); } });
  $(id).addEventListener('change', e => { state[f] = clampN(e.target.value, lo, hi, state[f]); commit(); syncInputs(); schedule(); });
});
$('inT').addEventListener('change', e => { state.defT = clampN(e.target.value, 3, 50, state.defT); commit(); syncInputs(); });
$('inSnap').addEventListener('change', e => { state.snap = Number(e.target.value); commit(); });

// ---- view chips, context bar, lower panels ----
document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => {
  view[b.dataset.view] = !view[b.dataset.view]; b.setAttribute('aria-pressed', String(view[b.dataset.view])); save(); schedule();
}));
ctxEl.addEventListener('click', e => {
  const b = e.target.closest('[data-ctx]'); if (!b) return;
  if (b.dataset.ctx === 'del' && ui.sel != null) deleteGroup(ui.sel);
  else if (b.dataset.ctx === 'addh' || b.dataset.ctx === 'addv') { if (ui.comp) addInComp(b.dataset.ctx === 'addh' ? 'h' : 'v', ui.comp, ui.ctxN); }
});
ctxEl.addEventListener('change', e => { if (e.target.id === 'ctxN') ui.ctxN = Number(e.target.value); });
$('cutBody').addEventListener('mouseover', e => {
  const tr = e.target.closest('tr[data-part]'), p = tr ? tr.dataset.part : null;
  if (p !== ui.hoverPart) { ui.hoverPart = p; schedule(); }
});
$('cutBody').addEventListener('mouseleave', () => { if (ui.hoverPart) { ui.hoverPart = null; schedule(); } });
$('issues').addEventListener('click', e => {
  const b = e.target.closest('[data-g]'); if (!b) return;
  ui.sel = Number(b.dataset.g); ui.comp = null; renderCards(); renderCtx(); schedule();
  const card = groupsEl.querySelector(`.grp[data-g="${ui.sel}"]`); if (card) card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
});

// ---- header tools ----
$('undoBtn').addEventListener('click', undo);
$('redoBtn').addEventListener('click', redo);
$('presetSel').innerHTML += PRESETS.map(p => `<option value="${p.key}">${t('preset.option', { name: t('preset.' + p.key), W: p.W, D: p.D })}</option>`).join('');
$('presetSel').addEventListener('change', e => {
  const key = e.target.value; if (!key) return;
  const { snap, gap, stockLen, kerf, defT } = state;
  state = presetState(key, { snap, gap, stockLen, kerf, defT });
  ui.sel = null; ui.comp = null; commit({ keepSample: true }); renderAll();
  toast(t('toast.sample', { name: t('preset.' + key) })); e.target.value = '';
});
$('clearBtn').addEventListener('click', () => {
  if (!state.groups.length) return;
  state.groups = []; ui.sel = null; ui.comp = null; commit(); renderAll(); toast(t('toast.cleared'));
});
function exportText() {
  const { W, D, H, defT, gap, stockLen, kerf } = state;
  // board references are written by group index so they survive renumbering on import
  const idx = new Map(state.groups.map((g, i) => [g.id, i]));
  const toIdx = r => { const m = REF_RE.exec(r || ''); return !m ? r : idx.has(Number(m[1])) ? `i:${idx.get(Number(m[1]))}:${m[2]}` : 'wall'; };
  const groups = state.groups.map(({ id, base, ...g }) => ({ ...g, aRef: toIdx(g.aRef), bRef: toIdx(g.bRef), posRef: toIdx(g.posRef) }));
  return JSON.stringify({ app: 'drawer-dividers', version: 2, W, D, H, defT, gap, stockLen, kerf, groups }, null, 2);
}
function cutText() {
  const lines = [t('copy.head', { W: fmt(state.W), D: fmt(state.D), H: fmt(state.H) }), ''];
  R.parts.forEach(p => {
    const proc = procLines(p).map(l => t('copy.item', { head: l.head, details: [l.spec, l.center, l.edge].filter(Boolean).join(t('punct.comma')) })).join(t('punct.semi')) || t('copy.plain');
    lines.push(`${p.letter}  ${ORI[p.orient].short}  ${fmt(p.cutL)} × ${fmt(state.H)} × ${fmt(p.t)}  ×${p.boards.length}  ${proc}`);
  });
  return lines.join('\n');
}
function openDlg(title, hint, text, canImport) {
  $('dlgTitle').textContent = title; $('dlgHint').textContent = hint; $('dlgText').value = text; $('dlgMsg').textContent = '';
  $('dlgImport').hidden = !canImport; $('dlg').hidden = false; $('dlgText').focus(); $('dlgText').select();
}
function closeDlg() { $('dlg').hidden = true; }
function copyText(text, okMsg, title) {
  const fallback = () => openDlg(title, t('copy.fallback'), text, false);
  try { navigator.clipboard.writeText(text).then(() => toast(okMsg), fallback); } catch (_) { fallback(); }
}
$('dataBtn').addEventListener('click', () => openDlg(t('data.title'), t('data.hint'), exportText(), true));
$('copyCut').addEventListener('click', () => copyText(cutText(), t('toast.cutCopied'), t('cut.title')));
$('dlgClose').addEventListener('click', closeDlg);
$('dlg').addEventListener('click', e => { if (e.target === $('dlg')) closeDlg(); });
$('dlgCopy').addEventListener('click', () => {
  const ta = $('dlgText'); ta.focus(); ta.select();
  try { navigator.clipboard.writeText(ta.value).then(() => toast(t('toast.copied')), () => toast(t('toast.copyKeys'))); } catch (_) { toast(t('toast.copyKeys')); }
});
$('dlgImport').addEventListener('click', () => {
  try {
    const o = JSON.parse($('dlgText').value);
    if (!o || typeof o !== 'object' || !Array.isArray(o.groups)) throw new Error('bad');
    state = normState({ ...o, snap: state.snap, sample: null });
    ui.sel = null; ui.comp = null; commit(); renderAll(); closeDlg();
    toast(t('toast.imported', { n: state.groups.length }));
  } catch (_) { $('dlgMsg').textContent = t('data.bad'); }
});

// ---- keyboard ----
document.addEventListener('keydown', e => {
  if (!$('dlg').hidden) { if (e.key === 'Escape') closeDlg(); return; }
  const tag = e.target.tagName, typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  const mod = e.metaKey || e.ctrlKey, key = e.key.toLowerCase();
  if (mod && (key === 'z' || key === 'y')) { if (typing) return; e.preventDefault(); if (key === 'y' || e.shiftKey) redo(); else undo(); return; }
  if (typing || mod) return;
  if (e.key === 'Escape') { ui.sel = null; ui.comp = null; renderCards(); renderCtx(); schedule(); return; }
  const g = ui.sel != null && byId(ui.sel); if (!g) return;
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteGroup(g.id); return; }
  const d = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[e.key]; if (!d) return;
  e.preventDefault();
  R = analyze(state);
  const step = e.shiftKey ? 10 : 1, h = g.orient === 'h';
  const dP = (h ? d[1] : d[0]) * step, dA = (h ? d[0] : d[1]) * step;
  if (dP) { const was = g.mode; movePerp(g, positions(g)[0] + dP, computeLinks(g)); if (was !== g.mode) renderCards(); }
  if (dA) g.s = clamp(g.s + dA, 0, Math.max(0, alongExt(state, g) - g.L));
  commitSoon(); schedule();
});
