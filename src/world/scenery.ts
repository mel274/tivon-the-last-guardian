import * as THREE from 'three';
import { ShapeUtils } from 'three';
import { BUILDINGS, AREAS, ROADS, WORLD, VEHICLE, DISTRICTS, landmark, orientedBox, pointInPolygon, type Footprint, type P2 } from './geo';
import { surfaceHeight } from './terrain';
import { Kit, MAT, NIGHT, Frame, PRIMS } from './kit';
import { buildingMaterial } from './materials';
import { styleFor, wallFinish, gardenTrees, treeKind } from './streetStyle';
import { nearestRoad } from './geo';
import { ZEID, STATIC_PADS } from './layout';
import { layoutPlots, dressPlots, PLOT_STATS } from './plots';
import { LANDMARKS } from '../game/landmarks';
import { spawnDriveableCar } from './vehicles';

/** The town's fabric from real OSM footprints. Each building stands on its ground (on slopes the
 *  downhill side shows a taller base, as Tivon's hillside houses do); heights follow OSM levels
 *  where mapped, otherwise footprint size. Small houses often get red-tile hipped roofs, flat
 *  roofs get solar water heaters. Windows are drawn by the facade shader. */
let seed = 90210;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const PLASTER = ['#f1ebdd', '#e9dfc8', '#efe3c6', '#ddd4bf', '#f5f1e8', '#e7d5b6', '#e4dccd', '#d9cdb4', '#eee6d6'];
const STONE = ['#efe2c4', '#e8d9b8', '#f1e6cc'];

export function window_(kit: Kit, f: Frame, lx: number, y: number, lz: number, w: number, h: number, shutter: string | null, roller = false) {
  const B = kit.B;
  B.lbox(f, MAT.plain, lx, y, lz + .02, w + .14, h + .14, .08, '#efeae0');
  const [x, z] = f.at(lx, lz + .07); B.place(PRIMS.box, NIGHT.window, x, f.y + y, z, w, h, .03, f.rot, null, false);
  if (roller) B.lbox(f, MAT.plain, lx, y + h / 2 + .16, lz + .08, w + .16, .26, .2, '#d8d4ca');
  else if (shutter) for (const s of [-1, 1]) B.lbox(f, MAT.wood, lx + s * (w / 2 + .2), y, lz + .06, .36, h, .05, shutter);
}
export function solarHeater(kit: Kit, x: number, y: number, z: number, rot: number) {
  const f = new Frame(x, z, rot, y);
  const [tx, tz] = f.at(0, -.35); kit.B.place(PRIMS.cyl, MAT.metal, tx, y + .75, tz, .3, 1.5, .3, rot + Math.PI / 2, '#e6e3dc', true, 0, Math.PI / 2);
  const [px, pz] = f.at(0, .65); kit.B.place(PRIMS.box, MAT.gloss, px, y + .45, pz, 1.6, .06, 1.3, rot, '#26383f', true, -.55);
}

interface Extruder { pos: number[]; nor: number[]; col: number[]; bld: number[] }
const newEx = (): Extruder => ({ pos: [], nor: [], col: [], bld: [] });
const exByChunk = new Map<string, { plaster: Extruder; stone: Extruder }>();
function chunk(x: number, z: number) { const k = `${Math.floor(x / 320)},${Math.floor(z / 320)}`; let c = exByChunk.get(k); if (!c) { c = { plaster: newEx(), stone: newEx() }; exByChunk.set(k, c); } return c; }
function pushTri(e: Extruder, a: number[], b: number[], c: number[], n: number[], color: THREE.Color, bld: number[]) {
  for (const v of [a, b, c]) { e.pos.push(v[0], v[1], v[2]); e.nor.push(n[0], n[1], n[2]); e.col.push(color.r, color.g, color.b); e.bld.push(bld[0], bld[1], bld[2]); }
}
const ccw = (p: P2[]) => { let a = 0; for (let i = 0; i < p.length; i++) { const [x1, z1] = p[i], [x2, z2] = p[(i + 1) % p.length]; a += x1 * z2 - x2 * z1; } return a < 0 ? p : [...p].reverse(); };

