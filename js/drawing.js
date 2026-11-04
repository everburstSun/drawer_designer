// ---- page state, history, drawing ----
const $ = id => document.getElementById(id);
const svg = $('svg'), scene = $('scene'), wrap = $('wrap'), groupsEl = $('groups'), ctxEl = $('ctx');
const KEY = 'drawer-divider-planner/v1';
const view = { dims: true, parts: false, joints: true };
const ui = { sel: null, comp: null, hoverPart: null, ctxN: 1 };
let state = null, R = null, k = 1;
let hist = [], fut = [], lastSig = '', commitTimer = 0;

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (o.view) Object.keys(view).forEach(key => { if (typeof o.view[key] === 'boolean') view[key] = o.view[key]; });
    return o.state && Array.isArray(o.state.groups) ? normState(o.state) : null;
  } catch (_) { return null; }
}
function save() { try { localStorage.setItem(KEY, JSON.stringify({ state, view })); } catch (_) { /* storage unavailable */ } }

const sigOf = st => { const { sample, ...rest } = st; return JSON.stringify(rest); };
function commit(opts) {
  clearTimeout(commitTimer); commitTimer = 0;
  resolveRefs(state);
  // keep the list in part-letter order; renumbered names show up in place, without dropping focus from a card field
  if (sortGroups(state)) { R = analyze(state); orderCards(); renderCtx(); schedule(); }
  const sig = sigOf(state);
  if (sig === lastSig) return;
  if (!(opts && opts.keepSample)) state.sample = null;
  hist.push(JSON.stringify(state)); lastSig = sig;
  if (hist.length > 150) hist.shift();
  fut.length = 0;
  save(); syncTop();
}
function commitSoon() { clearTimeout(commitTimer); commitTimer = setTimeout(commit, 450); }
function flushCommit() { if (commitTimer) commit(); }
function restore(json) {
  state = JSON.parse(json); lastSig = sigOf(state);
  if (ui.sel != null && !byId(ui.sel)) ui.sel = null;
  ui.comp = null; save(); renderAll();
}
function undo() { flushCommit(); if (hist.length < 2) return; fut.push(hist.pop()); restore(hist[hist.length - 1]); }
function redo() { if (!fut.length) return; const s = fut.pop(); hist.push(s); restore(s); }

const byId = id => state.groups.find(g => g.id === id) || null;
const gName = g => (R && R.names[g.id]) || groupNames(state)[g.id];

// ---- svg ----
function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const grainCache = { key: '', d: '' };
function grainPath(W, D) {
  const key = W + 'x' + D;
  if (grainCache.key === key) return grainCache.d;
  const rnd = mulberry32(17); let d = '';
  for (let y = 3; y < D; y += 5 + rnd() * 9) {
    const amp = 0.5 + rnd() * 2.4, f1 = 0.004 + rnd() * 0.012, ph = rnd() * 6.3;
    d += `M0 ${y.toFixed(1)}`;
    for (let x = 16; x <= W + 16; x += 16) d += `L${x} ${(y + amp * Math.sin(x * f1 + ph) + 0.7 * Math.sin(x * f1 * 2.7 + ph * 1.3)).toFixed(1)}`;
  }
  grainCache.key = key; grainCache.d = d;
  return d;
}
function textW(s, fs) { let w = 0; for (const ch of s) w += ch.charCodeAt(0) > 255 ? fs : fs * 0.62; return w; }
function compAt(pt) {
  if (!R || !pt) return null;
  const G = R.grid, fi = (arr, v) => { for (let i = 0; i < arr.length - 1; i++) if (v >= arr[i] && v < arr[i + 1]) return i; return -1; };
  const i = fi(G.xs, pt.x), j = fi(G.ys, pt.y);
  if (i < 0 || j < 0) return null;
  const ci = G.cellComp[j * G.nx + i];
  return ci >= 0 ? R.comps[ci] : null;
}

