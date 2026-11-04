
// ---- live AR on the phone: WebXR immersive-ar (Android Chrome) or AR Quick Look (iPhone Safari) ----
// Needs a standalone https copy of the page; claude.ai frames the page without camera access.
const xr = { kind: null, session: null, gl: null, prog: null, bufs: null, refSpace: null, hitSource: null, reticle: null, lost: 0, ghostYaw: 0, placed: null, touches: new Map(), stage: '', qlUrl: null };
const XR_LIGHT = v3.norm([0.35, 1, 0.45]);

async function initLiveAR() {
  const btn = $('arLiveBtn'), note = $('arLiveNote');
  if (IN_CLAUDE) return;
  let kind = null;
  if (navigator.xr && navigator.xr.isSessionSupported) {
    try { if (await navigator.xr.isSessionSupported('immersive-ar')) kind = 'webxr'; } catch (_) { /* treat as unsupported */ }
  }
  const a = document.createElement('a');
  if (!kind && a.relList && a.relList.supports && a.relList.supports('ar')) kind = 'quicklook';
  xr.kind = kind;
  if (kind) {
    btn.hidden = false;
    $('arModelBtn').classList.remove('primary');
    note.textContent = t(kind === 'webxr' ? 'live.xr' : 'live.ql');
    return;
  }
  note.textContent = t(window.isSecureContext ? 'live.none' : 'live.insecure');
  if (window.isSecureContext && /^https:$/.test(location.protocol)) {
    const url = document.createElement('span');
    url.className = 'ar-url'; url.textContent = ' ' + location.origin + location.pathname;
    note.appendChild(url);
  }
}

// ---- AR Quick Look: hand Safari a generated usdz through a rel="ar" link ----
function openQuickLook() {
  R = analyze(state);
  if (xr.qlUrl) URL.revokeObjectURL(xr.qlUrl);
  xr.qlUrl = URL.createObjectURL(new Blob([arUsdz(arMeshes(R.boards, state.W, state.D, state.H))], { type: 'model/vnd.usdz+zip' }));
  const a = document.createElement('a');
  a.rel = 'ar'; a.href = xr.qlUrl + '#allowsContentScaling=0'; a.download = 'drawer-dividers.usdz'; a.hidden = true;
  a.appendChild(document.createElement('img')); // Safari only treats the link as AR when it wraps an image
  document.body.appendChild(a); a.click(); a.remove();
}

// ---- WebXR: tiny WebGL renderer for boxes ----
const m4mul = (a, b) => {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0;
    for (let i = 0; i < 4; i++) s += a[i * 4 + r] * b[c * 4 + i];
    o[c * 4 + r] = s;
  }
  return o;
};
// rotate about Y by yaw (model +Z, the drawer front, turns toward (sin yaw, 0, cos yaw)), then move to p
const m4place = (p, yaw) => { const c = Math.cos(yaw), s = Math.sin(yaw); return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, p[0], p[1], p[2], 1]); };
function xrBoxVerts(boxes) {
  const out = [];
  boxes.forEach(box => {
    const p = P8(...box);
    BOX_FACES.forEach(([q, n]) => [0, 1, 2, 0, 2, 3].forEach(j => out.push(...p[q[j]], ...n)));
  });
  return new Float32Array(out);
}
function xrRingVerts(r0, r1, seg) {
  const out = [], P = (r, a) => [r * Math.cos(a), 0.002, r * Math.sin(a), 0, 1, 0];
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2, b = ((i + 1) / seg) * Math.PI * 2;
    out.push(...P(r0, a), ...P(r1, a), ...P(r1, b), ...P(r0, a), ...P(r1, b), ...P(r0, b));
  }
  return new Float32Array(out);
}
function xrInitGL(gl) {
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, `attribute vec3 aPos; attribute vec3 aNor; uniform mat4 uMVP; uniform vec3 uLight; varying float vShade;
void main() { vShade = 0.6 + 0.4 * max(dot(aNor, uLight), 0.0); gl_Position = uMVP * vec4(aPos, 1.0); }`));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, `precision mediump float; uniform vec4 uColor; varying float vShade;
void main() { gl_FragColor = vec4(uColor.rgb * vShade * uColor.a, uColor.a); }`));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('shader');
  const { W, D, H } = state, meshes = arMeshes(R.boards, W, D, H), w = W / 2000, d = D / 2000, e = 0.004, hh = 0.002;
  const buf = arr => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW); return { b, n: arr.length / 6 }; };
  xr.prog = { p: prog, pos: gl.getAttribLocation(prog, 'aPos'), nor: gl.getAttribLocation(prog, 'aNor'), mvp: gl.getUniformLocation(prog, 'uMVP'), light: gl.getUniformLocation(prog, 'uLight'), color: gl.getUniformLocation(prog, 'uColor') };
  xr.bufs = {
    wood: buf(xrBoxVerts(meshes.boards)),
    base: buf(xrBoxVerts(meshes.base)),
    // inner outline of the drawer floor; the front edge gets its own colour
    edge: buf(xrBoxVerts([[[-w, 0, -d], [w, hh, -d + e]], [[-w, 0, -d], [-w + e, hh, d]], [[w - e, 0, -d], [w, hh, d]]])),
    front: buf(xrBoxVerts([[[-w, 0, d - e], [w, hh, d]]])),
    ring: buf(xrRingVerts(0.05, 0.065, 48)),
    dot: buf(xrRingVerts(0, 0.008, 16)),
  };
}
function xrDraw(item, mvp, color, light) {
  const gl = xr.gl, P = xr.prog;
  if (!item.n) return;
  gl.bindBuffer(gl.ARRAY_BUFFER, item.b);
  gl.vertexAttribPointer(P.pos, 3, gl.FLOAT, false, 24, 0);
  gl.vertexAttribPointer(P.nor, 3, gl.FLOAT, false, 24, 12);
  gl.uniformMatrix4fv(P.mvp, false, mvp);
  gl.uniform3fv(P.light, light);
  gl.uniform4fv(P.color, color);
  gl.drawArrays(gl.TRIANGLES, 0, item.n);
}
function xrDrawModel(pv, p, yaw, ghost) {
  const gl = xr.gl, B = xr.bufs, mvp = m4mul(pv, m4place(p, yaw));
  const c = Math.cos(yaw), s = Math.sin(yaw), L = XR_LIGHT, light = [c * L[0] - s * L[2], L[1], s * L[0] + c * L[2]];
  gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE);
  gl.depthMask(true);
  xrDraw(B.wood, mvp, [0.84, 0.66, 0.44, ghost ? 0.6 : 1], light);
  gl.depthMask(false);
  xrDraw(B.base, mvp, [0.95, 0.93, 0.88, ghost ? 0.18 : 0.26], light);
  xrDraw(B.edge, mvp, [0.47, 0.85, 0.62, 0.95], [0, 1, 0]);
  xrDraw(B.front, mvp, [0.95, 0.66, 0.26, 0.95], [0, 1, 0]);
  gl.depthMask(true);
}
function xrDrawReticle(pv, p) {
  const gl = xr.gl, mvp = m4mul(pv, m4place(p, 0));
  gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
  xrDraw(xr.bufs.ring, mvp, [1, 1, 1, 0.92], [0, 1, 0]);
  xrDraw(xr.bufs.dot, mvp, [0.47, 0.85, 0.62, 1], [0, 1, 0]);
}

