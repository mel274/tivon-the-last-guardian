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

type Tile = { own: Int16Array; dist: Uint16Array; flag: Uint8Array; blk: Uint8Array; wave: Uint16Array; tx: number; tz: number; slot: number; nb: Array<Tile | undefined> };
const tkey = (tx: number, tz: number) => (tx + 512) * 1024 + tz + 512;
export class PlotGrid {
  readonly tiles = new Map<number, Tile>(); readonly all: Tile[] = [];
  private lk = NaN; private lt: Tile | undefined;
  ensure(x0: number, x1: number, z0: number, z1: number) {
    for (let tx = Math.floor(x0 / TS); tx <= Math.floor(x1 / TS); tx++) for (let tz = Math.floor(z0 / TS); tz <= Math.floor(z1 / TS); tz++) {
      const k = tkey(tx, tz); if (this.tiles.has(k)) continue;
      const t: Tile = { own: new Int16Array(TS * TS).fill(NONE), dist: new Uint16Array(TS * TS).fill(65535), flag: new Uint8Array(TS * TS), blk: new Uint8Array(TS * TS / 4), wave: new Uint16Array(TS * TS), tx, tz, slot: this.all.length, nb: [] };
      this.tiles.set(k, t); this.all.push(t);
    }
    this.lk = NaN;
  }
  /** Wire every tile to its eight neighbours (index (dz + 1) * 3 + dx + 1), once all are allocated. */
  link() { for (const t of this.all) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) t.nb[(dz + 1) * 3 + dx + 1] = this.tiles.get(tkey(t.tx + dx, t.tz + dz)); }
  tile(ix: number, iz: number) { const k = tkey(ix >> 6, iz >> 6); if (k !== this.lk) { this.lk = k; this.lt = this.tiles.get(k); } return this.lt; }
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
  /** OR `m` into the flags of cells ix0…ix1 of row iz (a tile's row at a time). */
  fillRow(iz: number, ix0: number, ix1: number, m: number) {
    const tz = iz >> 6, o = (iz & 63) << 6;
    for (let ix = ix0; ix <= ix1;) { const lx = ix & 63, n = Math.min(ix1 - ix, 63 - lx), t = this.tiles.get(tkey(ix >> 6, tz)); if (t) for (let k = 0, j = o + lx; k <= n; k++) t.flag[j + k] |= m; ix += n + 1; }
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
  /** Fast path for keepTest: true when the 2 m block under the point is free of authored ground (keepTest is then skipped). */
  blockFree?: (x: number, z: number) => boolean;
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
  const n = e.length / 4, out: P2[][] = [], used = new Uint8Array(n);
  // Vertex → incident edges: the first two in plain maps (no array per vertex), a junction's full list in `multi`.
  const f1 = new Map<number, number>(), f2 = new Map<number, number>(), multi = new Map<number, number[]>();
  const add = (v: number, k: number) => { if (!f1.has(v)) f1.set(v, k); else if (!f2.has(v)) f2.set(v, k); else { const m = multi.get(v); if (m) m.push(k); else multi.set(v, [f1.get(v)!, f2.get(v)!, k]); } };
  for (let k = 0; k < n; k++) { add(vk(e[k * 4], e[k * 4 + 1]), k); add(vk(e[k * 4 + 2], e[k * 4 + 3]), k); }
  const walk = (k0: number, x: number, z: number) => {
    const pts: P2[] = [[x, z]]; let k = k0;
    for (;;) {
      used[k] = 1; const o = k * 4, fwd = e[o] === x && e[o + 1] === z; x = fwd ? e[o + 2] : e[o]; z = fwd ? e[o + 3] : e[o + 1]; pts.push([x, z]);
      const v = vk(x, z), s2 = f2.get(v); if (s2 === undefined || multi.has(v)) break;
      const s1 = f1.get(v)!, nk = s1 === k ? s2 : s1; if (used[nk]) break; k = nk;
    }
    return pts;
  };
  f1.forEach((k1, v) => {
    const s2 = f2.get(v); if (s2 !== undefined && !multi.has(v)) return; // an interior vertex of a chain
    const x = Math.floor(v / 16384) - 8192, z = v % 16384 - 8192;
    for (const k of multi.get(v) ?? (s2 === undefined ? [k1] : [k1, s2])) if (!used[k]) out.push(walk(k, x, z));
  });
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
  grid.link();
  const stages: Record<string, number> = {}; let lapT = performance.now(); const lap = (n: string) => { const t = performance.now(); stages[n] = Math.round(t - lapT); lapT = t; };
  // ——— What is not garden land: every mask is rasterised by rows (one interval per row) instead of testing cells one by one ———
  /** Rows of cells whose centres lie within r of the segment a→b: a capsule is convex, so each row is one interval. */
  const capsule = (ax: number, az: number, bx: number, bz: number, r: number, row: (iz: number, ix0: number, ix1: number) => void) => {
    const vx = bx - ax, vz = bz - az, l = Math.hypot(vx, vz), ux = l > 1e-9 ? vx / l : 0, uz = l > 1e-9 ? vz / l : 0, r2 = r * r;
    for (let iz = Math.ceil(Math.min(az, bz) - r - .5), e = Math.floor(Math.max(az, bz) + r - .5); iz <= e; iz++) {
      const zc = iz + .5; let lo = Infinity, hi = -Infinity, dz = zc - az, hw: number;
      if (dz * dz < r2) { hw = Math.sqrt(r2 - dz * dz); lo = ax - hw; hi = ax + hw; }
      dz = zc - bz; if (dz * dz < r2) { hw = Math.sqrt(r2 - dz * dz); lo = Math.min(lo, bx - hw); hi = Math.max(hi, bx + hw); }
      if (l > 1e-9) { // the slab between the end caps: |perpendicular| < r and 0 ≤ along ≤ l, both linear in x
        const dzc = zc - az, k = dzc * ux, kk = dzc * uz; let s0 = -Infinity, s1 = Infinity, empty = false;
        if (Math.abs(uz) > 1e-9) { let p0 = (k - r) / uz, p1 = (k + r) / uz; if (p0 > p1) [p0, p1] = [p1, p0]; s0 = Math.max(s0, p0); s1 = Math.min(s1, p1); } else if (Math.abs(k) >= r) empty = true;
        if (Math.abs(ux) > 1e-9) { let q0 = -kk / ux, q1 = (l - kk) / ux; if (q0 > q1) [q0, q1] = [q1, q0]; s0 = Math.max(s0, q0); s1 = Math.min(s1, q1); } else if (kk < 0 || kk > l) empty = true;
        if (!empty && s0 < s1) { lo = Math.min(lo, ax + s0); hi = Math.max(hi, ax + s1); }
      }
      if (hi > lo) row(iz, Math.ceil(lo - .5), Math.floor(hi - .5));
    }
  };
  const roadBands = (roads: Road[], hard: (r: Road) => number, near: (r: Road) => number, f: number) => {
    for (const road of roads) { const c = hard(road), n = Math.max(c, near(road)); for (let k = 1; k < road.points.length; k++) { const [ax, az] = road.points[k - 1], [bx, bz] = road.points[k]; capsule(ax, az, bx, bz, n, (iz, a, b) => grid.fillRow(iz, a, b, NEAR)); capsule(ax, az, bx, bz, c, (iz, a, b) => grid.fillRow(iz, a, b, f | NEAR)); } }
  };
  lap('alloc');
  roadBands(spec.roads, corridor, r => r.width / 2 + (r.kind === 'service' ? .6 : 2.2) + 3.2, ROAD);
  roadBands(spec.paths ?? [], r => r.width / 2 + 1.3, r => r.width / 2 + 3.8, PUB);
  lap('roads');
  const xs: number[] = [];
  const fill = (poly: P2[], f: number) => {
    const [, , z0, z1] = bounds(poly);
    for (let iz = Math.ceil(z0 - .5), e = Math.floor(z1 - .5); iz <= e; iz++) {
      const zc = iz + .5; xs.length = 0;
      for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) { const az = poly[a][1], bz = poly[b][1]; if ((az <= zc) !== (bz <= zc)) xs.push(poly[a][0] + (zc - az) * (poly[b][0] - poly[a][0]) / (bz - az)); }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) grid.fillRow(iz, Math.ceil(xs[k] - .5), Math.ceil(xs[k + 1] - .5) - 1, f);
    }
  };
  for (const p of H) fill(p, BLD);
  for (const o of spec.others ?? []) fill(o.points, BLD);
  lap('bld');
  for (const p of spec.pub ?? []) fill(p, PUB);
  for (const p of spec.keep ?? []) fill(p, KEEP);
  for (const [x, z, r] of spec.keepDiscs ?? []) capsule(x, z, x, z, r, (iz, a, b) => grid.fillRow(iz, a, b, KEEP));
  lap("mask");
  // ——— Every footprint floods outwards over free cells (8-connected, 1 and √2 steps, in cm) up to R: each cell goes to
  //     the nearest footprint, and a plot is connected to its house by construction (roads and paths cut it off). The
  //     authored-ground test (spec.keepTest) runs lazily, once, on cells actually reached. Queue entries are bare
  //     cell ids (tile slot × 4096 + index); the owner is read back from the cell. ———
  const kt = spec.keepTest, KMAX = Math.round(R * 100), BK = 25, queue: number[][] = Array.from({ length: Math.ceil(KMAX / BK) + 2 }, () => []);
  const bf = spec.blockFree;
  const open = (t: Tile, i: number) => {
    const f = t.flag[i]; if (!kt || f & TESTED) return true;
    if (bf) { const lx = i & 63, lz = i >> 6, b = (lx >> 1) + ((lz >> 1) << 5); let m = t.blk[b]; if (!m) t.blk[b] = m = bf(t.tx * TS + (lx & 62) + 1, t.tz * TS + (lz & 62) + 1) ? 1 : 2; if (m === 1) { t.flag[i] = f | TESTED; return true; } }
    const k = kt(t.tx * TS + (i & 63) + .5, t.tz * TS + (i >> 6) + .5, !!(f & NEAR)); t.flag[i] = f | TESTED | (k ? k === 'keep' ? KEEP : ROAD : 0); return !k;
  };
  const sow = (poly: P2[], c: number) => {
    for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) {
      const ax = poly[b][0], az = poly[b][1], bx = poly[a][0], bz = poly[a][1], vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz || 1;
      capsule(ax, az, bx, bz, 1.6, (iz, x0, x1) => {
        for (let ix = x0; ix <= x1; ix++) {
          const t = grid.tile(ix, iz); if (!t) continue; const i = (ix & 63) + ((iz & 63) << 6);
          if (t.flag[i] & BLOCK) continue;
          const x = ix + .5, z = iz + .5, s = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / l2)), ex = x - ax - vx * s, ez = z - az - vz * s, q = Math.round(Math.sqrt(ex * ex + ez * ez) * 100);
          if (q < t.dist[i] && (c >= 0 || t.dist[i] < 65535) && open(t, i)) { t.dist[i] = q; t.own[i] = c; queue[(q / BK) | 0].push(t.slot << 12 | i); }
        }
      });
    }
  };
  // One flood per footprint, in spatial order, so each one works inside a few tiles that are still in cache. A footprint's
  // wave only goes where it is strictly nearer than whatever got there first, which gives the same shared-out land as one
  // global nearest-first flood (a cell its wave skips is held by a nearer wave that has already spread on from it).
  const all = grid.all, srcs: Array<{ poly: P2[]; c: number; k: number }> = H.map((poly, c) => ({ poly, c, k: 0 }));
  for (const o of spec.others ?? []) if (o.claim) srcs.push({ poly: o.points, c: OTHER, k: 0 });
  for (const s of srcs) { const [x0, x1, z0, z1] = bounds(s.poly); s.k = (Math.floor((z0 + z1) / 2 / TS) + 512) * 1024 + Math.floor((x0 + x1) / 2 / TS) + 512; }
  for (const s of srcs) if (s.c < 0) s.k += 1e9; // houses first; other buildings only claim cells a garden could reach
  srcs.sort((a, b) => a.k - b.k);
  // A per-footprint wave stamp replaces the DONE bit, so we never walk settled cells to clear flags.
  let wave = 1;
  for (const { poly, c } of srcs) {
    if (++wave === 65535) { for (const t of all) t.wave.fill(0); wave = 1; }
    sow(poly, c);
    for (let bk = 0; bk < queue.length; bk++) {
      const qb = queue[bk];
      for (let e = 0; e < qb.length; e++) {
        const v = qb[e], tt = all[v >> 12], i0 = v & 4095, d = tt.dist[i0];
        if (((d / BK) | 0) !== bk || tt.wave[i0] === wave) continue; // nearer since, or already spread this wave
        tt.wave[i0] = wave;
        const lx = i0 & 63, lz = i0 >> 6, inner = lx > 0 && lx < 63 && lz > 0 && lz < 63;
        for (let s = 0; s < 8; s++) {
          const nd = d + (s < 4 ? 100 : 141); if (nd >= KMAX) continue;
          let t = tt, i: number;
          if (inner) i = i0 + OFF8[s];
          else { const nx = lx + DX8[s], nz = lz + DZ8[s]; t = tt.nb[((nz < 0 ? 0 : nz > 63 ? 2 : 1) * 3) + (nx < 0 ? 0 : nx > 63 ? 2 : 1)] as Tile; if (!t) continue; i = (nx & 63) + ((nz & 63) << 6); }
          if (!(t.flag[i] & BLOCK) && t.wave[i] !== wave && nd < t.dist[i] && (c >= 0 || t.dist[i] < 65535) && open(t, i)) { t.dist[i] = nd; t.own[i] = c; queue[(nd / BK) | 0].push(t.slot << 12 | i); }
        }
      }
      qb.length = 0;
    }
  }
  lap("flood");
  // ——— Count cells, drop tiny plots, and collect boundary edges in one pass ———
  const count = new Int32Array(H.length);
  for (const t of all) for (let i = 0; i < TS * TS; i++) { const h = t.own[i]; if (h >= 0) count[h]++; }
  const tiny = new Uint8Array(H.length); let anyTiny = false;
  for (let h = 0; h < H.length; h++) if (count[h] < 60) { tiny[h] = 1; anyTiny = true; count[h] = 0; }
  if (anyTiny) for (const t of all) for (let i = 0; i < TS * TS; i++) { const h = t.own[i]; if (h >= 0 && tiny[h]) t.own[i] = NONE; }
  lap("connect");
  const edges = new Map<number, number[]>(), push = (k: number, a: number, b: number, c: number, d: number) => { let l = edges.get(k); if (!l) { l = []; edges.set(k, l); } l.push(a, b, c, d); };
  const SIDE = 1e10, STREET = 2e10, BACK = 3e10;
  for (const t of all) for (let i = 0; i < TS * TS; i++) {
    const h = t.own[i]; if (h < 0) continue;
    const lx = i & 63, lz = i >> 6, ix = t.tx * TS + lx, iz = t.tz * TS + lz, inner = lx > 0 && lx < 63 && lz > 0 && lz < 63;
    for (let s = 0; s < 4; s++) {
      const j = inner ? t.own[i + DX[s] + (DZ[s] << 6)] : grid.own(ix + DX[s], iz + DZ[s]);
      if (j === h) continue;
      const ex = s === 0 ? ix + 1 : ix, ez = s === 2 ? iz + 1 : iz, [fx, fz] = s < 2 ? [ex, iz + 1] : [ix + 1, ez];
      if (j >= 0) { if (h < j) push(SIDE + h * 1e5 + j, ex, ez, fx, fz); continue; }
      const f = inner ? t.flag[i + DX[s] + (DZ[s] << 6)] : grid.flag(ix + DX[s], iz + DZ[s]);
      if (f & (BLD | KEEP)) continue;
      if (j !== OTHER && !(f & (ROAD | PUB))) continue; // where the 18 m reach simply ends the garden fades into open land: no fence
      push((f & ROAD ? STREET : BACK) + h, ex, ez, fx, fz);
    }
  }
  const plots: Plot[] = H.map((_, h) => ({ house: h, cells: count[h], runs: [], gate: null, path: null, drive: null, spots: [] }));
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
  // Tree spots are filled lazily in dressPlots (only for gardens that actually plant trees).
  lap("spots");
  Object.assign(PLOT_STAGES, stages);
  return { grid, plots, ms: performance.now() - t0, stages };
}

