// ============================================================
// The plan of Bleak Flats: where the walls, the streets, the squares
// and the landmarks are. Nothing is drawn here; build.js builds the
// town from it, places.js the landmarks, and the land's own height
// (land.js) lies level inside the walls because of it.
//
// The layout is ported from the "Bleak Flats Main Street" blockout
// (its spine, side roads, walls and points of interest), turned to
// face the way the road arrives, and scaled down to sixty per cent so
// the Artery is a canyon and not a boulevard. The blockout's street
// alignments, wall lines, district names and gates are design
// proposals, not canon: Experimental. What the Artery looks like, the
// towers, the castes in the street, the Rusty Cog and the stamp-mills
// are Chapter Two's; the Miser-Boab and the Gallows-Gums are the Field
// Guide's species, and so is the crater.
//
// Units are metres; the road runs north along +z; east is −x.
// ============================================================
import { lerp, smooth } from '../road/core.js';

// ---------- the blockout, turned and scaled ----------
// The blockout's town runs south (its main gate) to north (the works) along its own z; its x is mirrored here,
// because its east (the Terrace) is our −x. Its origin sits 330 of its units north of the main gate.
export const K = 0.6;                                   // metres here for each metre of the blockout
export const GATE_AT = { x: 0, z: 1838 };               // the south gate (land.js's GATE)
export const fromBlockout = (xg, zg) => ({ x: -xg * K, z: GATE_AT.z + (zg + 330) * K });

// ---------- the walls ----------
export const WEST = fromBlockout(-170, 0).x, EAST = fromBlockout(166, 0).x;          // +102 and −99.6: the perimeter's long sides
export const NORTH = fromBlockout(0, 485).z;                                          // 2327: the north wall
export const ARC = { cx: 0, cz: 2015, r: 178, a: Math.asin(WEST / 178) };             // the south wall is the curve the road already ends at
export const SOUTH_CORNER = ARC.cz - Math.cos(ARC.a) * ARC.r;                         // where the curve meets the long sides
export const CASTE_W = fromBlockout(-84, 0).x, CASTE_E = fromBlockout(88, 0).x;       // +50.4 and −52.8: the walls behind the frontage
// the caste walls run in pieces, with the side roads through the gaps (z ranges)
export const CASTE_RUNS = {
  west: [[1880, 1918], [1932, 1975], [1989, 2125]],     // the Workers' Block behind it; north of the last piece the old town on North Ridge is open to the street
  east: [[1885, 1918], [1990, 2084], [2096, 2236]],     // the Warrens behind the first; the High Caste Terrace behind the others, its side gate in the gap
};
export const WORKERS_END = CASTE_RUNS.west[CASTE_RUNS.west.length - 1][1];            // where the Workers' Block gives way to North Ridge
export const TERRACE = { z0: CASTE_RUNS.east[1][0], z1: CASTE_RUNS.east[2][1] };      // the High Caste Terrace, raised a storey
export const TERRACE_GATE = { x: EAST, z0: fromBlockout(0, 98).z, z1: fromBlockout(0, 129).z };   // the high castes' own way in, through the east wall

// ---------- the Artery ----------
// the blockout's kinked spine: the street bends a little every fifty metres, so you never see far down it
export const SPINE = [[0, 1838], [-4, 1889], [2.4, 1940], [-6, 1988], [3, 2042], [-7, 2096], [0, 2156], [5, 2231], [-2.4, 2303], [-2.4, NORTH]];
export const ARTERY_HALF = 6.5;                       // thirteen metres between the frontages, and the upper storeys leaning out over it
export function arteryX(z) {
  if (z <= SPINE[0][1]) return SPINE[0][0];
  for (let i = 0; i < SPINE.length - 1; i++) { const [x0, z0] = SPINE[i], [x1, z1] = SPINE[i + 1]; if (z <= z1) return lerp(x0, x1, smooth(z0, z1, z)); }
  return SPINE[SPINE.length - 1][0];
}
// the side roads (the blockout's seven), and the back streets its notes suggest. half is half the width.
const lane = (zg, name, nameE = name) => ({ z: fromBlockout(0, zg).z, x0: EAST + 6, x1: WEST - 6, half: 3, name, nameE });
export const LANES = [
  lane(-265, 'Lower Market Lane', 'Warrens Cut'), lane(-185, 'Lower Market Lane', 'Warrens Cut'), lane(-90, 'the checkpoint lane', 'Water Tax Square'),
  lane(0, 'the Central Market', 'Cog Back Alley'), lane(90, 'Boiler Row', 'the Terrace approach'), lane(185, 'Boiler Row', 'Iron-Eye Approach'), lane(265, 'Boneworks Road', 'Boneworks Road'),
];
export const BACK = [                                    // north-south back streets
  { x: 30, z0: LANES[4].z, z1: 2210, half: 2.6, name: 'Boiler Row' },
  { x: -44, z0: LANES[3].z, z1: LANES[4].z, half: 2.2, name: 'Cog Back Alley' },
];

