import * as THREE from 'three';
import { ROADS, AREAS, DISTRICTS, VEHICLE, landmark, pointInPolygon, type Road, type P2 } from './geo';
import { surfaceHeight } from './terrain';
import { Kit, MAT, NIGHT, Frame } from './kit';
import { ZEID } from './layout';

/** Every OSM way at 1:1: carriageways with kerbs and pavements, footpaths, steps, dirt tracks,
 *  paved pedestrian areas and car parks, plus lamps and street-name plates. */
const LIFT: Record<string, number> = { trunk: .09, trunk_link: .085, motorway: .09, primary: .08, primary_link: .075, secondary: .075, secondary_link: .07, tertiary: .07, tertiary_link: .065, unclassified: .062, residential: .06, living_street: .058, service: .055, pedestrian: .07, footway: .05, steps: .06, cycleway: .05, path: .045, track: .045 };
const inDistrict = (x: number, z: number, pad = 0) => Object.values(DISTRICTS).some(d => Math.hypot(x - d.x, z - d.z) < d.r + pad);

class SegmentGrid {
  private cells = new Map<string, Array<{ road: Road; ax: number; az: number; bx: number; bz: number }>>();
  constructor(roads: Road[], private size = 16) {
    for (const road of roads) for (let i = 1; i < road.points.length; i++) {
      const [ax, az] = road.points[i - 1], [bx, bz] = road.points[i];
      for (let x = Math.floor(Math.min(ax, bx) / size); x <= Math.floor(Math.max(ax, bx) / size); x++)
        for (let z = Math.floor(Math.min(az, bz) / size); z <= Math.floor(Math.max(az, bz) / size); z++) {
          const k = `${x},${z}`; let a = this.cells.get(k); if (!a) { a = []; this.cells.set(k, a); } a.push({ road, ax, az, bx, bz });
        }
    }
  }
  onOtherRoad(x: number, z: number, self: Road, pad: number) {
    const list = this.cells.get(`${Math.floor(x / this.size)},${Math.floor(z / this.size)}`); if (!list) return false;
    for (const s of list) {
      if (s.road === self) continue;
      const vx = s.bx - s.ax, vz = s.bz - s.az, l2 = vx * vx + vz * vz || 1, t = Math.max(0, Math.min(1, ((x - s.ax) * vx + (z - s.az) * vz) / l2));
      if (Math.hypot(x - s.ax - vx * t, z - s.az - vz * t) < s.road.width / 2 + pad) return true;
    }
    return false;
  }
}
function offsetLine(points: P2[], offset: number): P2[] {
  return points.map((p, i) => {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
    const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
    return [p[0] + dz / l * offset, p[1] - dx / l * offset];
  });
}
function ribbon(points: P2[], width: number, lift: number, color: THREE.Color, curbFace = 0, curbColors?: (i: number) => THREE.Color) {
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  const left = offsetLine(points, width / 2), right = offsetLine(points, -width / 2);
  for (let i = 0; i < points.length; i++) {
    for (const [x, z] of [left[i], right[i]]) { pos.push(x, surfaceHeight(x, z) + lift, z); col.push(color.r, color.g, color.b); }
    if (i > 0) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  if (curbFace > 0) {
    const base = pos.length / 3;
    for (let i = 0; i < points.length; i++) {
      const [x, z] = right[i], y = surfaceHeight(x, z) + lift, c = curbColors ? curbColors(i) : color;
      pos.push(x, y, z, x, y - curbFace, z); col.push(c.r, c.g, c.b, c.r * .8, c.g * .8, c.b * .8);
      if (i > 0) { const a = base + (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals(); return g;
}
/** Draped overlay for a polygon area, sampled on a 1.5 m grid (pedestrian paving, car parks). */
/** Ground-hugging overlay of a polygon. With `flatY` it is a level slab (a terrace) built only
 *  from cells wholly inside, so it never drapes down over a retaining wall at its edge. */
function areaOverlay(poly: P2[], color: THREE.Color, lift: number, step = 1.5, flatY?: number) {
  const xs = poly.map(p => p[0]), zs = poly.map(p => p[1]);
  const pos: number[] = [], col: number[] = [];
  for (let x = Math.min(...xs); x < Math.max(...xs); x += step) for (let z = Math.min(...zs); z < Math.max(...zs); z += step) {
    const corners = [[x, z], [x + step, z], [x + step, z + step], [x, z + step]];
    if (flatY === undefined ? !pointInPolygon(x + step / 2, z + step / 2, poly) : !corners.every(([a, b]) => pointInPolygon(a, b, poly))) continue;
    const q = corners.map(([a, b]) => [a, (flatY ?? surfaceHeight(a, b)) + lift, b]);
    for (const i of [0, 3, 1, 1, 3, 2]) { pos.push(...q[i]); col.push(color.r, color.g, color.b); }
  }
  if (!pos.length) return null;
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const idx: number[] = []; for (let i = 0; i < pos.length / 3; i++) idx.push(i); g.setIndex(idx); g.computeVertexNormals(); return g;
}

/** Paved overlay for an authored plaza polygon; pass `flatY` for a level terrace. */
export function paveArea(kit: Kit, poly: P2[], color = '#d2c8b6', lift = .06, flatY?: number) {
  const g = areaOverlay(poly, new THREE.Color(color), lift, flatY === undefined ? 1.2 : .5, flatY); if (!g) return;
  const m = new THREE.Mesh(g, MAT.paving); m.receiveShadow = true; kit.root.add(m); kit.occ.mark(...bbox(poly));
}

const TERRACES = [ZEID.upperPlaza, ZEID.lowerPlaza, ZEID.footprint];

export function buildStreets(kit: Kit) {
  const root = kit.root, grid = new SegmentGrid(ROADS.filter(r => VEHICLE.has(r.kind) || r.kind === 'service'));
  const venues = ['amali', 'mandu', 'computer_shop', 'get_phone'].map(id => landmark(id));
  const asphalt: THREE.BufferGeometry[] = [], walks: THREE.BufferGeometry[] = [], marks: THREE.BufferGeometry[] = [], dirt: THREE.BufferGeometry[] = [], paved: THREE.BufferGeometry[] = [];
  const grey = new THREE.Color('#77766f'), walkC = new THREE.Color('#d9d2c2'), red = new THREE.Color('#b8463a'), white = new THREE.Color('#ece8de'), curbGrey = new THREE.Color('#bdb8ab'), lineC = new THREE.Color('#ecebe4'), yellow = new THREE.Color('#e3c04a'), earth = new THREE.Color('#c9b08a'), pave = new THREE.Color('#cfc6b3');
  for (const road of ROADS) {
    const lift = LIFT[road.kind] ?? .05, hw = road.width / 2, vehicle = VEHICLE.has(road.kind);
    const unpaved = road.kind === 'track' || road.kind === 'path' || /dirt|gravel|ground|unpaved|grass/.test(road.surface);
    for (const [x, z] of road.points) kit.occ.markDisc(x, z, hw + (vehicle ? 2.2 : .6));
    if (!vehicle && road.kind !== 'service') {
      // Footpaths stop at authored terraces (they are paved there, and would drape over retaining walls).
      let run: P2[] = [];
      for (const p of [...road.points, null]) { if (p && !TERRACES.some(t => pointInPolygon(p[0], p[1], t))) { run.push(p); continue; } if (run.length > 1) (unpaved ? dirt : paved).push(ribbon(run, road.width, lift, unpaved ? earth : pave)); run = []; }
      if (road.kind === 'steps') for (let i = 1; i < road.points.length; i++) { const [ax, az] = road.points[i - 1], [bx, bz] = road.points[i]; const n = Math.ceil(Math.hypot(bx - ax, bz - az) / .45); for (let j = 0; j < n; j++) { const t = j / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t; marks.push(ribbon([[x - (bx - ax) / n * .05, z - (bz - az) / n * .05], [x + (bx - ax) / n * .05, z + (bz - az) / n * .05]], road.width, lift + .01, new THREE.Color('#9d968a'))); } }
      continue;
    }
    asphalt.push(ribbon(road.points, road.width, lift, grey.clone().multiplyScalar(.92 + (road.width % 1) * .1)));
    if (road.kind === 'service') continue;
    // Pavements on both sides (one-way carriageways of Route 75 get one, on the outside).
    const walkW = road.kind === 'trunk' || road.kind === 'trunk_link' ? 1.6 : road.kind === 'residential' ? 1.6 : 2.2;
    const sides = road.oneway && road.kind.startsWith('trunk') ? [-1] : [1, -1];
    for (const side of sides) {
      const line = offsetLine(road.points, side * (hw + walkW / 2));
      let run: P2[] = [];
      const flush = () => {
        if (run.length > 1) {
          const mid = run[Math.floor(run.length / 2)], painted = inDistrict(mid[0], mid[1], 10);
          walks.push(ribbon(side === 1 ? run : [...run].reverse(), walkW, lift + .13, walkC, .14, i => painted ? (Math.floor(i * 2) % 2 ? white : red) : curbGrey));
        }
        run = [];
      };
      for (const p of line) { if (grid.onOtherRoad(p[0], p[1], road, walkW / 2 + .2)) flush(); else run.push(p); }
      flush();
    }
    if (road.width >= 6.4) for (let i = 1; i < road.points.length; i += 2) {
      const seg = road.points.slice(i - 1, i + 1);
      if (grid.onOtherRoad(seg[0][0], seg[0][1], road, 1)) continue;
      if (road.kind === 'trunk') { marks.push(ribbon(offsetLine(seg, -hw + .35), .14, lift + .012, yellow)); marks.push(ribbon(offsetLine(seg, hw - .35), .14, lift + .012, lineC)); marks.push(ribbon(seg, .12, lift + .012, lineC)); }
      else marks.push(ribbon(seg, .12, lift + .012, lineC));
    }
    let acc = 0, n = 0;
    for (let i = 1; i < road.points.length; i++) {
      const [ax, az] = road.points[i - 1], [bx, bz] = road.points[i]; acc += Math.hypot(bx - ax, bz - az);
      if (acc < 34) continue; acc = 0; n++;
      const side = sides.length === 1 ? sides[0] : n % 2 ? 1 : -1, dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1;
      const px = bx + dz / l * side * (hw + .5), pz = bz - dx / l * side * (hw + .5);
      if (grid.onOtherRoad(px, pz, road, 1.2) || venues.some(v => Math.hypot(v.x - px, v.z - pz) < 12)) continue;
      streetLamp(kit, px, pz, Math.atan2(-dz / l * side, dx / l * side), inDistrict(px, pz, 30));
    }
    if (road.name && road.points.length > 6) {
      const [ax, az] = road.points[2], [bx, bz] = road.points[3], dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1;
      const px = ax + dz / l * (hw + 1.4), pz = az - dx / l * (hw + 1.4);
      if (!grid.onOtherRoad(px, pz, road, 1)) streetSign(kit, px, pz, Math.atan2(dx, dz) + Math.PI / 2, road.name, road.en);
    }
  }
  for (const a of AREAS) {
    if (a.kind === 'pedestrian') { const g = areaOverlay(a.points, pave, .06); if (g) paved.push(g); kit.occ.mark(...bbox(a.points)); }
    else if (a.kind === 'parking') { const g = areaOverlay(a.points, new THREE.Color('#6f6e68'), .05, 2); if (g) asphalt.push(g); kit.occ.mark(...bbox(a.points)); }
  }
  const add = (geos: THREE.BufferGeometry[], material: THREE.Material) => {
    const bands = new Map<number, THREE.BufferGeometry[]>();
    for (const g of geos) { g.computeBoundingBox(); const k = Math.floor(g.boundingBox!.min.z / 320) * 100 + Math.floor(g.boundingBox!.min.x / 320); let a = bands.get(k); if (!a) { a = []; bands.set(k, a); } a.push(g); }
    bands.forEach(list => { const m = new THREE.Mesh(mergeAll(list), material); m.receiveShadow = true; root.add(m); });
  };
  add(asphalt, MAT.asphalt); add(walks, MAT.paving); add(paved, MAT.paving); add(marks, MAT.matte); add(dirt, MAT.soil);
  crosswalks(kit, grid);
}
const bbox = (p: P2[]): [number, number, number, number] => [Math.min(...p.map(q => q[0])), Math.max(...p.map(q => q[0])), Math.min(...p.map(q => q[1])), Math.max(...p.map(q => q[1]))];

function mergeAll(list: THREE.BufferGeometry[]) {
  let v = 0, ix = 0; for (const g of list) { v += g.attributes.position.count; ix += g.index!.count; }
  const pos = new Float32Array(v * 3), nor = new Float32Array(v * 3), col = new Float32Array(v * 3), idx = new Uint32Array(ix);
  let vo = 0, io = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array as Float32Array, vo * 3); nor.set(g.attributes.normal.array as Float32Array, vo * 3); col.set(g.attributes.color.array as Float32Array, vo * 3);
    const src = g.index!.array; for (let i = 0; i < src.length; i++) idx[io++] = src[i] + vo; vo += g.attributes.position.count; g.dispose();
  }
  const m = new THREE.BufferGeometry(); m.setAttribute('position', new THREE.BufferAttribute(pos, 3)); m.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); m.setAttribute('color', new THREE.BufferAttribute(col, 3)); m.setIndex(new THREE.BufferAttribute(idx, 1)); m.computeBoundingSphere();
  return m;
}

const kitBox = new THREE.BoxGeometry(1, 1, 1);
export function streetLamp(kit: Kit, x: number, z: number, faceRot: number, lit: boolean) {
  const y = surfaceHeight(x, z), B = kit.B;
  B.cyl(MAT.metal, x, y + 3, z, .07, 6, '#3c4440'); B.cyl(MAT.metal, x, y + .25, z, .14, .5, '#3c4440');
  const ax = x + Math.sin(faceRot) * .9, az = z + Math.cos(faceRot) * .9;
  B.place(kitBox, MAT.metal, (x + ax) / 2, y + 5.95, (z + az) / 2, .06, .06, 1.9, faceRot, '#3c4440');
  B.place(kitBox, MAT.metal, ax, y + 5.85, az, .32, .12, .55, faceRot, '#2d3330');
  const bulb = new THREE.Mesh(kitBox, NIGHT.bulb); bulb.position.set(ax, y + 5.78, az); bulb.rotation.y = faceRot; bulb.scale.set(.26, .03, .45); kit.root.add(bulb);
  if (lit) kit.light(ax, y + 5.6, az, '#ffd49b', 18, 20);
}
export function streetSign(kit: Kit, x: number, z: number, rot: number, he: string, en: string) {
  const y = surfaceHeight(x, z);
  kit.B.cyl(MAT.metal, x, y + 1.3, z, .035, 2.6, '#6c706c');
  kit.sign(null, x, y + 2.5, z, 1.25, .36, he, { bg: '#f4f1e8', fg: '#20365a', sub: en || undefined, border: true, weight: 700 }, rot);
}
function crosswalks(kit: Kit, grid: SegmentGrid) {
  for (const road of ROADS) {
    if (!VEHICLE.has(road.kind) || road.points.length < 6) continue;
    for (const end of [2, road.points.length - 3]) {
      const [x, z] = road.points[end]; if (!inDistrict(x, z, 40)) continue;
      const [bx, bz] = road.points[end + 1], rot = Math.atan2(bx - x, bz - z);
      if (grid.onOtherRoad(x, z, road, .5)) continue;
      const f = new Frame(x, z, rot);
      for (let s = -road.width / 2 + .45; s < road.width / 2 - .3; s += .9) kit.B.lbox(f, MAT.matte, s, (LIFT[road.kind] ?? .05) + .012, 0, .5, .015, 2.6, '#efece2', false);
    }
  }
}