/** Pick up to `want` garden-tree positions by stepping inward from the boundary (no full-plot scan). */
function fillSpots(grid: PlotGrid, p: Plot, want: number, rnd: () => number) {
  if (want <= 0 || p.spots.length >= want || !p.runs.length) return;
  const h = p.house, runs = p.runs;
  for (let attempt = 0; attempt < want * 28 && p.spots.length < want; attempt++) {
    const r = runs[(rnd() * runs.length) | 0], L = Math.hypot(r.b[0] - r.a[0], r.b[1] - r.a[1]); if (L < .2) continue;
    const s = rnd(), x = r.a[0] + (r.b[0] - r.a[0]) * s + r.nx * (1.8 + rnd() * 8), z = r.a[1] + (r.b[1] - r.a[1]) * s + r.nz * (1.8 + rnd() * 8);
    const ix = Math.floor(x), iz = Math.floor(z), t = grid.tile(ix, iz); if (!t) continue;
    const i = (ix & 63) + ((iz & 63) << 6); if (t.own[i] !== h || t.flag[i] & RESV || t.dist[i] < 300) continue;
    if (grid.own(ix + 1, iz) !== h || grid.own(ix - 1, iz) !== h || grid.own(ix, iz + 1) !== h || grid.own(ix, iz - 1) !== h) continue;
    if (p.spots.every(o => Math.hypot(o[0] - ix - .5, o[1] - iz - .5) > 3.5)) p.spots.push([ix + .5, iz + .5]);
  }
}

