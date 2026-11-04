// ---- rail cards ----
const ICON_DEL = '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.6 4.5l.6 8.5h5.6l.6-8.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const partChips = gid => R ? [...new Set(R.boards.filter(b => b.gid === gid).map(b => b.part))].map(l => `<i class="pchip">${l}</i>`).join('') : '';
function boardNth(b) { const G = byId(b.gid); return G && G.count > 1 ? t('board.nth', { name: R.names[b.gid], n: b.i + 1 }) : R.names[b.gid]; }
function boardLabel(b) { return boardNth(b) + (b.part ? ' · ' + b.part : ''); }
function refName(ref, g, side, long) {
  if (ref === 'wall') return ORI[g.orient].walls[side];
  if (ref === 'num') return fmt(side ? g.b : g.a);
  const m = REF_RE.exec(ref || ''), b = m && R && R.boards.find(x => x.gid === Number(m[1]) && x.i === Number(m[2]));
  if (!b) return t('ref.board');
  return long ? boardLabel(b) : boardNth(b);
}
function refOptions(g, which) {
  const side = which === 'bRef' ? 1 : 0, ps = positions(g);
  const center = g.mode === 'even' ? (ps[0] + ps[ps.length - 1] + g.t) / 2 : ps[0];
  const c = refCandidates(state, R.boards, g, center, dependents(state, g.id));
  const opts = [{ v: 'wall', label: ORI[g.orient].walls[side] }, ...(side ? c.end : c.start).map(x => ({ v: x.ref, label: boardLabel(x.b) }))];
  const cur = g[which];
  if (isBoardRef(cur) && !opts.some(o => o.v === cur)) opts.push({ v: cur, label: refName(cur, g, side, true) });
  if (which !== 'posRef') opts.push({ v: 'num', label: t('ref.custom') });
  return opts.map(o => `<option value="${o.v}"${o.v === cur ? ' selected' : ''}>${o.label}</option>`).join('');
}
function summary(g) {
  const where = g.mode === 'even'
    ? t('sum.even', { a: refName(g.aRef, g, 0), b: refName(g.bRef, g, 1) })
    : t('sum.from', { ref: refName(g.posRef, g, 0), v: fmt(g.off) });
  // each segment stays on one line; narrow cards wrap between segments
  return [t('sum.count', { n: g.count }), t('sum.len', { v: fmt(g.L) }), t('sum.thk', { v: fmt(g.t) }), where].map((s, i, a) => `<span>${s}${i < a.length - 1 ? ' ·' : ''}</span>`).join(' ');
}
function calcText(g) {
  if (g.mode === 'even') {
    const c = evenGap(g), range = { a: fmt(g.a), b: fmt(g.b), w: fmt(g.b - g.a) };
    return c < 0 ? `${t('calc.range', range)}<br><span style="color:var(--bad)">${t('calc.noFit')}</span>`
      : `${t('calc.rangeGap', { ...range, c: fmt(c) })}<br><button type="button" class="linkish" data-a="auto">${t('calc.auto')}</button>`;
  }
  const ps = positions(g), last = ps[g.count - 1] + g.t;
  const nxt = refCandidates(state, R.boards, g, last, null).end[0];
  const end = nxt ? boardLabel(nxt.b) : ORI[g.orient].walls[1];
  return t('calc.manual.' + g.orient, { first: fmt(ps[0]), end, last: fmt((nxt ? nxt.face : perpExt(state, g)) - last) });
}
const refField = (g, which, label) => `<label class="fld"><span>${label}</span><span class="num"><select id="r-${g.id}-${which}" data-ref="${which}">${refOptions(g, which)}</select></span></label>`;
const numField = (g, f, label, dis) => `<label class="fld"><span>${label}</span><span class="num"><input id="f-${g.id}-${f}" data-f="${f}" type="number" step="any" inputmode="decimal" value="${fmtNum(g[f])}"${dis ? ' disabled' : ''}><em>mm</em></span></label>`;
function cardBody(g) {
  const o = g.orient, h = o === 'h', even = g.mode === 'even';
  return `<div class="grp-body">
    <div class="row">
      <div class="seg" role="group" aria-label="${t('card.orient')}"><button type="button" data-a="orient" data-v="h" aria-pressed="${h}">${t('short.h')}</button><button type="button" data-a="orient" data-v="v" aria-pressed="${!h}">${t('short.v')}</button></div>
      <div class="stepper"><button type="button" data-a="cnt" data-d="-1" aria-label="${t('card.fewer')}">−</button><input id="f-${g.id}-count" data-f="count" type="number" inputmode="numeric" min="1" max="40" step="1" value="${g.count}" aria-label="${t('card.count')}"><button type="button" data-a="cnt" data-d="1" aria-label="${t('card.more')}">+</button></div>
      <span class="row-lbl">${t('card.pcs')}</span>
    </div>
    <div class="fields two">${numField(g, 'L', t('f.L'))}${numField(g, 't', t('f.t'))}</div>
    <div class="fields two end">${numField(g, 's', t('f.start.' + o))}
      <div class="btn-pair"><button type="button" class="btn sm" data-a="full" title="${t('btn.fullTip')}">${t('btn.full')}</button><button type="button" class="btn sm" data-a="fit" title="${t('btn.fitTip')}">${t('btn.fit')}</button></div></div>
    <div class="row"><span class="row-lbl">${t('card.pos')}</span><div class="seg" role="group" aria-label="${t('card.posMode')}"><button type="button" data-a="mode" data-v="even" aria-pressed="${even}">${t('mode.even')}</button><button type="button" data-a="mode" data-v="manual" aria-pressed="${!even}">${t('mode.manual')}</button></div></div>
    ${even
      ? `<div class="fields two">${refField(g, 'aRef', t('f.aRef'))}${refField(g, 'bRef', t('f.bRef'))}</div>
        ${g.aRef === 'num' || g.bRef === 'num' ? `<div class="fields two">${g.aRef === 'num' ? numField(g, 'a', t('f.a.' + o)) : '<span></span>'}${g.bRef === 'num' ? numField(g, 'b', t('f.b.' + o)) : '<span></span>'}</div>` : ''}`
      : `<div class="fields two">${refField(g, 'posRef', t('f.posRef'))}${numField(g, 'off', t('f.off'))}</div>
        <div class="fields two">${numField(g, 'gap', t('f.gap'), g.count < 2)}<span></span></div>`}
    <div class="calc" data-out="calc">${calcText(g)}</div>
  </div>`;
}
function renderCards() {
  groupsEl.innerHTML = state.groups.map(g => {
    const sel = g.id === ui.sel;
    return `<div class="grp${sel ? ' sel' : ''}" data-g="${g.id}">
      <div class="grp-head" data-a="select" role="button" tabindex="0" aria-expanded="${sel}">
        <span class="glyph ${g.orient}" aria-hidden="true"></span>
        <span class="grp-title"><span class="grp-name"><span data-out="name">${gName(g)}</span><span data-out="parts">${partChips(g.id)}</span></span><span class="grp-sum" data-out="sum">${summary(g)}</span></span>
        <button type="button" class="icon" data-a="del" title="${t('card.delTip')}" aria-label="${t('card.del', { name: gName(g) })}">${ICON_DEL}</button>
      </div>${sel ? cardBody(g) : ''}</div>`;
  }).join('') || `<div class="empty">${t('groups.empty')}</div>`;
  if (R) $('boardCount').textContent = countText();
}
function syncCards(force) {
  groupsEl.querySelectorAll('.grp').forEach(card => {
    const g = byId(Number(card.dataset.g)); if (!g) return;
    card.querySelectorAll('input[data-f]').forEach(inp => {
      if (!force && inp === document.activeElement) return;
      const f = inp.dataset.f, s = f === 'count' ? String(g[f]) : fmtNum(g[f]);
      if (inp.value !== s) inp.value = s;
    });
    const set = (key, html) => { const el = card.querySelector(`[data-out="${key}"]`); if (el && el.innerHTML !== html) el.innerHTML = html; };
    set('name', gName(g)); set('sum', summary(g)); set('parts', partChips(g.id)); set('calc', calcText(g));
    const del = card.querySelector('[data-a="del"]'), lbl = t('card.del', { name: gName(g) });
    if (del && del.getAttribute('aria-label') !== lbl) del.setAttribute('aria-label', lbl);
  });
  $('boardCount').textContent = countText();
}
const countText = () => `${t('count.groups', { n: state.groups.length })} · ${t('count.boards', { n: R.boards.length })}`;
// move the existing cards into list order; the card holding focus never leaves the DOM, so typing or tapping into it carries on
function orderCards() {
  const cards = new Map([...groupsEl.querySelectorAll('.grp')].map(c => [Number(c.dataset.g), c]));
  if (cards.size !== state.groups.length || state.groups.some(g => !cards.has(g.id))) { renderCards(); return; }
  const list = state.groups.map(g => cards.get(g.id)), ae = document.activeElement;
  const fixed = list.find(c => c.contains(ae)), at = list.indexOf(fixed);
  if (!fixed) list.forEach(c => groupsEl.appendChild(c));
  else {
    list.slice(0, at).forEach(c => fixed.before(c));
    let prev = fixed;
    list.slice(at + 1).forEach(c => { prev.after(c); prev = c; });
  }
  syncCards();
  // names in the reference menus changed with the numbering
  groupsEl.querySelectorAll('select[data-ref]').forEach(sel => {
    const g = byId(Number(sel.closest('.grp').dataset.g));
    if (g && sel !== ae) sel.innerHTML = refOptions(g, sel.dataset.ref);
  });
  if (fixed) fixed.scrollIntoView({ block: 'nearest' });
}