// ---------- the sites ----------
export const SITE = {
  yard: { x: 0, z: 1856, name: 'the gate yard' },
  lower: { x: 22, z: 1908, r: 16, name: 'the Lower Market' },
  water: { x: -29, z: 1986, r: 17, name: 'Water Square' },
  market: { x: 31, z: 2038, r: 19, name: 'the Central Market' },
  cog: { x: -25, z: 2058, name: 'the Rusty Cog' },
  sheriff: { x: -26, z: 2128, name: 'the sheriff’s station' },
  scrimp: { x: 13.5, z: 2222, name: 'the stalls by the stamp-mills' },
  stamps: { x: 26, z: 2240, name: 'the old stamp-mills' },
  refinery: { x: -58, z: 2284, name: 'the Refinery Complex' },
  bones: [[62, 2284, 46], [36, 2300, 58], [84, 2304, 40], [-26, 2302, 50]],     // the mine towers: x, z, height
  homesteads: { x: 150, z: 1806, name: 'the abandoned homesteads' },
  crater: { x: -430, z: 2690, r: 280, rim: 58 },                                 // north-east of the town, its rim over the rooftops
};

// ---------- where am I ----------
// 1 inside the walls, falling away to 0 a little way outside them
export function cityWeight(x, z, soft = 26) {
  if (z < GATE_AT.z - soft || z > NORTH + soft || x > WEST + soft || x < EAST - soft) return 0;
  // the south wall is a curve: inside it is north of the arc
  const dArc = Math.hypot(x - ARC.cx, z - ARC.cz), south = z < ARC.cz ? ARC.r - dArc : 1e3;
  const d = Math.min(south, NORTH - z, WEST - x, x - EAST);
  return smooth(-soft, 0, d);
}
export const inCity = (x, z, pad = 0) => z < ARC.cz
  ? Math.hypot(x - ARC.cx, z - ARC.cz) < ARC.r - pad && x < WEST - pad && x > EAST + pad
  : z < NORTH - pad && x < WEST - pad && x > EAST + pad;
export function districtAt(x, z) {
  if (!inCity(x, z)) return null;
  const ax = arteryX(z), west = x > ax, d = Math.abs(x - ax);
  if (x > CASTE_W) return z < WORKERS_END ? 'the Workers’ Block' : z < 2262 ? 'North Ridge' : 'under the Bones';
  if (x < CASTE_E) return z < TERRACE.z0 - 2 ? 'the Warrens' : z < TERRACE.z1 ? 'the High Caste Terrace' : SITE.refinery.name;
  for (const k of ['lower', 'water', 'market']) { const s = SITE[k]; if (Math.hypot(x - s.x, z - s.z) < s.r + 2) return s.name; }
  if (z < 1870) return SITE.yard.name;
  if (!west && Math.abs(z - SITE.cog.z) < 19 && d > 7) return SITE.cog.name;
  if (!west && Math.abs(z - SITE.sheriff.z) < 14 && d > 7) return SITE.sheriff.name;
  if (z > 2262) return west ? 'under the Bones' : SITE.refinery.name;
  if (z > 2205) return SITE.stamps.name;
  if (d < ARTERY_HALF + 2) return z > LANES[6].z ? 'Boneworks Road' : 'the Artery';
  for (const l of LANES) if (Math.abs(z - l.z) < l.half + 1.5) return west ? l.name : l.nameE;
  for (const b of BACK) if (Math.abs(x - b.x) < b.half + 1.5 && z > b.z0 && z < b.z1) return b.name;
  return 'the Artery’s back lots';
}

