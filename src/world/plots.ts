import * as THREE from 'three';
import { pointInPolygon, type P2, type Road } from './geo';
import { surfaceHeight } from './terrain';
import { Kit, MAT, Frame, PRIMS } from './kit';
import { worldMaterial } from './materials';
import { gardenTrees, treeKind, type StreetStyle } from './streetStyle';

/** Private plots for Kiryat Tivon's houses, as the owner's Street View survey found them: each
 *  house in its own green garden, behind a low dry-laid rubble wall with a tall clipped hedge
 *  (or a hedge alone, or a wooden slat fence) along the street, fences or hedges between
 *  neighbours, a gate and paved path to the door and often a driveway with a carport.
 *  Land is shared out on a 1 m grid (lazily allocated 64 m tiles): each free cell goes to the
 *  nearest footprint within MAX_DIST, never inside road corridors, footpaths, public or authored
 *  ground. Boundaries follow the cell edges where the owner changes, chained and simplified into
 *  long straight runs (one collider each). Pure layout first (tested), then dressing. */
const ROAD = 1, PUB = 2, BLD = 4, KEEP = 8, NEAR = 16, RESV = 32, TESTED = 64, DONE = 128, BLOCK = ROAD | PUB | BLD | KEEP;
const TS = 64, NONE = -1, OTHER = -2, MAX_DIST = 18;
const DX = [1, -1, 0, 0], DZ = [0, 0, 1, -1], DX8 = [1, -1, 0, 0, 1, 1, -1, -1], DZ8 = [0, 0, 1, -1, 1, -1, 1, -1], OFF8 = DX8.map((dx, s) => dx + (DZ8[s] << 6));
export const FLAGS = { ROAD, PUB, BLD, KEEP, NEAR, RESV } as const;

type Tile = { own: Int16Array; dist: Uint16Array; flag: Uint8Array };
const tkey = (tx: number, tz: number) => (tx + 512) * 1024 + tz + 512;
export class PlotGrid {
  readonly tiles = new Map<number, Tile>();
  private lk = NaN; private lt: Tile | undefined;
  ensure(x0: number, x1: number, z0: number, z1: number) {
    for (let tx = Math.floor(x0 / TS); tx <= Math.floor(x1 / TS); tx++) for (let tz = Math.floor(z0 / TS); tz <= Math.floor(z1 / TS); tz++) {
      const k = tkey(tx, tz); if (this.tiles.has(k)) continue;
      this.tiles.set(k, { own: new Int16Array(TS * TS).fill(NONE), dist: new Uint16Array(TS * TS).fill(65535), flag: new Uint8Array(TS * TS) });
    }
    this.lk = NaN;
  }
  tile(ix: number, iz: number) { const k = tkey(Math.floor(ix / TS), Math.floor(iz / TS)); if (k !== this.lk) { this.lk = k; this.lt = this.tiles.get(k); } return this.lt; }
  own(ix: number, iz: number) { const t = this.tile(ix, iz); return t ? t.own[(ix & 63) + ((iz & 63) << 6)] : NONE; }
  flag(ix: number, iz: number) { const t = this.tile(ix, iz); return t ? t.flag[(ix & 63) + ((iz & 63) << 6)] : 0; }
  /** Owner (house index, −1 none, −2 another building's land) of the cell under a point. */
  ownAt(x: number, z: number) { return this.own(Math.floor(x), Math.floor(z)); }
  flagAt(x: number, z: number) { return this.flag(Math.floor(x), Math.floor(z)); }
  /** Visit every allocated cell in an inclusive cell range. */
  each(x0: number, x1: number, z0: number, z1: number, fn: (t: Tile, i: number, ix: number, iz: number) => void) {
    for (let tx = Math.floor(x0 / TS); tx <= Math.floor(x1 / TS); tx++) for (let tz = Math.floor(z0 / TS); tz <= Math.floor(z1 / TS); tz++) {
      const t = this.tiles.get(tkey(tx, tz)); if (!t) continue;
      const ax = Math.max(x0, tx * TS), bx = Math.min(x1, tx * TS + TS - 1), az = Math.max(z0, tz * TS), bz = Math.min(z1, tz * TS + TS - 1);
      for (let iz = az; iz <= bz; iz++) for (let ix = ax; ix <= bx; ix++) fn(t, (ix & 63) + ((iz & 63) << 6), ix, iz);
    }
  }
  forAll(fn: (t: Tile, i: number, ix: number, iz: number) => void) {
    this.tiles.forEach((t, k) => { const tx = Math.floor(k / 1024) - 512, tz = k % 1024 - 512; for (let i = 0; i < TS * TS; i++) fn(t, i, tx * TS + (i & 63), tz * TS + (i >> 6)); });
  }
}

export interface PlotSpec {
  /** House footprints; the result's `house` fields index this list. */
  houses: P2[][];
  /** Other footprints: always solid; `claim` ones (shops, blocks, public buildings) keep their own grounds. */
  others?: Array<{ points: P2[]; claim: boolean }>;
  /** Carriageways (vehicle and service roads): their corridor and pavements stay clear, and plot edges facing them are the street boundary. */
  roads: Road[];
  /** Footpaths and tracks: kept clear and fenced off. */
  paths?: Road[];
  /** Public grounds (parks, schools, car parks): kept clear and fenced off. */
  pub?: P2[][];
  /** Authored ground (plazas, landmarks, people): kept clear and left open (no fence toward it). */
  keep?: P2[][]; keepDiscs?: Array<[number, number, number]>;
  /** Extra authored ground per cell (e.g. a district's occupancy); `near` is true within a few metres of a road. */
  keepTest?: (x: number, z: number, near: boolean) => 'keep' | 'road' | null;
  maxDist?: number; seed?: number; driveShare?: number;
}
export type RunKind = 'street' | 'side' | 'back';
/** A straight boundary run from a to b; (nx, nz) points into the owning plot. Side runs are owned by the lower house index. */
export interface Run { a: P2; b: P2; kind: RunKind; other: number; nx: number; nz: number }
export interface Plot {
  house: number; cells: number; runs: Run[];
  gate: { x: number; z: number; nx: number; nz: number } | null;
  path: [P2, P2] | null;
  drive: { x: number; z: number; nx: number; nz: number; len: number } | null;
  /** Garden tree spots: inside the plot, clear of the house, path, driveway and boundary. */
  spots: P2[];
}
export interface PlotLayout { grid: PlotGrid; plots: Plot[]; ms: number; stages: Record<string, number> }