// ---- context bar above the drawing ----
const liveText = g => t('live.' + g.orient, { pos: fmt(positions(g)[0]), L: fmt(g.L) });
function renderCtx() {
  const g = ui.sel != null && byId(ui.sel);
  if (g) {
    ctxEl.innerHTML = `<span class="ctx-name"><span class="glyph ${g.orient}" aria-hidden="true"></span><b>${gName(g)}</b></span><span class="mono" id="ctxLive">${liveText(g)}</span><span class="kbd">${t('ctx.keys')}</span><button type="button" class="btn sm danger" data-ctx="del">${t('ctx.del')}</button>`;
    return;
  }
  const c = compAt(ui.comp);
  if (c) {
    const size = c.rect ? `${fmt(c.w)} × ${fmt(c.h)}` : `≈${fmt(c.area / 100)} cm²`;
    ctxEl.innerHTML = `<span>${t('ctx.comp')} <b class="mono">${size}</b></span><span>${t('ctx.addIn')}</span><select id="ctxN" aria-label="${t('ctx.nAria')}">${[1, 2, 3, 4, 5].map(i => `<option value="${i}"${i === ui.ctxN ? ' selected' : ''}>${t('ctx.n', { n: i })}</option>`).join('')}</select><button type="button" class="btn sm" data-ctx="addh">${t('ctx.addH')}</button><button type="button" class="btn sm" data-ctx="addv">${t('ctx.addV')}</button>`;
    return;
  }
  ctxEl.innerHTML = `<span>${t('ctx.hint')}</span>`;
}

