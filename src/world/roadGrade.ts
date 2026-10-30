/** Smooth roads on the DEM. Every vehicle road's profile is sampled every 4 m, low-passed
 *  along its length (sigma 12 m) and grade-limited to 12 %; the ground within half the road's width
 *  plus 4 m is then levelled to that profile, tapering back to the DEM over 6 m. The result is a
 *  precomputed 2 m grid of height deltas (a typed array) that `surfaceHeight` samples bilinearly:
 *  the same road bed for every consumer (mesh, walking, roads, fences). The Zeid pads, Ben Gurion
 *  Square and the catacomb hill keep their ground: the correction fades to zero near them. */
import { BENGURION, STATIC_PADS } from './layout';
import { ROADS, VEHICLE, elevation, pointInPolygon, type P2 } from './geo';

const sstep = (e0: number, e1: number, x: number) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const BASE = elevation(126, 84);
/** Distance from a point to a polygon's outline; `edge` (set as a side effect) is the nearest edge's index, edge i running p[i-1] → p[i]. */
export const nearest = { edge: 0 };
export function distToPoly(x: number, z: number, p: P2[]) {
  let d = Infinity;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [ax, az] = p[j], [bx, bz] = p[i], vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / l2)), e = Math.hypot(x - ax - vx * t, z - az - vz * t);
    if (e < d) { d = e; nearest.edge = i; }
  }
  return d;
}

// The DEM's own bare-earth smooth is enough that real hills need not be flattened as hard.
const CELL = 2, SLOPE = .12, SIGMA = 12, TAPER = 8, VERGE = 5;
export const ROAD_GRADE = { ms: 0, nodes: 0, roads: 0 };
let field: Float32Array | null = null, X0 = 0, Z0 = 0, NX = 0, NZ = 0;

/** Zones whose ground is authored (or hidden under the cave cover): the correction fades out near them. */
function protect() {
  const pads = STATIC_PADS.map(p => { const xs = p.poly.map(q => q[0]), zs = p.poly.map(q => q[1]); return { p: p.poly, x0: Math.min(...xs) - 30, x1: Math.max(...xs) + 30, z0: Math.min(...zs) - 30, z1: Math.max(...zs) + 30 }; });
  const [ax, az] = BENGURION.a, [bx, bz] = BENGURION.b, vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz;
  return (x: number, z: number) => {
    let m = 1;
    for (const q of pads) if (x > q.x0 && x < q.x1 && z > q.z0 && z < q.z1) { m = Math.min(m, pointInPolygon(x, z, q.p) ? 0 : sstep(2, 26, distToPoly(x, z, q.p))); if (!m) return 0; }
    if (Math.abs(x - (ax + bx) / 2) < 120 + Math.abs(vx) / 2 && Math.abs(z - (az + bz) / 2) < 120 + Math.abs(vz) / 2) { const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / l2)); m = Math.min(m, sstep(10, 45, Math.hypot(x - ax - vx * t, z - az - vz * t))); }
    if (x > 60 && x < 200 && z > 50 && z < 290) m = Math.min(m, sstep(6, 30, Math.max(100 - x, x - 162, 70 - z, z - 262, 0))); // the catacomb hill
    return m;
  };
}

/** A road's profile: DEM heights along its points, low-passed along the arc, then grade-limited. */
function profile(pts: P2[]) {
  const n = pts.length, s = new Float64Array(n), raw = new Float64Array(n), out = new Float64Array(n);
  for (let i = 0; i < n; i++) { if (i) s[i] = s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); raw[i] = elevation(pts[i][0], pts[i][1]) - BASE; }
  for (let i = 0; i < n; i++) {
    let sw = 0, sh = 0;
    for (let j = i; j >= 0 && s[i] - s[j] < 3 * SIGMA; j--) { const w = Math.exp(-(((s[i] - s[j]) / SIGMA) ** 2) / 2); sw += w; sh += w * raw[j]; }
    for (let j = i + 1; j < n && s[j] - s[i] < 3 * SIGMA; j++) { const w = Math.exp(-(((s[j] - s[i]) / SIGMA) ** 2) / 2); sw += w; sh += w * raw[j]; }
    out[i] = sh / sw;
  }
  for (let i = 1; i < n; i++) { const g = SLOPE * (s[i] - s[i - 1]); out[i] = Math.min(out[i - 1] + g, Math.max(out[i - 1] - g, out[i])); }
  for (let i = n - 2; i >= 0; i--) { const g = SLOPE * (s[i + 1] - s[i]); out[i] = Math.min(out[i + 1] + g, Math.max(out[i + 1] - g, out[i])); }
  return out;
}

