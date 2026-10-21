// ============================================================
// The road's shared core: Three.js, small helpers, the materials,
// and the state every part of the road reads and writes. The land
// (land.js), its life (life.js), the caves (caves.js) and the game
// itself (main.js) all import from here.
// ============================================================
import * as THREE from '../yard/vendor/three.module.js';
export { THREE };

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export const noise2 = (x, z) => Math.sin(x * 0.027 + z * 0.009) * 0.45 + Math.cos(x * 0.039 - z * 0.012) * 0.35 + Math.sin(z * 0.027 + x * 0.012) * 0.2;
export const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const valueOf = (v) => typeof v === 'function' ? v() : v;

// ---------- where things come from ----------
export const TAG_NAME = { C: 'Canon', P: 'Plausible', X: 'Experimental' };
export const GUIDE = 'Survival Field Guide';
export const CH1 = 'Chapter One';
export const CH2 = 'Chapter Two';
export const FARM = 'from the Farm of Rust sketch';
export const NEW = 'new on the road';
export const tagHTML = (tag, src) => `<span class="tag ${tag}">${TAG_NAME[tag]}</span>${src ? ` <span class="src">${esc(src)}</span>` : ''}`;

// ---------- the game's shared state ----------
// G: the machinery. S: how Jacob and the journey stand. P: where he is and where he's looking.
export const G = { renderer: null, scene: null, camera: null, maxAniso: 8, area: 'out', caves: {}, tractor: null, time: 0, exposure: 1.05 };
export const S = {
  started: false, paused: false, ended: false, dead: false, inTractor: true, view: 'chase', compass: true, workshop: false,
  time: 6 * 3600 + 25 * 60, health: 100, water: 82, stress: 8, bleed: 0, sips: 3, can: 4, sulphur: 1, disoriented: 0, haze: 0, earcage: false,
  finds: {}, flags: {}, met: {}, footKm: 0, handoff: null, menuTab: 'finds', hull: 0, route: '',
};
export const P = { x: 0, z: 0, y: 0, yaw: 0, pitch: -0.05, look: 0, speed: 0, bob: 0, stun: 0, shake: 0, crouch: 0 };
export const things = [];      // anything that can be used: { id, name, verb, x, y, z, r, prov, use, enabled, area }
export const blockers = [];    // circles { x, z, r } and boxes { x0, z0, x1, z1 } outside
export const shades = [];      // where the sun can't reach: { x, z, r, why }
export const W = { spinifex: [], weeds: [], gums: [], stalkers: [], argus: [], wattles: [], flySources: [], mirages: [], leaks: [], smoke: [], tractorThings: [], sprays: [], drips: [], poles: [], spans: [] };
export const hooks = { bark() {}, book() {}, toast() {}, hurt() {}, sfx: new Proxy({}, { get: () => () => {} }), updateVitals() {} };
export const addThing = (t) => { const o = { r: 1.4, y: 0.8, area: 'out', enabled: () => true, ...t }; things.push(o); return o; };
export const bark = (...a) => hooks.bark(...a);
export const once = (key, text, prov) => { if (S.flags['l:' + key]) return; S.flags['l:' + key] = true; hooks.bark(text, prov); };

