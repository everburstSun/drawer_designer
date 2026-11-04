// ---- model, geometry and joinery analysis (no DOM; words come from t() in i18n.js) ----
const EPS = 0.3;
const WALL = 15, FRONT = 18, OVER = 12;
// h boards run left–right and are placed front–back; v boards run front–back and are placed left–right
const ORI = {
  h: { short: t('short.h'), ends: [t('end.left'), t('end.right')], walls: [t('wall.back'), t('wall.front')] },
  v: { short: t('short.v'), ends: [t('end.back'), t('end.front')], walls: [t('wall.left'), t('wall.right')] },
};
// a reference is 'wall', 'num' (typed value) or 'b:<groupId>:<boardIndex>' (a face of a parallel board)
const REF_RE = /^b:(\d+):(\d+)$/;
const isBoardRef = r => REF_RE.test(r || '');
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
function clampN(v, lo, hi, d) { v = Number(v); return Number.isFinite(v) ? clamp(v, lo, hi) : d; }
// fmtNum: plain 0.1 mm text for inputs and keys; fmt: the same with the page language's decimal mark, for reading
function fmtNum(v) { const r = Math.round(v * 10) / 10; return Number.isInteger(r) ? String(r + 0) : r.toFixed(1); }
function fmt(v) { return DEC === '.' ? fmtNum(v) : fmtNum(v).replace('.', DEC); }
function uniqSorted(a) { a.sort((p, q) => p - q); const o = []; for (const v of a) if (!o.length || v - o[o.length - 1] > 0.01) o.push(v); return o; }
const letterOf = i => String.fromCharCode(65 + (i % 26)) + (i >= 26 ? Math.floor(i / 26) : '');
const alongExt = (st, g) => g.orient === 'h' ? st.W : st.D;
const perpExt = (st, g) => g.orient === 'h' ? st.D : st.W;
const evenGap = g => (g.b - g.a - g.count * g.t) / (g.count + 1);
const groupSpan = g => (g.count - 1) * (g.t + g.gap) + g.t;

// near-face coordinate (top / left edge) of every board in a group
function positions(g) {
  const out = [];
  if (g.mode === 'even') { const c = evenGap(g); for (let i = 0; i < g.count; i++) out.push(g.a + c * (i + 1) + g.t * i); }
  else for (let i = 0; i < g.count; i++) out.push(g.pos + i * (g.t + g.gap));
  return out;
}

function normGroup(g, st, mapRef) {
  const o = g.orient === 'v' ? 'v' : 'h';
  const A = o === 'h' ? st.W : st.D, P = o === 'h' ? st.D : st.W;
  const a = clampN(g.a, 0, P, 0), b = clampN(g.b, 0, P, P), pos = clampN(g.pos, -1000, 5000, 0);
  const fixRef = (r, fallback) => {
    if (r === 'wall' || r === 'num') return r;
    const m = mapRef ? mapRef(r) : (isBoardRef(r) ? r : null);
    return m || fallback;
  };
  const posRef = fixRef(g.posRef, 'wall');
  return {
    id: g.id, orient: o,
    count: Math.round(clampN(g.count, 1, 40, 1)),
    t: clampN(g.t, 1, 100, st.defT),
    s: clampN(g.s, 0, A, 0),
    L: clampN(g.L, 1, 5000, A),
    mode: g.mode === 'manual' ? 'manual' : 'even',
    a, b,
    aRef: fixRef(g.aRef, a <= EPS ? 'wall' : 'num'),
    bRef: fixRef(g.bRef, b >= P - EPS ? 'wall' : 'num'),
    posRef: posRef === 'num' ? 'wall' : posRef,
    off: clampN(g.off != null ? g.off : pos, -1000, 5000, 0),
    pos,
    gap: clampN(g.gap, 0, 5000, 0),
  };
}

