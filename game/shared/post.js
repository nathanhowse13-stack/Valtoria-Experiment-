// ============================================================
// The look every outdoor page shares. It began in the yard and is
// used by the yard and the road alike, so the two read as one place.
// ============================================================
import * as THREE from '../yard/vendor/three.module.js';
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// ============================================================
// Post-processing and graphics quality. On anything but "low" the
// world is drawn into a linear HDR target (multisampled), ambient
// occlusion is worked out from its depth, Jacob's hand is drawn on
// top, then bloom and sun shafts are added and the lot is tone-mapped,
// graded, vignetted and dithered onto the screen. "Low" draws straight
// to the screen the old way, for slow phones.
// ============================================================
export const POSTU = { uPostLin: { value: 0 }, uPostExpo: { value: 1 }, uPostBase: { value: 0.2 } };
// three's ACES matrices (GLSL column order) and their inverses, so custom shaders can hand the post chain
// a linear colour that comes back out of the tone curve exactly as they meant it
const ACES_IN = [0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777];
const ACES_OUT = [1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602];
const glslMat3 = (a) => `mat3(${a.map(v => v.toFixed(7)).join(', ')})`;
const invMat3 = (a) => new THREE.Matrix3().fromArray(a).invert().elements.slice();
// Every custom shader that writes a display-ready colour ends with postOut(c).
export const POST_GLSL = `
uniform float uPostLin; uniform float uPostExpo; uniform float uPostBase;
vec3 postOut(vec3 c) {
  if (uPostLin < 0.5) return c;
  c = clamp(c, 0.0, 0.99);
  c = mix(pow((c + 0.055) / 1.055, vec3(2.4)), c / 12.92, step(c, vec3(0.04045)));
  vec3 u = clamp(${glslMat3(invMat3(ACES_OUT))} * c, 0.0, 0.99);
  vec3 A = 1.0 - 0.983729 * u, B = 0.0245786 - 0.4329510 * u, C = -(0.000090537 + 0.238081 * u);
  vec3 v = (-B + sqrt(max(B * B - 4.0 * A * C, 0.0))) / (2.0 * A);
  return max(${glslMat3(invMat3(ACES_IN))} * v, 0.0) * 0.6 / uPostExpo;
}
// An additive glow, given as what it adds on screen over a typical background for the place (uPostBase),
// turned into the light the post chain has to add to land there. Draw with alpha 1: vec4(postAdd(colour * a), 1.0).
vec3 postAdd(vec3 c) {
  if (uPostLin < 0.5) return c;
  vec3 b = vec3(uPostBase);
  return max(postOut(min(b + c, vec3(0.99))) - postOut(b), 0.0);
}`;
export const ACES_GLSL = `
vec3 postRRT(vec3 v) { vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
vec3 acesFilmic(vec3 color, float exposure) {
  color *= exposure / 0.6;
  color = ${glslMat3(ACES_IN)} * color;
  color = postRRT(color);
  color = ${glslMat3(ACES_OUT)} * color;
  return clamp(color, 0.0, 1.0);
}`;

// ---------- quality presets ----------
export const QUALITY = {
  low: { label: 'Low', post: false, ao: 0, msaa: 0, ratio: 1.0, shadow: 2048, shadowRadius: 1.5, shafts: false, bloom: false, aniso: 4 },
  medium: { label: 'Medium', post: true, ao: 0, msaa: 4, ratio: 1.25, shadow: 2048, shadowRadius: 2, shafts: true, bloom: true, aniso: 8 },
  high: { label: 'High', post: true, ao: 12, msaa: 4, ratio: 1.5, shadow: 4096, shadowRadius: 2.5, shafts: true, bloom: true, aniso: 16 },
  ultra: { label: 'Ultra', post: true, ao: 16, msaa: 4, ratio: 2.0, shadow: 4096, shadowRadius: 3, shafts: true, bloom: true, aniso: 16, aoFull: true },
};
export const QUALITY_ORDER = ['low', 'medium', 'high', 'ultra'];