// ——— Dressing: walls, hedges, fences, gates, paths, driveways, lawns ———
const LAWN = (() => { const m = worldMaterial('grass', { vertexColors: true, roughness: 1, scale: 4, strength: .65 }); m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = -2; return m; })();
const HEDGE_MAT = (() => { const m = worldMaterial(null, { vertexColors: true, roughness: .95 }); m.side = THREE.DoubleSide; return m; })();
const HEDGE_PLANE = new THREE.PlaneGeometry(1, 1);
const HEDGE = ['#3f5a35', '#465f37', '#4e6a3b', '#3b5532', '#55703f'];
const RUBBLE = ['#e3d3b0', '#d9c7a1', '#e8dbbd', '#d2c09a'];
export interface PlotStats { houses: number; plots: number; gates: number; drives: number; carports: number; runs: number; colliders: number; lawnTris: number; boundaryTris: number; trees: number; layoutMs: number; dressMs: number }
export const PLOT_STATS: PlotStats = { houses: 0, plots: 0, gates: 0, drives: 0, carports: 0, runs: 0, colliders: 0, lawnTris: 0, boundaryTris: 0, trees: 0, layoutMs: 0, dressMs: 0 };
export const PLOT_STAGES: Record<string, number> = {};

type HFn = (x: number, z: number) => number;
/** A ground-following box strip along a→b, offset `inset` into the plot, `thick` deep, spanning
 *  y0…y1 above the ground. One tilted box per stretch (split only on long or steep runs). */