/** Extrude a footprint polygon from `base` to `top` with walls (and a flat roof unless skipped).
 *  Adds oriented edge colliders. Returns the footprint's oriented box for roof dressing. */
export function extrude(kit: Kit, poly: P2[], base: number, top: number, wall: string, stone: boolean, opts: { roof?: boolean; collide?: boolean; roofColor?: string; parapet?: number } = {}) {
  const p = ccw(poly), c = chunk(p[0][0], p[0][1]), e = stone ? c.stone : c.plaster;
  const col = new THREE.Color(wall), roofCol = new THREE.Color(opts.roofColor ?? '#bcb8ad');
  const parapet = opts.parapet ?? .6, wallTop = top + (opts.roof === false ? 0 : parapet);
  const bld = [stone ? 1 : 0, base, top];
  for (let i = 0; i < p.length; i++) {
    const [ax, az] = p[i], [bx, bz] = p[(i + 1) % p.length];
    const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz); if (l < .05) continue;
    const n = [-dz / l, 0, dx / l]; // outward for the orientation ccw() returns
    pushTri(e, [ax, base, az], [bx, base, bz], [bx, wallTop, bz], n, col, bld);
    pushTri(e, [ax, base, az], [bx, wallTop, bz], [ax, wallTop, az], n, col, bld);
    if (opts.collide !== false) {
      const f = new Frame((ax + bx) / 2, (az + bz) / 2, Math.atan2(-dz, dx), base);
      kit.lcollide(f, 0, (wallTop - base) / 2, 0, l, wallTop - base, .3);
    }
  }
  if (opts.roof !== false) {
    const tris = ShapeUtils.triangulateShape(p.map(([x, z]) => new THREE.Vector2(x, z)), []);
    for (const [i, j, k] of tris) {
      const [a, b, c2] = [p[i], p[j], p[k]], up = (b[1] - a[1]) * (c2[0] - a[0]) - (b[0] - a[0]) * (c2[1] - a[1]);
      const [q, r] = up > 0 ? [b, c2] : [c2, b];
      pushTri(e, [a[0], top, a[1]], [q[0], top, q[1]], [r[0], top, r[1]], [0, 1, 0], roofCol, [9, base, top]);
    }
  }
  return orientedBox(p);
}
export function flushExtrusions(root: THREE.Object3D) {
  exByChunk.forEach(({ plaster, stone }) => {
    for (const [e, surf] of [[plaster, 'plaster'], [stone, 'limestone']] as const) {
      if (!e.pos.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(e.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(e.nor, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(e.col, 3)); g.setAttribute('bld', new THREE.Float32BufferAttribute(e.bld, 3));
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, buildingMaterial(surf)); m.castShadow = true; m.receiveShadow = true; root.add(m);
    }
  });
  exByChunk.clear();
}
/** Ground range under a footprint. */
export function groundRange(poly: P2[]) {
  let lo = Infinity, hi = -Infinity;
  const xs = poly.map(q => q[0]), zs = poly.map(q => q[1]);
  const samples: P2[] = [...poly, [xs.reduce((a, b) => a + b) / xs.length, zs.reduce((a, b) => a + b) / zs.length]];
  for (const [x, z] of samples) { const h = surfaceHeight(x, z); lo = Math.min(lo, h); hi = Math.max(hi, h); }
  return { lo, hi };
}
const polyArea = (p: P2[]) => { let a = 0; for (let i = 0; i < p.length; i++) { const [x1, z1] = p[i], [x2, z2] = p[(i + 1) % p.length]; a += x1 * z2 - x2 * z1; } return Math.abs(a) / 2; };

/** Garden tree: candidate spots in order of preference, and the instanced tree kind. */
export type GardenTree = { at: P2[]; kind: number };
const CIVIC = new Set(['school', 'pitch', 'cemetery', 'heritage', 'pool', 'playground', 'parking', 'pedestrian', 'park']);
const civic = AREAS.filter(a => CIVIC.has(a.kind)).map(a => { const xs = a.points.map(q => q[0]), zs = a.points.map(q => q[1]); return { a, box: [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)] }; });
const HOME = new Set(['yes', 'house', 'detached', 'residential', 'semidetached_house', 'bungalow']);
/** A private house: an untagged, unnamed residential footprint of 40–250 m² and at most three
 *  storeys (mapped, or as the street survey would build it), outside schools, parks and other
 *  public grounds. In the OSM data nearly every building is a plain `building=yes`. */
