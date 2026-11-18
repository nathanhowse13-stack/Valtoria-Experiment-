// ============================================================
// The ground, close up. Two things:
//
// The ground's own shader: the dirt sampled in world space at three
// scales that never line up (so it doesn't tile), broad patches of
// redder gravel and paler wash, relief that fades out with distance so
// it never shimmers; the salt pans broken into crust polygons with raised
// edges; the old bitumen's chip-seal stones and crocodile cracks with red
// dust in them; and dark, wet ground round the pipeline's leaks.
//
// And a ring of small things that follows the camera: pebbles, stones,
// dry grass that leans with the wind, dead sticks, and flecks of mica,
// salt and broken glass that catch the sun. The ring is a grid of 8 m
// cells that wraps round as the camera moves; each cell's contents come
// from its own seed, so the same stones are always in the same place.
// It is all a handful of instanced draws, and it shrinks away at the edge
// of the ring rather than popping.
// ============================================================
import { THREE, G, W, M, SWAY, shades } from './core.js';
import { h, HALF_W, nearestRoad, saltAt, inCanyon, landBlocked, PITS, TALLY } from './land.js';
import { scaleU } from './air.js';
import { inCity } from '../city/plan.js';
import { POSTU, POST_GLSL, HAZEU } from '../shared/post.js';

// ---------- the ground's shader ----------
const NOISE_GLSL = `
float gHash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float gNoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(gHash(i), gHash(i + vec2(1.0, 0.0)), f.x), mix(gHash(i + vec2(0.0, 1.0)), gHash(i + vec2(1.0, 1.0)), f.x), f.y); }
// a jittered grid of points: the distance to the nearest (x), to the next nearest (y), and the nearest one's own random value (z)
vec3 gVor(vec2 p){ vec2 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0, id = 0.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 o = vec2(float(x), float(y)), r = o + vec2(gHash(i + o), gHash(i + o + 17.31)) * 0.76 + 0.12 - f; float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; id = gHash(i + o + 3.7); } else if (d < d2) d2 = d; }
  return vec3(sqrt(d1), sqrt(d2), id); }
// the gap between the nearest and next-nearest: zero along the cracks between cells
float gCells(vec2 p){ vec3 v = gVor(p); return v.y - v.x; }
const mat2 gRot = mat2(0.8, -0.6, 0.6, 0.8);
`;
const WET_N = 8;
const GU = { uWet: { value: Array.from({ length: WET_N }, () => new THREE.Vector4(0, 0, 0, 0)) }, uSunXZ: { value: new THREE.Vector2(0, 1) } };