// what Jacob knows about each thing he meets, for the field notes
export const SPECIES = {
  gum: { name: 'Gallows-Gum', tag: 'C', src: GUIDE, fact: 'The best shade on the road, and it waits for whoever rests in it to relax before it attacks. (Chapter Two gives it pale bark peeling like sunburned skin over wet red cambium, and a noose of a loop in the leaves.)', counter: 'Use the shade if you must, but don’t settle: keep moving, stay on edge, and never park under one. When the limb creaks, go.' },
  spinifex: { name: 'Razor-Spinifex', tag: 'C', src: CH2, fact: 'A golden sea of blades made of something like glass, sharper than surgical steel. It senses movement, thrashes, and drinks the iron-rich blood of whatever it cuts.', counter: 'Keep to the game trail. On foot, walk; never run through it. In the tractor, creep, then punch it once you’re clear of the gums.' },
  weed: { name: 'Compass-Weed', tag: 'C', src: CH1 + '; ' + GUIDE, fact: 'A small, perfect spiral of leaves. Its spores scramble a compass, and a person’s sense of direction with it.', counter: 'Stop trusting the needle and your feet. Steer by the wires, the pipeline and the sun.' },
  flies: { name: 'Gossip-Flies', tag: 'C', src: GUIDE + '; ' + CH2, fact: 'Fist-sized, oil-slick wings. They pick up fears and whisper them back; a swarm doesn’t just annoy, it mines a mind.', counter: 'Outrun the small ones. A swarm breaks apart in sulphur: Sulphur-Salts in the intake, then redline it.' },
  strider: { name: 'Salt-Strider', tag: 'C', src: GUIDE + '; the look and the blink are ' + CH2, fact: 'Raptor-like, furred the colour of sun-bleached bone, over eight feet tall, a tail like a rudder. It moves by folding space, fifty feet at a blink. It hunts the open flats.', counter: 'Hold a constant, boring speed. Don’t speed up. Don’t slow down. Let it weigh you and find you too metallic.' },
  boar: { name: 'Razor-Back Boar', tag: 'C', src: CH2, fact: 'Bristles like blades down the spine. One running scared means something spooked it from the other direction.', counter: '' },
  stalker: { name: 'Drop-Stalker', tag: 'C', src: GUIDE, fact: 'A leopard-sized, heavily muscled koala-like predator that ambushes travellers from above, around rocky overhangs.', counter: 'Listen for the clicking. Look up and hold its eye; it won’t drop on something that’s watching it.' },
  wattle: { name: 'Judas-Wattle', tag: 'C', src: GUIDE, fact: 'Its pollen, the Golden Haze, turns the red world green and promises water.', counter: 'Keep to the road. Whatever’s shining up ahead isn’t there.' },
  argus: { name: 'Argus-Bush', tag: 'C', src: GUIDE, fact: 'Woody pods that open into eyes. It records fear and memory.', counter: 'Don’t linger, and don’t sleep near one.' },
  truthrot: { name: 'Truth-Rot', tag: 'C', src: GUIDE, fact: 'A fungus that glows green when someone lies near it. In the dark of a cave it lights the walls.', counter: '' },
  devil: { name: 'Thorny-Devil', tag: 'P', src: FARM, fact: 'A spiked lizard that basks on warm rock. Anything thrown at one goes straight back where it came from.', counter: '' },
  jaws: { name: 'Jaw-Jaws', tag: 'P', src: FARM, fact: 'Wedge-headed copper strippers in green-gone shells. They gut wrecks for wire.', counter: 'Keep them off the tractor’s ignition.' },
  webs: { name: 'Tunnel-Webs', tag: 'P', src: FARM, fact: 'Sheet webs across dark places, and what lives in them bites.', counter: 'Move slowly and brush them aside. Blunder through and you’ll be bitten.' },
  crows: { name: 'Tally-Crows', tag: 'X', src: NEW + ', a fear-made animal in the spirit of the Field Guide', fact: 'Black birds in rows along the wires of the old power line, every head turning as you pass. They lift when you come close, circle, and settle again behind you. They count.', counter: 'Nothing to be done about them. Don’t count back.' },
  hounds: { name: 'Hollow-Hounds', tag: 'X', src: NEW + ', a fear-made animal in the spirit of the Field Guide', fact: 'Lean, ribby dogs that keep pace with travellers out in the scrub along the main road, and are only ever there at the corner of the eye. Look straight at one and there’s nothing. They never come closer. They just follow.', counter: 'Keep your eyes on the road.' },
  ruin: { name: 'Ruins on the road', tag: 'X', src: NEW, fact: 'Shacks and camps people walked away from. Shade without branches, and sometimes a little water.', counter: '' },
};
export function meet(k) { if (S.met[k]) return; S.met[k] = true; hooks.toast(`Field notes · ${SPECIES[k].name}`); }