export function makePost(renderer) {
  const caps = renderer.capabilities, ext = renderer.extensions;
  const supported = caps.isWebGL2 && (ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float'));
  const maxSamples = caps.maxSamples || 0;
  const P = {
    supported, on: false, q: QUALITY.low, w: 2, h: 2,
    exposure: 1, ao: 0.75, aoRadius: 0.5, aoIntensity: 1.0, bloom: 0.065, shafts: 0, shaftColor: new THREE.Color(1.0, 0.78, 0.5), shimmer: 0, grain: 0.032, vignette: 0.26, sat: 1.04, contrast: 1.035, split: 0.5,
    shimRange: new THREE.Vector4(28, 140, 330, 400),      // the heat shimmer: fades in between the first two distances (metres), out between the last two
    skyZ: 360, aoFade: 42,                                 // further than skyZ counts as sky for the sun shafts; contact shade fades out by aoFade
    sunDir: null, time: 0,
  };
  const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
  const quadGeo = new THREE.BufferGeometry();
  quadGeo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  quadGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), quad = new THREE.Mesh(quadGeo), quadScene = new THREE.Scene();
  quad.frustumCulled = false; quadScene.add(quad);
  const mk = (fs, uniforms, defines = {}) => new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: fs, uniforms, defines, depthTest: false, depthWrite: false, toneMapped: false });
  function pass(mat, target) { quad.material = mat; renderer.setRenderTarget(target); renderer.render(quadScene, quadCam); }

  // ---------- targets ----------
  const RT = {};
  const target = (w, h, { samples = 0, depth = false, depthTex = false, half = true } = {}) => {
    const t = new THREE.WebGLRenderTarget(w, h, { type: half ? THREE.HalfFloatType : THREE.UnsignedByteType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: depth, stencilBuffer: false, samples });
    if (depthTex) t.depthTexture = new THREE.DepthTexture(w, h);
    t.texture.generateMipmaps = false;
    return t;
  };
  const LEVELS = 5;
  function build() {
    for (const k in RT) { if (Array.isArray(RT[k])) RT[k].forEach(t => t.dispose()); else RT[k].dispose(); delete RT[k]; }
    if (!P.on) return;
    const q = P.q, s = Math.min(q.msaa, maxSamples), w = P.w, h = P.h;
    RT.scene = target(w, h, { samples: s, depth: true, depthTex: true });
    RT.comp = target(w, h, { samples: s, depth: true });
    const aw = q.aoFull ? w : Math.ceil(w / 2), ah = q.aoFull ? h : Math.ceil(h / 2);
    RT.ao = target(aw, ah, { half: false }); RT.ao2 = target(aw, ah, { half: false });
    RT.down = []; RT.up = [];
    let bw = Math.ceil(w / 2), bh = Math.ceil(h / 2);
    for (let i = 0; i < LEVELS; i++) { RT.down.push(target(bw, bh)); RT.up.push(target(bw, bh)); bw = Math.max(1, Math.ceil(bw / 2)); bh = Math.max(1, Math.ceil(bh / 2)); }
    RT.shaft = target(Math.ceil(w / 4), Math.ceil(h / 4), { half: false }); RT.shaft2 = target(Math.ceil(w / 4), Math.ceil(h / 4), { half: false });
    // blank stand-ins when a stage is switched off
    RT.white = target(1, 1, { half: false }); RT.black = target(1, 1, { half: false });
    const cl = renderer.getClearColor(new THREE.Color()), ca = renderer.getClearAlpha();
    renderer.setRenderTarget(RT.white); renderer.setClearColor(0xffffff, 1); renderer.clear();
    renderer.setRenderTarget(RT.black); renderer.setClearColor(0x000000, 1); renderer.clear();
    renderer.setRenderTarget(null); renderer.setClearColor(cl, ca);
  }

  // ---------- passes ----------
  const DEPTH_GLSL = `uniform float uNear; uniform float uFar;
    float viewDist(float d) { return (uNear * uFar) / (uFar - (uFar - uNear) * d); }`;
  // scalable ambient obscurance from the depth buffer alone
  const aoMat = mk(`varying vec2 vUv; uniform sampler2D tDepth; uniform vec2 uRes; uniform mat4 uProjInv; uniform float uProjY;
    uniform float uRadius; uniform float uIntensity; uniform float uBias; uniform float uFade; uniform float uSeed;
    vec3 vpos(vec2 uv) { float d = texture2D(tDepth, uv).x; vec4 p = uProjInv * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); return p.xyz / p.w; }
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      float d = texture2D(tDepth, vUv).x;
      if (d > 0.99999) { gl_FragColor = vec4(1.0); return; }
      vec3 P = vpos(vUv);
      if (-P.z > uFade) { gl_FragColor = vec4(1.0); return; }
      vec2 px = 1.0 / uRes;
      vec3 Pr = vpos(vUv + vec2(px.x, 0.0)), Pl = vpos(vUv - vec2(px.x, 0.0)), Pu = vpos(vUv + vec2(0.0, px.y)), Pd = vpos(vUv - vec2(0.0, px.y));
      vec3 dx = abs(Pr.z - P.z) < abs(P.z - Pl.z) ? Pr - P : P - Pl;
      vec3 dy = abs(Pu.z - P.z) < abs(P.z - Pd.z) ? Pu - P : P - Pd;
      vec3 N = normalize(cross(dx, dy));
      float rPx = min(uRadius * uProjY * 0.5 * uRes.y / -P.z, 90.0);
      if (rPx < 1.5) { gl_FragColor = vec4(1.0); return; }
      float spin = hash(gl_FragCoord.xy + uSeed) * 6.2831853, sum = 0.0, r2 = uRadius * uRadius;
      for (int i = 0; i < NS; i++) {
        float a = (float(i) + 0.5) / float(NS), ang = a * 6.2831853 * 7.0 + spin;
        vec3 S = vpos(vUv + vec2(cos(ang), sin(ang)) * a * rPx * px);
        vec3 v = S - P; float vv = dot(v, v), vn = dot(v, N);
        float f = max(r2 - vv, 0.0);
        sum += f * f * f * max((vn - uBias) / (vv + 0.01), 0.0);
      }
      float ao = max(0.0, 1.0 - sum * uIntensity / (r2 * r2 * r2) * (5.0 / float(NS)));
      ao = mix(ao, 1.0, smoothstep(uFade * 0.6, uFade, -P.z));
      gl_FragColor = vec4(ao, ao, ao, 1.0);
    }`, { tDepth: { value: null }, uRes: { value: new THREE.Vector2() }, uProjInv: { value: new THREE.Matrix4() }, uProjY: { value: 1 }, uRadius: { value: 0.55 }, uIntensity: { value: 1.0 }, uBias: { value: 0.012 }, uFade: { value: 42 }, uSeed: { value: 0 } }, { NS: 12 });
  // depth-aware blur, run across and then down
  const blurMat = mk(`varying vec2 vUv; uniform sampler2D tAO; uniform sampler2D tDepth; uniform vec2 uDir; ${DEPTH_GLSL}
    void main() {
      float z0 = viewDist(texture2D(tDepth, vUv).x), sum = texture2D(tAO, vUv).r, ws = 1.0;
      for (int i = -4; i <= 4; i++) {
        if (i == 0) continue;
        vec2 uv = vUv + uDir * float(i);
        float z = viewDist(texture2D(tDepth, uv).x);
        float w = exp(-float(i * i) / 9.0) * max(0.0, 1.0 - abs(z - z0) / (0.04 * z0 + 0.03));
        sum += texture2D(tAO, uv).r * w; ws += w;
      }
      float a = sum / ws; gl_FragColor = vec4(a, a, a, 1.0);
    }`, { tAO: { value: null }, tDepth: { value: null }, uDir: { value: new THREE.Vector2() }, uNear: { value: 0.03 }, uFar: { value: 600 } });
  // the world times its occlusion, with a heat shimmer over the far ground outside
  const compMat = mk(`varying vec2 vUv; uniform sampler2D tColor; uniform sampler2D tAO; uniform sampler2D tDepth; uniform float uAO; uniform float uShimmer; uniform vec4 uShimR; uniform float uTime; ${DEPTH_GLSL}
    void main() {
      vec2 uv = vUv;
      if (uShimmer > 0.0) {
        float z = viewDist(texture2D(tDepth, vUv).x), k = smoothstep(uShimR.x, uShimR.y, z) * (1.0 - smoothstep(uShimR.z, uShimR.w, z)) * uShimmer;
        uv += vec2(sin(vUv.y * 190.0 + uTime * 5.3) + 0.6 * sin(vUv.y * 83.0 - uTime * 3.7), 0.5 * cos(vUv.x * 140.0 + uTime * 4.1)) * 0.00055 * k;
      }
      vec4 c = texture2D(tColor, uv);
      c.rgb *= mix(1.0, texture2D(tAO, vUv).r, uAO);
      if (!(c.r + c.g + c.b < 1e20)) c.rgb = vec3(0.0);        // a NaN or an infinity from anything upstream stops here, before bloom can spread it
      gl_FragColor = vec4(c.rgb, 1.0);
    }`, { tColor: { value: null }, tAO: { value: null }, tDepth: { value: null }, uAO: { value: 0.8 }, uShimmer: { value: 0 }, uShimR: { value: P.shimRange }, uTime: { value: 0 }, uNear: { value: 0.03 }, uFar: { value: 600 } });
  // bloom: a soft threshold, then a dual-filter chain down and back up
  const brightMat = mk(`varying vec2 vUv; uniform sampler2D tColor; uniform vec2 uTexel; uniform float uExpo; uniform float uThresh;
    void main() {
      vec3 c = (texture2D(tColor, vUv + uTexel * vec2(-0.5, -0.5)).rgb + texture2D(tColor, vUv + uTexel * vec2(0.5, -0.5)).rgb + texture2D(tColor, vUv + uTexel * vec2(-0.5, 0.5)).rgb + texture2D(tColor, vUv + uTexel * vec2(0.5, 0.5)).rgb) * 0.25 * uExpo;
      float br = max(c.r, max(c.g, c.b)), knee = uThresh * 0.5;
      float soft = clamp(br - uThresh + knee, 0.0, 2.0 * knee); soft = soft * soft / (4.0 * knee + 1e-4);
      c *= max(soft, br - uThresh) / max(br, 1e-4);
      gl_FragColor = vec4(min(c, vec3(40.0)), 1.0);
    }`, { tColor: { value: null }, uTexel: { value: new THREE.Vector2() }, uExpo: { value: 1 }, uThresh: { value: 1.0 } });
  const downMat = mk(`varying vec2 vUv; uniform sampler2D tSrc; uniform vec2 uTexel;
    void main() { vec3 s = texture2D(tSrc, vUv).rgb * 4.0;
      s += texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(1.0, -1.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(-1.0, 1.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(1.0, 1.0)).rgb;
      gl_FragColor = vec4(s / 8.0, 1.0); }`, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });
  const upMat = mk(`varying vec2 vUv; uniform sampler2D tSrc; uniform sampler2D tAdd; uniform vec2 uTexel;
    void main() { vec3 s = vec3(0.0);
      s += texture2D(tSrc, vUv + uTexel * vec2(-2.0, 0.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(2.0, 0.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(0.0, -2.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(0.0, 2.0)).rgb;
      s += (texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(1.0, -1.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(-1.0, 1.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(1.0, 1.0)).rgb) * 2.0;
      gl_FragColor = vec4(s / 12.0 + texture2D(tAdd, vUv).rgb, 1.0); }`, { tSrc: { value: null }, tAdd: { value: null }, uTexel: { value: new THREE.Vector2() } });
  // sun shafts: the sky that shows round things, smeared out from the sun's spot on screen
  const shaftMaskMat = mk(`varying vec2 vUv; uniform sampler2D tDepth; uniform vec2 uSun; uniform float uAspect; uniform float uSkyZ; ${DEPTH_GLSL}
    void main() {
      float z = viewDist(texture2D(tDepth, vUv).x);
      float sky = step(uSkyZ, z);
      vec2 d = (vUv - uSun) * vec2(uAspect, 1.0);
      gl_FragColor = vec4(vec3(sky * pow(max(0.0, 1.0 - length(d) / 0.75), 2.2)), 1.0);
    }`, { tDepth: { value: null }, uSun: { value: new THREE.Vector2() }, uAspect: { value: 1 }, uSkyZ: { value: 360 }, uNear: { value: 0.03 }, uFar: { value: 600 } });
  const shaftBlurMat = mk(`varying vec2 vUv; uniform sampler2D tSrc; uniform vec2 uSun; uniform float uSpan;
    void main() {
      vec2 step = (uSun - vUv) * uSpan / 30.0; vec2 uv = vUv; float sum = 0.0, w = 1.0;
      for (int i = 0; i < 30; i++) { sum += texture2D(tSrc, uv).r * w; w *= 0.955; uv += step; }
      gl_FragColor = vec4(vec3(sum / 12.0), 1.0);
    }`, { tSrc: { value: null }, uSun: { value: new THREE.Vector2() }, uSpan: { value: 1 } });
  // the last word: tone curve, grade, vignette, grain
  const finalMat = mk(`varying vec2 vUv; uniform sampler2D tColor; uniform sampler2D tBloom; uniform sampler2D tShaft;
    uniform float uExpo; uniform float uBloom; uniform float uShaft; uniform vec3 uShaftCol; uniform float uSat; uniform float uContrast; uniform float uSplit; uniform float uVignette; uniform float uGrain; uniform float uTime; uniform vec2 uRes;
    ${ACES_GLSL}
    void main() {
      vec3 c = texture2D(tColor, vUv).rgb + texture2D(tBloom, vUv).rgb * uBloom + texture2D(tShaft, vUv).r * uShaftCol * uShaft;
      c = acesFilmic(c, uExpo);
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = max(mix(vec3(l), c, uSat), 0.0);
      // a light split tone: shade leans cool, sunlit things lean warm, so the red world has some depth to it
      vec3 tint = mix(vec3(0.93, 0.97, 1.1), vec3(1.05, 1.0, 0.93), smoothstep(0.02, 0.5, l));
      c *= mix(vec3(1.0), tint, uSplit);
      c = mix(pow(c, vec3(0.41666)) * 1.055 - 0.055, c * 12.92, step(c, vec3(0.0031308)));
      c = (c - 0.5) * uContrast + 0.5;
      vec2 q = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
      c *= 1.0 - uVignette * smoothstep(0.25, 1.1, length(q) * 1.25);
      float n = fract(sin(dot(vUv * uRes + fract(uTime) * 91.7, vec2(12.9898, 78.233))) * 43758.5453);
      c += (n - 0.5) * uGrain;
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`, { tColor: { value: null }, tBloom: { value: null }, tShaft: { value: null }, uExpo: { value: 1 }, uBloom: { value: 0 }, uShaft: { value: 0 }, uShaftCol: { value: P.shaftColor }, uSat: { value: 1 }, uContrast: { value: 1 }, uSplit: { value: 0 }, uVignette: { value: 0 }, uGrain: { value: 0 }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2() } });

  const _sun = new THREE.Vector3(), _sz = new THREE.Vector2();
  // a target the driver won't draw into means no post chain here: fall back to drawing straight to the screen
  function targetsWork() {
    const gl = renderer.getContext();
    for (const t of [RT.scene, RT.comp, RT.down[0]]) {
      renderer.setRenderTarget(t);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) { renderer.setRenderTarget(null); return false; }
    }
    renderer.setRenderTarget(null);
    return true;
  }
  P.setQuality = (key) => {
    const q = QUALITY[key] || QUALITY.medium;
    P.q = q; P.key = key in QUALITY ? key : 'medium';
    P.on = q.post && P.supported;
    POSTU.uPostLin.value = P.on ? 1 : 0;
    if (P.on && q.ao) { aoMat.defines.NS = q.ao; aoMat.needsUpdate = true; }
    build();
    if (P.on && !targetsWork()) { P.supported = false; P.on = false; P.q = QUALITY.low; P.key = 'low'; POSTU.uPostLin.value = 0; build(); }
  };
  P.setSize = (w, h) => { w = Math.max(2, Math.round(w)); h = Math.max(2, Math.round(h)); if (w === P.w && h === P.h && (RT.scene || !P.on)) return; P.w = w; P.h = h; build(); };
  P.setExposure = (e) => { P.exposure = e; POSTU.uPostExpo.value = e; renderer.toneMappingExposure = e; };
  P.render = (scene, camera, vmScene, vmCam, drawVM, dt = 0.016) => {
    P.time += dt;
    if (!P.on) {
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
      if (drawVM) { renderer.autoClear = false; renderer.clearDepth(); renderer.render(vmScene, vmCam); renderer.autoClear = true; }
      return;
    }
    const q = P.q;
    // 1. the world
    renderer.setRenderTarget(RT.scene); renderer.render(scene, camera);
    const near = camera.near, far = camera.far, depth = RT.scene.depthTexture;
    for (const m of [blurMat, compMat, shaftMaskMat]) { m.uniforms.uNear.value = near; m.uniforms.uFar.value = far; }
    // 2. ambient occlusion
    let aoTex = RT.white.texture;
    if (q.ao && P.ao > 0) {
      const u = aoMat.uniforms;
      u.tDepth.value = depth; u.uRes.value.set(P.w, P.h); u.uFade.value = P.aoFade; u.uRadius.value = P.aoRadius; u.uIntensity.value = P.aoIntensity; u.uProjInv.value.copy(camera.projectionMatrixInverse); u.uProjY.value = camera.projectionMatrix.elements[5]; u.uSeed.value = (P.time * 7.3) % 50;
      pass(aoMat, RT.ao);
      blurMat.uniforms.tDepth.value = depth;
      blurMat.uniforms.tAO.value = RT.ao.texture; blurMat.uniforms.uDir.value.set(1 / RT.ao.width, 0); pass(blurMat, RT.ao2);
      blurMat.uniforms.tAO.value = RT.ao2.texture; blurMat.uniforms.uDir.value.set(0, 1 / RT.ao.height); pass(blurMat, RT.ao);
      aoTex = RT.ao.texture;
    }
    // 3. world × occlusion, then the hand on top of it
    compMat.uniforms.tColor.value = RT.scene.texture; compMat.uniforms.tAO.value = aoTex; compMat.uniforms.tDepth.value = depth;
    compMat.uniforms.uAO.value = q.ao ? P.ao : 0; compMat.uniforms.uShimmer.value = P.shimmer; compMat.uniforms.uTime.value = P.time;
    pass(compMat, RT.comp);
    if (drawVM) { renderer.setRenderTarget(RT.comp); renderer.autoClear = false; renderer.clearDepth(); renderer.render(vmScene, vmCam); renderer.autoClear = true; }
    // 4. bloom
    let bloomTex = RT.black.texture;
    if (q.bloom && P.bloom > 0) {
      brightMat.uniforms.tColor.value = RT.comp.texture; brightMat.uniforms.uTexel.value.set(1 / P.w, 1 / P.h); brightMat.uniforms.uExpo.value = P.exposure;
      pass(brightMat, RT.down[0]);
      for (let i = 1; i < LEVELS; i++) { downMat.uniforms.tSrc.value = RT.down[i - 1].texture; downMat.uniforms.uTexel.value.set(0.5 / RT.down[i - 1].width, 0.5 / RT.down[i - 1].height); pass(downMat, RT.down[i]); }
      let src = RT.down[LEVELS - 1];
      for (let i = LEVELS - 2; i >= 0; i--) { upMat.uniforms.tSrc.value = src.texture; upMat.uniforms.tAdd.value = RT.down[i].texture; upMat.uniforms.uTexel.value.set(0.5 / src.width, 0.5 / src.height); pass(upMat, RT.up[i]); src = RT.up[i]; }
      bloomTex = RT.up[0].texture;
    }
    // 5. sun shafts, when the sun is on or near the screen
    let shaftTex = RT.black.texture, shaftAmt = 0;
    if (q.shafts && P.shafts > 0 && P.sunDir) {
      _sun.copy(P.sunDir).multiplyScalar(400).add(camera.position).project(camera);
      const fwd = camera.getWorldDirection(new THREE.Vector3()).dot(P.sunDir);
      if (fwd > 0.05) {
        const sx = _sun.x * 0.5 + 0.5, sy = _sun.y * 0.5 + 0.5, edge = Math.max(Math.abs(_sun.x), Math.abs(_sun.y));
        shaftAmt = P.shafts * smooth(0.05, 0.5, fwd) * (1 - smooth(1.0, 1.9, edge));
        if (shaftAmt > 0.01) {
          shaftMaskMat.uniforms.tDepth.value = depth; shaftMaskMat.uniforms.uSkyZ.value = P.skyZ; shaftMaskMat.uniforms.uSun.value.set(sx, sy); shaftMaskMat.uniforms.uAspect.value = P.w / P.h;
          pass(shaftMaskMat, RT.shaft);
          shaftBlurMat.uniforms.tSrc.value = RT.shaft.texture; shaftBlurMat.uniforms.uSun.value.set(sx, sy); shaftBlurMat.uniforms.uSpan.value = 0.85;
          pass(shaftBlurMat, RT.shaft2);
          shaftTex = RT.shaft2.texture;
        }
      }
    }
    // 6. out to the screen
    const f = finalMat.uniforms;
    f.tColor.value = RT.comp.texture; f.tBloom.value = bloomTex; f.tShaft.value = shaftTex;
    f.uExpo.value = P.exposure; f.uBloom.value = q.bloom ? P.bloom : 0; f.uShaft.value = shaftAmt;
    f.uSat.value = P.sat; f.uContrast.value = P.contrast; f.uSplit.value = P.split; f.uVignette.value = P.vignette; f.uGrain.value = P.grain; f.uTime.value = P.time;
    renderer.getDrawingBufferSize(_sz); f.uRes.value.copy(_sz);
    pass(finalMat, null);
  };
  P.dispose = () => { P.on = false; build(); };
  return P;
}