// ---- cut list, checks, stock ----
function groupBy(list, keyFn) { const m = new Map(); list.forEach(x => { const key = keyFn(x); if (!m.has(key)) m.set(key, []); m.get(key).push(x); }); return [...m.values()]; }
// one entry per kind of joint on a part; every position is measured from the same end of the cut board
function procLines(p) {
  const o = p.orient, out = [];
  const mid = l => l.map(s => fmt(s.atCut + s.w / 2)).join(' / '), near = l => l.map(s => fmt(s.atCut)).join(' / ');
  const size = l => t('proc.size', { w: fmt(l[0].w), d: fmt(l[0].d) });
  groupBy(p.slots.filter(s => s.kind === 'lap'), s => fmtNum(s.w) + '/' + fmtNum(s.d)).forEach(l =>
    out.push({ head: t('proc.lap.' + o, { n: l.length }), spec: size(l), center: t('proc.center.' + o, { list: mid(l) }), edge: t('proc.edge.' + o, { list: near(l) }) }));
  groupBy(p.slots.filter(s => s.kind === 'dado'), s => s.face + '/' + fmtNum(s.w) + '/' + fmtNum(s.d)).forEach(l =>
    out.push({ head: t('proc.dado.' + l[0].face, { n: l.length }), spec: size(l), center: t('proc.center.' + o, { list: mid(l) }), edge: t('proc.edge.' + o, { list: near(l) }) }));
  groupBy(p.slots.filter(s => s.kind === 'butt'), s => s.face).forEach(l =>
    out.push({ head: t('proc.butt.' + l[0].face, { n: l.length }), spec: t('proc.nail', { h: fmt(state.H / 2) }), center: t('proc.hole.' + o, { list: mid(l) }), edge: '' }));
  return out;
}
function renderLower() {
  const H = state.H;
  $('cutBody').innerHTML = R.parts.map(p => {
    const lines = procLines(p);
    const proc = lines.length ? lines.map(l => `<div class="proc-item"><b>${l.head}</b> · <span class="mono">${l.spec}</span><div class="mono">${l.center}</div>${l.edge ? `<div class="mono muted">${l.edge}</div>` : ''}</div>`).join('') : `<span class="muted">${t('proc.none')}</span>`;
    return `<tr data-part="${p.letter}"${p.letter === ui.hoverPart ? ' class="hl"' : ''}><td><span class="ptag">${p.letter}</span></td><td>${ORI[p.orient].short}</td><td class="mono">${fmt(p.cutL)} × ${fmt(H)} × ${fmt(p.t)}</td><td class="mono c qty">${p.boards.length}</td><td class="proc">${proc}</td></tr>`;
  }).join('') || `<tr><td colspan="5" class="muted">${t('cut.empty')}</td></tr>`;
  const total = R.boards.reduce((s, b) => s + b.cutL, 0);
  $('cutFoot').textContent = R.boards.length ? t('cut.foot', { parts: t('count.parts', { n: R.parts.length }), boards: t('count.boards', { n: R.boards.length }), len: fmt(total / 1000) }) : '';

  const jc = R.jc, notes = [];
  if (state.gap > 0) notes.push(t('note.gap', { g: fmt(state.gap) }));
  if (jc.cross + jc.lap) notes.push(t('note.lap', { d: fmt(H / 2) }));
  if (jc.dado) notes.push(t('note.dado'));
  if (jc.butt) notes.push(t('note.butt', { n: jc.butt }));
  if (R.boards.length) notes.push(t('note.pos'));
  $('cutNotes').innerHTML = notes.map(t => `<li>${t}</li>`).join('');

  const iss = R.issues.length ? R.issues : [{ level: 'ok', gid: null, text: t('iss.ok') }];
  $('issues').innerHTML = iss.map(i => `<li><button type="button" class="iss ${i.level}"${i.gid != null ? ` data-g="${i.gid}"` : ' disabled'}><span class="dot"></span><span>${i.text}</span></button></li>`).join('');
  const nb = R.issues.filter(i => i.level === 'bad').length, nw = R.issues.length - nb;
  $('issCount').innerHTML = (nb ? `<span class="pill bad">${t('iss.bad', { n: nb })}</span> ` : '') + (nw ? `<span class="pill warn">${t('iss.warn', { n: nw })}</span>` : '') || `<span class="pill">${t('iss.pass')}</span>`;

  const runs = packStock(state, R.boards);
  // pick the longest label that fits each piece's on-screen width; the caption under the bar always lists every piece
  const barW = Math.max(80, $('stock').clientWidth - 68);
  const pieceLabel = p => {
    const px = p.len / state.stockLen * barW, full = `${p.part} ${fmt(p.len)}`;
    return textW(full, 11) + 10 <= px ? full : textW(p.part, 11) + 4 <= px ? p.part : '';
  };
  $('stock').innerHTML = runs.length ? runs.map(r => {
    const bars = r.bars.map(bar => `<div class="bar-row"><div class="bar">${bar.items.map((p, i) => `<span class="piece" style="flex:0 0 ${(p.len / state.stockLen * 100).toFixed(3)}%;${i ? `margin-inline-start:${Math.max(0.25, state.kerf / state.stockLen * 100).toFixed(3)}%` : ''}" title="${t('stock.tip', { part: p.part, len: fmt(p.len) })}">${pieceLabel(p)}</span>`).join('')}</div><span class="waste">${t('stock.left', { v: fmt(state.stockLen - bar.used) })}</span><div class="bar-cap">${bar.items.map(p => `${p.part} ${fmt(p.len)}`).join(' · ')}</div></div>`).join('');
    const over = r.over.length ? `<div class="over">${t('stock.over', { parts: [...new Set(r.over.map(p => p.part))].join(t('punct.list')) })}</div>` : '';
    return `<div class="stock-group"><div class="stock-head"><span>${t('stock.head', { size: `<b class="mono">${fmt(H)} × ${r.t}</b>` })}</span><span class="mono">${t('stock.bars', { n: r.bars.length, u: Math.round(r.util * 100) })}</span></div><div class="bars">${bars}</div>${over}</div>`;
  }).join('') : `<p class="hint">${t('stock.empty')}</p>`;
}

