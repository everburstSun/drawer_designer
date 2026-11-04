
// ---- 实景预览: 3D view, photo overlay, file saves ----
const arCv = $('arCanvas'), arCtx = arCv.getContext('2d');
const AR_CORNER_LBL = [t('corner.lb'), t('corner.rb'), t('corner.rf'), t('corner.lf')];
const AR_DEFAULT_CORNERS = [[0.22, 0.24], [0.78, 0.24], [0.9, 0.84], [0.1, 0.84]];
const ar = { mode: '3d', yaw: -28, pitch: 50, img: null, corners: AR_DEFAULT_CORNERS.map(c => c.slice()), alpha: 0.92, outline: true, drag: null, visible: true, dl: null };
const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
// opened inside claude.ai (framed, window.claude present before any script) vs. a standalone copy such as GitHub Pages
const IN_CLAUDE = !!(window.claude && typeof window.claude.use === 'function');
document.querySelectorAll('[data-env]').forEach(el => { el.hidden = el.dataset.env !== (IN_CLAUDE ? 'claude' : 'web'); });

function arBoxes(withWalls) {
  const { W, D, H } = state;
  const out = R.boards.map(b => ({ x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y1, h0: 0, h1: H, kind: 'board' }));
  if (withWalls) {
    const t = WALL, h = H + 25;
    out.push({ x0: -t, x1: 0, y0: -t, y1: D + t, h0: 0, h1: h, kind: 'wall' }, { x0: W, x1: W + t, y0: -t, y1: D + t, h0: 0, h1: h, kind: 'wall' },
      { x0: 0, x1: W, y0: -t, y1: 0, h0: 0, h1: h, kind: 'wall' }, { x0: 0, x1: W, y0: D, y1: D + t, h0: 0, h1: h, kind: 'wall' });
  }
  return out;
}
function drawFaces(ctx, cam, opt) {
  const lw = opt.lw || 1;
  visibleFaces(cam, arBoxes(opt.walls)).forEach(fc => {
    const wall = fc.kind === 'wall', base = wall ? [178, 134, 88] : [214, 168, 112], s = fc.shade;
    ctx.beginPath();
    fc.pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.closePath();
    ctx.fillStyle = `rgba(${Math.round(base[0] * s)},${Math.round(base[1] * s)},${Math.round(base[2] * s)},${wall ? 0.34 : opt.alpha})`;
    ctx.fill();
    ctx.strokeStyle = `rgba(70,42,18,${wall ? 0.25 : 0.6 * opt.alpha})`;
    ctx.lineWidth = lw; ctx.lineJoin = 'round';
    ctx.stroke();
  });
}
function drawFloor(ctx, cam, lw) {
  const { W, D } = state, P = (x, y) => cameraPoint(cam, x, y, 0);
  const poly = [P(0, 0), P(W, 0), P(W, D), P(0, D)];
  if (poly.some(p => p[2] <= 1)) return;
  ctx.beginPath(); poly.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath();
  ctx.fillStyle = 'rgb(236,223,198)'; ctx.fill();
  ctx.strokeStyle = 'rgba(120,90,55,0.18)'; ctx.lineWidth = lw;
  ctx.beginPath();
  for (let x = 50; x < W; x += 50) { const a = P(x, 0), b = P(x, D); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
  for (let y = 50; y < D; y += 50) { const a = P(0, y), b = P(W, y); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
  ctx.stroke();
  const f = P(W / 2, D + WALL + 22);
  if (f[2] > 1) { ctx.fillStyle = cssVar('--muted'); ctx.font = `${12 * lw}px ${cssVar('--f-body')}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t('svg.front'), f[0], f[1]); }
}
function arPhotoCam(w, h) {
  return quadOk(ar.corners) ? photoCamera(state.W, state.D, ar.corners.map(c => [c[0] * w, c[1] * h]), { x: 0, y: 0, w, h }) : null;
}

function arRender() {
  if (!ar.visible || !R) return;
  const photo = ar.mode === 'photo', stage = $('arStage');
  $('arEmpty').hidden = !(photo && !ar.img);
  arCv.hidden = photo && !ar.img;
  $('arShotBtn').disabled = !ar.dl || (photo && !ar.img);
  if (arCv.hidden) return;
  const sw = Math.max(240, stage.clientWidth - 2);
  let cw, ch;
  if (photo) {
    const asp = ar.img.width / ar.img.height, maxH = Math.max(300, window.innerHeight * 0.75);
    cw = Math.min(sw, maxH * asp); ch = cw / asp;
  } else { cw = sw; ch = clamp(sw * 0.66, 260, 580); }
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const pw = Math.round(cw * dpr), ph = Math.round(ch * dpr);
  if (arCv.width !== pw || arCv.height !== ph) { arCv.width = pw; arCv.height = ph; }
  arCv.style.width = cw + 'px'; arCv.style.height = ch + 'px';
  const ctx = arCtx;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cw, ch);
  if (!photo) {
    const cam = orbitCamera(state.W, state.D, state.H, ar.yaw, ar.pitch, cw, ch);
    drawFloor(ctx, cam, 1);
    drawFaces(ctx, cam, { walls: true, alpha: 1 });
    return;
  }
  ctx.drawImage(ar.img, 0, 0, cw, ch);
  const pts = ar.corners.map(c => [c[0] * cw, c[1] * ch]), ok = quadOk(ar.corners);
  if (ar.outline || !ok) {
    ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath();
    ctx.setLineDash([6, 5]); ctx.lineWidth = 2; ctx.strokeStyle = ok ? 'rgba(255,255,255,0.9)' : 'rgba(230,80,60,0.95)'; ctx.stroke(); ctx.setLineDash([]);
  }
  const cam = ok && arPhotoCam(cw, ch);
  if (cam) drawFaces(ctx, cam, { walls: false, alpha: ar.alpha });
  ctx.font = `600 12px ${cssVar('--f-body')}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  pts.forEach((p, i) => {
    ctx.beginPath(); ctx.arc(p[0], p[1], 11, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = cssVar('--accent'); ctx.stroke();
    ctx.beginPath(); ctx.arc(p[0], p[1], 2.5, 0, Math.PI * 2); ctx.fillStyle = cssVar('--accent'); ctx.fill();
    const ty = p[1] + (i < 2 ? -22 : 22), tw = ctx.measureText(AR_CORNER_LBL[i]).width + 12;
    ctx.fillStyle = 'rgba(20,28,24,0.78)'; ctx.fillRect(p[0] - tw / 2, ty - 10, tw, 20);
    ctx.fillStyle = '#fff'; ctx.fillText(AR_CORNER_LBL[i], p[0], ty);
  });
  if (!ok) {
    const msg = t('photo.order');
    ctx.font = `13px ${cssVar('--f-body')}`; const tw = ctx.measureText(msg).width + 20;
    ctx.fillStyle = 'rgba(160,40,30,0.88)'; ctx.fillRect(cw / 2 - tw / 2, 10, tw, 28);
    ctx.fillStyle = '#fff'; ctx.fillText(msg, cw / 2, 24);
  }
}

function setArMode(m) {
  ar.mode = m;
  document.querySelectorAll('[data-armode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.armode === m)));
  $('ar3dCtl').hidden = m !== '3d'; $('arPhotoCtl').hidden = m !== 'photo';
  arCv.classList.toggle('photo', m === 'photo');
  arRender();
}
document.querySelectorAll('[data-armode]').forEach(b => b.addEventListener('click', () => setArMode(b.dataset.armode)));
$('arPitch').addEventListener('input', e => { ar.pitch = Number(e.target.value); arRender(); });
$('arAlpha').addEventListener('input', e => { ar.alpha = Number(e.target.value) / 100; arRender(); });
$('arOutline').addEventListener('change', e => { ar.outline = e.target.checked; arRender(); });
$('arReset').addEventListener('click', () => { ar.corners = AR_DEFAULT_CORNERS.map(c => c.slice()); arRender(); });
document.querySelectorAll('[data-arfile]').forEach(inp => inp.addEventListener('change', e => {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const url = URL.createObjectURL(file), img = new Image();
  img.onload = () => {
    // keep a downscaled copy; the original file is not stored anywhere
    const s = Math.min(1, 2200 / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url);
    ar.img = c; ar.corners = AR_DEFAULT_CORNERS.map(q => q.slice());
    $('arFileBtn').firstChild.textContent = t('photo.change');
    setArMode('photo');
    $('ar').scrollIntoView({ block: 'start', behavior: 'smooth' });
    toast(t('toast.dragCorners'));
  };
  img.onerror = () => { URL.revokeObjectURL(url); toast(t('toast.badPhoto')); };
  img.src = url;
}));

arCv.addEventListener('pointerdown', e => {
  if (e.button !== 0) return;
  const r = arCv.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
  if (ar.mode === 'photo') {
    let best = -1, bd = 34;
    ar.corners.forEach((c, i) => { const d = Math.hypot(c[0] * r.width - px, c[1] * r.height - py); if (d < bd) { bd = d; best = i; } });
    if (best < 0) return;
    ar.drag = { kind: 'corner', i: best, pid: e.pointerId, ox: ar.corners[best][0] * r.width - px, oy: ar.corners[best][1] * r.height - py };
  } else {
    ar.drag = { kind: 'orbit', pid: e.pointerId, x: e.clientX, y: e.clientY, yaw: ar.yaw, pitch: ar.pitch, mouse: e.pointerType === 'mouse' };
  }
  e.preventDefault();
  try { arCv.setPointerCapture(e.pointerId); } catch (_) { /* capture unsupported */ }
});
arCv.addEventListener('pointermove', e => {
  const d = ar.drag; if (!d || e.pointerId !== d.pid) return;
  if (d.kind === 'corner') {
    const r = arCv.getBoundingClientRect();
    ar.corners[d.i] = [clamp((e.clientX - r.left + d.ox) / r.width, 0, 1), clamp((e.clientY - r.top + d.oy) / r.height, 0, 1)];
  } else {
    // one mapping for the whole view: dragging right turns the drawer's front to the right, dragging down looks more from above
    ar.yaw = d.yaw - (e.clientX - d.x) * 0.35;
    if (d.mouse) { ar.pitch = clamp(d.pitch + (e.clientY - d.y) * 0.3, 15, 88); $('arPitch').value = String(Math.round(ar.pitch)); }
  }
  arRender();
});
const arEndDrag = e => { if (ar.drag && e.pointerId === ar.drag.pid) ar.drag = null; };
arCv.addEventListener('pointerup', arEndDrag);
arCv.addEventListener('pointercancel', arEndDrag);

// ---- saving files: the downloads capability inside claude.ai, a plain download link elsewhere ----
const browserSaver = {
  async save({ filename, data }) {
    const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data])), a = document.createElement('a');
    a.href = url; a.download = filename; a.hidden = true;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return { status: 'saved' };
  },
};
function initDownloads() {
  if (!IN_CLAUDE) {
    ar.dl = browserSaver;
    $('arModelBtn').disabled = false;
    $('arDlNote').textContent = t('dl.web');
    arRender();
    return;
  }
  Promise.resolve(window.claude.use('downloads')).then(d => d, () => null).then(d => {
    ar.dl = d;
    $('arModelBtn').disabled = !d;
    $('arDlNote').textContent = d ? t('dl.claudeOk') : t('dl.claudeNo');
    arRender();
  });
}
async function saveFile(filename, data, okMsg) {
  if (!ar.dl) return;
  try {
    const res = await ar.dl.save({ filename, data });
    if (res && res.status === 'saved') toast(okMsg);
  } catch (err) {
    const code = err && err.code;
    if (code === 'declined') return;
    toast(t(code === 'rate_limited' ? 'toast.saveBusy' : code === 'too_large' ? 'toast.saveTooLarge' : 'toast.saveFail'));
  }
}
function arReadme() {
  const { W, D, H } = state;
  return [
    t('readme.title'),
    t('readme.size', { W: fmt(W), D: fmt(D), H: fmt(H), n: R.boards.length }),
    t('readme.base'),
    '',
    'iPhone / iPad',
    t('readme.ios1'), t('readme.ios2'), t('readme.ios3'),
    '',
    'Android',
    t('readme.android'),
    ...(IN_CLAUDE ? [] : [t('readme.web')]),
    '',
  ].join('\r\n');
}
// usdz for AR Quick Look (an uncompressed zip, 64-byte aligned) from the current design
function arUsdz(meshes) {
  return zipStore([{ name: 'model.usda', data: new TextEncoder().encode(usdaText(meshes)) }], 64);
}
$('arModelBtn').addEventListener('click', () => {
  R = analyze(state);
  const meshes = arMeshes(R.boards, state.W, state.D, state.H);
  const zip = zipStore([
    { name: 'drawer-dividers.usdz', data: arUsdz(meshes) },
    { name: 'drawer-dividers.glb', data: glbBytes(meshes) },
    { name: 'README.txt', data: new TextEncoder().encode(arReadme()) },
  ], 0);
  saveFile(t('file.zip'), new Blob([zip]), t('toast.modelSaved'));
});
$('arShotBtn').addEventListener('click', () => {
  const c = document.createElement('canvas'), x = c.getContext('2d');
  if (ar.mode === 'photo' && ar.img) {
    c.width = ar.img.width; c.height = ar.img.height;
    x.drawImage(ar.img, 0, 0);
    const cam = arPhotoCam(c.width, c.height);
    if (cam) drawFaces(x, cam, { walls: false, alpha: ar.alpha, lw: Math.max(1, c.width / 900) });
  } else {
    c.width = 1600; c.height = 1056;
    x.fillStyle = cssVar('--panel-2'); x.fillRect(0, 0, c.width, c.height);
    const cam = orbitCamera(state.W, state.D, state.H, ar.yaw, ar.pitch, c.width, c.height);
    drawFloor(x, cam, 2); drawFaces(x, cam, { walls: true, alpha: 1, lw: 2 });
  }
  c.toBlob(b => { if (b) saveFile(t('file.jpg'), b, t('toast.shotSaved')); else toast(t('toast.shotFail')); }, 'image/jpeg', 0.9);
});