function normState(raw) {
  raw = raw || {};
  const st = {
    W: clampN(raw.W, 100, 2400, 560), D: clampN(raw.D, 100, 2400, 480), H: clampN(raw.H, 10, 300, 50),
    defT: clampN(raw.defT, 3, 50, 12), snap: [0, 1, 5, 10].includes(Number(raw.snap)) ? Number(raw.snap) : 5,
    gap: clampN(raw.gap, 0, 5, 0.5), stockLen: clampN(raw.stockLen, 200, 6000, 1220), kerf: clampN(raw.kerf, 0, 10, 3),
    sample: PRESETS.some(p => p.key === raw.sample) ? raw.sample : null, nextId: 1, groups: [],
  };
  // ids are renumbered 1..n, so board references are remapped: 'b:<old id>' from saved state, 'i:<index>' from exports and presets
  const rawGroups = (Array.isArray(raw.groups) ? raw.groups : []).filter(g => g && typeof g === 'object');
  const idMap = new Map();
  rawGroups.forEach((g, idx) => { if (g.id != null) idMap.set(String(g.id), idx + 1); });
  const mapRef = r => {
    let m = REF_RE.exec(r || '');
    if (m) { const nid = idMap.get(m[1]); return nid ? `b:${nid}:${m[2]}` : null; }
    m = /^i:(\d+):(\d+)$/.exec(r || '');
    return m && Number(m[1]) < rawGroups.length ? `b:${Number(m[1]) + 1}:${m[2]}` : null;
  };
  rawGroups.forEach(g => st.groups.push(normGroup({ ...g, id: st.nextId++ }, st, mapRef)));
  resolveRefs(st);
  sortGroups(st);
  return st;
}

// the list follows the part letters A, B, C…, so the 横/竖隔板 numbers count up in letter order;
// groups sharing their first letter stay back-to-front / left-to-right. Returns true when the order changed.
function sortGroups(st) {
  const r = analyze(st), rank = new Map(r.parts.map((p, i) => [p.letter, i])), key = new Map();
  st.groups.forEach(g => {
    const bs = r.boards.filter(b => b.gid === g.id);
    key.set(g.id, [Math.min(...bs.map(b => rank.get(b.part))), Math.min(...bs.map(b => (g.orient === 'h' ? b.y0 : b.x0)))]);
  });
  const before = st.groups.map(g => g.id).join();
  st.groups.sort((a, b) => key.get(a.id)[0] - key.get(b.id)[0] || key.get(a.id)[1] - key.get(b.id)[1] || a.id - b.id);
  return st.groups.map(g => g.id).join() !== before;
}

// turn references into absolute coordinates: even groups get a/b, manual groups get pos = base + off
function resolveRefs(st) {
  const byId = new Map(st.groups.map(g => [g.id, g])), mark = new Map();
  const face = (ref, which, self) => {
    const m = REF_RE.exec(ref || ''); if (!m) return null;
    const G = byId.get(Number(m[1])), i = Number(m[2]);
    if (!G || G === self || G.orient !== self.orient || i >= G.count || !visit(G)) return null;
    const near = positions(G)[i];
    return which === 'far' ? near + G.t : near;
  };
  function visit(g) {
    const s = mark.get(g.id);
    if (s === 1) return true;
    if (s === 0) return false; // reference cycle
    mark.set(g.id, 0);
    if (g.mode === 'even') {
      if (g.aRef === 'wall') g.a = 0;
      else if (g.aRef !== 'num') { const f = face(g.aRef, 'far', g); if (f == null) g.aRef = 'num'; else g.a = f; }
      if (g.bRef === 'wall') g.b = perpExt(st, g);
      else if (g.bRef !== 'num') { const f = face(g.bRef, 'near', g); if (f == null) g.bRef = 'num'; else g.b = f; }
    } else {
      let base = 0;
      if (g.posRef !== 'wall') { const f = face(g.posRef, 'far', g); if (f == null) { g.posRef = 'wall'; g.off = g.pos; } else base = f; }
      g.base = base; g.pos = base + g.off;
    }
    mark.set(g.id, 1);
    return true;
  }
  st.groups.forEach(visit);
}

// parallel boards of other groups that share some of g's length, split into the start side and end side of `center`
function refCandidates(st, boards, g, center, skip) {
  const h = g.orient === 'h', s0 = g.s, s1 = g.s + g.L, start = [], end = [];
  boards.forEach(b => {
    if (b.orient !== g.orient || b.gid === g.id || (skip && skip.has(b.gid))) return;
    const a0 = h ? b.x0 : b.y0, a1 = h ? b.x1 : b.y1;
    if (Math.min(a1, s1) - Math.max(a0, s0) <= EPS) return;
    const near = h ? b.y0 : b.x0, far = h ? b.y1 : b.x1, ref = `b:${b.gid}:${b.i}`;
    if (far <= center + EPS) start.push({ ref, b, face: far });
    else if (near >= center - EPS) end.push({ ref, b, face: near });
  });
  start.sort((p, q) => q.face - p.face);
  end.sort((p, q) => p.face - q.face);
  return { start, end };
}
// groups whose active references lead back to gid; they cannot become gid's reference
function dependents(st, gid) {
  const out = new Set([gid]);
  let grew = true;
  while (grew) {
    grew = false;
    st.groups.forEach(g => {
      if (out.has(g.id)) return;
      const refs = g.mode === 'even' ? [g.aRef, g.bRef] : [g.posRef];
      if (refs.some(r => { const m = REF_RE.exec(r || ''); return m && out.has(Number(m[1])); })) { out.add(g.id); grew = true; }
    });
  }
  out.delete(gid);
  return out;
}

