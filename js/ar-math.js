
// ---- 实景预览 math: cameras, projection, model files (no DOM) ----
const v3 = {
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: a => Math.hypot(a[0], a[1], a[2]),
  scale: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
};
v3.norm = a => v3.scale(a, 1 / (v3.len(a) || 1));

function solveLinear(A, b) {
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) if (r !== c) { const k = M[r][c] / M[c][c]; for (let j = c; j <= n; j++) M[r][j] -= k * M[c][j]; }
  }
  return M.map((r, i) => r[n] / r[i]);
}
// plane-to-image homography from 4 point pairs, h33 = 1
function homography(src, dst) {
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  return solveLinear(A, b);
}
// corners in screen order 左后, 右后, 右前, 左前 must form a convex, clockwise quad
function quadOk(c) {
  for (let i = 0; i < 4; i++) {
    const a = c[i], b = c[(i + 1) % 4], d = c[(i + 2) % 4];
    if ((b[0] - a[0]) * (d[1] - b[1]) - (b[1] - a[1]) * (d[0] - b[0]) <= 1e-9) return false;
  }
  return true;
}

// A camera is {f, cx, cy, M}: M (3x4) maps world [x mm, y mm (toward front), h mm (up), 1] to camera space.
function cameraPoint(cam, x, y, h) {
  const c = cam.M.map(r => r[0] * x + r[1] * y + r[2] * h + r[3]);
  return [cam.cx + cam.f * c[0] / c[2], cam.cy + cam.f * c[1] / c[2], c[2]];
}
// orbit camera looking at the drawer from the front, yaw / pitch in degrees
function orbitCamera(W, D, H, yaw, pitch, cw, ch) {
  const f = Math.min(cw, ch) * 1.25, yr = yaw * Math.PI / 180, pr = pitch * Math.PI / 180;
  const T = [W / 2, D / 2, H * 0.3];
  const r = Math.hypot(W + 2 * WALL, D + 2 * WALL) / 2 + 20;
  const dist = r * f / (Math.min(cw, ch) / 2) * 1.08;
  const C = [T[0] + dist * Math.cos(pr) * Math.sin(yr), T[1] + dist * Math.cos(pr) * Math.cos(yr), T[2] + dist * Math.sin(pr)];
  const fw = v3.norm(v3.sub(T, C)), right = v3.norm(v3.cross([0, 0, 1], fw)), down = v3.cross(right, fw);
  return { f, cx: cw / 2, cy: ch / 2, M: [right, down, fw].map(row => [row[0], row[1], row[2], -v3.dot(row, C)]) };
}
// camera recovered from the drawer floor's four inner corners in a photo (pixels inside rect)
function photoCamera(W, D, cornersPx, rect) {
  const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
  const Hm = homography([[0, 0], [W, 0], [W, D], [0, D]], cornersPx.map(p => [p[0] - cx, p[1] - cy]));
  if (!Hm) return null;
  const [h11, h12, h13, h21, h22, h23, h31, h32] = Hm, long = Math.max(rect.w, rect.h);
  const okF = f => f > 0.45 * long && f < 1.8 * long;
  // focal length from r1 ⟂ r2, then from |r1| = |r2|, else a typical phone main camera
  let f = 0;
  if (Math.abs(h31 * h32) > 1e-14) { const f2 = -(h11 * h12 + h21 * h22) / (h31 * h32); if (f2 > 0) f = Math.sqrt(f2); }
  if (!okF(f)) { const d = h31 * h31 - h32 * h32; const f2 = Math.abs(d) > 1e-14 ? (h12 * h12 + h22 * h22 - h11 * h11 - h21 * h21) / d : -1; f = f2 > 0 ? Math.sqrt(f2) : 0; }
  if (!okF(f)) f = 0.78 * long;
  const a1 = [h11 / f, h21 / f, h31], a2 = [h12 / f, h22 / f, h32], a3 = [h13 / f, h23 / f, 1];
  const lam = 2 / (v3.len(a1) + v3.len(a2));
  const c1 = v3.scale(a1, lam), c2 = v3.scale(a2, lam), t = v3.scale(a3, lam);
  // the floor columns reproduce the homography exactly; height runs along the floor normal, toward the camera
  let n = v3.norm(v3.cross(c1, c2));
  if (v3.dot(n, t) > 0) n = v3.scale(n, -1);
  n = v3.scale(n, (v3.len(c1) + v3.len(c2)) / 2);
  return { f, cx, cy, M: [0, 1, 2].map(i => [c1[i], c2[i], n[i], t[i]]) };
}