function strip(kit: Kit, a: P2, b: P2, nx: number, nz: number, inset: number, thick: number, y0: number, y1: number, mat: THREE.Material, color: string, ht: HFn) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < .05) return 0;
  const ox = nx * inset, oz = nz * inset, rot = Math.atan2(-(b[1] - a[1]) / L, (b[0] - a[0]) / L);
  const ga = ht(a[0] + ox, a[1] + oz), gb = ht(b[0] + ox, b[1] + oz);
  // Prefer one tilted box per run; only split on very long or steep stretches.
  const n = Math.max(1, Math.ceil(L / 28), Math.ceil(Math.abs(gb - ga) / 4));
  let g0 = ga, boxes = 0;
  for (let k = 0; k < n; k++) {
    const t0 = k / n, t1 = (k + 1) / n;
    const x0 = a[0] + (b[0] - a[0]) * t0 + ox, z0 = a[1] + (b[1] - a[1]) * t0 + oz;
    const x1 = a[0] + (b[0] - a[0]) * t1 + ox, z1 = a[1] + (b[1] - a[1]) * t1 + oz;
    const g1 = k === n - 1 ? gb : ht(x1, z1), len = L / n, h = y1 - y0;
    kit.B.place(PRIMS.box, mat, (x0 + x1) / 2, (g0 + g1) / 2 + (y0 + y1) / 2, (z0 + z1) / 2, len + .04, h, thick, rot, color, true, -Math.atan2(g1 - g0, len));
    g0 = g1; boxes++;
  }
  return boxes;
}
/** Tall clipped hedge as a double-sided plane (2 tris) tilted to the ground — reads as a green wall from the street. */
function hedgePlane(kit: Kit, a: P2, b: P2, nx: number, nz: number, inset: number, y0: number, y1: number, color: string, ht: HFn) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < .05) return 0;
  const ox = nx * inset, oz = nz * inset, rot = Math.atan2(-(b[1] - a[1]) / L, (b[0] - a[0]) / L);
  const xa = a[0] + ox, za = a[1] + oz, xb = b[0] + ox, zb = b[1] + oz;
  const ga = ht(xa, za), gb = ht(xb, zb), h = y1 - y0;
  kit.B.place(HEDGE_PLANE, HEDGE_MAT, (xa + xb) / 2, (ga + gb) / 2 + (y0 + y1) / 2, (za + zb) / 2, L + .04, h, 1, rot, color, true, -Math.atan2(gb - ga, L));
  return 1;
}
/** One collider per run, spanning `d0`…`d1` into the plot and up to `h` above the highest ground. */
function runCollider(kit: Kit, r: Run, d0: number, d1: number, h: number, ht: HFn) {
  const L = Math.hypot(r.b[0] - r.a[0], r.b[1] - r.a[1]); if (L < .05) return 0;
  const gs = [r.a, r.b, [(r.a[0] + r.b[0]) / 2, (r.a[1] + r.b[1]) / 2] as P2].map(([x, z]) => ht(x + r.nx * (d0 + d1) / 2, z + r.nz * (d0 + d1) / 2));
  const lo = Math.min(...gs) - .3, hi = Math.max(...gs) + h;
  const f = new Frame((r.a[0] + r.b[0]) / 2, (r.a[1] + r.b[1]) / 2, Math.atan2(-(r.b[1] - r.a[1]) / L, (r.b[0] - r.a[0]) / L), lo);
  kit.lcollide(f, 0, (hi - lo) / 2, (d0 + d1) / 2, L, hi - lo, d1 - d0);
  kit.occ.markRect(f, 0, (d0 + d1) / 2, L, Math.max(.6, d1 - d0));
  return 1;
}
type Boundary = 'wall' | 'wall+hedge' | 'hedge' | 'slats' | 'rails';
/** Returns [colliders added, triangle count]. One collider per run; hedges are planes, walls/fences one box. */
function boundary(kit: Kit, r: Run, kind: Boundary, h: number, color: string, centred: boolean, ht: HFn): [number, number] {
  const wallH = Math.min(.9, h), stoneish = kind === 'wall' || kind === 'wall+hedge';
  const half = (w: number) => centred ? 0 : w / 2;
  let tris = 0;
  if (stoneish) tris += strip(kit, r.a, r.b, r.nx, r.nz, half(.45), .45, -.3, wallH, MAT.stone, RUBBLE[Math.floor(Math.abs(Math.sin(r.a[0] * 12.9 + r.a[1])) * 4)], ht) * 12;
  if (kind === 'wall+hedge') tris += hedgePlane(kit, r.a, r.b, r.nx, r.nz, .45 + .25, wallH - .05, h, color, ht) * 2;
  if (kind === 'hedge') tris += hedgePlane(kit, r.a, r.b, r.nx, r.nz, half(.15), -.1, h, color, ht) * 2;
  // Slat / rail fence: one thin panel (wood grain or metal) per run.
  if (kind === 'slats') tris += strip(kit, r.a, r.b, r.nx, r.nz, half(.12), .04, .06, h, MAT.wood, color, ht) * 12;
  if (kind === 'rails') tris += strip(kit, r.a, r.b, r.nx, r.nz, half(.05), .05, .08, h, MAT.metal, '#3a4a3e', ht) * 12;
  const depth = kind === 'wall+hedge' ? 1.0 : kind === 'hedge' ? .5 : kind === 'wall' ? .45 : .14;
  const col = centred ? runCollider(kit, r, -depth / 2, depth / 2, h, ht) : runCollider(kit, r, 0, depth, kind === 'wall' ? wallH : h, ht);
  return [col, tris];
}
/** A paved strip (path or driveway) from p along (nx, nz), tilted piecewise to the slope. */
function paving(kit: Kit, x: number, z: number, nx: number, nz: number, len: number, w: number, color: string, ht: HFn) {
  const n = Math.max(1, Math.ceil(len / 5)), rot = Math.atan2(nx, nz);
  let boxes = 0;
  for (let k = 0; k < n; k++) {
    const x0 = x + nx * len * k / n, z0 = z + nz * len * k / n, x1 = x + nx * len * (k + 1) / n, z1 = z + nz * len * (k + 1) / n, g0 = ht(x0, z0), g1 = ht(x1, z1), l = len / n;
    kit.B.place(PRIMS.box, MAT.paving, (x0 + x1) / 2, (g0 + g1) / 2 + .04, (z0 + z1) / 2, w, .1, l + .05, rot, color, false, -Math.atan2(g1 - g0, l));
    boxes++;
  }
  return boxes;
}
/** A slim steel pergola carport over the inner end of a driveway. */
function carport(kit: Kit, x: number, z: number, nx: number, nz: number, ht: HFn) {
  const f = new Frame(x, z, Math.atan2(nx, nz)), hs = [-2.6, 2.6].flatMap(v => [-1.45, 1.45].map(u => { const [px, pz] = f.at(u, v); return ht(px, pz); })), top = Math.max(...hs) + 2.45;
  let boxes = 0, k = 0;
  for (const v of [-2.6, 2.6]) for (const u of [-1.45, 1.45]) { const [px, pz] = f.at(u, v), g = hs[k++]; kit.B.place(PRIMS.box, MAT.metal, px, (g + top) / 2, pz, .09, top - g, .09, f.rot, '#3d4448'); kit.lcollide(new Frame(px, pz, f.rot, g), 0, (top - g) / 2, 0, .12, top - g, .12); boxes++; }
  for (const u of [-1.45, 1.45]) { kit.B.lbox(f, MAT.metal, u, top - f.y + .06, 0, .08, .14, 5.5, '#3d4448'); boxes++; }
  // Two cross-beams instead of a dense slat roof.
  for (const v of [-1.4, 1.4]) { kit.B.lbox(f, MAT.metal, 0, top - f.y + .16, v, 3.1, .06, .07, '#4a5256'); boxes++; }
  kit.B.lbox(f, MAT.plain, 0, top - f.y + .21, 0, 3.2, .03, 5.6, '#cfd3d0'); boxes++;
  return boxes;
}