const PRESETS = [
  { key: 'classic', W: 560, D: 480, H: 50, groups: [
    { orient: 'h', count: 1, t: 12, s: 0, L: 560, mode: 'manual', pos: 144, gap: 0 },
    { orient: 'v', count: 3, t: 12, s: 156, L: 324, mode: 'even', a: 0, b: 560 },
    { orient: 'v', count: 1, t: 12, s: 0, L: 144, mode: 'even', a: 0, b: 560 },
  ] },
  { key: 'grid', W: 560, D: 480, H: 50, groups: [
    { orient: 'h', count: 2, t: 12, s: 0, L: 560, mode: 'even', a: 0, b: 480 },
    { orient: 'v', count: 2, t: 12, s: 0, L: 480, mode: 'even', a: 0, b: 560 },
  ] },
  { key: 'long', W: 600, D: 500, H: 55, groups: [
    { orient: 'v', count: 1, t: 12, s: 0, L: 500, mode: 'manual', pos: 170 },
    { orient: 'h', count: 2, t: 12, s: 182, L: 418, mode: 'manual', pos: 160, gap: 150 },
    { orient: 'v', count: 1, t: 12, s: 0, L: 160, mode: 'even', aRef: 'i:0:0', bRef: 'wall' },
  ] },
  { key: 'strips', W: 450, D: 500, H: 50, groups: [
    { orient: 'v', count: 4, t: 9, s: 0, L: 500, mode: 'even', a: 0, b: 450 },
  ] },
];
function presetState(key, keep) {
  const p = PRESETS.find(x => x.key === key) || PRESETS[0];
  return normState({ ...(keep || {}), W: p.W, D: p.D, H: p.H, groups: p.groups, sample: p.key });
}

function groupNames(st) {
  const seq = { h: 0, v: 0 }, out = {};
  st.groups.forEach(g => { out[g.id] = t('name.' + g.orient, { n: ++seq[g.orient] }); });
  return out;
}

function boardsOf(st) {
  const out = [];
  st.groups.forEach(g => {
    positions(g).forEach((e, i) => {
      const b = g.orient === 'h' ? { x0: g.s, x1: g.s + g.L, y0: e, y1: e + g.t } : { x0: e, x1: e + g.t, y0: g.s, y1: g.s + g.L };
      Object.assign(b, { gid: g.id, i, orient: g.orient, t: g.t, L: g.L, slots: [] });
      out.push(b);
    });
  });
  return out;
}

// free interval through pt along an axis, bounded by walls and boards
// also returns the boards that set each bound (null for a wall)
function freeSpan(st, boards, pt, axis, skip) {
  let lo = 0, hi = axis === 'x' ? st.W : st.D, loB = null, hiB = null;
  for (const b of boards) {
    if (skip && skip(b)) continue;
    const across = axis === 'x' ? pt.y > b.y0 && pt.y < b.y1 : pt.x > b.x0 && pt.x < b.x1;
    if (!across) continue;
    const p = axis === 'x' ? pt.x : pt.y, b0 = axis === 'x' ? b.x0 : b.y0, b1 = axis === 'x' ? b.x1 : b.y1;
    if (b1 <= p + 1e-6) { if (b1 > lo) { lo = b1; loB = b; } }
    else if (b0 >= p - 1e-6 && b0 < hi) { hi = b0; hiB = b; }
  }
  return [lo, hi, loB, hiB];
}