// visible faces of axis-aligned boxes {x0,x1,y0,y1,h0,h1,kind}, far to near, projected to the image
const AR_FACES = [
  { n: [0, 0, 1], q: b => [[b.x0, b.y0, b.h1], [b.x1, b.y0, b.h1], [b.x1, b.y1, b.h1], [b.x0, b.y1, b.h1]] },
  { n: [-1, 0, 0], q: b => [[b.x0, b.y0, b.h0], [b.x0, b.y1, b.h0], [b.x0, b.y1, b.h1], [b.x0, b.y0, b.h1]] },
  { n: [1, 0, 0], q: b => [[b.x1, b.y0, b.h0], [b.x1, b.y1, b.h0], [b.x1, b.y1, b.h1], [b.x1, b.y0, b.h1]] },
  { n: [0, -1, 0], q: b => [[b.x0, b.y0, b.h0], [b.x1, b.y0, b.h0], [b.x1, b.y0, b.h1], [b.x0, b.y0, b.h1]] },
  { n: [0, 1, 0], q: b => [[b.x0, b.y1, b.h0], [b.x1, b.y1, b.h0], [b.x1, b.y1, b.h1], [b.x0, b.y1, b.h1]] },
];
const AR_LIGHT = v3.norm([-0.35, 0.45, 0.82]);
function visibleFaces(cam, boxes) {
  const M = cam.M, faces = [];
  const toCam = p => M.map(r => r[0] * p[0] + r[1] * p[1] + r[2] * p[2] + r[3]);
  boxes.forEach(b => AR_FACES.forEach(F => {
    const cs = F.q(b).map(toCam);
    if (cs.some(c => c[2] <= 1)) return;
    const cc = [0, 1, 2].map(i => (cs[0][i] + cs[1][i] + cs[2][i] + cs[3][i]) / 4);
    const nc = M.map(r => r[0] * F.n[0] + r[1] * F.n[1] + r[2] * F.n[2]);
    if (v3.dot(nc, cc) >= 0) return; // facing away
    faces.push({ z: cc[2], kind: b.kind, shade: 0.58 + 0.42 * Math.max(0, v3.dot(F.n, AR_LIGHT)), pts: cs.map(c => [cam.cx + cam.f * c[0] / c[2], cam.cy + cam.f * c[1] / c[2]]) });
  }));
  return faces.sort((a, b) => b.z - a.z);
}