/** Pavement width each side, as streets.ts draws it. */
export const pavement = (r: Road) => r.kind === 'service' ? 0 : r.kind === 'residential' || r.kind.startsWith('trunk') ? 1.6 : 2.2;
/** Plot cells keep their centres this far from a road's centreline (carriageway, pavement and a verge). */
export const corridor = (r: Road) => r.width / 2 + (r.kind === 'service' ? .9 : pavement(r) + 1.2);

function segDist(x: number, z: number, ax: number, az: number, bx: number, bz: number) {
  const vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz || 1, t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / l2));
  return Math.hypot(x - ax - vx * t, z - az - vz * t);
}
/** Squared distance to a polygon's outline (no Math.hypot: this runs millions of times). */
function polyDist2(x: number, z: number, p: P2[]) {
  let d2 = Infinity;
  for (let a = 0, b = p.length - 1; a < p.length; b = a++) {
    const ax = p[b][0], az = p[b][1], vx = p[a][0] - ax, vz = p[a][1] - az, l2 = vx * vx + vz * vz || 1, s = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / l2)), ex = x - ax - vx * s, ez = z - az - vz * s, e2 = ex * ex + ez * ez;
    if (e2 < d2) d2 = e2;
  }
  return d2;
}
function nearestOnPoly(x: number, z: number, p: P2[]): P2 {
  let best: P2 = p[0], bd = Infinity;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [ax, az] = p[j], [bx, bz] = p[i], vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz || 1, t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / l2));
    const qx = ax + vx * t, qz = az + vz * t, d = Math.hypot(x - qx, z - qz); if (d < bd) { bd = d; best = [qx, qz]; }
  }
  return best;
}
const bounds = (p: P2[]) => { let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (const [x, z] of p) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); } return [x0, x1, z0, z1]; };
const centroid = (p: P2[]): P2 => [p.reduce((s, q) => s + q[0], 0) / p.length, p.reduce((s, q) => s + q[1], 0) / p.length];

/** Unit cell edges → polylines (break at junctions), then Douglas–Peucker into straight runs. */
const vk = (x: number, z: number) => (x + 8192) * 16384 + (z + 8192);
function chains(e: number[]): P2[][] {
  const n = e.length / 4, at = new Map<number, number[]>(), out: P2[][] = [], used = new Uint8Array(n);
  for (let k = 0; k < n; k++) for (const o of [0, 2]) { const v = vk(e[k * 4 + o], e[k * 4 + o + 1]); let a = at.get(v); if (!a) { a = []; at.set(v, a); } a.push(k); }
  const walk = (k0: number, x: number, z: number) => {
    const pts: P2[] = [[x, z]]; let k = k0;
    for (;;) {
      used[k] = 1; const o = k * 4, fwd = e[o] === x && e[o + 1] === z; x = fwd ? e[o + 2] : e[o]; z = fwd ? e[o + 3] : e[o + 1]; pts.push([x, z]);
      const list = at.get(vk(x, z))!; if (list.length !== 2) break;
      const nk = list[0] === k ? list[1] : list[0]; if (used[nk]) break; k = nk;
    }
    return pts;
  };
  at.forEach((list, v) => { if (list.length === 2) return; const x = Math.floor(v / 16384) - 8192, z = v % 16384 - 8192; for (const k of list) if (!used[k]) out.push(walk(k, x, z)); });
  for (let k = 0; k < n; k++) if (!used[k]) out.push(walk(k, e[k * 4], e[k * 4 + 1]));
  return out;
}
/** Edge midpoints lie on the true line of a stair-stepped diagonal (the corners sit up to 0.7 m off it); the chain's own ends stay. */
function smooth(pts: P2[]): P2[] {
  const last = pts.length - 1; if (last < 2) return pts;
  const mids = pts.slice(1).map((q, k): P2 => [(pts[k][0] + q[0]) / 2, (pts[k][1] + q[1]) / 2]);
  return pts[0][0] === pts[last][0] && pts[0][1] === pts[last][1] ? [...mids, mids[0]] : [pts[0], ...mids, pts[last]];
}
function simplify(pts: P2[], eps: number): P2[] {
  const last = pts.length - 1;
  if (last > 2 && pts[0][0] === pts[last][0] && pts[0][1] === pts[last][1]) {
    let m = 1, md = -1; for (let k = 1; k < last; k++) { const d = Math.hypot(pts[k][0] - pts[0][0], pts[k][1] - pts[0][1]); if (d > md) { md = d; m = k; } }
    return [...simplify(pts.slice(0, m + 1), eps), ...simplify(pts.slice(m), eps).slice(1)];
  }
  const keep = new Uint8Array(pts.length); keep[0] = keep[last] = 1;
  const rec = (i: number, j: number) => {
    if (j <= i + 1) return;
    let md = -1, mi = i + 1;
    for (let k = i + 1; k < j; k++) { const d = segDist(pts[k][0], pts[k][1], pts[i][0], pts[i][1], pts[j][0], pts[j][1]); if (d > md) { md = d; mi = k; } }
    if (md > eps) { keep[mi] = 1; rec(i, mi); rec(mi, j); }
  };
  rec(0, last);
  return pts.filter((_, k) => keep[k]);
}

