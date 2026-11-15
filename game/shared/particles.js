// ============================================================
// Small moving things, shared by the yard and the road: glints (one
// Points draw for every "you haven't looked at this yet" twinkle) and
// pools of soft particles (steam, smoke, dust, sparks, splashes).
// Both write their colour through the post chain's postOut/postAdd, so
// they look the same whether or not the page is drawing through it.
// ============================================================
import * as THREE from '../yard/vendor/three.module.js';
import { POSTU, POST_GLSL } from './post.js';
// where the randomness comes from: the yard hands in its seeded generator so its world builds the same every time
export const prng = { next: Math.random };
const R = () => prng.next();
const rand = (a = 0, b = 1) => a + (b - a) * R();
const TAU = Math.PI * 2;

// ---------- glints: one Points draw call for every "you haven't looked at this yet" twinkle ----------
export function makeGlints(positions, tex, { size = 0.07, color = 0xffe2b0, near = 0.4, far = 1.0, strength = 1 } = {}) {
  const n = positions.length, pos = new Float32Array(n * 3), phase = new Float32Array(n), on = new Float32Array(n);
  positions.forEach((p, i) => { pos.set([p.x, p.y, p.z], i * 3); phase[i] = rand(0, TAU); on[i] = 1; });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  g.setAttribute('aOn', new THREE.BufferAttribute(on, 1));
  const u = { uTex: { value: tex }, uTime: { value: 0 }, uScale: { value: 400 }, uSize: { value: size }, uColor: { value: new THREE.Color(color) }, uNear: { value: near }, uFar: { value: far }, uStrength: { value: strength }, ...POSTU };
  const m = new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: `attribute float aPhase; attribute float aOn; uniform float uTime; uniform float uScale; uniform float uSize; uniform float uNear; uniform float uFar; varying float vA;
      void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); float d = -mv.z;
        vA = aOn * (0.22 + 0.28 * (0.5 + 0.5 * sin(uTime * 2.2 + aPhase))) * smoothstep(uNear, uFar, d);
        gl_PointSize = aOn > 0.5 ? max(2.0, uSize * uScale / d) : 0.0; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: POST_GLSL + `uniform sampler2D uTex; uniform vec3 uColor; uniform float uStrength; varying float vA;
      void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(postAdd(uColor * t.rgb * (t.a * vA * uStrength * 2.0)), 1.0); }`,
  });
  const points = new THREE.Points(g, m);
  points.frustumCulled = false; points.renderOrder = 5;
  return {
    points, uniforms: u,
    set(i, visible) { on[i] = visible ? 1 : 0; g.attributes.aOn.needsUpdate = true; },
    move(i, p) { pos.set([p.x, p.y, p.z], i * 3); g.attributes.position.needsUpdate = true; },
  };
}

// ---------- a pool of soft particles (steam, smoke, sparks, feathers, splashes) ----------
export class Particles {
  constructor(max, tex, { additive = false, fog = true, color = 0xffffff, renderOrder = 6 } = {}) {
    this.max = max; this.n = 0;
    this.pos = new Float32Array(max * 3); this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max); this.age = new Float32Array(max);
    this.size0 = new Float32Array(max); this.size1 = new Float32Array(max);
    this.alpha = new Float32Array(max); this.a0 = new Float32Array(max);
    this.col = new Float32Array(max * 3); this.drag = new Float32Array(max); this.grav = new Float32Array(max);
    this.sizeNow = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.sizeNow, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.u = { uTex: { value: tex }, uScale: { value: 400 }, fogColor: { value: new THREE.Color() }, fogDensity: { value: 0 }, uTint: { value: new THREE.Color(color) }, ...POSTU };
    this.useFog = fog;
    this.mat = new THREE.ShaderMaterial({
      uniforms: this.u, transparent: true, depthWrite: false, fog: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: `attribute float aSize; attribute float aAlpha; attribute vec3 aColor; uniform float uScale; varying float vA; varying vec3 vC; varying float vFogDepth;
        void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vFogDepth = -mv.z; vA = aAlpha; vC = aColor;
          gl_PointSize = aSize * uScale / max(0.05, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: POST_GLSL + `uniform sampler2D uTex; uniform vec3 uTint; uniform vec3 fogColor; uniform float fogDensity; varying float vA; varying vec3 vC; varying float vFogDepth;
        void main(){ vec4 t = texture2D(uTex, gl_PointCoord); vec3 c = t.rgb * vC * uTint;
          float f = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
          ${additive ? 'gl_FragColor = vec4(postAdd(c * (t.a * vA * (1.0 - f))), 1.0);' : `vec3 cf = mix(c, fogColor, f); float a = t.a * vA;
          // through the post chain this blends in linear light, where a pale puff over dark ground reads far stronger than it
          // did on screen: thin the pale ones out, keep dark smoke dense
          if (uPostLin > 0.5) a = pow(a, mix(0.85, 2.0, smoothstep(0.25, 0.75, dot(cf, vec3(0.299, 0.587, 0.114)))));
          gl_FragColor = vec4(postOut(cf), a);`} }`,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false; this.points.renderOrder = renderOrder;
    this.geo = g;
  }
  emit(x, y, z, { vx = 0, vy = 0, vz = 0, life = 1, size = 0.1, size1 = null, alpha = 1, color = [1, 1, 1], drag = 1, grav = 0, spread = 0 } = {}) {
    let i = this.n < this.max ? this.n++ : (this._r = ((this._r || 0) + 1) % this.max);
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx + (R() - 0.5) * spread; this.vel[i * 3 + 1] = vy + (R() - 0.5) * spread; this.vel[i * 3 + 2] = vz + (R() - 0.5) * spread;
    this.life[i] = life; this.age[i] = 0; this.size0[i] = size; this.size1[i] = size1 ?? size; this.a0[i] = alpha; this.alpha[i] = alpha;
    this.col[i * 3] = color[0]; this.col[i * 3 + 1] = color[1]; this.col[i * 3 + 2] = color[2];
    this.drag[i] = drag; this.grav[i] = grav; this.sizeNow[i] = size;
  }
  update(dt, scene) {
    let n = this.n;
    for (let i = 0; i < n; i++) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) { this.copy(--n, i); i--; continue; }
      const k = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= k; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * k - this.grav[i] * dt; this.vel[i * 3 + 2] *= k;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const t = this.age[i] / this.life[i];
      this.sizeNow[i] = this.size0[i] + (this.size1[i] - this.size0[i]) * t;
      this.alpha[i] = this.a0[i] * Math.min(1, t * 6) * (1 - t) * (1 - t);
    }
    this.n = n;
    const g = this.geo;
    g.setDrawRange(0, n);
    g.attributes.position.needsUpdate = g.attributes.aSize.needsUpdate = g.attributes.aAlpha.needsUpdate = g.attributes.aColor.needsUpdate = true;
    if (this.useFog && scene && scene.fog) { this.u.fogColor.value.copy(scene.fog.color); this.u.fogDensity.value = scene.fog.density || 0; }
    else this.u.fogDensity.value = 0;
  }
  copy(from, to) {
    if (from === to) return;
    for (const [arr, w] of [[this.pos, 3], [this.vel, 3], [this.col, 3]]) for (let k = 0; k < w; k++) arr[to * w + k] = arr[from * w + k];
    for (const arr of [this.life, this.age, this.size0, this.size1, this.alpha, this.a0, this.drag, this.grav, this.sizeNow]) arr[to] = arr[from];
  }
  clear() { this.n = 0; this.geo.setDrawRange(0, 0); }
}