// ---- model files for AR viewers: meters, Y up, drawer front toward +Z ----
const P8 = ([x0, y0, z0], [x1, y1, z1]) => [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
const BOX_FACES = [[[0, 3, 2, 1], [0, 0, -1]], [[4, 5, 6, 7], [0, 0, 1]], [[0, 1, 5, 4], [0, -1, 0]], [[3, 7, 6, 2], [0, 1, 0]], [[0, 4, 7, 3], [-1, 0, 0]], [[1, 2, 6, 5], [1, 0, 0]]];
function arMeshes(boards, W, D, H) {
  const m = 1 / 1000, toU = (x, y, h) => [(x - W / 2) * m, h * m, (y - D / 2) * m];
  return { boards: boards.map(b => [toU(b.x0, b.y0, 0), toU(b.x1, b.y1, H)]), base: [[toU(0, 0, -1), toU(W, D, 0)]] };
}
function usdaText(meshes) {
  const n = v => +v.toFixed(5), tup = p => `(${n(p[0])}, ${n(p[1])}, ${n(p[2])})`;
  const mesh = (name, boxes, mat) => {
    const pts = [], idx = [], nrm = [], mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    boxes.forEach(box => {
      const o = pts.length, p = P8(...box);
      p.forEach(q => { pts.push(q); for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], q[k]); mx[k] = Math.max(mx[k], q[k]); } });
      BOX_FACES.forEach(([f, nv]) => { f.forEach(i => { idx.push(o + i); nrm.push(nv); }); });
    });
    return `
    def Mesh "${name}" (
        prepend apiSchemas = ["MaterialBindingAPI"]
    )
    {
        float3[] extent = [${tup(mn)}, ${tup(mx)}]
        int[] faceVertexCounts = [${new Array(boxes.length * 6).fill(4).join(', ')}]
        int[] faceVertexIndices = [${idx.join(', ')}]
        rel material:binding = </Root/Materials/${mat}>
        normal3f[] normals = [${nrm.map(tup).join(', ')}] (
            interpolation = "faceVarying"
        )
        point3f[] points = [${pts.map(tup).join(', ')}]
        uniform token subdivisionScheme = "none"
    }
`;
  };
  const material = (name, color, opacity, rough) => `
        def Material "${name}"
        {
            token outputs:surface.connect = </Root/Materials/${name}/Surface.outputs:surface>
            def Shader "Surface"
            {
                uniform token info:id = "UsdPreviewSurface"
                color3f inputs:diffuseColor = ${tup(color)}
                float inputs:metallic = 0
                float inputs:roughness = ${rough}
                float inputs:opacity = ${opacity}
                token outputs:surface
            }
        }
`;
  return `#usda 1.0
(
    defaultPrim = "Root"
    metersPerUnit = 1
    upAxis = "Y"
)

def Xform "Root" (
    kind = "component"
)
{
    def Scope "Materials"
    {${material('Wood', [0.62, 0.38, 0.18], 1, 0.75)}${material('Base', [0.9, 0.9, 0.85], 0.35, 0.9)}    }
${meshes.boards.length ? mesh('Dividers', meshes.boards, 'Wood') : ''}${mesh('Floor', meshes.base, 'Base')}}
`;
}
function concatBytes(arrs) {
  const out = new Uint8Array(arrs.reduce((s, a) => s + a.length, 0));
  let o = 0;
  arrs.forEach(a => { out.set(a, o); o += a.length; });
  return out;
}
function glbBytes(meshes) {
  const bins = [], views = [], accs = [], prims = [];
  let off = 0;
  const addView = (arr, target) => { const u8 = new Uint8Array(arr.buffer); views.push({ buffer: 0, byteOffset: off, byteLength: u8.length, target }); bins.push(u8); off += u8.length; return views.length - 1; };
  [[meshes.boards, 0], [meshes.base, 1]].forEach(([boxes, mat]) => {
    if (!boxes.length) return;
    const pos = [], nor = [], ind = [];
    boxes.forEach(box => {
      const p = P8(...box);
      BOX_FACES.forEach(([q, nv]) => { const o = pos.length / 3; q.forEach(i => { pos.push(...p[i]); nor.push(...nv); }); ind.push(o, o + 1, o + 2, o, o + 2, o + 3); });
    });
    const P = new Float32Array(pos), mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < P.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], P[i + k]); mx[k] = Math.max(mx[k], P[i + k]); }
    accs.push({ bufferView: addView(P, 34962), componentType: 5126, count: P.length / 3, type: 'VEC3', min: mn, max: mx });
    accs.push({ bufferView: addView(new Float32Array(nor), 34962), componentType: 5126, count: P.length / 3, type: 'VEC3' });
    accs.push({ bufferView: addView(new Uint32Array(ind), 34963), componentType: 5125, count: ind.length, type: 'SCALAR' });
    prims.push({ attributes: { POSITION: accs.length - 3, NORMAL: accs.length - 2 }, indices: accs.length - 1, material: mat });
  });
  const json = {
    asset: { version: '2.0', generator: 'drawer-dividers' }, scene: 0, scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: 'DrawerDividers' }], meshes: [{ primitives: prims }],
    materials: [
      { name: 'Wood', pbrMetallicRoughness: { baseColorFactor: [0.62, 0.38, 0.18, 1], metallicFactor: 0, roughnessFactor: 0.75 } },
      { name: 'Base', alphaMode: 'BLEND', pbrMetallicRoughness: { baseColorFactor: [0.9, 0.9, 0.85, 0.35], metallicFactor: 0, roughnessFactor: 0.9 } },
    ],
    accessors: accs, bufferViews: views, buffers: [{ byteLength: off }],
  };
  let js = new TextEncoder().encode(JSON.stringify(json));
  if (js.length % 4) js = concatBytes([js, new Uint8Array(4 - js.length % 4).fill(0x20)]);
  const bin = concatBytes(bins), head = new DataView(new ArrayBuffer(20)), binHead = new DataView(new ArrayBuffer(8));
  head.setUint32(0, 0x46546C67, true); head.setUint32(4, 2, true); head.setUint32(8, 28 + js.length + bin.length, true);
  head.setUint32(12, js.length, true); head.setUint32(16, 0x4E4F534A, true);
  binHead.setUint32(0, bin.length, true); binHead.setUint32(4, 0x004E4942, true);
  return concatBytes([new Uint8Array(head.buffer), js, new Uint8Array(binHead.buffer), bin]);
}
const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(u8) { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC_T[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
// uncompressed zip; align > 0 pads each file's data to that boundary (usdz needs 64)
function zipStore(files, align) {
  const enc = new TextEncoder(), chunks = [], central = [], now = new Date();
  const dt = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dd = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  let off = 0;
  files.forEach(f => {
    const name = enc.encode(f.name), crc = crc32(f.data), size = f.data.length;
    let extra = new Uint8Array(0);
    if (align) {
      const pad = (align - ((off + 30 + name.length + 4) % align)) % align;
      extra = new Uint8Array(4 + pad);
      const ev = new DataView(extra.buffer); ev.setUint16(0, 0x3039, true); ev.setUint16(2, pad, true);
    }
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(10, dt, true); h.setUint16(12, dd, true);
    h.setUint32(14, crc, true); h.setUint32(18, size, true); h.setUint32(22, size, true); h.setUint16(26, name.length, true); h.setUint16(28, extra.length, true);
    chunks.push(new Uint8Array(h.buffer), name, extra, f.data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(12, dt, true); c.setUint16(14, dd, true);
    c.setUint32(16, crc, true); c.setUint32(20, size, true); c.setUint32(24, size, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
    central.push(new Uint8Array(c.buffer), name);
    off += 30 + name.length + extra.length + size;
  });
  const cd = concatBytes(central), e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, cd.length, true); e.setUint32(16, off, true);
  return concatBytes([...chunks, cd, new Uint8Array(e.buffer)]);
}