// the dirt, the salt and the wet: the open land (it carries aSalt from land.js)
function groundPatch(mat) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, GU);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aSalt; varying float vSalt; varying vec3 vGW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGW = (modelMatrix * vec4(transformed, 1.0)).xyz; vSalt = aSalt;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying float vSalt; varying vec3 vGW; uniform vec4 uWet[${WET_N}]; uniform vec2 uSunXZ;\n${NOISE_GLSL}`)
      .replace('#include <map_fragment>', `
        vec2 gp = vGW.xz; float gDist = length(vViewPosition);
        vec3 d1 = texture2D(map, gp / 2.5).rgb, d2 = texture2D(map, gRot * gp / 8.7 + vec2(0.37, 0.71)).rgb, d3 = texture2D(map, gp / 41.0 + vec2(0.11, 0.53)).rgb;
        vec3 dirt = d1 * 0.5 + d2 * 0.32 + d3 * 0.18;
        // broad patches: redder ironstone gravel, a paler wash where water once ran, darker where it pooled
        float m1 = gNoise(gp / 37.0), m2 = gNoise(gRot * gp / 13.0 + 5.3), m3 = gNoise(gp / 90.0 + 2.1);
        dirt *= mix(vec3(1.12, 0.92, 0.84), vec3(0.95, 0.99, 1.04), m1) * (0.88 + 0.22 * m2) * (0.92 + 0.16 * m3);
        // the salt: bleached, and broken into a crust of polygons with raised, sun-caught edges
        float gSalt = smoothstep(0.25, 0.8, vSalt);
        if (gSalt > 0.0) {
          vec2 sp = gp / 1.6 + vec2(gNoise(gp * 0.7), gNoise(gp * 0.7 + 9.1)) * 0.5;          // warped, so the polygons aren't too regular
          float c0 = gCells(sp), c1 = gCells(sp + uSunXZ * 0.05), c2 = gCells(gp / 0.55 + 4.0);
          float crustFade = 1.0 - smoothstep(25.0, 90.0, gDist);
          float ridge = (1.0 - smoothstep(0.0, 0.11, c0)) * crustFade, fine = (1.0 - smoothstep(0.0, 0.07, c2)) * (1.0 - smoothstep(6.0, 22.0, gDist));
          float lit = clamp((c1 - c0) * 9.0, -1.0, 1.0) * ridge;
          vec3 crust = vec3(0.97, 0.96, 0.93) * (0.9 + 0.1 * gNoise(gp * 2.7));
          crust *= 1.0 + ridge * 0.09 + lit * 0.1 - fine * 0.05;                               // raised edges, lit on the sun's side; finer cracks between
          crust *= 1.0 - 0.12 * smoothstep(0.55, 0.85, gNoise(gp / 7.0)) * (1.0 - ridge);      // a grey film where it's damp underneath
          crust = mix(crust, crust * vec3(1.0, 0.93, 0.86), smoothstep(0.5, 0.9, gNoise(gp / 23.0 + 7.0)) * 0.6);   // and the red dust blown out over it
          dirt = mix(dirt, crust * (0.4 + 0.6 * dot(dirt, vec3(0.3, 0.59, 0.11)) * 2.2), gSalt);
        }
        // wet ground round the leaks: darker, glossy, a ragged edge
        float gWet = 0.0;
        for (int i = 0; i < ${WET_N}; i++) { vec4 w = uWet[i]; if (w.w <= 0.0) continue; float d = length(gp - w.xy) + (gNoise(gp * 1.1 + float(i) * 3.7) - 0.5) * w.z * 0.6; gWet = max(gWet, (1.0 - smoothstep(w.z * 0.3, w.z, d)) * w.w); }
        dirt *= mix(1.0, 0.48, gWet);
        diffuseColor.rgb *= dirt;`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.3, gWet * 0.85); roughnessFactor = mix(roughnessFactor, 0.72, gSalt * 0.6);')
      .replace('#include <normal_fragment_maps>', `
        #ifdef USE_NORMALMAP_TANGENTSPACE
        {
          // the dirt's relief from two scales (the same directions as the uv the frame was built from), fading out with distance
          float nf = 1.0 - smoothstep(14.0, 70.0, gDist);
          vec3 n1 = texture2D(normalMap, gp / 2.5).xyz * 2.0 - 1.0, n2 = texture2D(normalMap, gp / 0.83 + vec2(0.3, 0.6)).xyz * 2.0 - 1.0;
          vec3 mapN = vec3((n1.xy * 0.7 + n2.xy * 0.5 * nf) * normalScale * (0.3 + 0.7 * nf) * (1.0 - gSalt * 0.7) * (1.0 - gWet * 0.6), 1.0);
          normal = normalize(tbn * mapN);
        }
        #endif`);
  };
  mat.customProgramCacheKey = () => 'road-ground';
  mat.needsUpdate = true;
}
// the canyon road and the side tracks: compacted dirt, the same three scales so the wheel ruts don't repeat
function trackPatch(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vGW;\n${NOISE_GLSL}`)
      .replace('#include <map_fragment>', `
        vec2 gp = vGW.xz; float gDist = length(vViewPosition);
        vec3 dirt = texture2D(map, gp / 2.5).rgb * 0.55 + texture2D(map, gRot * gp / 7.9 + vec2(0.61, 0.13)).rgb * 0.3 + texture2D(map, gp / 33.0 + 0.4).rgb * 0.15;
        dirt *= 0.9 + 0.2 * gNoise(gp / 9.0);
        diffuseColor.rgb *= dirt;`)
      .replace('#include <normal_fragment_maps>', `
        #ifdef USE_NORMALMAP_TANGENTSPACE
        {
          float nf = 1.0 - smoothstep(12.0, 60.0, gDist);
          vec3 n1 = texture2D(normalMap, gp / 2.5).xyz * 2.0 - 1.0, n2 = texture2D(normalMap, gp / 0.9 + 0.5).xyz * 2.0 - 1.0;
          normal = normalize(tbn * vec3((n1.xy * 0.7 + n2.xy * 0.45 * nf) * normalScale * (0.4 + 0.6 * nf), 1.0));
        }
        #endif`);
  };
  mat.customProgramCacheKey = () => 'road-track';
  mat.needsUpdate = true;
}
// the old bitumen: the stones in the seal, worn smooth in the wheel paths, and crocodile cracks with red dust blown into them
function sealPatch(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vGW;\n${NOISE_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec2 gp = vGW.xz; float gDist = length(vViewPosition);
        float seal = 1.0 - smoothstep(0.1, 0.3, diffuseColor.r);                 // the vertex colour says where the bitumen still is
        float near = 1.0 - smoothstep(8.0, 34.0, gDist), aa = clamp(1.6 - length(fwidth(gp * 26.0)) * 1.4, 0.0, 1.0);   // chips fade before they'd shimmer
        // aggregate: pale and dark chips set in the black, rounded, a few centimetres across
        vec3 v1 = gVor(gp * 22.0);
        float sz = 0.2 + 0.28 * fract(v1.z * 13.1);                                  // every chip its own size
        float chip = smoothstep(sz + 0.1, sz - 0.05, v1.x) * step(0.3, v1.z) * seal * near * aa * (0.55 + 0.45 * gNoise(gp * 1.7));
        vec3 stone = mix(vec3(0.06, 0.055, 0.05), vec3(0.3, 0.27, 0.24), smoothstep(0.45, 1.0, fract(v1.z * 7.3)));   // most still coated black, some worn pale
        diffuseColor.rgb = mix(diffuseColor.rgb, stone, chip * 0.6);
        // the cracks: a net of them where the seal has gone brittle, red dust blown into every one
        float net = clamp(smoothstep(0.45, 0.7, gNoise(gp / 6.0 + 3.0)) + smoothstep(0.72, 0.9, gNoise(gp / 2.1)), 0.0, 1.0);
        vec2 cp = gp / 0.5 + vec2(gNoise(gp * 1.3), gNoise(gp * 1.3 + 5.0)) * 0.6;
        float cr = 1.0 - smoothstep(0.02, 0.09 + 0.08 * (1.0 - near), gCells(cp));
        float crack = cr * net * seal * (1.0 - smoothstep(25.0, 70.0, gDist));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.44, 0.19, 0.1), crack * 0.9);
        float gCrack = crack;`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.78, seal * (1.0 - gCrack) * 0.5);')
      .replace('#include <normal_fragment_maps>', `
        #ifdef USE_NORMALMAP_TANGENTSPACE
        {
          float nf = 1.0 - smoothstep(10.0, 50.0, gDist);
          vec3 n1 = texture2D(normalMap, gp / 2.5).xyz * 2.0 - 1.0, n2 = texture2D(normalMap, gp / 0.7 + 0.2).xyz * 2.0 - 1.0;
          normal = normalize(tbn * vec3((n1.xy * 0.6 + n2.xy * 0.6 * nf) * normalScale * (0.35 + 0.65 * nf) + vec2(gCrack * 0.25), 1.0));
        }
        #endif`);
  };
  mat.customProgramCacheKey = () => 'road-seal';
  mat.needsUpdate = true;
}