/** Share land out between the houses and draw each plot's boundary, gate, path and driveway. */
export function layoutPlots(spec: PlotSpec): PlotLayout {
  const t0 = performance.now(), R = spec.maxDist ?? MAX_DIST, grid = new PlotGrid();
  let seed = spec.seed ?? 5150;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const H = spec.houses, boxes = H.map(bounds);
  for (const [x0, x1, z0, z1] of boxes) grid.ensure(Math.floor(x0 - R - 2), Math.ceil(x1 + R + 2), Math.floor(z0 - R - 2), Math.ceil(z1 + R + 2));
  const stages: Record<string, number> = {}; let lapT = performance.now(); const lap = (n: string) => { const t = performance.now(); stages[n] = Math.round(t - lapT); lapT = t; };
  // ——— What is not garden land ———
  const capsule = (ax: number, az: number, bx: number, bz: number, r: number, fn: (t: Tile, i: number, d2: number) => void) => {
    const vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz || 1, r2 = r * r;
    grid.each(Math.floor(Math.min(ax, bx) - r), Math.floor(Math.max(ax, bx) + r), Math.floor(Math.min(az, bz) - r), Math.floor(Math.max(az, bz) + r), (t, i, ix, iz) => {
      const x = ix + .5, z = iz + .5, s = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / l2)), ex = x - ax - vx * s, ez = z - az - vz * s, d2 = ex * ex + ez * ez;
      if (d2 < r2) fn(t, i, d2);
    });
  };
  const roadBands = (roads: Road[], hard: (r: Road) => number, near: (r: Road) => number, f: number) => {
    for (const road of roads) { const c = hard(road), n = Math.max(c, near(road)); for (let k = 1; k < road.points.length; k++) { const [ax, az] = road.points[k - 1], [bx, bz] = road.points[k]; capsule(ax, az, bx, bz, n, (t, i, d2) => { t.flag[i] |= d2 < c * c ? f | NEAR : NEAR; }); } }
  };
  lap('alloc');
  roadBands(spec.roads, corridor, r => r.width / 2 + (r.kind === 'service' ? .6 : 2.2) + 3.2, ROAD);
  roadBands(spec.paths ?? [], r => r.width / 2 + 1.3, r => r.width / 2 + 3.8, PUB);
  lap('roads');
  const fill = (poly: P2[], f: number) => { const [x0, x1, z0, z1] = bounds(poly); grid.each(Math.floor(x0), Math.floor(x1), Math.floor(z0), Math.floor(z1), (t, i, ix, iz) => { if (pointInPolygon(ix + .5, iz + .5, poly)) t.flag[i] |= f; }); };
  for (const p of H) fill(p, BLD);
  for (const o of spec.others ?? []) fill(o.points, BLD);
  lap('bld');
  for (const p of spec.pub ?? []) fill(p, PUB);
  for (const p of spec.keep ?? []) fill(p, KEEP);
  for (const [x, z, r] of spec.keepDiscs ?? []) capsule(x, z, x, z, r, (t, i) => { t.flag[i] |= KEEP; });
  lap("mask");
  // ——— Every footprint floods outwards over free cells (8-connected, 1 and √2 steps, in cm) up to R: each cell goes to
  //     the nearest footprint, and a plot is connected to its house by construction (roads and paths cut it off). The
  //     authored-ground test (spec.keepTest) runs lazily, once, on cells actually reached. ———
  const kt = spec.keepTest, KMAX = Math.round(R * 100), BK = 25, queue: number[][] = Array.from({ length: Math.ceil(KMAX / BK) + 2 }, () => []);
  const open = (t: Tile, i: number, x: number, z: number) => {
    let f = t.flag[i]; if (f & BLOCK) return false;
    if (kt && !(f & TESTED)) { f |= TESTED; const k = kt(x, z, !!(f & NEAR)); if (k) f |= k === 'keep' ? KEEP : ROAD; t.flag[i] = f; return !k; }
    return true;
  };
  const pack = (ix: number, iz: number, c: number) => ((ix + 8192) * 16384 + iz + 8192) * 4096 + c + 2;
  const sow = (poly: P2[], c: number) => {
    const [x0, x1, z0, z1] = bounds(poly);
    grid.each(Math.floor(x0 - 2), Math.floor(x1 + 2), Math.floor(z0 - 2), Math.floor(z1 + 2), (t, i, ix, iz) => {
      if (t.flag[i] & BLOCK) return;
      const d2 = polyDist2(ix + .5, iz + .5, poly); if (d2 >= 2.56) return;
      const q = Math.round(Math.sqrt(d2) * 100);
      if (q < t.dist[i] && open(t, i, ix + .5, iz + .5)) { t.dist[i] = q; t.own[i] = c; queue[Math.floor(q / BK)].push(pack(ix, iz, c)); }
    });
  };
  H.forEach((p, i) => sow(p, i));
  for (const o of spec.others ?? []) if (o.claim) sow(o.points, OTHER);
  lap('seed');
  const cells: number[][] = H.map(() => []);
  for (let bk = 0; bk < queue.length; bk++) {
    const qb = queue[bk];
    for (let e = 0; e < qb.length; e++) {
      const v = qb[e], c = v % 4096 - 2, w = Math.floor(v / 4096), ix = Math.floor(w / 16384) - 8192, iz = w % 16384 - 8192, t0 = grid.tile(ix, iz)!, lx = ix & 63, lz = iz & 63, i0 = lx + (lz << 6), d = t0.dist[i0];
      if (t0.own[i0] !== c || Math.floor(d / BK) !== bk || t0.flag[i0] & DONE) continue; // a nearer footprint took it, or this entry is out of date or already spread
      t0.flag[i0] |= DONE;
      if (c >= 0) cells[c].push(ix, iz);
      for (let s = 0; s < 8; s++) {
        const nx = ix + DX8[s], nz = iz + DZ8[s], nd = d + (s < 4 ? 100 : 141); if (nd >= KMAX) continue;
        const inner = lx > 0 && lx < 63 && lz > 0 && lz < 63, t = inner ? t0 : grid.tile(nx, nz); if (!t) continue; const i = inner ? i0 + OFF8[s] : (nx & 63) + ((nz & 63) << 6);
        if (nd < t.dist[i] && open(t, i, nx + .5, nz + .5)) { t.dist[i] = nd; t.own[i] = c; queue[Math.floor(nd / BK)].push(pack(nx, nz, c)); }
      }
    }
    qb.length = 0;
  }
  lap("flood");
  // A plot under ~30 m² is no garden to speak of.
  H.forEach((_, h) => { if (cells[h].length < 60) { for (let q = 0; q < cells[h].length; q += 2) grid.tile(cells[h][q], cells[h][q + 1])!.own[(cells[h][q] & 63) + ((cells[h][q + 1] & 63) << 6)] = NONE; cells[h] = []; } });
  lap("connect");
  // ——— Boundary edges where the owner changes ———
  const edges = new Map<number, number[]>(), push = (k: number, a: number, b: number, c: number, d: number) => { let l = edges.get(k); if (!l) { l = []; edges.set(k, l); } l.push(a, b, c, d); };
  const SIDE = 1e10, STREET = 2e10, BACK = 3e10;
  for (let h = 0; h < H.length; h++) { const list = cells[h]; for (let q = 0; q < list.length; q += 2) {
    const ix = list[q], iz = list[q + 1], t = grid.tile(ix, iz)!, i = (ix & 63) + ((iz & 63) << 6);
    for (let s = 0; s < 4; s++) {
      const nx = ix + DX[s], nz = iz + DZ[s], lx = ix & 63, lz = iz & 63, inner = lx > 0 && lx < 63 && lz > 0 && lz < 63, j = inner ? t.own[i + DX[s] + (DZ[s] << 6)] : grid.own(nx, nz);
      if (j === h) continue;
      const ex = s === 0 ? ix + 1 : ix, ez = s === 2 ? iz + 1 : iz, [fx, fz] = s < 2 ? [ex, iz + 1] : [ix + 1, ez];
      if (j >= 0) { if (h < j) push(SIDE + h * 1e5 + j, ex, ez, fx, fz); continue; }
      const f = inner ? t.flag[i + DX[s] + (DZ[s] << 6)] : grid.flag(nx, nz);
      if (f & (BLD | KEEP)) continue;
      if (j !== OTHER && !(f & (ROAD | PUB))) continue; // where the 18 m reach simply ends the garden fades into open land: no fence
      push((f & ROAD ? STREET : BACK) + h, ex, ez, fx, fz);
    }
  } }
  const plots: Plot[] = H.map((_, h) => ({ house: h, cells: cells[h].length / 2, runs: [], gate: null, path: null, drive: null, spots: [] }));
  edges.forEach((e, k) => {
    const kind: RunKind = k >= BACK ? 'back' : k >= STREET ? 'street' : 'side', rest = k - (kind === 'back' ? BACK : kind === 'street' ? STREET : SIDE);
    const h = kind === 'side' ? Math.floor(rest / 1e5) : rest, other = kind === 'side' ? rest % 1e5 : -1;
    for (const chain of chains(e)) {
      const pts = simplify(smooth(chain), kind === 'street' ? .7 : .95);
      for (let q = 1; q < pts.length; q++) {
        let a = pts[q - 1], b = pts[q]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < .01) continue;
        let nx = -(b[1] - a[1]) / L, nz = (b[0] - a[0]) / L; const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
        let side = 0; for (const o of [.4, .9, 1.4]) { if (grid.ownAt(mx + nx * o, mz + nz * o) === h) { side = 1; break; } if (grid.ownAt(mx - nx * o, mz - nz * o) === h) { side = -1; break; } }
        if (side < 0) { [a, b] = [b, a]; nx = -nx; nz = -nz; }
        plots[h].runs.push({ a, b, kind, other, nx, nz });
      }
    }
  });
  lap("edges");
  // ——— Gate and path, then a driveway where there is room ———
  const mark = (x0: number, x1: number, z0: number, z1: number, inside: (x: number, z: number) => boolean) => grid.each(Math.floor(x0), Math.floor(x1), Math.floor(z0), Math.floor(z1), (t, i, ix, iz) => { if (inside(ix + .5, iz + .5)) t.flag[i] |= RESV; });
  const cut = (p: Plot, r: Run, s: number, w: number) => {
    const L = Math.hypot(r.b[0] - r.a[0], r.b[1] - r.a[1]), ux = (r.b[0] - r.a[0]) / L, uz = (r.b[1] - r.a[1]) / L;
    p.runs.splice(p.runs.indexOf(r), 1);
    if (s - w / 2 > .15) p.runs.push({ ...r, b: [r.a[0] + ux * (s - w / 2), r.a[1] + uz * (s - w / 2)] });
    if (L - s - w / 2 > .15) p.runs.push({ ...r, a: [r.a[0] + ux * (s + w / 2), r.a[1] + uz * (s + w / 2)] });
  };
  for (const p of plots) {
    if (!p.cells) continue;
    const poly = H[p.house], [cx, cz] = centroid(poly);
    let best: { r: Run; s: number; d: number } | null = null;
    for (const r of p.runs) {
      if (r.kind !== 'street') continue;
      const L = Math.hypot(r.b[0] - r.a[0], r.b[1] - r.a[1]); if (L < 2.2) continue;
      const ux = (r.b[0] - r.a[0]) / L, uz = (r.b[1] - r.a[1]) / L, s = Math.max(1, Math.min(L - 1, (cx - r.a[0]) * ux + (cz - r.a[1]) * uz));
      const d = Math.hypot(r.a[0] + ux * s - cx, r.a[1] + uz * s - cz); if (!best || d < best.d) best = { r, s, d };
    }
    if (best) {
      const { r, s } = best, L = Math.hypot(r.b[0] - r.a[0], r.b[1] - r.a[1]), gx = r.a[0] + (r.b[0] - r.a[0]) * s / L, gz = r.a[1] + (r.b[1] - r.a[1]) * s / L;
      p.gate = { x: gx, z: gz, nx: r.nx, nz: r.nz }; cut(p, r, s, 1.2);
      const door = nearestOnPoly(gx, gz, poly); p.path = [[gx, gz], door];
      const [x0, x1, z0, z1] = bounds([[gx, gz], door]); mark(x0 - 1.5, x1 + 1.5, z0 - 1.5, z1 + 1.5, (x, z) => segDist(x, z, gx, gz, door[0], door[1]) < 1.3);
    }
    if (rnd() < (spec.driveShare ?? .5)) {
      const cands: Array<{ r: Run; s: number }> = [];
      for (const r of p.runs) { if (r.kind !== 'street') continue; const L = Math.hypot(r.b[0] - r.a[0], r.b[1] - r.a[1]); for (let s = 1.8; s <= L - 1.8; s += .5) cands.push({ r, s }); }
      for (let k = cands.length - 1; k > 0; k--) { const j = Math.floor(rnd() * (k + 1)); [cands[k], cands[j]] = [cands[j], cands[k]]; }
      for (const { r, s } of cands) {
        const L = Math.hypot(r.b[0] - r.a[0], r.b[1] - r.a[1]), ux = (r.b[0] - r.a[0]) / L, uz = (r.b[1] - r.a[1]) / L, x = r.a[0] + ux * s, z = r.a[1] + uz * s;
        if (p.gate && Math.hypot(x - p.gate.x, z - p.gate.z) < 3.5) continue;
        const fits = (len: number) => { for (let u = -1.6; u <= 1.6; u += .4) for (let v = .3; v <= len; v += .5) { const px = x + ux * u + r.nx * v, pz = z + uz * u + r.nz * v; if (grid.ownAt(px, pz) !== p.house || grid.flagAt(px, pz) & (RESV | BLOCK)) return false; } return true; };
        const len = fits(7.2) ? 7.2 : fits(5.6) ? 5.6 : 0; if (!len) continue;
        p.drive = { x, z, nx: r.nx, nz: r.nz, len }; cut(p, r, s, 3.2);
        mark(Math.min(x, x + r.nx * len) - 3, Math.max(x, x + r.nx * len) + 3, Math.min(z, z + r.nz * len) - 3, Math.max(z, z + r.nz * len) + 3, (qx, qz) => { const v = (qx - x) * r.nx + (qz - z) * r.nz, u = (qx - x) * ux + (qz - z) * uz; return v > -.5 && v < len + 1 && Math.abs(u) < 2.4; });
        break;
      }
    }
  }
  lap("gate");
  // ——— Tree spots: well inside the plot, away from the house, path and driveway ———
  for (const p of plots) {
    const list = cells[p.house], spots: P2[] = [];
    for (let q = 0; q < list.length; q += 2) {
      const ix = list[q], iz = list[q + 1]; if ((ix ^ iz) & 1 || ix & 1) continue; const t = grid.tile(ix, iz)!, i = (ix & 63) + ((iz & 63) << 6);
      if (t.dist[i] < 300 || t.flag[i] & RESV) continue;
      if (grid.own(ix + 2, iz) !== p.house || grid.own(ix - 2, iz) !== p.house || grid.own(ix, iz + 2) !== p.house || grid.own(ix, iz - 2) !== p.house || grid.own(ix + 1, iz + 1) !== p.house || grid.own(ix - 1, iz - 1) !== p.house || grid.own(ix + 1, iz - 1) !== p.house || grid.own(ix - 1, iz + 1) !== p.house) continue;
      spots.push([ix + .5, iz + .5]);
    }
    for (let k = spots.length - 1; k > 0; k--) { const j = Math.floor(rnd() * (k + 1)); [spots[k], spots[j]] = [spots[j], spots[k]]; }
    for (const s of spots) if (p.spots.length < 24 && p.spots.every(o => Math.hypot(o[0] - s[0], o[1] - s[1]) > 3.5)) p.spots.push(s);
  }
  lap("spots");
  return { grid, plots, ms: performance.now() - t0, stages };
}