// split the drawer floor on every board edge, flood-fill the free cells into compartments
function compartments(st, boards) {
  const { W, D } = st;
  const rects = boards.map(b => ({ x0: Math.max(0, b.x0), x1: Math.min(W, b.x1), y0: Math.max(0, b.y0), y1: Math.min(D, b.y1) }))
    .filter(r => r.x1 - r.x0 > 1e-6 && r.y1 - r.y0 > 1e-6);
  const xs = uniqSorted([0, W, ...rects.flatMap(r => [r.x0, r.x1])]);
  const ys = uniqSorted([0, D, ...rects.flatMap(r => [r.y0, r.y1])]);
  const nx = xs.length - 1, ny = ys.length - 1, N = nx * ny;
  const blocked = new Uint8Array(N);
  for (let j = 0; j < ny; j++) {
    const cy = (ys[j] + ys[j + 1]) / 2;
    for (let i = 0; i < nx; i++) {
      const cx = (xs[i] + xs[i + 1]) / 2;
      for (const r of rects) if (cx > r.x0 && cx < r.x1 && cy > r.y0 && cy < r.y1) { blocked[j * nx + i] = 1; break; }
    }
  }
  const par = new Int32Array(N); for (let i = 0; i < N; i++) par[i] = i;
  const find = i => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
  const join = (a, b) => { a = find(a); b = find(b); if (a !== b) par[a] = b; };
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const c = j * nx + i; if (blocked[c]) continue;
    if (i + 1 < nx && !blocked[c + 1]) join(c, c + 1);
    if (j + 1 < ny && !blocked[c + nx]) join(c, c + nx);
  }
  const cellComp = new Int32Array(N).fill(-1), byRoot = new Map(), comps = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const c = j * nx + i; if (blocked[c]) continue;
    const r = find(c);
    let cp = byRoot.get(r);
    if (!cp) { cp = { idx: comps.length, cells: [], area: 0, bx0: Infinity, by0: Infinity, bx1: -Infinity, by1: -Infinity }; byRoot.set(r, cp); comps.push(cp); }
    const cell = { x0: xs[i], x1: xs[i + 1], y0: ys[j], y1: ys[j + 1] };
    cp.cells.push(cell);
    cp.area += (cell.x1 - cell.x0) * (cell.y1 - cell.y0);
    cp.bx0 = Math.min(cp.bx0, cell.x0); cp.bx1 = Math.max(cp.bx1, cell.x1);
    cp.by0 = Math.min(cp.by0, cell.y0); cp.by1 = Math.max(cp.by1, cell.y1);
    cellComp[c] = cp.idx;
  }
  const r2 = v => +v.toFixed(2);
  comps.forEach(cp => {
    cp.w = cp.bx1 - cp.bx0; cp.h = cp.by1 - cp.by0;
    cp.rect = Math.abs(cp.area - cp.w * cp.h) < 0.5;
    cp.d = cp.cells.map(c => `M${r2(c.x0)} ${r2(c.y0)}H${r2(c.x1)}V${r2(c.y1)}H${r2(c.x0)}Z`).join('');
    if (cp.rect) { cp.lx = (cp.bx0 + cp.bx1) / 2; cp.ly = (cp.by0 + cp.by1) / 2; }
    else {
      let best = -1;
      cp.cells.forEach(c => {
        const pt = { x: (c.x0 + c.x1) / 2, y: (c.y0 + c.y1) / 2 };
        const sx = freeSpan(st, boards, pt, 'x'), sy = freeSpan(st, boards, pt, 'y');
        const score = Math.min(sx[1] - sx[0], sy[1] - sy[0]);
        if (score > best) { best = score; cp.lx = (sx[0] + sx[1]) / 2; cp.ly = pt.y; cp.lw = sx[1] - sx[0]; cp.lh = sy[1] - sy[0]; }
      });
    }
    cp.narrow = cp.rect && Math.min(cp.w, cp.h) < 30;
  });
  return { comps, xs, ys, nx, ny, cellComp };
}