/** Build the plots' boundaries, gates, paths, driveways and lawns; returns garden tree candidates
 *  (each tree's spots in order of preference) for buildTrees. */
export function dressPlots(kit: Kit, L: PlotLayout, styleOf: (house: number) => StreetStyle, parkCar: (x: number, z: number, rot: number) => void) {
  if (import.meta.env?.DEV) (globalThis as any).__L = L;
  const t0 = performance.now(); let seed = 6061; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
  const trees: Array<{ at: P2[]; kind: number }> = [], S = PLOT_STATS;
  S.plots = S.gates = S.drives = S.carports = S.runs = S.colliders = S.lawnTris = S.boundaryTris = S.trees = 0;
  let tris = 0;
  const ht: HFn = surfaceHeight;
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
      const [col, t] = r.kind === 'street'
        ? boundary(kit, r, front, fh, front === 'slats' ? pick(['#9b7550', '#a8835b', '#7d5d40']) : hc, false, ht)
        : (() => { const ps = pairStyle(p.house, r.other); return boundary(kit, r, ps.kind, ps.h, ps.color, r.kind === 'side', ht); })();
      S.colliders += col; tris += t;
    }
    if (p.gate) {
      S.gates++;
      const g = p.gate, ux = g.nz, uz = -g.nx, ph = front === 'wall' ? fh + .25 : front === 'slats' ? fh + .1 : 1.35;
      for (const s of [-1, 1]) { const x = g.x + ux * s * .78 + g.nx * .22, z = g.z + uz * s * .78 + g.nz * .22, y = ht(x, z); kit.B.place(PRIMS.box, front === 'slats' ? MAT.wood : MAT.stone, x, y + ph / 2 - .1, z, .42, ph + .2, .42, Math.atan2(g.nx, g.nz), front === 'slats' ? '#6e5238' : '#d8c8a4'); tris += 12; }
      if (p.path) { const [[ax, az], [bx, bz]] = p.path, len = Math.hypot(bx - ax, bz - az); if (len > .3) { tris += paving(kit, ax, az, (bx - ax) / len, (bz - az) / len, len, 1.1, pick(['#d6ccb6', '#cfc3aa', '#ddd3bd']), ht) * 12; } kit.occ.markRect(new Frame((ax + bx) / 2, (az + bz) / 2, Math.atan2(bx - ax, bz - az)), 0, 0, 1.2, len); }
    }
    if (p.drive) {
      S.drives++;
      const d = p.drive; tris += paving(kit, d.x, d.z, d.nx, d.nz, d.len, 3, pick(['#bdb7aa', '#b3ada0', '#c6c0b2']), ht) * 12;
      const cx = d.x + d.nx * (d.len - 2.9), cz = d.z + d.nz * (d.len - 2.9), rot = Math.atan2(d.nx, d.nz);
      if (d.len > 7 && rnd() < .6) { tris += carport(kit, cx, cz, d.nx, d.nz, ht) * 12; S.carports++; if (rnd() < .55) parkCar(cx, cz, rot + (rnd() < .5 ? 0 : Math.PI)); }
      else parkCar(cx, cz, rot + (rnd() < .5 ? 0 : Math.PI));
      kit.occ.markRect(new Frame(d.x + d.nx * d.len / 2, d.z + d.nz * d.len / 2, rot), 0, 0, 3.4, d.len + 1);
    }
    // Garden trees by the street's density and species, more in bigger gardens.
    const n = gardenTrees(st.treeDensity) * Math.max(.7, Math.min(2.4, p.cells / 320)), count = Math.floor(n) + (rnd() < n % 1 ? 1 : 0);
    if (count > 0) {
      fillSpots(L.grid, p, Math.min(24, count * 3), rnd);
      for (let t = 0; t < count && t < p.spots.length; t++) trees.push({ at: [p.spots[t], ...p.spots.slice(count + t * 2, count + t * 2 + 2)], kind: treeKind(st.species, rnd()) });
    }
  }
  S.trees = trees.length; S.boundaryTris = tris; S.lawnTris = lawn(kit, L.grid); S.dressMs = performance.now() - t0;
  return trees;
}