function drawSvg() {
  const { W, D } = state;
  const cw = Math.max(240, wrap.clientWidth);
  const maxH = Math.max(300, Math.min(window.innerHeight - 210, 940));
  const padL = 50, padR = 14, padT = 46, padB = 44;
  const totW = W + 2 * (WALL + OVER), totH = D + 2 * WALL + FRONT;
  k = Math.max(0.05, Math.min((cw - padL - padR) / totW, (maxH - padT - padB) / totH));
  const u = 1 / k, n = v => +v.toFixed(2);
  const vx = -(WALL + OVER) - padL * u, vy = -WALL - padT * u, vw = totW + (padL + padR) * u, vh = totH + (padT + padB) * u;
  svg.setAttribute('viewBox', `${n(vx)} ${n(vy)} ${n(vw)} ${n(vh)}`);
  svg.setAttribute('width', Math.round(vw * k));
  svg.setAttribute('height', Math.round(vh * k));
  const o = [];
  const P = 6 * u;
  o.push(`<defs><pattern id="hatchW" patternUnits="userSpaceOnUse" width="${n(P)}" height="${n(P)}" patternTransform="rotate(45)"><rect class="s-warnbg" width="${n(P)}" height="${n(P)}"/><line class="s-hatch" x1="0" y1="0" x2="0" y2="${n(P)}" stroke-width="${n(2 * u)}"/></pattern><clipPath id="clipIn"><rect x="0" y="0" width="${W}" height="${D}"/></clipPath></defs>`);

  // drawer box, false front and pull
  o.push(`<rect class="s-wall" x="${-WALL}" y="${-WALL}" width="${W + 2 * WALL}" height="${D + 2 * WALL}" rx="${n(2 * u)}"/>`);
  o.push(`<rect class="s-front" x="${-WALL - OVER}" y="${D + WALL}" width="${W + 2 * (WALL + OVER)}" height="${FRONT}" rx="${n(2 * u)}" stroke-width="${n(u)}"/>`);
  const pw = Math.min(W * 0.32, 192);
  o.push(`<rect class="s-pull" x="${n(W / 2 - pw / 2)}" y="${n(D + WALL + FRONT + 4 * u)}" width="${n(pw)}" height="${n(5 * u)}" rx="${n(2.5 * u)}"/>`);
  o.push(`<text class="s-cap" x="${n(W / 2)}" y="${n(D + WALL + FRONT + 25 * u)}" font-size="${n(11 * u)}">${t('svg.front')}</text>`);
  o.push(`<rect class="s-floor" x="0" y="0" width="${W}" height="${D}" stroke-width="${n(u)}"/>`);
  o.push(`<g clip-path="url(#clipIn)"><path class="s-grain" d="${grainPath(W, D)}" stroke-width="${n(0.9 * u)}"/></g>`);

  // compartments
  const selComp = compAt(ui.comp);
  R.comps.forEach(c => {
    const cls = 's-comp' + (c.narrow ? ' narrow' : '') + (c === selComp ? ' sel' : '');
    const tip = c.rect ? t('svg.compTip', { w: fmt(c.w), h: fmt(c.h) }) : t('svg.compTipOdd', { a: fmt(c.area / 100) });
    o.push(`<path class="${cls}" data-act="comp" d="${c.d}"><title>${tip}</title></path>`);
  });

  // boards
  R.boards.forEach(b => {
    const cls = 's-board' + (b.gid === ui.sel ? ' sel' : '') + (ui.hoverPart && b.part === ui.hoverPart ? ' hl' : '') + (b.bad ? ' bad' : '');
    o.push(`<rect class="${cls}" x="${n(b.x0)}" y="${n(b.y0)}" width="${n(b.x1 - b.x0)}" height="${n(b.y1 - b.y0)}" stroke-width="${n((b.gid === ui.sel ? 2 : 1) * u)}"/>`);
  });

  // joints
  R.joints.forEach(j => {
    if (j.type === 'clash') { o.push(`<rect class="s-clash" x="${n(j.x0)}" y="${n(j.y0)}" width="${n(j.x1 - j.x0)}" height="${n(j.y1 - j.y0)}"/>`); return; }
    if (!view.joints) return;
    const ins = Math.min(1.5 * u, (j.x1 - j.x0) / 4, (j.y1 - j.y0) / 4);
    if (j.type === 'cross' || j.type === 'lap') {
      o.push(`<path class="s-joint" stroke-width="${n(u)}" d="M${n(j.x0 + ins)} ${n(j.y0 + ins)}L${n(j.x1 - ins)} ${n(j.y1 - ins)}M${n(j.x1 - ins)} ${n(j.y0 + ins)}L${n(j.x0 + ins)} ${n(j.y1 - ins)}"/>`);
    } else if (j.type === 'dado') {
      o.push(`<rect class="s-joint" stroke-width="${n(u)}" stroke-dasharray="${n(2 * u)} ${n(1.5 * u)}" x="${n(j.x0 + ins / 2)}" y="${n(j.y0 + ins / 2)}" width="${n(j.x1 - j.x0 - ins)}" height="${n(j.y1 - j.y0 - ins)}"/>`);
    }
  });
  // T joints: a nail hole in the board being butted, the dashed line shows the nail going into the other board's end
  if (view.joints) R.boards.forEach(b => b.slots.forEach(s => {
    if (s.kind !== 'butt') return;
    const h = b.orient === 'h', c = (h ? b.x0 : b.y0) + s.at + s.w / 2, back = s.face === 'back' || s.face === 'left', run = 12;
    const r = clamp((h ? b.y1 - b.y0 : b.x1 - b.x0) * 0.3, 1.6 * u, 3.4 * u);
    const [a0, a1] = h ? (back ? [b.y1, b.y0 - run] : [b.y0, b.y1 + run]) : (back ? [b.x1, b.x0 - run] : [b.x0, b.x1 + run]);
    const mid = h ? (b.y0 + b.y1) / 2 : (b.x0 + b.x1) / 2, [x, y] = h ? [c, mid] : [mid, c];
    o.push(h ? `<line class="s-screw" x1="${n(c)}" y1="${n(a0)}" x2="${n(c)}" y2="${n(a1)}" stroke-width="${n(u)}" stroke-dasharray="${n(2 * u)} ${n(1.5 * u)}"/>`
      : `<line class="s-screw" x1="${n(a0)}" y1="${n(c)}" x2="${n(a1)}" y2="${n(c)}" stroke-width="${n(u)}" stroke-dasharray="${n(2 * u)} ${n(1.5 * u)}"/>`);
    o.push(`<circle class="s-hole" cx="${n(x)}" cy="${n(y)}" r="${n(r)}" stroke-width="${n(0.8 * u)}"/>`);
  }));

  // compartment labels
  if (view.dims) R.comps.forEach(c => {
    const txt = c.rect ? `${fmt(c.w)} × ${fmt(c.h)}` : `≈${fmt(c.area / 100)} cm²`;
    const wpx = (c.rect ? c.w : c.lw) * k, hpx = (c.rect ? c.h : c.lh) * k;
    for (const fs of [12.5, 11, 9.5]) {
      const tw = textW(txt, fs);
      let rot = null;
      if (tw + 8 <= wpx && fs + 6 <= hpx) rot = false;
      else if (tw + 8 <= hpx && fs + 6 <= wpx) rot = true;
      if (rot === null) continue;
      const cls = 's-label' + (c === selComp ? ' sel' : '') + (c.narrow ? ' narrow' : '');
      o.push(`<text class="${cls}" x="${n(c.lx)}" y="${n(c.ly)}" font-size="${n(fs * u)}" stroke-width="${n(3 * u)}"${rot ? ` transform="rotate(-90 ${n(c.lx)} ${n(c.ly)})"` : ''}>${txt}</text>`);
      break;
    }
  });

  // part tags
  if (view.parts) R.boards.forEach(b => {
    const h = b.orient === 'h', len = h ? b.x1 - b.x0 : b.y1 - b.y0, along = Math.min(Math.max(16 * u, len * 0.2), len / 2);
    const x = h ? b.x0 + along : (b.x0 + b.x1) / 2, y = h ? (b.y0 + b.y1) / 2 : b.y0 + along, s = 16 * u;
    o.push(`<rect class="s-tagbg" x="${n(x - s / 2)}" y="${n(y - s / 2)}" width="${n(s)}" height="${n(s)}" rx="${n(3 * u)}"/><text class="s-tag" x="${n(x)}" y="${n(y)}" font-size="${n(10 * u)}">${b.part}</text>`);
  });

  // unsupported ends
  R.boards.forEach(b => {
    const h = b.orient === 'h', cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    [0, 1].forEach(ei => {
      if (b.support[ei]) return;
      const x = h ? (ei ? b.x1 : b.x0) : cx, y = h ? cy : (ei ? b.y1 : b.y0);
      o.push(`<circle class="s-dangle" cx="${n(x)}" cy="${n(y)}" r="${n(4 * u)}" stroke-width="${n(1.5 * u)}"/>`);
    });
  });

  // selected group: centre of every slot and hole, measured like the cut list from the cut board's left / back end
  if (view.joints) R.boards.filter(b => b.gid === ui.sel && b.slots.length).forEach(b => {
    const h = b.orient === 'h', fs = 10.5, gap = 4 * u, start = h ? b.x0 : b.y0, cut0 = b.wall[0] ? state.gap : 0;
    const side0 = (h ? b.y0 : b.x0) < 24 ? 1 : -1; // hugging the back / left wall: label on the other side
    const marks = [{ c: start + cut0, txt: '0', zero: true }, ...b.slots.map(s => ({ c: start + s.at + s.w / 2, txt: fmt(s.atCut + s.w / 2) }))];
    let last = [-Infinity, -Infinity];
    marks.forEach(m => {
      // crowded marks alternate sides
      const need = (h ? textW(m.txt, fs) + 6 : fs + 3) * u;
      let side = side0;
      if (m.c - last[side0 > 0 ? 1 : 0] < need) side = -side0;
      last[side > 0 ? 1 : 0] = m.c;
      const cls = 's-holelbl' + (m.zero ? ' zero' : ''), sw = n(3 * u), f = n(fs * u);
      if (h) o.push(`<text class="${cls}" x="${n(m.c)}" y="${n(side < 0 ? b.y0 - gap - fs * u / 2 : b.y1 + gap + fs * u / 2)}" text-anchor="middle" font-size="${f}" stroke-width="${sw}">${m.txt}</text>`);
      else o.push(`<text class="${cls}" x="${n(side < 0 ? b.x0 - gap : b.x1 + gap)}" y="${n(m.c)}" text-anchor="${side < 0 ? 'end' : 'start'}" font-size="${f}" stroke-width="${sw}">${m.txt}</text>`);
    });
  });

  // hit areas (at least 18 px thick so thin boards stay easy to grab)
  const minT = 18 * u;
  R.boards.forEach(b => {
    let { x0, x1, y0, y1 } = b;
    if (b.orient === 'h' && y1 - y0 < minT) { const c = (y0 + y1) / 2; y0 = c - minT / 2; y1 = c + minT / 2; }
    if (b.orient === 'v' && x1 - x0 < minT) { const c = (x0 + x1) / 2; x0 = c - minT / 2; x1 = c + minT / 2; }
    o.push(`<rect class="s-hit" data-act="board" data-g="${b.gid}" x="${n(x0)}" y="${n(y0)}" width="${n(x1 - x0)}" height="${n(y1 - y0)}"><title>${t('svg.boardTip', { name: gName(byId(b.gid)), part: b.part, L: fmt(b.L) })}</title></rect>`);
  });

  // end handles for the selected group
  R.boards.filter(b => b.gid === ui.sel).forEach(b => {
    const h = b.orient === 'h', cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    [0, 1].forEach(ei => {
      const x = h ? (ei ? b.x1 : b.x0) : cx, y = h ? cy : (ei ? b.y1 : b.y0);
      o.push(`<circle class="s-knob" cx="${n(x)}" cy="${n(y)}" r="${n(5.5 * u)}" stroke-width="${n(2 * u)}"/><circle class="s-knobhit ${b.orient}" data-act="end" data-g="${b.gid}" data-end="${ei}" cx="${n(x)}" cy="${n(y)}" r="${n(13 * u)}"><title>${t('svg.knobTip', { end: ORI[b.orient].ends[ei] })}</title></circle>`);
    });
  });

  // overall dimensions
  const dy = -WALL - 22 * u, dx = -WALL - 24 * u, t3 = 3 * u;
  o.push(`<g class="s-dim" stroke-width="${n(u)}">
    <line x1="0" y1="${n(-WALL - 4 * u)}" x2="0" y2="${n(dy - 5 * u)}"/><line x1="${W}" y1="${n(-WALL - 4 * u)}" x2="${W}" y2="${n(dy - 5 * u)}"/>
    <line x1="${n(-4 * u)}" y1="${n(dy)}" x2="${n(W + 4 * u)}" y2="${n(dy)}"/>
    <line x1="${n(-t3)}" y1="${n(dy + t3)}" x2="${n(t3)}" y2="${n(dy - t3)}" stroke-width="${n(1.6 * u)}"/><line x1="${n(W - t3)}" y1="${n(dy + t3)}" x2="${n(W + t3)}" y2="${n(dy - t3)}" stroke-width="${n(1.6 * u)}"/>
    <line x1="${n(-WALL - 4 * u)}" y1="0" x2="${n(dx - 5 * u)}" y2="0"/><line x1="${n(-WALL - 4 * u)}" y1="${D}" x2="${n(dx - 5 * u)}" y2="${D}"/>
    <line x1="${n(dx)}" y1="${n(-4 * u)}" x2="${n(dx)}" y2="${n(D + 4 * u)}"/>
    <line x1="${n(dx - t3)}" y1="${n(t3)}" x2="${n(dx + t3)}" y2="${n(-t3)}" stroke-width="${n(1.6 * u)}"/><line x1="${n(dx - t3)}" y1="${n(D + t3)}" x2="${n(dx + t3)}" y2="${n(D - t3)}" stroke-width="${n(1.6 * u)}"/>
  </g>`);
  o.push(`<text class="s-dimtxt" x="${n(W / 2)}" y="${n(dy - 9 * u)}" font-size="${n(11.5 * u)}">${t('svg.innerW', { v: fmt(W) })}</text>`);
  o.push(`<text class="s-dimtxt" x="${n(dx - 9 * u)}" y="${n(D / 2)}" font-size="${n(11.5 * u)}" transform="rotate(-90 ${n(dx - 9 * u)} ${n(D / 2)})">${t('svg.innerD', { v: fmt(D) })}</text>`);

  scene.innerHTML = o.join('');

  const jc = R.jc, bits = [`<span>${t('sum.boards', { n: R.boards.length })}</span>`, `<span>${t('sum.comps', { n: R.comps.length })}</span>`];
  ['cross', 'lap', 'dado', 'butt'].forEach(k => { if (jc[k]) bits.push(`<span>${t('sum.' + k, { n: jc[k] })}</span>`); });
  const holes = view.joints && R.boards.some(b => b.slots.length);
  bits.push(`<span class="legend">${t('legend')}${holes ? t('punct.sp') + t('legend.holes') : ''}</span>`);
  $('summary').innerHTML = bits.join('');
}