// ——— Dressing: walls, hedges, fences, gates, paths, driveways, lawns ———
const LAWN = (() => { const m = worldMaterial('grass', { vertexColors: true, roughness: 1, scale: 4, strength: .65 }); m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = -2; return m; })();
const HEDGE = ['#3f5a35', '#465f37', '#4e6a3b', '#3b5532', '#55703f'];
const RUBBLE = ['#e3d3b0', '#d9c7a1', '#e8dbbd', '#d2c09a'];
export interface PlotStats { houses: number; plots: number; gates: number; drives: number; carports: number; runs: number; colliders: number; lawnTris: number; trees: number; layoutMs: number; dressMs: number }
export const PLOT_STATS: PlotStats = { houses: 0, plots: 0, gates: 0, drives: 0, carports: 0, runs: 0, colliders: 0, lawnTris: 0, trees: 0, layoutMs: 0, dressMs: 0 };

/** A ground-following box strip along a→b, offset `inset` into the plot, `thick` deep, spanning
 *  y0…y1 above the ground. Split into pieces on slopes so walls and hedges step down the hill. */
function strip(kit: Kit, a: P2, b: P2, nx: number, nz: number, inset: number, thick: number, y0: number, y1: number, mat: THREE.Material, color: string) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < .05) return;
  const ox = nx * inset, oz = nz * inset, rot = Math.atan2(-(b[1] - a[1]) / L, (b[0] - a[0]) / L);
  const ga = surfaceHeight(a[0] + ox, a[1] + oz), gb = surfaceHeight(b[0] + ox, b[1] + oz);
  const n = Math.max(1, Math.min(Math.ceil(L / 1.2), Math.max(Math.ceil(L / 9), Math.ceil(Math.abs(gb - ga) / .45))));
  let g0 = ga;
  for (let k = 0; k < n; k++) {
    const t1 = (k + 1) / n, x1 = a[0] + (b[0] - a[0]) * t1 + ox, z1 = a[1] + (b[1] - a[1]) * t1 + oz, g1 = k === n - 1 ? gb : surfaceHeight(x1, z1);
    const lo = Math.min(g0, g1) + y0, hi = Math.max(g0, g1) + y1, tm = (k + .5) / n;
    kit.B.place(PRIMS.box, mat, a[0] + (b[0] - a[0]) * tm + ox, (lo + hi) / 2, a[1] + (b[1] - a[1]) * tm + oz, L / n + .04, hi - lo, thick, rot, color);
    g0 = g1;
  }
}
/** Posts along a run, each on its own ground. */
function posts(kit: Kit, a: P2, b: P2, nx: number, nz: number, inset: number, every: number, size: number, h: number, mat: THREE.Material, color: string) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / every));
  for (let k = 0; k <= n; k++) { const x = a[0] + (b[0] - a[0]) * k / n + nx * inset, z = a[1] + (b[1] - a[1]) * k / n + nz * inset, g = surfaceHeight(x, z); kit.B.place(PRIMS.box, mat, x, g + h / 2 - .1, z, size, h + .2, size, Math.atan2(nx, nz), color); }
}
/** One collider per run, spanning `d0`…`d1` into the plot and up to `h` above the highest ground. */
function runCollider(kit: Kit, r: Run, d0: number, d1: number, h: number) {
  const L = Math.hypot(r.b[0] - r.a[0], r.b[1] - r.a[1]); if (L < .05) return 0;
  const gs = [r.a, r.b, [(r.a[0] + r.b[0]) / 2, (r.a[1] + r.b[1]) / 2] as P2].map(([x, z]) => surfaceHeight(x + r.nx * (d0 + d1) / 2, z + r.nz * (d0 + d1) / 2));
  const lo = Math.min(...gs) - .3, hi = Math.max(...gs) + h;
  const f = new Frame((r.a[0] + r.b[0]) / 2, (r.a[1] + r.b[1]) / 2, Math.atan2(-(r.b[1] - r.a[1]) / L, (r.b[0] - r.a[0]) / L), lo);
  kit.lcollide(f, 0, (hi - lo) / 2, (d0 + d1) / 2, L, hi - lo, d1 - d0);
  kit.occ.markRect(f, 0, (d0 + d1) / 2, L, Math.max(.6, d1 - d0));
  return 1;
}
type Boundary = 'wall' | 'wall+hedge' | 'hedge' | 'slats' | 'rails';
function boundary(kit: Kit, r: Run, kind: Boundary, h: number, color: string, centred: boolean) {
  const wallH = Math.min(.9, h), stoneish = kind === 'wall' || kind === 'wall+hedge';
  const half = (w: number) => centred ? 0 : w / 2;
  if (stoneish) strip(kit, r.a, r.b, r.nx, r.nz, half(.45), .45, -.3, wallH, MAT.stone, RUBBLE[Math.floor(Math.abs(Math.sin(r.a[0] * 12.9 + r.a[1])) * 4)]);
  if (kind === 'wall+hedge') strip(kit, r.a, r.b, r.nx, r.nz, .45 + .42, .8, -.1, h, MAT.foliage, color);
  if (kind === 'hedge') strip(kit, r.a, r.b, r.nx, r.nz, half(.8), .8, -.1, h, MAT.foliage, color);
  if (kind === 'slats') { posts(kit, r.a, r.b, r.nx, r.nz, half(.12), 3.2, .1, h + .05, MAT.wood, '#6e5238'); strip(kit, r.a, r.b, r.nx, r.nz, half(.12), .04, .06, h, MAT.wood, color); }
  if (kind === 'rails') { posts(kit, r.a, r.b, r.nx, r.nz, half(.1), 3.5, .07, h, MAT.metal, '#2f3d34'); for (const y of [h * .35, h - .05]) strip(kit, r.a, r.b, r.nx, r.nz, half(.1), .035, y - .03, y + .03, MAT.metal, '#3a4a3e'); }
  const depth = kind === 'wall+hedge' ? 1.27 : kind === 'hedge' ? .8 : kind === 'wall' ? .45 : .14;
  return centred ? runCollider(kit, r, -depth / 2, depth / 2, h) : runCollider(kit, r, 0, depth, kind === 'wall' ? wallH : h);
}
/** A paved strip (path or driveway) from p along (nx, nz), tilted piecewise to the slope. */
function paving(kit: Kit, x: number, z: number, nx: number, nz: number, len: number, w: number, color: string) {
  const n = Math.max(1, Math.ceil(len / 2.5)), rot = Math.atan2(nx, nz);
  for (let k = 0; k < n; k++) {
    const x0 = x + nx * len * k / n, z0 = z + nz * len * k / n, x1 = x + nx * len * (k + 1) / n, z1 = z + nz * len * (k + 1) / n, g0 = surfaceHeight(x0, z0), g1 = surfaceHeight(x1, z1), l = len / n;
    kit.B.place(PRIMS.box, MAT.paving, (x0 + x1) / 2, (g0 + g1) / 2 + .04, (z0 + z1) / 2, w, .1, l + .05, rot, color, false, -Math.atan2(g1 - g0, l));
  }
}
/** A slim steel pergola carport over the inner end of a driveway. */
function carport(kit: Kit, x: number, z: number, nx: number, nz: number) {
  const f = new Frame(x, z, Math.atan2(nx, nz)), hs = [-2.6, 2.6].flatMap(v => [-1.45, 1.45].map(u => { const [px, pz] = f.at(u, v); return surfaceHeight(px, pz); })), top = Math.max(...hs) + 2.45;
  let k = 0; for (const v of [-2.6, 2.6]) for (const u of [-1.45, 1.45]) { const [px, pz] = f.at(u, v), g = hs[k++]; kit.B.place(PRIMS.box, MAT.metal, px, (g + top) / 2, pz, .09, top - g, .09, f.rot, '#3d4448'); kit.lcollide(new Frame(px, pz, f.rot, g), 0, (top - g) / 2, 0, .12, top - g, .12); }
  for (const u of [-1.45, 1.45]) kit.B.lbox(f, MAT.metal, u, top - f.y + .06, 0, .08, .14, 5.5, '#3d4448');
  for (let v = -2.5; v <= 2.51; v += .62) kit.B.lbox(f, MAT.metal, 0, top - f.y + .16, v, 3.1, .06, .07, '#4a5256');
  kit.B.lbox(f, MAT.plain, 0, top - f.y + .21, 0, 3.2, .03, 5.6, '#cfd3d0');
}