export function isPrivateHouse(b: Footprint, area = polyArea(b.points)) {
  if (b.layer < 0 || b.points.length < 3 || b.name || b.tag || !HOME.has(b.type) || area < 40 || area >= 250) return false;
  const st = styleFor(b.street);
  if (/commercial|public|industrial|office/.test(st.type) || (st.type.includes('apartment') && area > 160)) return false;
  if ((b.levels || (b.height ? Math.round(b.height / 3) : Math.min(st.floorsMax, st.floorsTypical + 1))) > 3) return false;
  const cx = b.points.reduce((s, q) => s + q[0], 0) / b.points.length, cz = b.points.reduce((s, q) => s + q[1], 0) / b.points.length;
  return !civic.some(({ a, box }) => cx >= box[0] && cx <= box[1] && cz >= box[2] && cz <= box[3] && pointInPolygon(cx, cz, a.points));
}
const CARS = ['#d8d6cf', '#2d2f33', '#8e9399', '#7c2f2b', '#e9e8e3', '#33475f', '#5d6b5e', '#b8b4a6', '#f2f2ef'];

/** All OSM buildings except those in `skip` (custom-built) and underground tombs. Private houses
 *  get their own walled, hedged and planted plots (plots.ts). */
export function buildFootprints(kit: Kit, skip: Set<string>) {
  seed = 90210; let count = 0;
  const gardens: GardenTree[] = [];
  // Plots are laid out before this function marks the occupancy grid, so it still tells authored ground apart.
  const homes: Footprint[] = [], home = new Set<string>(), others: Array<{ points: P2[]; claim: boolean }> = [];
  for (const b of BUILDINGS) {
    if (b.layer < 0 || b.points.length < 3) continue;
    const area = polyArea(b.points);
    if (!skip.has(b.id) && isPrivateHouse(b, area)) { home.add(b.id); homes.push(b); } else others.push({ points: b.points, claim: !skip.has(b.id) && area >= 40 });
  }
  const v = new THREE.Vector3(), keepDiscs: Array<[number, number, number]> = [];
  for (const i of kit.ctx.interactables) { i.object.getWorldPosition(v); keepDiscs.push([v.x, v.z, 6]); }
  for (const n of kit.ctx.npcs) { n.object.getWorldPosition(v); keepDiscs.push([v.x, v.z, 6]); }
  for (const l of LANDMARKS) { const m = landmark(l.id); keepDiscs.push([m.x, m.z, 9]); }
  const districts = Object.values(DISTRICTS).map(d => ({ x: d.x, z: d.z, r2: (d.r + 30) ** 2 }));
  const plots = layoutPlots({
    houses: homes.map(b => b.points), others,
    roads: ROADS.filter(r => VEHICLE.has(r.kind) || r.kind === 'service'), paths: ROADS.filter(r => !VEHICLE.has(r.kind) && r.kind !== 'service'),
    pub: civic.map(c => c.a.points), keep: STATIC_PADS.map(p => p.poly), keepDiscs,
    // Occupied cells off the roads' own bands are authored ground; inside the districts, occupied near-road cells count as street.
    blockFree: (x, z) => kit.occ.free(x, x, z, z),
    keepTest: (x, z, near) => kit.occ.free(x, x, z, z) ? null : districts.some(d => (x - d.x) ** 2 + (z - d.z) ** 2 < d.r2) ? (near ? 'road' : 'keep') : near ? null : 'keep',
  });
  PLOT_STATS.houses = homes.length; PLOT_STATS.layoutMs = Math.round(plots.ms);
  const plotted = (x: number, z: number) => plots.grid.ownAt(x, z) >= 0;
  for (const b of BUILDINGS) {
    if (skip.has(b.id) || b.layer < 0 || b.points.length < 3) continue;
    const area = polyArea(b.points); if (area < 6) continue;
    const { lo, hi } = groundRange(b.points), house = home.has(b.id);
    // Storeys, finishes and roofs follow the street's Street View survey (or town defaults).
    const st = styleFor(b.street), big = area > 500 || (st.type.includes('apartment') && area > 160);
    const guess = (big ? st.floorsMax : st.floorsTypical) + (rnd() < .25 ? -1 : rnd() < .15 ? 1 : 0) + (area < 55 ? -1 : 0);
    const levels = Math.min(house ? 3 : 99, b.levels || (b.height ? Math.round(b.height / 3) : Math.max(1, Math.min(st.floorsMax, guess))));
    const top = hi + levels * 3;
    const fin = wallFinish(pick(st.walls), rnd()), stone = fin.stone, wall = fin.color;
    const box = orientedBox(b.points);
    const tiled = levels <= 3 && area < 320 && box.area < area * 1.3 && rnd() < st.redTileRoofShare;
    extrude(kit, b.points, lo - .4, top, wall, stone, { roof: !tiled, parapet: tiled ? 0 : .6 });
    for (const [x, z] of b.points) kit.occ.markDisc(x, z, 1.2);
    const f = new Frame(box.cx, box.cz, box.rot, top);
    kit.occ.markRect(f, 0, 0, box.w + 1, box.d + 1);
    if (tiled) {
      kit.B.place(PRIMS.roof, MAT.tiles, box.cx, top + Math.min(box.w, box.d) * .2, box.cz, box.w + .8, Math.min(box.w, box.d) * .4, box.d + .8, box.rot, pick(['#b4563b', '#a84d35', '#9a5040', '#b8654a', '#8f4a38']));
    } else if (area < 900 && st.solarHeaters) {
      const heaters = area < 150 ? 1 : Math.min(6, Math.floor(area / 120));
      for (let i = 0; i < heaters; i++) { const [x, z] = f.at((i - (heaters - 1) / 2) * Math.min(2.4, box.w / heaters), -box.d / 4); if (pointInPolygon(x, z, b.points)) solarHeater(kit, x, top, z, box.rot); }
    }
    // Other low buildings keep a ring of garden trees and a street-side boundary where no plot is.
    if (!house && levels <= 3) {
      const n = gardenTrees(st.treeDensity);
      for (let k = 0; k < Math.floor(n) + (rnd() < n % 1 ? 1 : 0); k++) {
        const a = rnd() * Math.PI * 2, r = Math.max(box.w, box.d) / 2 + 2.2 + rnd() * 3.5, x = box.cx + Math.cos(a) * r, z = box.cz + Math.sin(a) * r;
        gardens.push({ at: [[x, z], ...[0, 1, 2].map((): P2 => [x + (rnd() - .5) * 6, z + (rnd() - .5) * 6])], kind: treeKind(st.species, rnd()) });
      }
      if (st.frontBoundary !== 'none') frontBoundary(kit, box, st.frontBoundary, st.hedges, plotted);
    }
    count++;
  }
  gardens.push(...dressPlots(kit, plots, h => styleFor(homes[h].street), (x, z, rot) => { if (rnd() < .35) car(kit, x, z, rot, pick(CARS)); }));
  PLOT_STATS.dressMs = Math.round(PLOT_STATS.dressMs);
  if (import.meta.env?.DEV) console.info('[plots]', JSON.stringify({ ...PLOT_STATS, stages: plots.stages }));
  return { count, gardens };
}

