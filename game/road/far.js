// ============================================================
// Past the edge of the road's land, out to the horizon.
//
// The skirt: ground that picks up exactly where the land's 5 m grid
// stops (same vertices along the join, same shader), then eases out
// into long, low swells that rise a little towards the horizon, so
// the world no longer ends 330 m off the road.
//
// The ranges: three rings of old, worn hills and buttes, 1.6, 2.4 and
// 3.2 km out. Each sits further into the haze than the one in front,
// the way far country does in dusty air, and the haze in front of them
// goes golden towards the sun. The ones facing the morning sun catch
// it; the ones with their backs to it stand as dark shapes.
// ============================================================
import { THREE, clamp, lerp, smooth, noise2, G, M } from './core.js';
import { h, HALF_W, LAND_Z1 } from './land.js';
import { HAZEU } from '../shared/post.js';

const Z0 = -100, Z1 = LAND_Z1;                               // the land's own extent (land.js builds its chunks to LAND_Z1)
const OUT = [5, 15, 35, 75, 155, 315, 635, 1100, 1700, 2400];   // how far past the edge each row or column of the skirt sits

// ---------- the skirt ----------
const edgeCache = new Map();
function edgeH(cx, cz) { const k = cx + ',' + cz; let v = edgeCache.get(k); if (v === undefined) { v = h(cx, cz) - 0.02; edgeCache.set(k, v); } return v; }
export function farHeight(x, z) {
  const cx = clamp(x, -HALF_W, HALF_W), cz = clamp(z, Z0, Z1), d = Math.hypot(x - cx, z - cz);
  const edge = edgeH(Math.round(cx * 100) / 100, Math.round(cz * 100) / 100);
  if (d <= 0) return edge;
  const swell = 8 * noise2(x * 0.2, z * 0.2) + 12 * Math.max(0, Math.sin(x * 0.0021 + z * 0.0013) * Math.cos(z * 0.0017 - x * 0.0009)) + 22 * smooth(300, 2400, d) * (0.6 + 0.4 * noise2(x * 0.05 + 3, z * 0.05));
  return lerp(edge, swell - 1.5, smooth(0, 280, d));
}
function buildSkirt() {
  const xs = [], zs = [];
  for (let k = OUT.length - 1; k >= 0; k--) xs.push(-HALF_W - OUT[k]);
  for (let x = -HALF_W; x <= HALF_W + 1e-6; x += 5) xs.push(x);
  for (const o of OUT) xs.push(HALF_W + o);
  for (let k = OUT.length - 1; k >= 0; k--) zs.push(Z0 - OUT[k]);
  for (let z = Z0; z <= Z1 + 1e-6; z += 5) zs.push(z);
  for (const o of OUT) zs.push(Z1 + o);
  const NX = xs.length, inside = (x, z) => x > -HALF_W + 1e-6 && x < HALF_W - 1e-6 && z > Z0 + 1e-6 && z < Z1 - 1e-6;
  const pos = new Float32Array(NX * zs.length * 3), col = new Float32Array(NX * zs.length * 3), uv = new Float32Array(NX * zs.length * 2), salt = new Float32Array(NX * zs.length), idx = [];
  const c = new THREE.Color();
  zs.forEach((z, j) => xs.forEach((x, i) => {
    const k = j * NX + i, y = inside(x, z) ? 0 : farHeight(x, z);
    pos.set([x, y, z], k * 3); uv.set([x / 2.5, z / 2.5], k * 2);
    const n = noise2(x * 3.1, z * 2.7) * 0.5 + 0.5; c.setRGB(1.0, 0.93, 0.88).multiplyScalar(0.82 + n * 0.3);   // as the land's own ground (land.js)
    col.set([c.r, c.g, c.b], k * 3);
  }));
  // only the quads outside the land: the land draws its own
  for (let j = 0; j < zs.length - 1; j++) for (let i = 0; i < NX - 1; i++) {
    const mx = (xs[i] + xs[i + 1]) / 2, mz = (zs[j] + zs[j + 1]) / 2;
    if (inside(mx, mz)) continue;
    const a = j * NX + i, b = a + 1, cc = a + NX, d = cc + 1; idx.push(a, cc, b, b, cc, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setAttribute('aSalt', new THREE.BufferAttribute(salt, 1));
  g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, M.ground); m.receiveShadow = true; m.frustumCulled = false; G.scene.add(m);
}

// ---------- the ranges ----------
const RU = { uHaze: { value: new THREE.Color() }, uSunHaze: HAZEU.uSunHaze, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color(1, 0.9, 0.8) } };
function rangeMaterial(amount) {
  return new THREE.ShaderMaterial({
    uniforms: { ...RU, uAmt: { value: amount } }, fog: false,
    vertexShader: `attribute float aH; varying vec3 vN; varying vec3 vW; varying float vH;
      void main(){ vN = normalize(normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vH = aH; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform vec3 uHaze; uniform vec3 uSunHaze; uniform vec3 uSunDir; uniform vec3 uSunCol; uniform float uAmt; varying vec3 vN; varying vec3 vW; varying float vH;
      void main(){
        vec3 rock = mix(vec3(0.16, 0.065, 0.04), vec3(0.34, 0.15, 0.08), vH);           // weathered red rock, paler up top
        float lit = max(dot(normalize(vN), uSunDir), 0.0);
        vec3 c = rock * (0.35 + 1.5 * lit * uSunCol);
        vec3 v = normalize(vW - cameraPosition);
        vec3 haze = mix(uHaze, uSunHaze, pow(max(dot(v, uSunDir), 0.0), 5.0) * 0.8);
        c = mix(c, haze, clamp(uAmt - 0.12 * vH, 0.0, 1.0));
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}
// a ring of hills round the land, dist metres out: a wall of rock whose top is the skyline, facing in
function buildRange(dist, height, seed, amount) {
  const cx = 0, cz = (Z0 + Z1) / 2, hx = HALF_W, hz = (Z1 - Z0) / 2, pos = [], aH = [], idx = [];
  const N = Math.round((2 * (hx + dist) + 2 * (hz + dist)) * Math.PI / 2 / 45);
  let s = 0, px = 0, pz = 0;
  for (let i = 0; i <= N; i++) {
    const a = i / N * Math.PI * 2, sx = Math.sin(a), sz = Math.cos(a);
    const r = Math.min(hx / Math.max(1e-4, Math.abs(sx)), hz / Math.max(1e-4, Math.abs(sz))) + dist * (1 + 0.12 * noise2(i * 7.3 + seed, seed * 3.1));
    const x = cx + sx * r, z = cz + sz * r;
    if (i) s += Math.hypot(x - px, z - pz); px = x; pz = z;
    // the skyline: long worn ridges, a few buttes standing proud with flat tops, nicks and saddles between
    const ridge = 0.45 + 0.35 * Math.sin(s * 0.0011 + seed) + 0.2 * Math.sin(s * 0.0037 + seed * 2.3);
    const butte = Math.max(0, Math.sin(s * 0.0023 + seed * 4.1)) ** 6;
    const top = height * clamp(ridge + 0.6 * butte + 0.08 * Math.sin(s * 0.019 + seed), 0.12, 1.25);
    const flat = butte > 0.5 ? Math.min(top, height * (0.95 + 0.1 * Math.sin(seed))) : top;
    pos.push(x, -40, z, x, flat, z); aH.push(0, clamp(flat / (height * 1.2), 0, 1));
  }
  for (let i = 0; i < N; i++) { const a = i * 2, b = a + 1, c = a + 2, d = a + 3; idx.push(a, b, c, b, d, c); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aH', new THREE.Float32BufferAttribute(aH, 1));
  g.setIndex(idx); g.computeVertexNormals();
  // tilt the normals up a little, as slopes rather than cliffs, so the sun picks out the faces turned to it
  const n = g.attributes.normal; for (let i = 0; i < n.count; i++) { const y = n.getY(i) + 0.55, l = Math.hypot(n.getX(i), y, n.getZ(i)); n.setXYZ(i, n.getX(i) / l, y / l, n.getZ(i) / l); }
  const m = new THREE.Mesh(g, rangeMaterial(amount)); m.frustumCulled = false; m.renderOrder = -5; G.scene.add(m);
}

export function buildFar() {
  buildSkirt();
  buildRange(1600, 95, 1.3, 0.6); buildRange(2400, 150, 4.7, 0.72); buildRange(3200, 210, 8.9, 0.82);
}
// the haze and the sun move through the morning; the ranges follow them
export function updateFar(sunDir, sunColor, fogColor) {
  RU.uSunDir.value.copy(sunDir); RU.uSunCol.value.copy(sunColor); RU.uHaze.value.copy(fogColor);
}