// ---- WebXR session ----
async function startWebXR() {
  if (xr.session) return;
  R = analyze(state);
  const overlay = $('xrOverlay');
  let session;
  try {
    session = await navigator.xr.requestSession('immersive-ar', { requiredFeatures: ['hit-test'], optionalFeatures: ['dom-overlay'], domOverlay: { root: overlay } });
  } catch (err) {
    const n = err && err.name;
    toast(t(n === 'NotAllowedError' ? 'toast.xrDenied' : n === 'SecurityError' ? 'toast.xrHttps' : 'toast.xrUnsupported'));
    return;
  }
  xr.session = session;
  session.addEventListener('end', endedWebXR);
  try {
    const gl = document.createElement('canvas').getContext('webgl', { xrCompatible: true, alpha: true, antialias: true });
    if (!gl) throw new Error('webgl');
    xr.gl = gl;
    xrInitGL(gl);
    gl.useProgram(xr.prog.p);
    gl.enableVertexAttribArray(xr.prog.pos); gl.enableVertexAttribArray(xr.prog.nor);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    session.updateRenderState({ baseLayer: new XRWebGLLayer(session, gl) });
    xr.refSpace = await session.requestReferenceSpace('local');
    xr.hitSource = await session.requestHitTestSource({ space: await session.requestReferenceSpace('viewer') });
  } catch (err) {
    toast(t('toast.xrFail'));
    session.end().catch(() => {});
    return;
  }
  xr.reticle = null; xr.placed = null; xr.touches.clear(); xr.stage = '';
  overlay.hidden = false;
  session.addEventListener('select', () => {
    if (xr.placed || !xr.reticle) return;
    xr.placed = { p: xr.reticle.slice(), yaw: xr.ghostYaw };
  });
  session.addEventListener('selectstart', e => {
    if (!xr.placed) return;
    const pose = e.frame.getPose(e.inputSource.targetRaySpace, xr.refSpace), h = pose && xrFloorHit(pose);
    if (h) xr.touches.set(e.inputSource, h);
  });
  session.addEventListener('selectend', e => xr.touches.delete(e.inputSource));
  session.requestAnimationFrame(xrFrame);
}
function endedWebXR() {
  if (xr.hitSource) { try { xr.hitSource.cancel(); } catch (_) { /* session already gone */ } }
  const lose = xr.gl && xr.gl.getExtension('WEBGL_lose_context');
  if (lose) lose.loseContext();
  Object.assign(xr, { session: null, gl: null, prog: null, bufs: null, refSpace: null, hitSource: null, reticle: null, placed: null, stage: '' });
  xr.touches.clear();
  $('xrOverlay').hidden = true;
}
// where a touch ray meets the floor plane the model sits on, as [x, z]
function xrFloorHit(pose) {
  const o = pose.transform.position, m = pose.transform.matrix, dx = -m[8], dy = -m[9], dz = -m[10];
  if (dy > -0.02) return null;
  const t = (xr.placed.p[1] - o.y) / dy;
  return t > 0 && t < 6 ? [o.x + dx * t, o.z + dz * t] : null;
}
// one finger drags the model across the floor, two fingers turn it about their midpoint
function xrApplyTouches(frame) {
  const cur = [], P = xr.placed;
  xr.touches.forEach((last, src) => {
    const pose = frame.getPose(src.targetRaySpace, xr.refSpace), h = pose && xrFloorHit(pose);
    if (h) cur.push([src, last, h]);
  });
  if (cur.length === 1) {
    const [, a, b] = cur[0];
    P.p[0] += b[0] - a[0]; P.p[2] += b[1] - a[1];
  } else if (cur.length >= 2) {
    const [[, a0, a1], [, b0, b1]] = cur, ang = (u, v) => Math.atan2(v[0] - u[0], v[1] - u[1]);
    let dYaw = ang(a1, b1) - ang(a0, b0);
    dYaw = Math.atan2(Math.sin(dYaw), Math.cos(dYaw));
    const m0 = [(a0[0] + b0[0]) / 2, (a0[1] + b0[1]) / 2], m1 = [(a1[0] + b1[0]) / 2, (a1[1] + b1[1]) / 2];
    const rx = P.p[0] - m0[0], rz = P.p[2] - m0[1], c = Math.cos(dYaw), s = Math.sin(dYaw);
    P.p[0] = m1[0] + c * rx + s * rz; P.p[2] = m1[1] - s * rx + c * rz; P.yaw += dYaw;
  }
  cur.forEach(([src, , h]) => xr.touches.set(src, h));
}
function xrSetStage(stage) {
  if (stage === xr.stage) return;
  xr.stage = stage;
  $('xrHint').textContent = t('xr.' + stage);
  ['xrRotL', 'xrRotR', 'xrAgain'].forEach(id => { $(id).hidden = stage !== 'placed'; });
}
function xrFrame(time, frame) {
  const session = frame.session;
  if (session !== xr.session) return;
  session.requestAnimationFrame(xrFrame);
  const gl = xr.gl, layer = session.renderState.baseLayer, pose = frame.getViewerPose(xr.refSpace);
  gl.bindFramebuffer(gl.FRAMEBUFFER, layer.framebuffer);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  if (!pose) return;
  if (xr.placed) {
    if (xr.touches.size) xrApplyTouches(frame);
  } else {
    const hit = xr.hitSource && frame.getHitTestResults(xr.hitSource)[0], hp = hit && hit.getPose(xr.refSpace);
    if (hp) {
      const q = hp.transform.position, p = [q.x, q.y, q.z];
      xr.reticle = xr.reticle ? xr.reticle.map((v, i) => v + (p[i] - v) * 0.4) : p; // smooth the jitter
      xr.lost = 0;
    } else if (++xr.lost > 20) xr.reticle = null;
    if (xr.reticle) { const cam = pose.transform.position; xr.ghostYaw = Math.atan2(cam.x - xr.reticle[0], cam.z - xr.reticle[2]); }
  }
  xrSetStage(xr.placed ? 'placed' : xr.reticle ? 'aim' : 'search');
  pose.views.forEach(view => {
    const vp = layer.getViewport(view);
    gl.viewport(vp.x, vp.y, vp.width, vp.height);
    const pv = m4mul(view.projectionMatrix, view.transform.inverse.matrix);
    if (xr.placed) xrDrawModel(pv, xr.placed.p, xr.placed.yaw, false);
    else if (xr.reticle) { xrDrawModel(pv, xr.reticle, xr.ghostYaw, true); xrDrawReticle(pv, xr.reticle); }
  });
}

$('arLiveBtn').addEventListener('click', () => { if (xr.kind === 'webxr') startWebXR(); else if (xr.kind === 'quicklook') openQuickLook(); });
// taps on the overlay toolbar must not also count as a tap into the AR scene
$('xrBar').addEventListener('beforexrselect', e => e.preventDefault());
$('xrRotL').addEventListener('click', () => { if (xr.placed) xr.placed.yaw += Math.PI / 180; });
$('xrRotR').addEventListener('click', () => { if (xr.placed) xr.placed.yaw -= Math.PI / 180; });
$('xrAgain').addEventListener('click', () => { xr.placed = null; xr.reticle = null; xr.touches.clear(); });
$('xrExit').addEventListener('click', () => { if (xr.session) xr.session.end().catch(endedWebXR); });