// ---------- the ground ----------
// The town's ground: it climbs in from the gate as the road already did, then lies level; the High Caste Terrace
// stands a storey above everything east of its wall; the old town on North Ridge is a little higher again.
const TERRACE_UP = 5.5;
export function cityLevel(x, z) {
  let y = 4 * smooth(1800, 1950, z);
  y += TERRACE_UP * smooth(CASTE_E + 1.5, CASTE_E - 5, x) * smooth(TERRACE.z0 - 8, TERRACE.z0 + 4, z) * (1 - smooth(TERRACE.z1 - 4, TERRACE.z1 + 10, z));
  y += 3.5 * smooth(CASTE_W - 16, WEST - 30, x) * smooth(2120, 2190, z) * (1 - smooth(2262, 2300, z));
  y += 2 * smooth(2190, 2300, z);                                                     // and up, gently, to the works
  return y;
}
// what land.js's height becomes round the town (the crater is its own piece of ground, laid over the plain: places.js)
export function cityGround(x, z, y) {
  const w = cityWeight(x, z);
  return w > 0 ? lerp(y, cityLevel(x, z), w) : y;
}

// ---------- what stands where: nothing is built twice on the same ground ----------
const CELL = 4, solid = new Map(), keep = [];
const key = (i, j) => i * 4096 + j;
// keep clear: streets, squares, yards (kind 'open'); or mark as built on (kind 'solid')
export function claim(x0, z0, x1, z1, kind = 'solid') {
  const r = { x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), kind };
  if (kind === 'open') { keep.push(r); return r; }
  for (let i = Math.floor(r.x0 / CELL); i <= Math.floor(r.x1 / CELL); i++) for (let j = Math.floor(r.z0 / CELL); j <= Math.floor(r.z1 / CELL); j++) { const k = key(i + 512, j); let l = solid.get(k); if (!l) solid.set(k, l = []); l.push(r); }
  return r;
}
export function built(x, z, pad = 0) {
  const l = solid.get(key(Math.floor(x / CELL) + 512, Math.floor(z / CELL)));
  if (l) for (const r of l) if (x > r.x0 - pad && x < r.x1 + pad && z > r.z0 - pad && z < r.z1 + pad) return true;
  if (pad > 0) for (const [di, dj] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) { const m = solid.get(key(Math.floor(x / CELL) + di + 512, Math.floor(z / CELL) + dj)); if (m) for (const r of m) if (x > r.x0 - pad && x < r.x1 + pad && z > r.z0 - pad && z < r.z1 + pad) return true; }
  return false;
}
// would a building with this footprint stand on a street, a square, or another building?
export function clear(x0, z0, x1, z1, pad = 0.4) {
  const a = Math.min(x0, x1) - pad, b = Math.max(x0, x1) + pad, c = Math.min(z0, z1) - pad, d = Math.max(z0, z1) + pad;
  for (const r of keep) if (a < r.x1 && b > r.x0 && c < r.z1 && d > r.z0) return false;
  for (let i = Math.floor(a / CELL); i <= Math.floor(b / CELL); i++) for (let j = Math.floor(c / CELL); j <= Math.floor(d / CELL); j++) { const l = solid.get(key(i + 512, j)); if (l) for (const r of l) if (a < r.x1 && b > r.x0 && c < r.z1 && d > r.z0) return false; }
  return true;
}
// (for debugging: which claim stands in the way)
export function why(x0, z0, x1, z1, pad = 0.4) {
  const a = Math.min(x0, x1) - pad, b = Math.max(x0, x1) + pad, c = Math.min(z0, z1) - pad, d = Math.max(z0, z1) + pad;
  for (const r of keep) if (a < r.x1 && b > r.x0 && c < r.z1 && d > r.z0) return ['open', +r.x0.toFixed(1), +r.z0.toFixed(1), +r.x1.toFixed(1), +r.z1.toFixed(1)];
  for (const l of solid.values()) for (const r of l) if (a < r.x1 && b > r.x0 && c < r.z1 && d > r.z0) return ['solid', +r.x0.toFixed(1), +r.z0.toFixed(1), +r.x1.toFixed(1), +r.z1.toFixed(1)];
  return null;
}
export const onStreet = (x, z) => { for (const r of keep) if (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1) return true; return false; };