/** Build the plots' boundaries, gates, paths, driveways and lawns; returns garden tree candidates
 *  (each tree's spots in order of preference) for buildTrees. */
export function dressPlots(kit: Kit, L: PlotLayout, styleOf: (house: number) => StreetStyle, parkCar: (x: number, z: number, rot: number) => void) {
  const t0 = performance.now(); let seed = 6061; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
  const trees: Array<{ at: P2[]; kind: number }> = [], S = PLOT_STATS;
  // Side fences between neighbours: one style per pair (hedge, wooden slats or steel rails).
  const pairStyle = (i: number, j: number) => { const v = Math.abs(Math.sin(i * 12.9898 + j * 78.233) * 43758.5453) % 1; return { kind: (v < .45 ? 'hedge' : v < .8 ? 'slats' : 'rails') as Boundary, h: 1.4 + (v * 7 % 1) * .4, color: v < .45 ? HEDGE[Math.floor(v * 97) % HEDGE.length] : '#a07a52' }; };
  for (const p of L.plots) {
    if (!p.cells) continue;
    S.plots++;
    const st = styleOf(p.house), k = st.frontBoundary.toLowerCase(), fence = k.includes('fence');
    let stone = k.includes('stone') || k === 'none' || (!fence && !k.includes('hedge')), hedge = !fence && (k.includes('hedge') || st.hedges);
    if (!fence && hedge && rnd() < .18) stone = !stone; // the survey's mix along one street
    const front: Boundary = fence ? 'slats' : stone ? (hedge ? 'wall+hedge' : 'wall') : 'hedge';
    const fh = front === 'wall' ? .6 + rnd() * .3 : front === 'slats' ? 1.4 + rnd() * .3 : 1.6 + rnd() * .5, hc = pick(HEDGE);
    for (const r of p.runs) {
      S.runs++;
      if (r.kind === 'street') S.colliders += boundary(kit, r, front, fh, front === 'slats' ? pick(['#9b7550', '#a8835b', '#7d5d40']) : hc, false);
      else { const ps = pairStyle(p.house, r.other); S.colliders += boundary(kit, r, ps.kind, ps.h, ps.color, r.kind === 'side'); }
    }
    if (p.gate) {
      S.gates++;
      const g = p.gate, ux = g.nz, uz = -g.nx, ph = front === 'wall' ? fh + .25 : front === 'slats' ? fh + .1 : 1.35;
      for (const s of [-1, 1]) { const x = g.x + ux * s * .78 + g.nx * .22, z = g.z + uz * s * .78 + g.nz * .22, y = surfaceHeight(x, z); kit.B.place(PRIMS.box, front === 'slats' ? MAT.wood : MAT.stone, x, y + ph / 2 - .1, z, .42, ph + .2, .42, Math.atan2(g.nx, g.nz), front === 'slats' ? '#6e5238' : '#d8c8a4'); }
      if (p.path) { const [[ax, az], [bx, bz]] = p.path, len = Math.hypot(bx - ax, bz - az); if (len > .3) paving(kit, ax, az, (bx - ax) / len, (bz - az) / len, len, 1.1, pick(['#d6ccb6', '#cfc3aa', '#ddd3bd'])); kit.occ.markRect(new Frame((ax + bx) / 2, (az + bz) / 2, Math.atan2(bx - ax, bz - az)), 0, 0, 1.2, len); }
    }
    if (p.drive) {
      S.drives++;
      const d = p.drive; paving(kit, d.x, d.z, d.nx, d.nz, d.len, 3, pick(['#bdb7aa', '#b3ada0', '#c6c0b2']));
      const cx = d.x + d.nx * (d.len - 2.9), cz = d.z + d.nz * (d.len - 2.9), rot = Math.atan2(d.nx, d.nz);
      if (d.len > 7 && rnd() < .6) { carport(kit, cx, cz, d.nx, d.nz); S.carports++; if (rnd() < .55) parkCar(cx, cz, rot + (rnd() < .5 ? 0 : Math.PI)); }
      else parkCar(cx, cz, rot + (rnd() < .5 ? 0 : Math.PI));
      kit.occ.markRect(new Frame(d.x + d.nx * d.len / 2, d.z + d.nz * d.len / 2, rot), 0, 0, 3.4, d.len + 1);
    }
    // Garden trees by the street's density and species, more in bigger gardens.
    const n = gardenTrees(st.treeDensity) * Math.max(.7, Math.min(2.4, p.cells / 320)), count = Math.floor(n) + (rnd() < n % 1 ? 1 : 0);
    for (let t = 0; t < count && t < p.spots.length; t++) trees.push({ at: [p.spots[t], ...p.spots.slice(count + t * 2, count + t * 2 + 2)], kind: treeKind(st.species, rnd()) });
  }
  S.trees = trees.length; S.lawnTris = lawn(kit, L.grid); S.dressMs = performance.now() - t0;
  return trees;
}