const vehicleRoads = ROADS.filter(r => VEHICLE.has(r.kind) && !r.kind.startsWith('trunk'));
/** Garden wall / hedge / fence along the street side of a plot, just behind the pavement. */
function frontBoundary(kit: Kit, box: { cx: number; cz: number; w: number; d: number }, kind: string, hedges: boolean, plotted: (x: number, z: number) => boolean) {
  const r = nearestRoad(box.cx, box.cz, vehicleRoads); if (r.dist > 28) return;
  const nx = box.cx - r.px, nz = box.cz - r.pz, l = Math.hypot(nx, nz) || 1, off = r.road.width / 2 + 1.9;
  if (l < off + 1.5) return;
  const len = Math.min(16, Math.max(box.w, box.d) + 3), x = r.px + nx / l * off, z = r.pz + nz / l * off;
  const f = new Frame(x, z, Math.atan2(r.dx, r.dz) + Math.PI / 2), k = kind.toLowerCase();
  for (const e of [-len / 2, len / 2]) { const [ex, ez] = f.at(e, 0), q = nearestRoad(ex, ez, vehicleRoads); if (q.dist < q.road.width / 2 + 1.6) return; }
  // Never across a private plot (it has its own boundary).
  for (let e = -len / 2; e <= len / 2; e += 1) { const [ex, ez] = f.at(e, 0); if (plotted(ex, ez)) return; }
  // Never across an authored plaza (the Zeid lane opens onto Alexander Zaid Street).
  for (let e = -len / 2 - 1.5; e <= len / 2 + 1.5; e += 1.5) { const [ex, ez] = f.at(e, 0); if (pointInPolygon(ex, ez, ZEID.upperPlaza) || pointInPolygon(ex, ez, ZEID.lowerPlaza)) return; }
  const stoneWall = k.includes('stone'), fence = k.includes('fence'), hedge = k.includes('hedge') || (hedges && !fence); // the survey's signature: rubble wall, tall hedge behind
  if (stoneWall) { kit.B.lbox(f, MAT.stone, 0, .35, 0, len, .9, .4, '#e3d3b0'); kit.lcollide(f, 0, .45, 0, len, .9, .45); }
  if (fence) { kit.B.lbox(f, MAT.metal, 0, .55, 0, len, 1.1, .05, '#3b4743'); kit.lcollide(f, 0, .55, 0, len, 1.1, .1); }
  if (hedge) { const top = 1.6 + rnd() * .5, bot = stoneWall ? .8 : 0; kit.B.lbox(f, MAT.foliage, 0, (top + bot) / 2, -.05, len, top - bot, .8, pick(['#4e6a3b', '#5c7743', '#465f37', '#3f5a35'])); if (!stoneWall) kit.lcollide(f, 0, top / 2, 0, len, top, .8); }
  kit.occ.markRect(f, 0, 0, len, .6);
}