// the finds: things other people left on this road, some of them older than the Fracture
export const FINDS = [
  { name: 'Survey stake', where: 'off the road near the fork', text: 'A brass-capped survey stake, stamped with a number and an arrow. Someone measured this country once, carefully, as if it would hold still.' },
  { name: 'Ear-cage clasp', where: 'the scrapper’s shack', text: 'A brass clasp off an ear-cage, the fine mesh ones that keep gossip-flies out of your ears. The rest of it is long gone.' },
  { name: 'Road atlas page', where: 'the Pipewright’s shack', book: ['The roads in the Age of Glass were as smooth as fresh milk and stretched from horizon to horizon without a single crack.', CH2 + ', epigraph'], text: 'A page from a book of maps. Roads like veins, drawn in red and blue, running edge to edge with nothing in the way.' },
  { name: 'Weathered map scrap', where: 'the Pipewright’s shack', text: 'A corner of a hand-drawn map: the canyon, the pans, and an X in the east wall with “COOL WATER” written beside it.' },
  { name: 'Pipewright token', where: 'a pipeline leak', text: 'A pressed-tin token, a wrench and a drop of water on it. Good for one day’s wages, from people who no longer pay them.' },
  { name: 'Painted chariot', where: 'the den in the west wall', book: ['Painted chariots moved in rivers of polite agreement – red meant stop, green meant go, and every soul obeyed.', CH2 + ', epigraph'], text: 'A little metal carriage on four wheels, no longer than a finger, red paint still on it. A toy. Nobody built a toy out here.' },
  { name: 'Scrapper’s tally-book', where: 'the den in the west wall', text: 'Pencil notes in a cramped hand: “GUMS: DONT LOOK UP. STRIDER ON THE PANS BY NOON. DEN EMPTY DAYS, FULL NIGHTS.” The last page just says “out of salts”.' },
  { name: 'Stalker claw', where: 'the den in the west wall', text: 'A shed claw as long as a finger, black and hooked. Whatever wore it is up on the ledge, if it isn’t behind you.' },
  { name: 'Vacuum flask', where: 'the seep in the east wall', book: ['…and when the sun grew tired, the houses swallowed it whole and kept its warmth inside the walls until morning.', CH1 + ', epigraph'], text: 'A steel bottle with a glass skin inside. Pour something hot in at night and it’s still hot in the morning. Out here that’s a curse.' },
  { name: 'Sulphur-Salts tin', where: 'the seep in the east wall', counts: 'sulphur', text: 'A sealed tin of Sulphur-Salts, tucked in a crack where the damp couldn’t reach it. One more blast, if the flies come. Back in the compartment with it.' },
  { name: 'Creeper-vine cord', where: 'the seep in the east wall', text: 'A coil of dried creeper-vine, the same stuff that holds the load on the tractor. Somebody strung this up as a ladder and never came back for it.' },
  { name: 'Insulator glass', where: 'a fallen pole on the old main road', text: 'A glass insulator off a power pole, green as a bottle and ribbed like a shell. It held the lightning off the wood, once. The wire it held is still humming.' },
  { name: 'Tin wind-up bird', where: 'a caved-in house in Tally Bore', text: 'A little tin bird with a key in its back. Wind it and it hops, and pecks at nothing. It still pecks. Somebody left in a hurry, or couldn’t bear to take it.' },
  { name: 'Pump-house logbook', where: 'the pump house at Tally Bore', text: 'Pressure readings twice a day, in a careful hand, for years. The numbers fall. The last page: MAIN FAILED AT THE BEND. NO PIPEWRIGHTS. TOWN LEAVING FOR THE FLATS. TAKE WHAT WATER YOU CAN CARRY.' },
  { name: 'Telephone handset', where: 'the old adit', book: ['Information moved alongside the road, in towers that stood high and bold.', CH2 + ', epigraph'], text: 'A curved black handle with holes at each end: one to speak into, one to listen. A cord hangs off it, cut. Nobody’s on the other end.' },
  { name: 'Miner’s brass chit', where: 'the old adit', text: 'A brass tally chit, the kind the mines hand out for a shift. This one says 1 SHIFT · BF. Somebody didn’t come back up to cash it.' },
  { name: 'Pre-Fracture glass', where: 'the old adit', text: 'A thick lens of glass, ground perfectly smooth, wedged in the rock at the end of the adit. No anima in it at all.' },
];

