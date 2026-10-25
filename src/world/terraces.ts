/** House terraces. Tivon is built on slopes: each private house sits on a flat pad cut into the
 *  hill, its footprint plus ~3 m (less towards a road), at the footprint's average ground height,
 *  blending into the surrounding ground over ~2 m. Where the ground beside a pad steps by more
 *  than ~0.6 m the edge is left sharp and held by a low rubble-stone retaining wall.
 *  The pads are registered before the terrain mesh exists (`groundHooks`), the walls drawn with the town. */
import { BUILDINGS, DISTRICTS, ROADS, landmark, nearestRoad, orientedBox, pointInPolygon, type P2 } from './geo';
import { LANDMARKS } from '../game/landmarks';
import { STATIC_PADS } from './layout';
import { isPrivateHouse } from './scenery';
import { addPad, groundHooks, surfaceHeight } from './terrain';
import { distToPoly } from './roadGrade';
import { MAT, type Kit } from './kit';

export const TERRACE_STATS = { houses: 0, pads: 0, shared: 0, skipped: 0, walls: 0, ms: 0 };
interface Wall { x: number; z: number; rot: number; len: number; lo: number; hi: number; shade: number }
const WALLS: Wall[] = [];
const PAD = 3, BLEND = 2, DROP = .6, SEG = 3;
const STONE = ['#9d968a', '#8d887d', '#a8a193', '#948d80', '#b0a898'];
let done = false;

type Rect = { poly: P2[]; y: number; cx: number; cz: number; r: number };
/** Separating-axis test for two convex quads. */
function overlap(a: P2[], b: P2[]) {
  for (const poly of [a, b]) for (let i = 0; i < poly.length; i++) {
    const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % poly.length], nx = az - bz, nz = bx - ax;
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (const [x, z] of a) { const d = x * nx + z * nz; a0 = Math.min(a0, d); a1 = Math.max(a1, d); }
    for (const [x, z] of b) { const d = x * nx + z * nz; b0 = Math.min(b0, d); b1 = Math.max(b1, d); }
    if (a1 < b0 || b1 < a0) return false;
  }
  return true;
}