function car(kit: Kit, x: number, z: number, rot: number, color: string) {
  spawnDriveableCar(kit, x, z, rot, color);
}
/** Cars parked along residential/local kerbs and in car parks — every visible car is enterable. */
export function buildCars(kit: Kit) {
  seed = 777;
  for (const road of ROADS) {
    if (!VEHICLE.has(road.kind) || road.kind.startsWith('trunk') || road.kind === 'service') continue;
    for (let i = 4; i < road.points.length - 4; i += 9) {
      if (rnd() > .18) continue;
      const [ax, az] = road.points[i], [bx, bz] = road.points[i + 1], dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1, side = rnd() < .5 ? 1 : -1;
      car(kit, ax + dz / l * side * (road.width / 2 - 1.1), az - dx / l * side * (road.width / 2 - 1.1), Math.atan2(dx, dz), pick(CARS));
    }
  }
  for (const a of AREAS) if (a.kind === 'parking') {
    const box = orientedBox(a.points), f = new Frame(box.cx, box.cz, box.rot);
    for (let u = -box.w / 2 + 2; u < box.w / 2 - 1.5; u += 3.4) for (const v of [-box.d / 2 + 3, box.d / 2 - 3]) {
      const [x, z] = f.at(u, v); if (!pointInPolygon(x, z, a.points) || rnd() > .4) continue;
      car(kit, x, z, box.rot + (v < 0 ? 0 : Math.PI), pick(CARS));
    }
  }
  // Guaranteed car at the spawn plaza so the first E always works.
  try {
    const a = landmark('amali'), face = .35;
    const [sx, sz] = new Frame(a.x, a.z, face).at(6.5, 12);
    car(kit, sx, sz, face + Math.PI / 2, '#c9ced3');
  } catch { /* */ }
}