/** Lawn over the plots: each 64 m tile is cut into greedy rectangles of 2 m blocks, each draped on the
 *  ground in quads of at most 4 m and merged into one vertex-coloured mesh per 128 m. A block is lawn
 *  when at least two of its four cells are garden and the rest are free (never road, building,
 *  authored or another's ground), so the lawn spills at most 1 m onto open verge and the edge stays tidy. */
function lawn(kit: Kit, grid: PlotGrid) {
  const buckets = new Map<string, { pos: number[]; col: number[]; nor: number[] }>(), a = new THREE.Color('#6d8c43'), b = new THREE.Color('#8aa456'), c = new THREE.Color(), v1 = new THREE.Vector3(), v2 = new THREE.Vector3();
  let tris = 0;
  // Ground heights at the 2 m lattice, shared by neighbouring quads (surfaceHeight is the costly part).
  const hgt = new Float32Array((TS / 2 + 1) ** 2); let hx = 0, hz = 0;
  const hAt = (x: number, z: number) => { const k = (x - hx) + (z - hz) * (TS / 2 + 1) ; let h = hgt[k]; if (Number.isNaN(h)) { h = surfaceHeight(x * 2, z * 2) + .03; hgt[k] = h; } return h; };
  const cx = [0, 0, 0, 0], cy = [0, 0, 0, 0], cz = [0, 0, 0, 0], TRI = [0, 1, 2, 0, 2, 3];
  const quad = (x0: number, z0: number, x1: number, z1: number) => {
    const k = `${Math.floor(x0 / 64)},${Math.floor(z0 / 64)}`; let o = buckets.get(k); if (!o) { o = { pos: [], col: [], nor: [] }; buckets.set(k, o); }
    cx[0] = cx[1] = x0 * 2; cx[2] = cx[3] = x1 * 2; cz[0] = cz[3] = z0 * 2; cz[1] = cz[2] = z1 * 2;
    cy[0] = hAt(x0, z0); cy[1] = hAt(x0, z1); cy[2] = hAt(x1, z1); cy[3] = hAt(x1, z0);
    v1.set(cx[1] - cx[0], cy[1] - cy[0], cz[1] - cz[0]); v2.set(cx[2] - cx[0], cy[2] - cy[0], cz[2] - cz[0]); v1.cross(v2).normalize(); if (v1.y < 0) v1.negate();
    for (const i of TRI) { const n = Math.sin(cx[i] * .19 + Math.cos(cz[i] * .13) * 2) * Math.cos(cz[i] * .17 - cx[i] * .05) * .5 + .5; c.copy(a).lerp(b, n); o.pos.push(cx[i], cy[i], cz[i]); o.col.push(c.r, c.g, c.b); o.nor.push(v1.x, v1.y, v1.z); }
    tris += 2;
  };

  const H2 = TS / 2, used = new Uint8Array(H2 * H2), lawned = new Uint8Array(H2 * H2);
  grid.tiles.forEach((t, key) => {
    const tx = (Math.floor(key / 1024) - 512) * TS, tz = (key % 1024 - 512) * TS; used.fill(0); hgt.fill(NaN); hx = tx / 2; hz = tz / 2;
    for (let bz = 0; bz < H2; bz++) for (let bx = 0; bx < H2; bx++) {
      let garden = 0, ok = true;
      for (let dz = 0; dz < 2 && ok; dz++) for (let dx = 0; dx < 2; dx++) { const i = bx * 2 + dx + ((bz * 2 + dz) << 6); if (t.own[i] >= 0) garden++; else if (t.own[i] === OTHER || t.flag[i] & BLOCK) { ok = false; break; } }
      lawned[bx + bz * H2] = ok && garden >= 2 ? 1 : 0;
    }
    const free = (x: number, z: number) => lawned[x + z * H2] && !used[x + z * H2];
    for (let z = 0; z < H2; z++) for (let x = 0; x < H2; x++) {
      if (!free(x, z)) continue;
      let w = 1; while (x + w < H2 && free(x + w, z)) w++;
      let h = 1; grow: while (z + h < H2) { for (let k = 0; k < w; k++) if (!free(x + k, z + h)) break grow; h++; }
      for (let j = 0; j < h; j++) for (let k = 0; k < w; k++) used[x + k + (z + j) * H2] = 1;
      for (let j = 0; j < h; j += 2) for (let k = 0; k < w; k += 2) quad(hx + x + k, hz + z + j, hx + x + Math.min(w, k + 2), hz + z + Math.min(h, j + 2));
    }
  });
  buckets.forEach(o => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(o.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(o.nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(o.col, 3));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, LAWN); m.receiveShadow = true; m.name = 'lawn'; kit.root.add(m);
  });
  return tris;
}