// ---------- the ring of small things ----------
const CELL = 8;
const RING = { low: 3, medium: 4, high: 5, ultra: 6 };          // cells either side of the camera's
const PER = { low: 0.6, medium: 0.85, high: 1, ultra: 1.2 };     // how full each cell is
const FADEU = { uDetCam: { value: new THREE.Vector3() }, uDetFade: { value: new THREE.Vector2(30, 40) } };

// everything here shrinks away towards the edge of the ring; the grass also leans with the wind (in world space)
function ringPatch(mat, key, { wind = 0 } = {}) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, FADEU, { uTime: SWAY.uTime, uWind: SWAY.uWind });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uDetCam; uniform vec2 uDetFade; uniform float uTime; uniform vec3 uWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 dIp = instanceMatrix[3].xyz;
        transformed *= 1.0 - smoothstep(uDetFade.x, uDetFade.y, distance(dIp.xz, uDetCam.xz));`)
      .replace('#include <project_vertex>', `
        vec4 mvPosition = instanceMatrix * vec4(transformed, 1.0);
        ${wind ? `{ float k = clamp(position.y, 0.0, 1.0), sy = length(instanceMatrix[1].xyz); k *= k; float sw = sin(uTime * (1.7 + uWind.z * 1.5) + dIp.x * 0.83 + dIp.z * 0.61), fl = sin(uTime * 5.3 + dIp.x * 3.1);
          mvPosition.xz += (uWind.xy * (0.06 + 0.22 * uWind.z) * (0.75 + 0.5 * sw) + vec2(fl, -fl) * 0.03 * uWind.z) * sy * k * ${wind.toFixed(2)}; }` : ''}
        mvPosition = modelViewMatrix * mvPosition;
        gl_Position = projectionMatrix * mvPosition;`);
  };
  mat.customProgramCacheKey = () => 'detail-' + key;
  return mat;
}

// the shapes: a chipped pebble, a lumpy stone, a tuft of dry grass, a forked dead stick
function lumpy(geo, amt, seed) {
  const p = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i); const n = Math.sin(v.x * 3.1 + seed) * Math.cos(v.z * 2.7 - seed) + Math.sin(v.y * 4.3 + seed * 2);
    v.multiplyScalar(1 + n * amt); p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals(); return geo;
}
function tuftGeometry() {
  const blades = [], N = 9;
  for (let b = 0; b < N; b++) {
    const a = b * 2.39996, lean = 0.15 + (b % 4) * 0.12, len = 0.65 + (b % 3) * 0.18, w = 0.022;
    const g = new THREE.PlaneGeometry(w, len, 1, 3); g.translate(0, len / 2, 0);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i), t = y / len;
      p.setX(i, p.getX(i) * (1 - t * 0.85));                                  // taper to a point
      p.setZ(i, lean * t * t * len);                                          // and curl out
    }
    g.rotateY(a); g.translate(Math.cos(a) * 0.04, 0, Math.sin(a) * 0.04);
    blades.push(g);
  }
  const out = mergeGeos(blades);
  // grass reads best lit from above, whichever side you see it from
  const n = out.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  // heights are normalised to 1 so the wind can bend the tips more than the base
  return out;
}
function stickGeometry() {
  const main = new THREE.CylinderGeometry(0.35, 0.6, 1, 5, 1); main.rotateZ(Math.PI / 2);
  const fork = new THREE.CylinderGeometry(0.2, 0.35, 0.45, 4, 1); fork.rotateZ(Math.PI / 2); fork.translate(0.22, 0, 0); fork.rotateY(0.6); fork.translate(0.12, 0, 0.08);
  return mergeGeos([main, fork]);
}
function mergeGeos(list) {
  let n = 0; for (const g of list) n += (g.index ? g.index.count : g.attributes.position.count);
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3); let o = 0;
  for (const g0 of list) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count;
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return g;
}

// a layer: one instanced mesh, a block of instances for every cell slot in the ring
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
class Layer {
  constructor(name, geo, mat, per, { cast = false, depth = null } = {}) { Object.assign(this, { name, geo, mat, per0: per, cast, depth }); this.im = null; }
  alloc(slots, fill) {
    if (this.im) { G.scene.remove(this.im); this.im.dispose(); }
    this.per = Math.max(1, Math.round(this.per0 * fill));
    const n = this.per * slots, im = this.im = new THREE.InstancedMesh(this.geo, this.mat, n);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < n; i++) im.setMatrixAt(i, ZERO);
    im.frustumCulled = false; im.castShadow = this.cast; im.receiveShadow = true;
    if (this.depth) im.customDepthMaterial = this.depth;                // so a stone's shadow shrinks away with it
    G.scene.add(im);
  }
  write(slot, list) {
    const im = this.im, base = slot * this.per, m = im.instanceMatrix.array, c = im.instanceColor.array;
    for (let i = 0; i < this.per; i++) {
      const k = base + i, e = i < list.length ? list[i] : null;
      if (e) { e.m.toArray(m, k * 16); c[k * 3] = e.r; c[k * 3 + 1] = e.g; c[k * 3 + 2] = e.b; }
      else ZERO.toArray(m, k * 16);
    }
    im.instanceMatrix.addUpdateRange(base * 16, this.per * 16); im.instanceMatrix.needsUpdate = true;
    im.instanceColor.addUpdateRange(base * 3, this.per * 3); im.instanceColor.needsUpdate = true;
  }
}
// glints: specks that flash when the sun, the speck and the eye line up
class Glints {
  constructor(per) { this.per0 = per; this.points = null; }
  alloc(slots, fill) {
    if (this.points) { G.scene.remove(this.points); this.points.geometry.dispose(); }
    this.per = Math.max(1, Math.round(this.per0 * fill));
    const n = this.per * slots;
    this.pos = new Float32Array(n * 3).fill(-999); this.nor = new Float32Array(n * 3); this.tint = new Float32Array(n * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aN', new THREE.BufferAttribute(this.nor, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aTint', new THREE.BufferAttribute(this.tint, 3).setUsage(THREE.DynamicDrawUsage));
    if (!this.mat) {
      const u = this.u = { uSunV: HAZEU.uSunView, uScale: { value: 400 }, ...FADEU, ...POSTU };
      scaleU.push(u.uScale);
      this.mat = new THREE.ShaderMaterial({ uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
        vertexShader: `attribute vec3 aN; attribute vec3 aTint; uniform vec3 uSunV; uniform float uScale; uniform vec3 uDetCam; uniform vec2 uDetFade; varying float vA; varying vec3 vT;
          void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vec3 n = normalize((viewMatrix * vec4(aN, 0.0)).xyz);
            float s = pow(max(dot(reflect(-uSunV, n), normalize(-mv.xyz)), 0.0), 90.0) * step(0.02, length(uSunV));
            vA = s * (1.0 - smoothstep(uDetFade.x * 0.8, uDetFade.y * 0.95, distance(position.xz, uDetCam.xz))) * smoothstep(0.4, 1.5, -mv.z); vT = aTint;
            gl_PointSize = vA > 0.002 ? max(2.0, 0.09 * uScale / -mv.z) : 0.0; gl_Position = projectionMatrix * mv; }`,
        fragmentShader: POST_GLSL + `varying float vA; varying vec3 vT;
          void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c), star = pow(max(0.0, 1.0 - d * 2.0), 3.0) + max(0.0, 1.0 - abs(c.x) * 18.0) * max(0.0, 1.0 - abs(c.y) * 2.2) * 0.5 + max(0.0, 1.0 - abs(c.y) * 18.0) * max(0.0, 1.0 - abs(c.x) * 2.2) * 0.5;
            gl_FragColor = vec4(postAdd(vT * star * vA * 9.0), 1.0); }` });
    }
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false; this.points.renderOrder = 5;
    G.scene.add(this.points);
  }
  write(slot, list) {
    const base = slot * this.per, g = this.points.geometry;
    for (let i = 0; i < this.per; i++) {
      const k = (base + i) * 3, e = i < list.length ? list[i] : null;
      if (e) { this.pos.set(e.p, k); this.nor.set(e.n, k); this.tint.set(e.t, k); } else { this.pos[k + 1] = -999; }
    }
    for (const a of ['position', 'aN', 'aTint']) { g.attributes[a].addUpdateRange(base * 3, this.per * 3); g.attributes[a].needsUpdate = true; }
  }
}

// ---------- where things can lie: the ground mesh's own surface, not the smooth height under it ----------
// land.js lays the open ground as a 5 m grid (x from −HALF_W, z from 0) cut into triangles along one diagonal;
// a pebble set on h() would float or sink wherever the land curves between grid points
const VH = new Map();
function vertH(k, j) { const key = k * 8192 + j + 400; let v = VH.get(key); if (v === undefined) { v = h(-HALF_W + k * 5, j * 5) - 0.02; VH.set(key, v); } return v; }
const GA = { y: 0, sx: 0, sz: 0 };
function groundAt(x, z) {
  const fx0 = (x + HALF_W) / 5, fz0 = z / 5, k = Math.floor(fx0), j = Math.floor(fz0), fx = fx0 - k, fz = fz0 - j;
  if (fx + fz <= 1) { const a = vertH(k, j), b = vertH(k + 1, j), c = vertH(k, j + 1); GA.sx = (b - a) / 5; GA.sz = (c - a) / 5; GA.y = a + (b - a) * fx + (c - a) * fz; }
  else { const b = vertH(k + 1, j), c = vertH(k, j + 1), d = vertH(k + 1, j + 1); GA.sx = (d - c) / 5; GA.sz = (d - b) / 5; GA.y = d + (c - d) * (1 - fx) + (b - d) * (1 - fz); }
  return GA;
}
export const groundY = (x, z) => groundAt(x, z).y;           // the height of the drawn ground, for anything that rests on it (props.js)

// ---------- filling a cell ----------
function seedOf(i, j) { let a = (i * 73856093) ^ (j * 19349663) ^ 0x5bd1e995; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _n = new THREE.Vector3();
const pool = [];
function entry(k) { return pool[k] || (pool[k] = { m: new THREE.Matrix4(), r: 0, g: 0, b: 0 }); }
// where a small thing can't be: in a wall, under a floor, under a mesa's slope
function solidFloor(x, z) {
  if (W.floors) for (const f of W.floors) if ((x - f.x) ** 2 + (z - f.z) ** 2 < f.r * f.r) return true;
  for (const s of shades) if ((s.why === 'shack' || s.why === 'house' || s.why === 'shed') && (x - s.x) ** 2 + (z - s.z) ** 2 < (s.r + 1) ** 2) return true;
  return false;
}
// the stones' colours: iron-red, black desert varnish, ochre, grey quartzite, and once in a while white quartz
const STONE = [[0.36, 0.12, 0.06], [0.1, 0.05, 0.035], [0.45, 0.24, 0.1], [0.28, 0.24, 0.21], [0.6, 0.57, 0.52], [0.24, 0.07, 0.04]];
const pickStone = (r, salt, pit) => salt > 0.5 ? STONE[r < 0.5 ? 4 : 3] : pit ? STONE[r < 0.5 ? 3 : r < 0.8 ? 1 : 5] : STONE[r < 0.34 ? 0 : r < 0.6 ? 1 : r < 0.8 ? 5 : r < 0.93 ? 2 : r < 0.985 ? 3 : 4];
const lists = { pebbles: [], stones: [], tufts: [], sticks: [], glints: [] };
function fillCell(ci, cj, L) {
  for (const k in lists) lists[k].length = 0;
  const x0 = ci * CELL, z0 = cj * CELL;
  if (z0 < -70 || z0 > 1880 || Math.abs(x0 + CELL / 2) > HALF_W - 6) return lists;
  const R = seedOf(ci, cj), cx = x0 + CELL / 2, cz = z0 + CELL / 2;
  if (inCity(cx, cz, -3)) return lists;                                                       // the town's streets are swept by feet, not strewn with stones
  const nr = nearestRoad(cx, cz, 1), roadNear = nr.d < CELL * 0.75 + 6;
  const town = Math.hypot(cx - TALLY.x, cz - TALLY.z) < 70, outskirts = cz > 1250 && cz < 1800;
  let pit = false; for (const p of PITS) if (Math.hypot(cx - p.x, cz - p.z) < p.r + 4) pit = true;
  const canyon = inCanyon(cx, cz);
  let pe = 0;
  const N = { pebbles: L.pebbles.per, stones: L.stones.per, tufts: L.tufts.per, sticks: L.sticks.per, glints: L.glints.per };
  // candidates: every kind tries its own count of spots, and each spot decides what it is from where it is
  const tries = N.pebbles + N.stones + N.tufts + N.sticks;
  for (let t = 0; t < tries * 1.3; t++) {
    const x = x0 + R() * CELL, z = z0 + R() * CELL, roll = R(), r2 = R(), r3 = R();
    if (landBlocked(x, z, 0.05) || solidFloor(x, z)) continue;
    let zone = 'open', d = 1e9;
    if (roadNear) { const n = nearestRoad(x, z, 1); d = n.d; const half = n.s && n.s.route === 'canyon' ? 2.3 : 3.8; zone = d < half - 0.25 ? 'road' : d < half + 1.6 ? 'shoulder' : 'open'; }
    const salt = saltAt(x, z), g = groundAt(x, z), steep = Math.hypot(g.sx, g.sz);
    if (steep > 1.2) continue;
    _n.set(-g.sx, 1, -g.sz).normalize();
    // what is this spot: mostly pebbles; the open ground also grows grass and drops sticks, and has the odd stone
    let kind = roll < 0.62 ? 'pebbles' : roll < 0.72 ? 'stones' : roll < 0.93 ? 'tufts' : 'sticks';
    if (zone === 'road') { if (kind !== 'pebbles' || r2 > 0.12) continue; }             // a little gravel on the road; nothing else
    if (zone === 'shoulder' && kind === 'tufts' && r2 < 0.5) kind = 'pebbles';           // the shoulders are graded gravel
    if (salt > 0.5) { if (kind === 'tufts' || kind === 'sticks') continue; if (r2 > 0.3) continue; }   // the pans are nearly bare
    if (canyon && kind === 'tufts' && r2 < 0.6) kind = 'stones';                          // the canyon floor is rubble
    if (pit && kind === 'tufts') kind = 'stones';
    const list = lists[kind]; if (list.length >= N[kind]) continue;
    const e = entry(pe++);
    if (kind === 'pebbles') {
      const s = (zone === 'road' ? 0.025 : 0.03) + r3 ** 2 * (zone === 'shoulder' ? 0.1 : 0.085);
      _e.set(R() * 6.3, R() * 6.3, R() * 6.3); _q.setFromEuler(_e);
      _s.set(s * (1 + R() * 0.6), s * (0.45 + R() * 0.35), s * (1 + R() * 0.4));
      _p.set(x, g.y + _s.y * 0.35, z);
      const c = pickStone(R(), salt, pit), v = 0.8 + R() * 0.4; e.r = c[0] * v; e.g = c[1] * v; e.b = c[2] * v;
    } else if (kind === 'stones') {
      const s = 0.1 + r3 ** 1.5 * (canyon || pit ? 0.42 : 0.26);
      _q.setFromUnitVectors(_up, _n); _q2.setFromEuler(_e.set((R() - 0.5) * 0.6, R() * 6.3, (R() - 0.5) * 0.6)); _q.multiply(_q2);
      _s.set(s * (1 + R() * 0.5), s * (0.55 + R() * 0.3), s * (0.9 + R() * 0.4));
      _p.set(x, g.y + _s.y * 0.2, z);                                                     // bedded in, not balanced on top
      const c = pickStone(R(), salt, pit || canyon), v = 0.75 + R() * 0.35; e.r = c[0] * v; e.g = c[1] * v; e.b = c[2] * v;
    } else if (kind === 'tufts') {
      const s = 0.22 + r3 * 0.32;
      _q.setFromUnitVectors(_up, _n.lerp(_up, 0.6).normalize()); _q2.setFromAxisAngle(_up, R() * 6.3); _q.multiply(_q2);
      _s.set(s * (0.8 + R() * 0.5), s * (0.8 + R() * 0.5), s * (0.8 + R() * 0.5));
      _p.set(x, g.y - 0.01, z);
      // straw to grey: last season's growth, sun-bleached; a little green at the heart near the pipeline's leaks
      const v = 0.75 + R() * 0.35, grey = R(); e.r = (0.66 - grey * 0.18) * v; e.g = (0.52 - grey * 0.12) * v; e.b = (0.3 - grey * 0.02) * v;
    } else {
      const len = 0.25 + r3 * 0.9, th = 0.012 + R() * 0.02;
      _q.setFromUnitVectors(_up, _n); _q2.setFromAxisAngle(_up, R() * 6.3); _q.multiply(_q2);
      _s.set(len, th * (0.8 + R() * 0.4), th * (0.8 + R() * 0.4));
      _p.set(x, g.y + th * 0.4, z);
      const v = 0.75 + R() * 0.4, dark = R() < 0.3; e.r = (dark ? 0.2 : 0.46) * v; e.g = (dark ? 0.15 : 0.42) * v; e.b = (dark ? 0.12 : 0.37) * v;   // silver-grey, or darker where it's rotting
    }
    e.m.compose(_p, _q, _s); list.push(e);
  }
  // glints: mica in the gravel, salt crystals on the pans, broken glass where people were
  const glassy = town || outskirts || (roadNear && nr.d < 8);
  const gn = Math.min(N.glints, Math.round(N.glints * (saltAt(cx, cz) > 0.5 ? 1 : glassy ? 0.8 : 0.3)));
  for (let t = 0; t < gn; t++) {
    const x = x0 + R() * CELL, z = z0 + R() * CELL;
    if (landBlocked(x, z, 0.05) || solidFloor(x, z)) continue;
    const g = groundAt(x, z), salt = saltAt(x, z), a = R() * 6.3, tilt = 0.25 + R() * 0.9;
    const glass = glassy && R() < 0.6, t3 = salt > 0.5 ? [1, 0.98, 0.94] : glass ? (R() < 0.5 ? [0.7, 1, 0.8] : [1, 0.86, 0.6]) : [1, 0.94, 0.82];
    lists.glints.push({ p: [x, g.y + 0.02, z], n: [Math.sin(a) * Math.sin(tilt), Math.cos(tilt), Math.cos(a) * Math.sin(tilt)], t: t3 });
  }
  return lists;
}

// ---------- the ring itself ----------
const D = { built: false, layers: null, ring: 4, n: 9, slots: null, cx: 1e9, cz: 1e9, key: null, queue: [] };
export function buildDetail() {
  // the ground's own shader first
  groundPatch(M.ground); trackPatch(M.road); sealPatch(M.seal);
  const leaks = (W.leaks || []).slice(0, WET_N);
  leaks.forEach((l, i) => GU.uWet.value[i].set(l.x, l.z, l.name ? 5.5 : 3.6, l.name ? 1 : 0.8));
  // the layers' shapes and materials (made once; the meshes are sized by the quality setting)
  const stoneMat = (key) => ringPatch(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82, flatShading: true }), key);
  const pebbleGeo = new THREE.OctahedronGeometry(1, 0), stoneGeo = lumpy(new THREE.IcosahedronGeometry(1, 1), 0.14, 1.7);   // pebbles are seen small: eight faces will do
  D.layers = {
    pebbles: new Layer('pebbles', pebbleGeo, stoneMat('pebble'), 40),
    stones: new Layer('stones', stoneGeo, stoneMat('stone'), 6, { cast: true, depth: ringPatch(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), 'stone-depth') }),
    tufts: new Layer('tufts', tuftGeometry(), ringPatch(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, side: THREE.DoubleSide }), 'tuft', { wind: 1 }), 12),
    sticks: new Layer('sticks', stickGeometry(), ringPatch(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true }), 'stick'), 3),
    glints: new Glints(6),
  };
  D.built = true;
}
export function setDetailQuality(key) {
  if (!D.built) return;
  D.ring = RING[key] || 4; D.n = D.ring * 2 + 1;
  const slots = D.n * D.n, fill = PER[key] || 1;
  for (const k in D.layers) D.layers[k].alloc(slots, fill);
  D.layers.stones.im.castShadow = key === 'high' || key === 'ultra';
  D.slots = new Array(slots).fill(null); D.cx = D.cz = 1e9; D.queue.length = 0;
  FADEU.uDetFade.value.set(D.ring * CELL * 0.72, D.ring * CELL * 0.98);
}
const mod = (a, n) => ((a % n) + n) % n;
function fillSlot(slot, ci, cj) {
  const l = fillCell(ci, cj, D.layers);
  for (const k in D.layers) D.layers[k].write(slot, l[k]);
  D.slots[slot] = ci + ',' + cj;
}
export function updateDetail(camera, cave) {
  if (!D.built || !D.slots || cave) return;
  const p = camera.position; FADEU.uDetCam.value.copy(p);
  if (G.sunDirXZ) GU.uSunXZ.value.copy(G.sunDirXZ);
  const ci = Math.floor(p.x / CELL), cj = Math.floor(p.z / CELL), R = D.ring, n = D.n;
  if (ci !== D.cx || cj !== D.cz) {
    const jump = Math.max(Math.abs(ci - D.cx), Math.abs(cj - D.cz)) > R;
    D.cx = ci; D.cz = cj; D.queue.length = 0;
    for (let i = ci - R; i <= ci + R; i++) for (let j = cj - R; j <= cj + R; j++) {
      const slot = mod(i, n) + mod(j, n) * n;
      if (D.slots[slot] === i + ',' + j) continue;
      if (jump) fillSlot(slot, i, j); else D.queue.push([slot, i, j, Math.max(Math.abs(i - ci), Math.abs(j - cj))]);
    }
    D.queue.sort((a, b) => b[3] - a[3]);                       // nearest last, so they pop first
  }
  // a few cells a frame, nearest first: they're far enough out (and shrunk) that nobody sees one arrive
  const t0 = performance.now();
  while (D.queue.length && performance.now() - t0 < 2) { const [slot, i, j] = D.queue.pop(); fillSlot(slot, i, j); }
  if (VH.size > 80000) VH.clear();
}
export const detailState = () => ({ ring: D.ring, queue: D.queue.length, per: D.layers ? Object.fromEntries(Object.entries(D.layers).map(([k, l]) => [k, l.per])) : null });