/** Instanced trees: dense oak–pine woodland in OSM forests, park trees, garden trees around
 *  houses and street trees, chunked by 128 m tiles so they frustum-cull. */
export function buildTrees(kit: Kit, extra: GardenTree[] = []) {
  seed = 4242;
  type T = { x: number; z: number; kind: 0 | 1 | 2 | 3; s: number };
  const trees: T[] = [];
  const tryAdd = (x: number, z: number, kind: T['kind'], s: number, r = 1.6) => {
    if (x < WORLD.minX - 200 || x > WORLD.maxX + 200 || z < WORLD.minZ - 200 || z > WORLD.maxZ + 200) return false;
    if (!kit.occ.free(x - r, x + r, z - r, z + r)) return false;
    kit.occ.markDisc(x, z, r * .7); trees.push({ x, z, kind, s }); return true;
  };
  // Garden trees: if the spot is taken, try the alternatives before giving up.
  for (const { at, kind } of extra) { const s = .8 + rnd() * .4; for (const [x, z] of at) if (tryAdd(x, z, kind as T['kind'], s, 1)) break; }
  for (const a of AREAS) {
    const dens = a.kind === 'forest' ? 1 / 55 : a.kind === 'park' ? 1 / 140 : a.kind === 'cemetery' ? 1 / 90 : a.kind === 'farm' ? 1 / 900 : 0;
    if (!dens) continue;
    const xs = a.points.map(q => q[0]), zs = a.points.map(q => q[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
    const n = Math.min(1600, Math.round(polyArea(a.points) * dens));
    for (let i = 0; i < n * 2; i++) { const x = x0 + rnd() * (x1 - x0), z = z0 + rnd() * (z1 - z0); if (!pointInPolygon(x, z, a.points)) continue; tryAdd(x, z, a.kind === 'cemetery' ? 2 : rnd() < .55 ? 0 : rnd() < .7 ? 1 : 3, .8 + rnd() * .6); }
  }
  // Tivon's oak woodland between streets, thinner in the built-up areas.
  for (let i = 0; i < 40000 && trees.length < 15000; i++) {
    const x = WORLD.minX - 150 + rnd() * (WORLD.maxX - WORLD.minX + 300), z = WORLD.minZ - 150 + rnd() * (WORLD.maxZ - WORLD.minZ + 300);
    if (x > 92 && x < 168 && z > 86 && z < 270 && rnd() < .7) continue;
    const woods = Math.sin(x * .011 + 1) * Math.cos(z * .009);
    if (rnd() > .18 + Math.max(0, woods) * .7) continue;
    tryAdd(x, z, z > 0 ? (rnd() < .5 ? 3 : 0) : rnd() < .55 ? 0 : rnd() < .6 ? 1 : rnd() < .5 ? 2 : 3, .75 + rnd() * .6);
  }
  // Street trees along town streets.
  for (const road of ROADS) {
    if (!VEHICLE.has(road.kind) || road.kind.startsWith('trunk')) continue;
    for (let i = 2; i < road.points.length; i += 3) {
      if (rnd() > .35) continue;
      const [ax, az] = road.points[i - 1], [bx, bz] = road.points[i], dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1, side = rnd() < .5 ? 1 : -1, kind = rnd() < .6 ? 0 : 2, s = .7 + rnd() * .4;
      // Just past the pavement, or a little further into the verge or front garden.
      for (const off of [road.width / 2 + 3.4, road.width / 2 + 5, road.width / 2 + 7]) if (tryAdd(bx + dz / l * side * off, bz - dx / l * side * off, kind, s, 1)) break;
    }
  }
  // Yard trees behind the front gardens, as dense as the street survey found (Tivon's houses sit among trees).
  const yardShare: Record<string, number> = { none: 0, low: .25, medium: .55, high: .9, forest: 1 };
  for (const road of ROADS) {
    if (!VEHICLE.has(road.kind) || road.kind.startsWith('trunk')) continue;
    const share = yardShare[styleFor(road.name).treeDensity] ?? .55;
    for (let i = 1; i < road.points.length; i += 2) for (const side of [1, -1]) {
      if (rnd() > share) continue;
      const [ax, az] = road.points[i - 1], [bx, bz] = road.points[i], dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1, st = styleFor(road.name);
      for (let j = 0; j < 3; j++) { const off = road.width / 2 + 8 + rnd() * 12; if (tryAdd(bx + dz / l * side * off, bz - dx / l * side * off, treeKind(st.species, rnd()), .75 + rnd() * .5, 1.4)) break; }
    }
  }
  const TT = 128, tile = (x: number, z: number) => `${Math.floor(x / TT)},${Math.floor(z / TT)}`;
  const groups = new Map<string, T[]>(); for (const t of trees) { const k = tile(t.x, t.z); let a = groups.get(k); if (!a) { a = []; groups.set(k, a); } a.push(t); }
  const trunkGeo = new THREE.CylinderGeometry(.6, 1, 1, 6), crownGeo = new THREE.IcosahedronGeometry(1, 0), coneGeo = new THREE.SphereGeometry(1, 7, 6);
  const trunkMat = new THREE.MeshStandardMaterial({ color: '#5d4a36', roughness: 1 });
  const crownMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .95, flatShading: true });
  const o = new THREE.Object3D(), col = new THREE.Color();
  groups.forEach((list, key) => {
    const crowns: Array<[THREE.Matrix4, THREE.Color]> = [], trunks: THREE.Matrix4[] = [], conifers: Array<[THREE.Matrix4, THREE.Color]> = [], far: Array<[THREE.Matrix4, THREE.Color]> = [];
    for (const t of list) {
      const y = surfaceHeight(t.x, t.z), s = t.s, lean = (rnd() - .5) * .12;
      if (t.kind === 0) {
        const h = 4.2 * s; o.position.set(t.x, y + h / 2, t.z); o.rotation.set(lean, 0, lean); o.scale.set(.32 * s, h, .32 * s); o.updateMatrix(); trunks.push(o.matrix.clone());
        for (let j = 0; j < 4; j++) { const a = j * 1.6 + rnd(); const rr = j === 3 ? 0 : 1.6 * s; o.position.set(t.x + Math.cos(a) * rr, y + h + (j === 3 ? 1.1 : .3 + rnd() * .8) * s, t.z + Math.sin(a) * rr); o.rotation.set(rnd(), rnd() * 6, rnd()); o.scale.set((1.9 + rnd() * .7) * s, (1.4 + rnd() * .4) * s, (1.9 + rnd() * .7) * s); o.updateMatrix(); crowns.push([o.matrix.clone(), col.set(pick(['#4c6436', '#56703c', '#5f7742', '#4a5f35'])).clone()]); }
      } else if (t.kind === 1) {
        const h = 8.5 * s; o.position.set(t.x, y + h / 2, t.z); o.rotation.set(lean * 2, 0, lean * 2); o.scale.set(.24 * s, h, .24 * s); o.updateMatrix(); trunks.push(o.matrix.clone());
        for (let j = 0; j < 3; j++) { const a = j * 2.1 + rnd(); o.position.set(t.x + Math.cos(a) * 1.5 * s + lean * h, y + h + rnd() * .9, t.z + Math.sin(a) * 1.6 * s + lean * h); o.rotation.set(0, rnd() * 6, 0); o.scale.set(2.4 * s, 1 * s, 2.4 * s); o.updateMatrix(); crowns.push([o.matrix.clone(), col.set(pick(['#3f5638', '#46603d', '#4b5f3a'])).clone()]); }
      } else if (t.kind === 2) {
        const h = 9 * s; o.position.set(t.x, y + 1, t.z); o.rotation.set(0, 0, 0); o.scale.set(.18, 2, .18); o.updateMatrix(); trunks.push(o.matrix.clone());
        o.position.set(t.x, y + h * .55, t.z); o.scale.set(.95 * s, h * .52, .95 * s); o.updateMatrix(); conifers.push([o.matrix.clone(), col.set('#2f4731').clone()]);
      } else {
        const h = 2.2 * s; o.position.set(t.x, y + h / 2, t.z); o.rotation.set(lean * 3, 0, -lean * 3); o.scale.set(.3 * s, h, .3 * s); o.updateMatrix(); trunks.push(o.matrix.clone());
        for (let j = 0; j < 3; j++) { const a = j * 2.1 + rnd(); o.position.set(t.x + Math.cos(a) * 1.1 * s, y + h + .5 + rnd() * .5, t.z + Math.sin(a) * 1.1 * s); o.rotation.set(rnd(), rnd() * 6, rnd()); o.scale.set(1.5 * s, .9 * s, 1.5 * s); o.updateMatrix(); crowns.push([o.matrix.clone(), col.set(pick(['#7f8e6a', '#8a9873', '#76875f'])).clone()]); }
      }
      // One rough crown stands in for the whole tree at a distance.
      const fh = t.kind === 0 ? 5.6 : t.kind === 1 ? 9.2 : t.kind === 2 ? 5 : 3.2, fr = t.kind === 2 ? 1 : t.kind === 3 ? 1.9 : 2.7;
      o.position.set(t.x, y + fh * s, t.z); o.rotation.set(0, rnd() * 6, 0); o.scale.set(fr * s, (t.kind === 2 ? 4.8 : 1.6) * s, fr * s); o.updateMatrix();
      const farGreen = t.kind === 2 ? '#2f4731' : pick(t.kind === 3 ? ['#7f8e6a', '#8a9873', '#76875f'] : t.kind === 1 ? ['#3f5638', '#46603d', '#4b5f3a'] : ['#4c6436', '#56703c', '#5f7742', '#4a5f35']);
      far.push([o.matrix.clone(), col.set(farGreen).clone()]);
      kit.collide(t.x - .3, t.x + .3, t.z - .3, t.z + .3, y, y + 3);
    }
    const tm = new THREE.InstancedMesh(trunkGeo, trunkMat, trunks.length); trunks.forEach((m, i) => tm.setMatrixAt(i, m));
    const cm = new THREE.InstancedMesh(crownGeo, crownMat, Math.max(1, crowns.length)); cm.count = crowns.length; crowns.forEach(([m, c], i) => { cm.setMatrixAt(i, m); cm.setColorAt(i, c); });
    const km = new THREE.InstancedMesh(coneGeo, crownMat, Math.max(1, conifers.length)); km.count = conifers.length; conifers.forEach(([m, c], i) => { km.setMatrixAt(i, m); km.setColorAt(i, c); });
    const fm = new THREE.InstancedMesh(crownGeo, crownMat, far.length); far.forEach(([m, c], i) => { fm.setMatrixAt(i, m); fm.setColorAt(i, c); }); fm.computeBoundingSphere();
    // Full trees up close, single crowns beyond ~200 m from the tile.
    const [ix, iz] = key.split(',').map(Number), cx = (ix + .5) * TT, cz = (iz + .5) * TT;
    const near = new THREE.Group(), distant = new THREE.Group(); near.position.set(-cx, 0, -cz); distant.position.set(-cx, 0, -cz);
    for (const m of [tm, cm, km]) { m.castShadow = true; m.receiveShadow = true; m.computeBoundingSphere(); near.add(m); }
    distant.add(fm);
    const lod = new THREE.LOD(); lod.position.set(cx, 0, cz); lod.addLevel(near, 0); lod.addLevel(distant, 200); lod.name = 'trees'; kit.root.add(lod);
  });
  return trees.length;
}
export type { Footprint };