function analyze(st) {
  resolveRefs(st);
  const { W, D } = st, e = EPS;
  const names = groupNames(st);
  const byId = {}; st.groups.forEach(g => { byId[g.id] = g; });
  const boards = boardsOf(st);
  const nm = b => (byId[b.gid].count > 1 ? t('board.nth', { name: names[b.gid], n: b.i + 1 }) : names[b.gid]);
  const joints = [], issues = [];
  const Hs = boards.filter(b => b.orient === 'h'), Vs = boards.filter(b => b.orient === 'v');

  for (const B of Hs) for (const C of Vs) {
    const box = { x0: Math.max(B.x0, C.x0), x1: Math.min(B.x1, C.x1), y0: Math.max(B.y0, C.y0), y1: Math.min(B.y1, C.y1) };
    const ow = box.x1 - box.x0, oh = box.y1 - box.y0;
    if (ow > e && oh > e) {
      const bSpans = B.x0 <= C.x0 + e && B.x1 >= C.x1 - e;
      const cSpans = C.y0 <= B.y0 + e && C.y1 >= B.y1 - e;
      if (bSpans && cSpans) {
        const cross = B.x0 < C.x0 - e && B.x1 > C.x1 + e && C.y0 < B.y0 - e && C.y1 > B.y1 + e;
        joints.push({ type: cross ? 'cross' : 'lap', ...box });
        B.slots.push({ kind: 'lap', at: C.x0 - B.x0, w: C.t, d: st.H / 2 });
        C.slots.push({ kind: 'lap', at: B.y0 - C.y0, w: B.t, d: st.H / 2 });
      } else if (bSpans) {
        joints.push({ type: 'dado', ...box });
        B.slots.push({ kind: 'dado', face: C.y0 < B.y0 ? 'back' : 'front', at: C.x0 - B.x0, w: C.t, d: oh });
      } else if (cSpans) {
        joints.push({ type: 'dado', ...box });
        C.slots.push({ kind: 'dado', face: B.x0 < C.x0 ? 'left' : 'right', at: B.y0 - C.y0, w: B.t, d: ow });
      } else {
        joints.push({ type: 'clash', ...box });
        issues.push({ level: 'bad', gid: B.gid, text: t('iss.clash', { a: nm(B), b: nm(C) }) });
      }
    } else if (ow > -e && oh > -e && (ow > e || oh > e)) {
      joints.push({ type: 'butt', ...box });
      // the board whose side is touched gets a fixing hole at the middle of the other board's end
      if (ow > e) B.slots.push({ kind: 'butt', face: C.y0 < B.y0 ? 'back' : 'front', at: box.x0 - B.x0, w: ow, d: 0 });
      else C.slots.push({ kind: 'butt', face: B.x0 < C.x0 ? 'left' : 'right', at: box.y0 - C.y0, w: oh, d: 0 });
    }
  }

  const seen = new Set();
  for (const list of [Hs, Vs]) for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const A = list[i], B = list[j];
    if (Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0) > e && Math.min(A.y1, B.y1) - Math.max(A.y0, B.y0) > e) {
      A.bad = B.bad = true;
      const key = A.gid + '-' + B.gid; if (seen.has(key)) continue; seen.add(key);
      issues.push({ level: 'bad', gid: B.gid, text: A.gid === B.gid ? t('iss.overlapSelf', { name: names[A.gid] }) : t('iss.overlap', { a: names[A.gid], b: names[B.gid] }) });
    }
  }
  st.groups.forEach(g => {
    if (g.mode === 'even' && evenGap(g) < 0) issues.push({ level: 'bad', gid: g.id, text: t('iss.evenTight', { name: names[g.id], w: fmt(g.b - g.a), n: g.count, t: fmt(g.t) }) });
  });
  boards.forEach(b => { const over = Math.max(-b.x0, b.x1 - W, -b.y0, b.y1 - D); if (over > e) { b.bad = true; b.out = over; } });
  st.groups.forEach(g => {
    const bs = boards.filter(b => b.gid === g.id && b.out);
    if (bs.length) issues.push({ level: 'bad', gid: g.id, text: t('iss.outside', { name: names[g.id], d: fmt(Math.max(...bs.map(b => b.out))) }) });
  });

  // end support: an end must touch a wall or a perpendicular board
  boards.forEach(b => {
    const h = b.orient === 'h';
    const lo = h ? b.x0 : b.y0, hi = h ? b.x1 : b.y1, lim = h ? W : D;
    b.wall = [lo <= e, hi >= lim - e];
    b.gapEnd = [0, 0];
    const perps = h ? Vs : Hs;
    b.support = [lo, hi].map((p, ei) => {
      if (b.wall[ei]) return true;
      const ok = perps.some(P => h
        ? (P.y0 < b.y1 - e && P.y1 > b.y0 + e && p >= P.x0 - e && p <= P.x1 + e)
        : (P.x0 < b.x1 - e && P.x1 > b.x0 + e && p >= P.y0 - e && p <= P.y1 + e));
      if (!ok) {
        const c = h ? (b.y0 + b.y1) / 2 : (b.x0 + b.x1) / 2;
        const q = ei ? hi + 0.01 : lo - 0.01;
        const sp = freeSpan(st, boards, h ? { x: q, y: c } : { x: c, y: q }, h ? 'x' : 'y', bb => bb === b);
        b.gapEnd[ei] = ei ? sp[1] - hi : lo - sp[0];
      }
      return ok;
    });
  });
  st.groups.forEach(g => {
    const bs = boards.filter(b => b.gid === g.id);
    [0, 1].forEach(ei => {
      const dang = bs.filter(b => !b.support[ei]);
      if (!dang.length) return;
      const gaps = dang.map(b => b.gapEnd[ei]), mn = Math.min(...gaps), mx = Math.max(...gaps);
      const who = g.count > 1 ? (dang.length === g.count ? t('iss.whoAll', { n: g.count }) : t('iss.whoSome', { k: dang.length, n: g.count })) : '';
      const gap = fmt(mn) + (mx - mn > 0.05 ? '–' + fmt(mx) : '');
      issues.push({ level: 'warn', gid: g.id, text: t('iss.dangle', { name: names[g.id], who, end: ORI[g.orient].ends[ei], gap }) });
    });
  });

  const C = compartments(st, boards);
  const narrow = C.comps.filter(c => c.narrow).length;
  if (narrow) issues.push({ level: 'warn', gid: null, text: t('iss.narrow', { n: narrow }) });

  // parts: identical cut length, thickness and slot layout share a letter
  const pmap = new Map();
  boards.forEach(b => {
    const cutS = b.wall[0] ? st.gap : 0, cutE = b.wall[1] ? st.gap : 0;
    b.cutL = b.L - cutS - cutE;
    b.slots.sort((p, q) => p.at - q.at);
    b.slots.forEach(s => { s.atCut = s.at - cutS; });
    const key = [b.orient, fmtNum(b.cutL), fmtNum(b.t), b.slots.map(s => `${s.kind}${s.face || ''}${fmtNum(s.atCut)}/${fmtNum(s.w)}/${fmtNum(s.d)}`).join(',')].join('|');
    if (!pmap.has(key)) pmap.set(key, { orient: b.orient, cutL: b.cutL, t: b.t, slots: b.slots, boards: [] });
    pmap.get(key).boards.push(b);
  });
  // horizontals first, longer first; equal lengths go back-to-front / left-to-right, so letters never depend on list order
  const lead = p => p.boards.map(b => (p.orient === 'h' ? [b.y0, b.x0] : [b.x0, b.y0])).sort((u, v) => u[0] - v[0] || u[1] - v[1])[0];
  const parts = [...pmap.values()].sort((p, q) => {
    if (p.orient !== q.orient) return p.orient === 'h' ? -1 : 1;
    const a = lead(p), b = lead(q);
    return q.cutL - p.cutL || a[0] - b[0] || a[1] - b[1];
  });
  parts.forEach((p, i) => { p.letter = letterOf(i); p.boards.forEach(b => { b.part = p.letter; }); });

  const jc = { cross: 0, lap: 0, dado: 0, butt: 0, clash: 0 };
  joints.forEach(j => { jc[j.type]++; });
  const rank = { bad: 0, warn: 1 };
  issues.sort((a, b) => rank[a.level] - rank[b.level]);
  return { boards, joints, issues, parts, comps: C.comps, grid: C, jc, names };
}

// first-fit decreasing onto stock strips, one run per board thickness
function packStock(st, boards) {
  const byT = new Map();
  boards.forEach(b => { const t = fmt(b.t); if (!byT.has(t)) byT.set(t, []); byT.get(t).push({ len: b.cutL, part: b.part }); });
  return [...byT.entries()].map(([t, pcs]) => {
    pcs.sort((a, b) => b.len - a.len);
    const bars = [], over = [];
    for (const p of pcs) {
      if (p.len > st.stockLen + 1e-6) { over.push(p); continue; }
      let bar = bars.find(r => r.used + (r.items.length ? st.kerf : 0) + p.len <= st.stockLen + 1e-6);
      if (!bar) { bar = { used: 0, items: [] }; bars.push(bar); }
      bar.used += (bar.items.length ? st.kerf : 0) + p.len;
      bar.items.push(p);
    }
    const fit = pcs.filter(p => !over.includes(p)).reduce((s, p) => s + p.len, 0);
    return { t, bars, over, util: bars.length ? fit / (bars.length * st.stockLen) : 0 };
  });
}