// ---- refresh ----
let raf = 0;
function updateLive() { const g = ui.sel != null && byId(ui.sel), el = $('ctxLive'); if (g && el) el.textContent = liveText(g); }
function frame() { R = analyze(state); drawSvg(); renderLower(); syncCards(); updateLive(); arRender(); }
function schedule() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; frame(); }); }
function syncInputs() {
  const set = (id, v) => { const el = $(id); if (el !== document.activeElement) el.value = v; };
  set('inW', fmtNum(state.W)); set('inD', fmtNum(state.D)); set('inH', fmtNum(state.H)); set('inT', fmtNum(state.defT));
  set('inSnap', String(state.snap)); set('inGap', fmtNum(state.gap)); set('inStock', fmtNum(state.stockLen)); set('inKerf', fmtNum(state.kerf));
  document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', String(view[b.dataset.view])));
}
function syncTop() {
  $('undoBtn').disabled = hist.length < 2; $('redoBtn').disabled = !fut.length;
  $('saveNote').textContent = state.sample ? t('save.sample', { name: t('preset.' + state.sample) }) : t('save.note');
}
function renderAll() { R = analyze(state); renderCards(); renderCtx(); drawSvg(); renderLower(); syncInputs(); syncTop(); arRender(); }
let toastTimer = 0;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2800); }

