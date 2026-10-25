/** Real-world placement for the game map, at 1:1 scale. Pure data/maths so tests and tools can
 *  import it. WGS84 points are projected to local metres (east = +x, north = −z) about the
 *  Beit She'arim catacombs, which sit at the cave entrance (126, 86). Streets, paths, areas and
 *  building footprints come from OpenStreetMap (© OpenStreetMap contributors, ODbL) via
 *  docs/gis/build-world.mjs; elevation from AWS Terrain Tiles via docs/gis/build-dem.mjs. */
import world from '../data/tivon-world.json';
import dem from '../data/tivon-dem.json';
import { LANDMARKS } from '../game/landmarks';

export type P2 = [number, number];
export const GEO = { lat0: world.origin.lat, lon0: world.origin.lon, x0: world.origin.x, z0: world.origin.z, mPerLon: world.mPerLon, mPerLat: world.mPerLat } as const;
export const WORLD = { minX: world.bounds.minX + 20, maxX: world.bounds.maxX - 20, minZ: world.bounds.minZ + 20, maxZ: world.bounds.maxZ - 20 } as const;

export const project = (lat: number, lon: number): P2 => [GEO.x0 + (lon - GEO.lon0) * GEO.mPerLon, GEO.z0 - (lat - GEO.lat0) * GEO.mPerLat];
export const unproject = (x: number, z: number): [number, number] => [GEO.lat0 - (z - GEO.z0) / GEO.mPerLat, GEO.lon0 + (x - GEO.x0) / GEO.mPerLon];
export const toWorld = project;

// ——— Elevation ———
const demGrid: Int16Array = (() => {
  const bin = atob(dem.data);
  const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Int16Array(bytes.buffer);
})();
/** Ground elevation above sea level (m), bilinear on the ~6 m DEM grid. */
export function elevation(x: number, z: number): number {
  const [lat, lon] = unproject(x, z);
  const fr = (dem.north - lat) / dem.step, fc = (lon - dem.west) / dem.step;
  const r = Math.max(0, Math.min(dem.rows - 2, Math.floor(fr))), c = Math.max(0, Math.min(dem.cols - 2, Math.floor(fc)));
  const tr = Math.min(1, Math.max(0, fr - r)), tc = Math.min(1, Math.max(0, fc - c));
  const g = (rr: number, cc: number) => demGrid[rr * dem.cols + cc] / 10;
  return (g(r, c) * (1 - tc) + g(r, c + 1) * tc) * (1 - tr) + (g(r + 1, c) * (1 - tc) + g(r + 1, c + 1) * tc) * tr;
}
/** Sea level of game y = 0: the catacomb courtyard floor. */
export const BASE_ELEVATION = 100.5;

// ——— Streets, areas, buildings ———
export interface Road { name: string; en: string; kind: string; width: number; oneway: boolean; bridge: boolean; surface: string; points: P2[] }
const densify = (pts: P2[], step = 4): P2[] => {
  const out: P2[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / step));
    for (let j = 1; j <= n; j++) out.push([ax + (bx - ax) * j / n, az + (bz - az) * j / n]);
  }
  return out;
};
export const VEHICLE = new Set(['motorway', 'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary', 'tertiary_link', 'unclassified', 'residential', 'living_street']);
export const ROADS: Road[] = (world.roads as Array<{ k: string; w: number; n: string; en: string; ow: number; br: number; sf: string; p: P2[] }>)
  .map(r => ({ name: r.n, en: r.en, kind: r.k, width: r.w, oneway: !!r.ow, bridge: !!r.br, surface: r.sf, points: densify(r.p, VEHICLE.has(r.k) ? 4 : 3) }));
export interface Area { kind: string; name: string; points: P2[] }
export const AREAS: Area[] = (world.areas as Array<{ k: string; n?: string; p: P2[] }>).map(a => ({ kind: a.k, name: a.n ?? '', points: a.p }));
export interface Footprint { id: string; points: P2[]; levels: number; height: number; name: string; type: string; tag: string; layer: number; street: string }
export const BUILDINGS: Footprint[] = (world.buildings as Array<{ id: string; p: P2[]; lv: number; h: number; n: string; b: string; a: string; lay: number; st?: string }>)
  .map(b => ({ id: b.id, points: b.p, levels: b.lv, height: b.h, name: b.n, type: b.b, tag: b.a, layer: b.lay, street: b.st ?? '' }));
export const POIS = world.pois as Array<{ n: string; k: string; x: number; z: number }>;