function build() {
  const t0 = performance.now();
  const roads = ROADS.filter(r => VEHICLE.has(r.kind) && !r.bridge && r.points.length > 1);
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const r of roads) for (const [x, z] of r.points) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  const pad = 30; X0 = Math.floor((x0 - pad) / CELL) * CELL; Z0 = Math.floor((z0 - pad) / CELL) * CELL; NX = Math.ceil((x1 + pad - X0) / CELL) + 2; NZ = Math.ceil((z1 + pad - Z0) / CELL) + 2;
  // Per node: the heaviest road weight, and the weight-averaged profile height of every road in reach (a junction takes both roads' levels).
  const maxW = new Float32Array(NX * NZ), sumW = new Float32Array(NX * NZ), sumWT = new Float32Array(NX * NZ);
  for (const r of roads) {
    const h = profile(r.points), half = r.width / 2 + VERGE, R = half + TAPER;
    for (let i = 1; i < r.points.length; i++) {
      const [ax, az] = r.points[i - 1], [bx, bz] = r.points[i], vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz || 1;
      const ix0 = Math.max(0, Math.floor((Math.min(ax, bx) - R - X0) / CELL)), ix1 = Math.min(NX - 1, Math.ceil((Math.max(ax, bx) + R - X0) / CELL));
      const iz0 = Math.max(0, Math.floor((Math.min(az, bz) - R - Z0) / CELL)), iz1 = Math.min(NZ - 1, Math.ceil((Math.max(az, bz) + R - Z0) / CELL));
      for (let iz = iz0; iz <= iz1; iz++) for (let ix = ix0; ix <= ix1; ix++) {
        const x = X0 + ix * CELL, z = Z0 + iz * CELL, t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / l2)), ex = x - ax - vx * t, ez = z - az - vz * t, d2 = ex * ex + ez * ez;
        if (d2 >= R * R) continue;
        const d = Math.sqrt(d2);
        const w = d <= half ? 1 : 1 - sstep(half, R, d), k = iz * NX + ix;
        if (w > maxW[k]) maxW[k] = w;
        sumW[k] += w; sumWT[k] += w * (h[i - 1] + (h[i] - h[i - 1]) * t);
      }
    }
  }
  const keep = protect(); let nodes = 0;
  for (let iz = 0; iz < NZ; iz++) for (let ix = 0; ix < NX; ix++) {
    const k = iz * NX + ix; if (!maxW[k]) { sumWT[k] = 0; continue; }
    const x = X0 + ix * CELL, z = Z0 + iz * CELL, m = keep(x, z);
    sumWT[k] = m > 0 ? maxW[k] * m * (sumWT[k] / sumW[k] - (elevation(x, z) - BASE)) : 0; if (m > 0) nodes++;
  }
  field = sumWT; // the other two arrays are scratch
  ROAD_GRADE.ms = Math.round(performance.now() - t0); ROAD_GRADE.nodes = nodes; ROAD_GRADE.roads = roads.length;
}

/** Height correction (m) to add to the DEM at (x, z): bilinear on the 2 m field, built on first use. */
export function roadDelta(x: number, z: number): number {
  if (!field) build();
  const fx = (x - X0) / CELL, fz = (z - Z0) / CELL, ix = Math.floor(fx), iz = Math.floor(fz);
  if (ix < 0 || iz < 0 || ix >= NX - 1 || iz >= NZ - 1) return 0;
  const tx = fx - ix, tz = fz - iz, k = iz * NX + ix, f = field!;
  return (f[k] * (1 - tx) + f[k + 1] * tx) * (1 - tz) + (f[k + NX] * (1 - tx) + f[k + NX + 1] * tx) * tz;
}