// ---------- the yard's haze: brighter and golden towards the sun, dusty red away from it ----------
export const HAZEU = { uSunView: { value: new THREE.Vector3(0, 0, -1) }, uSunHaze: { value: new THREE.Color(1.0, 0.82, 0.58).multiplyScalar(1.25) } };
export function hazeify(mat) {
  if (!mat || mat.userData.hazed || !mat.fog || mat.isShaderMaterial || mat.isMeshBasicMaterial || mat.isPointsMaterial || mat.isSpriteMaterial || mat.isLineBasicMaterial) return;
  mat.userData.hazed = true;
  // the old cache key is taken now, before the wrapper replaces onBeforeCompile (three keys programs on its source)
  const prev = mat.onBeforeCompile, baseKey = mat.customProgramCacheKey.call(mat);
  mat.onBeforeCompile = function (sh, r) {
    if (prev) prev.call(this, sh, r);
    sh.uniforms.uSunView = HAZEU.uSunView; sh.uniforms.uSunHaze = HAZEU.uSunHaze;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <fog_pars_fragment>', '#include <fog_pars_fragment>\nuniform vec3 uSunView; uniform vec3 uSunHaze;')
      .replace('#include <fog_fragment>', `#ifdef USE_FOG
        #ifdef FOG_EXP2
          float hzF = 1.0 - exp(- fogDensity * fogDensity * vFogDepth * vFogDepth);
        #else
          float hzF = smoothstep(fogNear, fogFar, vFogDepth);
        #endif
        float hzS = pow(max(dot(normalize(-vViewPosition), uSunView), 0.0), 5.0);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, mix(fogColor, uSunHaze, hzS * 0.8), hzF);
      #endif`);
  };
  mat.customProgramCacheKey = function () { return baseKey + '|haze'; };
  mat.needsUpdate = true;
}