/** 32 m grid of road segments per road list, so nearest-road queries stay local. */
type Seg = { road: Road; ax: number; az: number; bx: number; bz: number };
const segIndex = new WeakMap<Road[], Map<number, Seg[]>>();
const CELL = 32, ckey = (ix: number, iz: number) => (ix + 1000) * 4000 + (iz + 1000);
function indexFor(roads: Road[]) {
  let idx = segIndex.get(roads); if (idx) return idx;
  idx = new Map();
  for (const road of roads) for (let i = 1; i < road.points.length; i++) {
    const [ax, az] = road.points[i - 1], [bx, bz] = road.points[i], s: Seg = { road, ax, az, bx, bz };
    for (let x = Math.floor(Math.min(ax, bx) / CELL); x <= Math.floor(Math.max(ax, bx) / CELL); x++) for (let z = Math.floor(Math.min(az, bz) / CELL); z <= Math.floor(Math.max(az, bz) / CELL); z++) {
      const k = ckey(x, z); let a = idx.get(k); if (!a) { a = []; idx.set(k, a); } a.push(s);
    }
  }
  segIndex.set(roads, idx); return idx;
}
export function nearestRoad(x: number, z: number, roads: Road[] = ROADS) {
  let best = { dist: Infinity, px: 0, pz: 0, dx: 1, dz: 0, road: roads[0] };
  const idx = indexFor(roads), cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
  for (let ring = 0; ring < 40; ring++) {
    for (let ix = cx - ring; ix <= cx + ring; ix++) for (let iz = cz - ring; iz <= cz + ring; iz++) {
      if (Math.max(Math.abs(ix - cx), Math.abs(iz - cz)) !== ring) continue;
      for (const s of idx.get(ckey(ix, iz)) ?? []) {
        const vx = s.bx - s.ax, vz = s.bz - s.az, len2 = vx * vx + vz * vz || 1;
        const t = Math.max(0, Math.min(1, ((x - s.ax) * vx + (z - s.az) * vz) / len2));
        const px = s.ax + vx * t, pz = s.az + vz * t, d = Math.hypot(x - px, z - pz);
        if (d < best.dist) { const l = Math.sqrt(len2); best = { dist: d, px, pz, dx: vx / l, dz: vz / l, road: s.road }; }
      }
    }
    if (best.dist <= ring * CELL) break; // nothing in farther rings can be closer
  }
  return best;
}
/** Exhaustive version kept for small, ad-hoc road lists. */
export function nearestRoadScan(x: number, z: number, roads: Road[]) {
  let best = { dist: Infinity, px: 0, pz: 0, dx: 1, dz: 0, road: roads[0] };
  for (const road of roads) for (let i = 1; i < road.points.length; i++) {
    const [ax, az] = road.points[i - 1], [bx, bz] = road.points[i];
    const vx = bx - ax, vz = bz - az, len2 = vx * vx + vz * vz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / len2));
    const px = ax + vx * t, pz = az + vz * t, d = Math.hypot(x - px, z - pz);
    if (d < best.dist) { const l = Math.sqrt(len2); best = { dist: d, px, pz, dx: vx / l, dz: vz / l, road }; }
  }
  return best;
}
export function pointInPolygon(x: number, z: number, p: P2[]) {
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) if ((p[i][1] > z) !== (p[j][1] > z) && x < (p[j][0] - p[i][0]) * (z - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0]) inside = !inside;
  return inside;
}
/** The OSM building that contains (or is nearest to) a point. */
export function footprintAt(x: number, z: number, maxDist = 25): Footprint | undefined {
  let best: Footprint | undefined, bd = maxDist;
  for (const b of BUILDINGS) {
    if (pointInPolygon(x, z, b.points)) return b;
    for (const [px, pz] of b.points) { const d = Math.hypot(px - x, pz - z); if (d < bd) { bd = d; best = b; } }
  }
  return best;
}
/** Minimum-area oriented rectangle of a footprint: centre, size and rotation (local +z = rot). */
export function orientedBox(p: P2[]) {
  let best = { area: Infinity, cx: 0, cz: 0, w: 0, d: 0, rot: 0 };
  for (let i = 0; i < p.length; i++) {
    const [ax, az] = p[i], [bx, bz] = p[(i + 1) % p.length], a = Math.atan2(bz - az, bx - ax), c = Math.cos(a), s = Math.sin(a);
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const [x, z] of p) { const u = x * c + z * s, v = -x * s + z * c; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
    const area = (u1 - u0) * (v1 - v0);
    if (area < best.area) { const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2; best = { area, cx: cu * c - cv * s, cz: cu * s + cv * c, w: u1 - u0, d: v1 - v0, rot: -a }; }
  }
  return best;
}

export function landmark(id: string) {
  const l = LANDMARKS.find(m => m.id === id);
  if (!l) throw new Error(`Unknown landmark ${id}`);
  const [x, z] = project(l.lat, l.lon);
  return { ...l, x, z };
}
const centre = (id: string) => landmark(id);
export const DISTRICTS = {
  bengurion: { x: centre('bengurion_square').x, z: centre('bengurion_square').z, r: 90 },
  kiryatamal: { x: centre('mandu').x, z: centre('mandu').z, r: 80 },
} as const;