export function prepareTerraces() {
  if (done) return; done = true;
  const t0 = performance.now();
  const near = LANDMARKS.map(l => landmark(l.id)), centres = Object.values(DISTRICTS);
  const statics = STATIC_PADS.map(p => { const xs = p.poly.map(q => q[0]), zs = p.poly.map(q => q[1]); return { poly: p.poly, x0: Math.min(...xs) - 8, x1: Math.max(...xs) + 8, z0: Math.min(...zs) - 8, z1: Math.max(...zs) + 8 }; });
  const made = new Map<number, Rect[]>(), key = (gx: number, gz: number) => gx * 4096 + gz;
  const pending: Array<{ pad: Rect; edges: Array<{ a: P2; b: P2; out: P2; g: number[]; blend: number }> }> = [];
  for (const b of BUILDINGS) {
    if (!isPrivateHouse(b)) continue;
    const box = orientedBox(b.points), c = Math.cos(box.rot), s = Math.sin(box.rot);
    // Authored ground stays as it is: the two centres, the story landmarks, the catacomb hill.
    if (centres.some(d => Math.hypot(box.cx - d.x, box.cz - d.z) < d.r) || near.some(l => Math.hypot(box.cx - l.x, box.cz - l.z) < 22) || (box.cx > 70 && box.cx < 195 && box.cz > 55 && box.cz < 290)) { TERRACE_STATS.skipped++; continue; }
    const at = (lx: number, lz: number): P2 => [box.cx + lx * c + lz * s, box.cz - lx * s + lz * c];
    // Side extents (−x, −z, +x, +z): 3 m, less where a road or path would be reached (its edge plus the blend stays off the carriageway).
    const hw = box.w / 2, hd = box.d / 2, ext = [PAD, PAD, PAD, PAD];
    const outer = (k: number, e: number, u: number): P2 => k === 0 ? at(-hw - e, u * hd) : k === 1 ? at(u * hw, -hd - e) : k === 2 ? at(hw + e, u * hd) : at(u * hw, hd + e);
    for (let k = 0; k < 4; k++) while (ext[k] > 0 && [-.85, 0, .85].some(u => { const [x, z] = outer(k, ext[k], u), n = nearestRoad(x, z, ROADS); return n.dist < n.road.width / 2 + BLEND + .5; })) ext[k] = Math.max(0, ext[k] - .75);
    const c0 = at(-hw - ext[0], -hd - ext[1]), c1 = at(hw + ext[2], -hd - ext[1]), c2 = at(hw + ext[2], hd + ext[3]), c3 = at(-hw - ext[0], hd + ext[3]), poly = [c0, c1, c2, c3];
    // Not over a hand-made pad.
    const pts: P2[] = [...poly, at(0, 0), ...poly.map((q, i) => [(q[0] + poly[(i + 1) % 4][0]) / 2, (q[1] + poly[(i + 1) % 4][1]) / 2] as P2)];
    if (statics.some(q => pts.some(([x, z]) => x > q.x0 && x < q.x1 && z > q.z0 && z < q.z1 && (pointInPolygon(x, z, q.poly) || distToPoly(x, z, q.poly) < 6)))) { TERRACE_STATS.skipped++; continue; }
    // Level: the average ground under the footprint.
    let sum = 0, n = 0;
    for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) { const [x, z] = at((i / 4 - .5) * box.w, (j / 4 - .5) * box.d); if (pointInPolygon(x, z, b.points)) { sum += surfaceHeight(x, z); n++; } }
    if (!n) sum = surfaceHeight(box.cx, box.cz), n = 1;
    let y = sum / n;
    // Houses whose pads touch share the first one's level.
    const rad = Math.hypot(hw + PAD, hd + PAD), gx0 = Math.floor((box.cx - rad) / 16), gx1 = Math.floor((box.cx + rad) / 16), gz0 = Math.floor((box.cz - rad) / 16), gz1 = Math.floor((box.cz + rad) / 16);
    let twin: Rect | undefined;
    for (let gx = gx0; gx <= gx1 && !twin; gx++) for (let gz = gz0; gz <= gz1 && !twin; gz++) twin = made.get(key(gx, gz))?.find(o => Math.hypot(o.cx - box.cx, o.cz - box.cz) < o.r + rad && overlap(o.poly, poly));
    if (twin) { y = twin.y; TERRACE_STATS.shared++; }
    const pad: Rect = { poly, y, cx: box.cx, cz: box.cz, r: rad };
    for (let gx = gx0; gx <= gx1; gx++) for (let gz = gz0; gz <= gz1; gz++) { const k = key(gx, gz); (made.get(k) ?? made.set(k, []).get(k)!).push(pad); }
    // The ground just beyond each edge, before any pad changes it; the edge order matches poly edges (p[i-1] → p[i]): −x, −z, +x, +z.
    const edges = [[c3, c0, -1, 0], [c0, c1, 0, -1], [c1, c2, 1, 0], [c2, c3, 0, 1]].map(([a, bb, ox, oz]) => {
      const A = a as P2, B = bb as P2, ex = B[0] - A[0], ez = B[1] - A[1], L = Math.hypot(ex, ez), nx = (ox as number) * c + (oz as number) * s, nz = -(ox as number) * s + (oz as number) * c;
      const segs = Math.max(1, Math.round(L / SEG)), g: number[] = [];
      for (let q = 0; q < segs; q++) { const t = (q + .5) / segs; g.push(surfaceHeight(A[0] + ex * t + nx * .8, A[1] + ez * t + nz * .8)); }
      const mean = g.reduce((u, v) => u + v, 0) / g.length;
      return { a: A, b: B, out: [nx, nz] as P2, g, blend: y - mean > DROP ? 0 : BLEND };
    });
    pending.push({ pad, edges });
    TERRACE_STATS.houses++;
  }
  // Register every pad only now, so the samples above saw the untouched ground.
  for (const { pad, edges } of pending) {
    addPad(pad.poly, pad.y, BLEND, { edgeBlend: edges.map(e => e.blend), terrace: true }); TERRACE_STATS.pads++;
    for (const e of edges) {
      if (e.blend > 0) continue;
      const ex = e.b[0] - e.a[0], ez = e.b[1] - e.a[1], L = Math.hypot(ex, ez), segs = e.g.length, rot = Math.atan2(-ez, ex);
      for (let q = 0; q < segs; q++) {
        const g = e.g[q], lo = Math.min(g, pad.y), hi = Math.max(g, pad.y);
        if (hi - lo < .15) continue;
        const t = (q + .5) / segs, h = (Math.sin(pad.cx * 12.9 + pad.cz * 78.2 + q * 3.7) * 43758.5) % 1;
        WALLS.push({ x: e.a[0] + ex * t + e.out[0] * .2, z: e.a[1] + ez * t + e.out[1] * .2, rot, len: L / segs + .06, lo: lo - .35, hi: hi + .08 + Math.abs(h) * .1, shade: Math.floor(Math.abs(h) * 5) % 5 });
      }
    }
  }
  TERRACE_STATS.walls = WALLS.length; TERRACE_STATS.ms = Math.round(performance.now() - t0);
}
groundHooks.push(prepareTerraces);

/** Rubble-stone retaining walls along the pads' stepped edges (batched into the town's stone). */
export function buildTerraceWalls(kit: Kit) {
  prepareTerraces();
  for (const w of WALLS) {
    kit.B.box(MAT.stone, w.x, (w.lo + w.hi) / 2, w.z, w.len, w.hi - w.lo, .5, w.rot, STONE[w.shade]);
  }
}