/** Lawn over the plots: each 64 m tile is cut into greedy rectangles of 2 m blocks, each draped on the
 *  ground in quads of at most 8 m and merged into one vertex-coloured mesh per 128 m. A block is lawn
 *  when at least two of its four cells are garden and the rest are free (never road, building,
 *  authored or another's ground), so the lawn spills at most 1 m onto open verge and the edge stays tidy. */
function lawn(kit: Kit, grid: PlotGrid) {
  const buckets = new Map<string, { pos: number[]; col: number[]; nor: number[] }>(), a = new THREE.Color('#6d8c43'), b = new THREE.Color('#8aa456'), c = new THREE.Color(), v1 = new THREE.Vector3(), v2 = new THREE.Vector3();
  let tris = 0;
  // Ground heights at the 2 m lattice, shared by neighbouring quads (surfaceHeight is the costly part).
  const hgt = new Float32Array((TS / 2 + 1) ** 2); let hx = 0, hz = 0;
  const hAt = (x: number, z: number) => { const k = (x - hx) + (z - hz) * (TS / 2 + 1); let h = hgt[k]; if (Number.isNaN(h)) { h = surfaceHeight(x * 2, z * 2) + .03; hgt[k] = h; } return h; };
  const cx = [0, 0, 0, 0], cy = [0, 0, 0, 0], cz = [0, 0, 0, 0], TRI = [0, 1, 2, 0, 2, 3];
  const quad = (x0: number, z0: number, x1: number, z1: number) => {
    const k = `${Math.floor(x0 / 64)},${Math.floor(z0 / 64)}`; let o = buckets.get(k); if (!o) { o = { pos: [], col: [], nor: [] }; buckets.set(k, o); }
    cx[0] = cx[1] = x0 * 2; cx[2] = cx[3] = x1 * 2; cz[0] = cz[3] = z0 * 2; cz[1] = cz[2] = z1 * 2;
    cy[0] = hAt(x0, z0); cy[1] = hAt(x0, z1); cy[2] = hAt(x1, z1); cy[3] = hAt(x1, z0);
    v1.set(cx[1] - cx[0], cy[1] - cy[0], cz[1] - cz[0]); v2.set(cx[2] - cx[0], cy[2] - cy[0], cz[2] - cz[0]); v1.cross(v2).normalize(); if (v1.y < 0) v1.negate();
    for (const i of TRI) { const n = Math.sin(cx[i] * .19 + Math.cos(cz[i] * .13) * 2) * Math.cos(cz[i] * .17 - cx[i] * .05) * .5 + .5; c.copy(a).lerp(b, n); o.pos.push(cx[i], cy[i], cz[i]); o.col.push(c.r, c.g, c.b); o.nor.push(v1.x, v1.y, v1.z); }
    tris += 2;
  };

  const H2 = TS / 2, used = new Uint8Array(H2 * H2), lawned = new Uint8Array(H2 * H2), STEP = 8; // at most 16 m per quad
  for (const t of grid.all) {
    const tx = t.tx * TS, tz = t.tz * TS; used.fill(0); hgt.fill(NaN); hx = tx / 2; hz = tz / 2;
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
      // One quad when the rect is small; otherwise tile at STEP so slopes still drape.
      if (w <= STEP && h <= STEP) quad(hx + x, hz + z, hx + x + w, hz + z + h);
      else for (let j = 0; j < h; j += STEP) for (let k = 0; k < w; k += STEP) quad(hx + x + k, hz + z + j, hx + x + Math.min(w, k + STEP), hz + z + Math.min(h, j + STEP));
    }
  }
  buckets.forEach(o => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(o.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(o.nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(o.col, 3));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, LAWN); m.receiveShadow = true; m.name = 'lawn'; kit.root.add(m);
  });
  return tris;
}