// ---------- building helpers ----------
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
export const MX = (x, y, z, rx = 0, ry = 0, rz = 0, s = 1, sy = s, sz = s) => new THREE.Matrix4().compose(v3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), v3(s, sy, sz));
export function rodMX(a, b) {   // a unit-high cylinder stretched from a to b
  const A = v3(...a), B = v3(...b), d = B.clone().sub(A), len = d.length();
  return new THREE.Matrix4().compose(A.add(B).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(v3(0, 1, 0), d.normalize()), v3(1, len, 1));
}
// textures that tile by the metre on whatever they're wrapped round
export function planarUV(geo, tile = 1) {
  const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
  if (!uv || !n) return geo;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    uv.setXY(i, (ax > 0.6 ? p.getZ(i) : p.getX(i)) / tile, (ay > 0.6 ? p.getZ(i) : p.getY(i)) / tile);
  }
  return geo;
}
// many pieces, one draw: geometries placed by matrices and joined
export function merge(parts) {
  const out = { position: [], normal: [], uv: [] };
  for (const [g, m] of parts) {
    const n = (g.index ? g.toNonIndexed() : g.clone()).applyMatrix4(m), cnt = n.attributes.position.count;
    for (const k in out) { const a = n.attributes[k]; if (a) for (let i = 0; i < a.array.length; i++) out[k].push(a.array[i]); else if (k === 'uv') for (let i = 0; i < cnt * 2; i++) out[k].push(0); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(out.position, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(out.normal, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(out.uv, 2));
  return g;
}
export function mesh(geo, mat, { cast = true, receive = true } = {}) { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = receive; return m; }
export const glowTexture = (() => { let t = null; return () => { if (t) return t; const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return (t = new THREE.CanvasTexture(c)); }; })();

// an alpha map that fades from the middle out to nothing at the edges
function softEdge() { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, '#fff'); g.addColorStop(0.45, '#bbb'); g.addColorStop(1, '#000'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); }

// ---------- the materials: the shack's photographed textures, tinted for the Waste ----------
export const assetURL = (path) => (window.__ASSETS && window.__ASSETS[path]) || 'assets/' + path;
export const T = {};
export const M = {};
export const SWAY = { uTime: { value: 0 }, uThrash: { value: new THREE.Vector4(0, 0, 0, 0) } };   // the spinifex's wind, and where it's thrashing
export function initMaterials(maxAniso) {
  const loader = new THREE.TextureLoader();
  const tex = (name, srgb = true) => { const t = loader.load(assetURL('tex/' + name + '.jpg')); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = Math.min(8, maxAniso); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; return t; };
  for (const k of ['dirt', 'iron', 'ironpaint', 'boards', 'tin', 'frame', 'canvas', 'leather']) T[k] = { c: tex(k + '_c'), n: tex(k + '_n', false) };
  const std = (k, o = {}) => new THREE.MeshStandardMaterial({ map: T[k].c, normalMap: T[k].n, roughness: 0.9, ...o });
  Object.assign(M, {
    ground: new THREE.MeshStandardMaterial({ map: T.dirt.c, normalMap: T.dirt.n, normalScale: new THREE.Vector2(0.8, 0.8), vertexColors: true, roughness: 1 }),
    road: new THREE.MeshStandardMaterial({ map: T.dirt.c, normalMap: T.dirt.n, normalScale: new THREE.Vector2(0.35, 0.35), vertexColors: true, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 }),
    seal: new THREE.MeshStandardMaterial({ normalMap: T.dirt.n, normalScale: new THREE.Vector2(0.6, 0.6), vertexColors: true, roughness: 1, envMapIntensity: 0.12, polygonOffset: true, polygonOffsetFactor: -2 }),   // old bitumen: the colour's all in the vertices
    strata: new THREE.MeshStandardMaterial({ map: T.dirt.c, normalMap: T.iron.n, normalScale: new THREE.Vector2(1.4, 1.4), vertexColors: true, roughness: 0.95 }),   // canyon and cave rock: the banding is in the vertex colours
    rock: std('iron', { color: 0xc8826a, roughness: 0.95 }),
    iron: std('iron', { roughness: 0.8, metalness: 0.4 }),
    rust: std('iron', { color: 0xe0a07c, roughness: 0.9, metalness: 0.3 }),
    paint: std('ironpaint', { color: 0x8a6a4a, roughness: 0.75, metalness: 0.3 }),
    boards: std('boards', { roughness: 0.95 }),
    tin: std('tin', { roughness: 0.55, metalness: 0.55, side: THREE.DoubleSide }),
    timber: std('frame', { color: 0xb8a690, roughness: 0.92 }),
    canvas: std('canvas', { roughness: 0.97 }),
    rag: std('canvas', { color: 0x8a7258, roughness: 1, side: THREE.DoubleSide }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x1d1a19, roughness: 0.95 }),
    black: new THREE.MeshStandardMaterial({ color: 0x0d0a09, roughness: 1 }),
    bone: new THREE.MeshStandardMaterial({ color: 0xe9e2d4, roughness: 0.7 }),
    gumBark: new THREE.MeshStandardMaterial({ color: 0xe8d6c8, roughness: 0.7 }),           // pale, like skin that's never seen shade
    gumFlesh: new THREE.MeshStandardMaterial({ color: 0x9a1e14, roughness: 0.35, emissive: 0x200402, side: THREE.DoubleSide }),   // the wet cambium under it
    gumLeaf: new THREE.MeshStandardMaterial({ color: 0x55603f, roughness: 0.9, flatShading: true }),
    stain: new THREE.MeshStandardMaterial({ color: 0x4a1008, roughness: 1, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    spinifex: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.4 }),
    scrub: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, flatShading: true }),
    compass: new THREE.MeshStandardMaterial({ color: 0xa9c88e, roughness: 0.55 }),
    wattle: new THREE.MeshStandardMaterial({ color: 0xf4c430, roughness: 0.9, emissive: 0x4a3300, emissiveIntensity: 0.5, flatShading: true }),
    vine: new THREE.MeshStandardMaterial({ color: 0x4e5a2c, roughness: 0.8, side: THREE.DoubleSide }),
    vineDry: new THREE.MeshStandardMaterial({ color: 0x8a7650, roughness: 0.9, side: THREE.DoubleSide }),
    salt: new THREE.MeshStandardMaterial({ color: 0xe9e4d8, roughness: 0.6, flatShading: true }),
    eyeWhite: new THREE.MeshStandardMaterial({ color: 0xf2eee4, roughness: 0.15 }),
    pupil: new THREE.MeshStandardMaterial({ color: 0x0a0806, roughness: 0.2 }),
    fur: std('canvas', { color: 0x8a817a, roughness: 1 }),
    boneFur: std('canvas', { color: 0xe8dfcc, roughness: 1 }),                                 // the strider: sun-bleached bone
    boarHide: std('leather', { color: 0x5a3a2a, roughness: 0.9 }),
    furDark: new THREE.MeshStandardMaterial({ color: 0x2a2523, roughness: 0.6 }),
    claw: new THREE.MeshStandardMaterial({ color: 0x1b1716, roughness: 0.35 }),
    stalkerEye: new THREE.MeshStandardMaterial({ color: 0x220a02, emissive: 0xe0661a, emissiveIntensity: 0.8 }),
    devil: new THREE.MeshStandardMaterial({ color: 0xb87a40, roughness: 0.7, flatShading: true }),
    copper: new THREE.MeshStandardMaterial({ color: 0x6aa08a, roughness: 0.35, metalness: 0.8 }),   // copper gone to verdigris
    fly: new THREE.MeshPhysicalMaterial({ color: 0x14302f, metalness: 0.7, roughness: 0.25, iridescence: 1, iridescenceIOR: 1.6 }),
    wing: new THREE.MeshStandardMaterial({ color: 0xc4d9cf, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }),
    relic: new THREE.MeshStandardMaterial({ color: 0xc8a050, roughness: 0.3, metalness: 0.9, emissive: 0x3a2400, emissiveIntensity: 0.6 }),
    mirage: new THREE.MeshBasicMaterial({ color: 0xbfe0e4, transparent: true, opacity: 0, depthWrite: false, fog: false, alphaMap: softEdge() }),   // feathered, so it lies on the pans like a sheet of water
    truthrot: new THREE.MeshStandardMaterial({ color: 0xd8f0c0, emissive: 0x5cff5a, emissiveIntensity: 1.2, roughness: 0.6 }),
    web: new THREE.MeshBasicMaterial({ color: 0xf4f0e8, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false }),
    water: new THREE.MeshStandardMaterial({ color: 0x2a2620, roughness: 0.12, metalness: 0.2, envMapIntensity: 0.35 }),   // still and dark, with a little sky in it
    corr: std('tin', { color: 0x9a7a62, roughness: 0.6, metalness: 0.5, side: THREE.DoubleSide }),
    wire: new THREE.LineBasicMaterial({ color: 0x1c1816 }),
    smoke: new THREE.MeshBasicMaterial({ color: 0x3a3230, transparent: true, opacity: 0.35, depthWrite: false }),
    yellowSmoke: new THREE.MeshBasicMaterial({ color: 0x4a4026, transparent: true, opacity: 0.4, depthWrite: false }),
    ironshell: std('iron', { color: 0x8a8a88, roughness: 0.6, metalness: 0.7 }),
    slit: new THREE.MeshStandardMaterial({ color: 0x200000, emissive: 0xd01a10, emissiveIntensity: 1.6 }),
    post: new THREE.MeshStandardMaterial({ color: 0xe2dccf, roughness: 0.8 }),                     // guide posts
    reflector: new THREE.MeshStandardMaterial({ color: 0x8a1410, emissive: 0x3a0402, roughness: 0.3 }),
    pole: std('frame', { color: 0x8a7a68, roughness: 0.95 }),                                        // power poles, grey with age
    insulator: new THREE.MeshStandardMaterial({ color: 0x6f9a7c, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.85 }),   // bottle-green glass
    crow: new THREE.MeshStandardMaterial({ color: 0x141212, roughness: 0.45, metalness: 0.25, side: THREE.DoubleSide }),
    hound: new THREE.MeshStandardMaterial({ color: 0x5a4a40, roughness: 0.9, transparent: true, opacity: 0 }),
    brick: new THREE.MeshStandardMaterial({ color: 0x9a5a44, roughness: 0.95, flatShading: true }),
    tank: std('tin', { color: 0xa89a88, roughness: 0.5, metalness: 0.6, side: THREE.DoubleSide }),
  });
  // the spinifex never quite holds still, and thrashes where something moves through it
  M.spinifex.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, SWAY);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime; uniform vec4 uThrash;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
        vec2 ip = instanceMatrix[3].xz;
        float near = 1.0 - smoothstep(uThrash.z * 0.4, uThrash.z, distance(ip, uThrash.xy));
        float k = position.y * position.y;
        transformed.x += (sin(uTime * 1.3 + ip.x * 0.7) * 0.05 + near * uThrash.w * sin(uTime * 17.0 + ip.y * 3.1) * 0.35) * k;
        transformed.z += (cos(uTime * 1.1 + ip.y * 0.6) * 0.05 + near * uThrash.w * cos(uTime * 13.0 + ip.x * 2.3) * 0.35) * k;
        #endif`);
  };
}

// ---------- relics: a glint where something was left, and the hand that picks it up ----------
export const RELICS = [];
export function placeRelic(name, p, { area = 'out', scene = G.scene } = {}) {
  const def = FINDS.find(f => f.name === name);
  if (!def) throw new Error('no such find: ' + name);
  const m = mesh(new THREE.OctahedronGeometry(0.09, 0), M.relic); m.position.copy(p); scene.add(m);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffd890, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.scale.setScalar(0.55); m.add(glow);
  m.visible = !S.finds[name];
  RELICS.push({ def, m });
  addThing({ id: 'relic:' + name, area, name, verb: 'Pick it up', x: p.x, y: p.y, z: p.z, r: 1.3, prov: ['X', 'a find: ' + NEW], enabled: () => !S.finds[name], use: () => { m.visible = false; hooks.found(def); } });
}