// ---- edits ----
function setOrient(g, o) {
  g.orient = o; g.s = 0; g.L = alongExt(state, g); g.a = 0; g.b = perpExt(state, g); g.mode = 'even';
  g.aRef = 'wall'; g.bRef = 'wall'; g.posRef = 'wall'; g.off = 0;
}
// point both ends of the even split at the nearest parallel boards (or the walls)
function autoRange(g) {
  R = analyze(state);
  const ps = positions(g), center = (ps[0] + ps[ps.length - 1] + g.t) / 2;
  const c = refCandidates(state, R.boards, g, center, dependents(state, g.id));
  g.aRef = c.start.length ? c.start[0].ref : 'wall';
  g.bRef = c.end.length ? c.end[0].ref : 'wall';
}
// keep the first board where it is while measuring it from a new reference
function rebase(g, abs) { resolveRefs(state); g.off = abs - g.base; g.pos = abs; }
function setRef(g, which, v) {
  if (which !== 'posRef') { g[which] = v; return; }
  const abs = positions(g)[0];
  g.posRef = v; rebase(g, abs);
}
function setMode(g, m) {
  if (m === g.mode) return;
  resolveRefs(state);
  if (m === 'manual') {
    const abs = positions(g)[0];
    g.gap = Math.max(0, evenGap(g));
    g.posRef = isBoardRef(g.aRef) ? g.aRef : 'wall';
    g.mode = 'manual';
    rebase(g, abs);
  } else {
    autoRange(g);
    g.mode = 'even';
  }
}
function fitGroup(g) {
  R = analyze(state);
  const h = g.orient === 'h';
  let lo = 0, hi = alongExt(state, g);
  R.boards.filter(b => b.gid === g.id).forEach(b => {
    const sp = freeSpan(state, R.boards, { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 }, h ? 'x' : 'y', bb => bb.gid === g.id);
    lo = Math.max(lo, sp[0]); hi = Math.min(hi, sp[1]);
  });
  if (hi - lo > 1) { g.s = lo; g.L = hi - lo; }
}
function addInComp(orient, pt, count) {
  R = analyze(state);
  const xs = freeSpan(state, R.boards, pt, 'x'), ys = freeSpan(state, R.boards, pt, 'y');
  const h = orient === 'h', [s0, s1] = h ? xs : ys, [a, b, loB, hiB] = h ? ys : xs, thick = state.defT;
  if (b - a < count * thick + 2) { toast(t('toast.noRoom', { w: fmt(b - a), n: count, t: fmt(thick) })); return; }
  // the split range follows the parallel boards that bound this compartment
  const refOf = bb => !bb ? 'wall' : bb.orient === orient ? `b:${bb.gid}:${bb.i}` : 'num';
  const g = normGroup({ id: state.nextId++, orient, count, t: thick, s: s0, L: s1 - s0, mode: 'even', a, b, aRef: refOf(loB), bRef: refOf(hiB) }, state);
  state.groups.push(g); ui.sel = g.id; ui.comp = null;
  commit(); renderAll();
}
function addInLargest(orient) {
  R = analyze(state);
  const c = [...R.comps].sort((p, q) => (q.rect - p.rect) || (q.area - p.area))[0];
  addInComp(orient, c ? { x: c.lx, y: c.ly } : { x: state.W / 2, y: state.D / 2 }, 1);
}
function deleteGroup(id) {
  const g = byId(id); if (!g) return;
  const name = gName(g);
  state.groups = state.groups.filter(x => x.id !== id);
  if (ui.sel === id) ui.sel = null;
  commit(); renderAll(); toast(t('toast.deleted', { name }));
}
function resizeDrawer(nW, nD) {
  const oW = state.W, oD = state.D;
  state.groups.forEach(g => {
    const h = g.orient === 'h', oA = h ? oW : oD, nA = h ? nW : nD, oP = h ? oD : oW, nP = h ? nD : nW;
    if (g.s >= nA - 1) { g.s = 0; g.L = nA; }
    else if (Math.abs(g.s + g.L - oA) < EPS || g.s + g.L > nA) g.L = nA - g.s;
    if (Math.abs(g.b - oP) < EPS || g.b > nP) g.b = nP;
    if (g.a >= g.b) g.a = 0;
  });
  state.W = nW; state.D = nD;
}

// boards of other groups whose ends (or even-split ranges) sit on a face of g follow it when g moves
function computeLinks(g) {
  const links = [], h = g.orient === 'h';
  const mine = R.boards.filter(b => b.gid === g.id);
  state.groups.forEach(G => {
    if (G.id === g.id) return;
    const gb = R.boards.filter(b => b.gid === G.id);
    mine.forEach(mb => {
      const near = h ? mb.y0 : mb.x0, far = h ? mb.y1 : mb.x1;
      if (G.orient !== g.orient) {
        if (!gb.some(b => h ? (b.x0 < mb.x1 - EPS && b.x1 > mb.x0 + EPS) : (b.y0 < mb.y1 - EPS && b.y1 > mb.y0 + EPS))) return;
        [[0, G.s], [1, G.s + G.L]].forEach(([end, val]) => {
          if (links.some(l => l.G === G && l.kind === end)) return;
          const face = Math.abs(val - far) < EPS ? 'far' : Math.abs(val - near) < EPS ? 'near' : null;
          if (face) links.push({ G, kind: end, i: mb.i, face, other: end ? G.s : G.s + G.L });
        });
      } else if (G.mode === 'even') {
        // groups that reference this board already follow it; only typed ranges need a link
        const gA0 = G.s, gA1 = G.s + G.L, mA0 = h ? mb.x0 : mb.y0, mA1 = h ? mb.x1 : mb.y1;
        if (!(gA0 < mA1 - EPS && gA1 > mA0 + EPS)) return;
        if (G.aRef === 'num' && Math.abs(G.a - far) < EPS) links.push({ G, kind: 'a', i: mb.i, face: 'far' });
        if (G.bRef === 'num' && Math.abs(G.b - near) < EPS) links.push({ G, kind: 'b', i: mb.i, face: 'near' });
      }
    });
  });
  return links;
}
function applyLinks(g, links) {
  links.forEach(l => {
    const near = g.pos + l.i * (g.t + g.gap), face = l.face === 'near' ? near : near + g.t, G = l.G;
    if (l.kind === 0) { if (l.other - face >= 5) { G.s = face; G.L = l.other - face; } }
    else if (l.kind === 1) { if (face - l.other >= 5) G.L = face - l.other; }
    else if (l.kind === 'a') { if (G.b - face > G.count * G.t) G.a = face; }
    else if (G.b !== face && face - G.a > G.count * G.t) G.b = face;
  });
}
function movePerp(g, newPos, links) {
  if (g.mode === 'even') setMode(g, 'manual');
  const abs = clamp(newPos, 0, Math.max(0, perpExt(state, g) - groupSpan(g)));
  g.off += abs - g.pos; g.pos = abs;
  applyLinks(g, links);
}
