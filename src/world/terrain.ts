import * as THREE from 'three';
import { AREAS, WORLD, elevation, pointInPolygon, type P2 } from './geo';
import { worldMaterial } from './materials';
import { STATIC_PADS } from './layout';
import { CAVE_PLAN, CAVE_FACADE as FACE, CAVE_COURT as COURT } from './Caves';

/** Real relief from the DEM (AWS Terrain Tiles, ~30 m source resampled to ~6 m), with game
 *  y = 0 at the Beit She'arim catacomb courtyard. Flat pads are authored where the town is
 *  terraced (plazas, building platforms); the fictional cave plan stays under a covering hill. */
const sstep = (e0: number, e1: number, x: number) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
export const BASE = elevation(126, 84);

export interface Pad { poly: P2[]; y: number; blend: number; box?: [number, number, number, number] }
/** Terraces registered by districts before the terrain mesh is built (plazas, stairs landings). */
export const PADS: Pad[] = [...STATIC_PADS];
export function addPad(poly: P2[], y: number, blend = 3) { PADS.push({ poly, y, blend }); padsBox = null; }
function distToPoly(x: number, z: number, p: P2[]) {
  let d = Infinity;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [ax, az] = p[j], [bx, bz] = p[i], vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / l2)); d = Math.min(d, Math.hypot(x - ax - vx * t, z - az - vz * t));
  }
  return d;
}
function padBox(pad: Pad) {
  if (!pad.box) { const xs = pad.poly.map(q => q[0]), zs = pad.poly.map(q => q[1]); pad.box = [Math.min(...xs) - pad.blend, Math.max(...xs) + pad.blend, Math.min(...zs) - pad.blend, Math.max(...zs) + pad.blend]; }
  return pad.box;
}
let padsBox: [number, number, number, number] | null = null;
function padsAt(x: number, z: number, h: number) {
  if (!padsBox) { padsBox = [Infinity, -Infinity, Infinity, -Infinity]; for (const p of PADS) { const b = padBox(p); padsBox = [Math.min(padsBox[0], b[0]), Math.max(padsBox[1], b[1]), Math.min(padsBox[2], b[2]), Math.max(padsBox[3], b[3])]; } }
  if (x < padsBox[0] || x > padsBox[1] || z < padsBox[2] || z > padsBox[3]) return h;
  for (const pad of PADS) {
    const b = padBox(pad); if (x < b[0] || x > b[1] || z < b[2] || z > b[3]) continue;
    const inside = pointInPolygon(x, z, pad.poly);
    if (inside) return pad.y;
    if (pad.blend > 0) { const d = distToPoly(x, z, pad.poly); if (d < pad.blend) h += (pad.y - h) * (1 - sstep(0, pad.blend, d)); }
  }
  return h;
}

// ——— The fictional catacomb (floor y = 0) under the real hill ———
// A height field cannot overhang, so it is kept off the plan: over every cave space and 8.5 m
// around it (a whole 8 m mesh cell, so the interpolated mesh cannot sag through a ceiling) the
// ground stays COVER m up, fading out over 9 m. The cover stops at the carved façade, and the
// courtyard in front of it is sunk just below its paving.
const COVER = 9.4; // above every ceiling slab (7.5 m at most); meets the façade's cornice (9.1–9.6 m)
const FACE_Z = (FACE.front + FACE.back) / 2;
type Rect = readonly [number, number, number, number];
const CAVE_RECTS: Rect[] = [...CAVE_PLAN.map(([x0, x1, z0, z1]): Rect => [x0 - 1, x1 + 1, z0 - 1, z1 + 1]), [101, 161, 109, 261]]; // cells, and the hull of the body
const rectDist = (x: number, z: number, [x0, x1, z0, z1]: Rect) => Math.max(x0 - x, x - x1, z0 - z, z - z1, 0);
function caveGround(x: number, z: number, h: number) {
  const pit = 1 - sstep(2.5, 8.5, rectDist(x, z, [COURT.x0, COURT.x1, COURT.z0, COURT.z1]));
  if (pit > 0 && h > -.15) h += (-.15 - h) * pit;
  let d = Infinity; for (const r of CAVE_RECTS) d = Math.min(d, rectDist(x, z, r));
  let cover = 1 - sstep(8.5, 17.5, d);
  // Before the façade line: nothing across its span (the stone face is the cliff), a short fade beside it.
  if (z < FACE_Z) cover *= x >= FACE.x0 && x <= FACE.x1 ? 0 : 1 - sstep(0, 6, FACE_Z - z);
  return Math.max(h, COVER * cover);
}

export function surfaceHeight(x: number, z: number): number {
  let h = elevation(x, z) - BASE;
  if (x > 80 && x < 184 && z > 64 && z < 280) h = caveGround(x, z, h);
  return PADS.length ? padsAt(x, z, h) : h;
}

const AREA_COLOR: Record<string, string> = { forest: '#4f6339', park: '#7c9150', pitch: '#6f9a48', playground: '#c4ad7c', school: '#b8a879', parking: '#7d7c76', cemetery: '#7f8a62', farm: '#a99d62', heritage: '#b3a173', pool: '#8fb0a6', pedestrian: '#cfc6b4' };
export function buildTerrain(scene: THREE.Scene) {
  const pad = 320, minX = WORLD.minX - pad, maxX = WORLD.maxX + pad, minZ = WORLD.minZ - pad, maxZ = WORLD.maxZ + pad;
  const step = 8, TILE = 320;
  const nearPad = PADS.map(pad => { const xs = pad.poly.map(q => q[0]), zs = pad.poly.map(q => q[1]); return [Math.min(...xs) - 8, Math.max(...xs) + 8, Math.min(...zs) - 8, Math.max(...zs) + 8]; });
  const dry = new THREE.Color('#aba46e'), green = new THREE.Color('#6d8247'), wood = new THREE.Color('#566b3e');
  const boxed = AREAS.filter(a => AREA_COLOR[a.kind] && a.kind !== 'pedestrian').map(a => {
    const xs = a.points.map(q => q[0]), zs = a.points.map(q => q[1]);
    return { a, x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs), c: new THREE.Color(AREA_COLOR[a.kind]) };
  });
  // Bucket the land-use polygons on a 64 m grid so each vertex only tests nearby ones.
  const grid = new Map<number, typeof boxed>();
  for (const bx of boxed) for (let gx = Math.floor(bx.x0 / 64); gx <= Math.floor(bx.x1 / 64); gx++) for (let gz = Math.floor(bx.z0 / 64); gz <= Math.floor(bx.z1 / 64); gz++) { const k = (gx + 200) * 1000 + gz + 200; let a = grid.get(k); if (!a) { a = []; grid.set(k, a); } a.push(bx); }
  const c = new THREE.Color(), n3 = new THREE.Vector3();
  const mat = worldMaterial('grass', { vertexColors: true, roughness: 1, scale: 6, strength: .8 });
  const ground = new THREE.Group(); ground.name = 'terrain'; scene.add(ground);
  // The carved façade is a cliff the 8 m grid cannot follow: the rows either side of it are pulled
  // onto its front and back faces and the strip between them (inside the stone, under the cornice)
  // is left out, so no grass ramps over the courtyard or through the doorway.
  const faceRow = (x: number, z: number) => x < FACE.x0 - step || x > FACE.x1 + step || Math.abs(z - FACE_Z) >= step ? 0 : z <= FACE_Z ? -1 : 1;
  // Tiles so the camera's frustum and draw distance can skip the parts out of view; normals come
  // from the height field itself, so tile edges meet without seams.
  for (let tx = minX; tx < maxX; tx += TILE) for (let tz = minZ; tz < maxZ; tz += TILE) {
    const W = Math.min(TILE, maxX - tx), D = Math.min(TILE, maxZ - tz);
    const geo = new THREE.PlaneGeometry(W, D, Math.max(1, Math.round(W / step)), Math.max(1, Math.round(D / step)));
    geo.rotateX(-Math.PI / 2); geo.translate(tx + W / 2, 0, tz + D / 2);
    const p = geo.attributes.position, nrm = geo.attributes.normal, colors = new Float32Array(p.count * 3), inStone = new Uint8Array(p.count);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), row = faceRow(x, p.getZ(i)), z = row < 0 ? FACE.front + .05 : row > 0 ? FACE.back - .05 : p.getZ(i);
      if (row) { p.setZ(i, z); if (x >= FACE.x0 && x <= FACE.x1) inStone[i] = 1; }
      let y = surfaceHeight(x, z);
      // At a terrace's retaining wall the 8 m mesh would bridge the two levels and poke grass
      // through the lower paving; keep such vertices at the lower level (the wall hides the step).
      if (nearPad.some(b => x > b[0] && x < b[1] && z > b[2] && z < b[3])) {
        let lo = y, hi = y; for (const [dx, dz] of [[-4, 0], [4, 0], [0, -4], [0, 4]]) { const h = surfaceHeight(x + dx, z + dz); lo = Math.min(lo, h); hi = Math.max(hi, h); }
        if (hi - lo > 2) y = lo;
      }
      p.setY(i, y - .08);
      const za = row > 0 ? z : z - step, zb = row < 0 ? z : z + step; // one-sided across the façade
      n3.set(surfaceHeight(x - step, z) - surfaceHeight(x + step, z), 2 * step, (surfaceHeight(x, za) - surfaceHeight(x, zb)) * 2 * step / (zb - za)).normalize(); nrm.setXYZ(i, n3.x, n3.y, n3.z);
      const n = (Math.sin(x * .071) * Math.cos(z * .063) + Math.sin((x + z) * .021)) * .5 + .5;
      c.copy(dry).lerp(green, .3 + n * .55);
      const woods = Math.max(0, Math.sin(x * .011 + 1) * Math.cos(z * .009) - .2); c.lerp(wood, Math.min(1, woods * 1.4));
      for (const b of grid.get((Math.floor(x / 64) + 200) * 1000 + Math.floor(z / 64) + 200) ?? []) if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1 && pointInPolygon(x, z, b.a.points)) { c.lerp(b.c, .8); break; }
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    if (inStone.includes(1)) { const idx = geo.index!, keep: number[] = []; for (let t = 0; t < idx.count; t += 3) { const a = idx.getX(t), b = idx.getX(t + 1), d = idx.getX(t + 2); if (!(inStone[a] && inStone[b] && inStone[d])) keep.push(a, b, d); } geo.setIndex(keep); }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeBoundingSphere(); geo.computeBoundingBox();
    const tile = new THREE.Mesh(geo, mat); tile.receiveShadow = true; tile.name = 'terrain'; ground.add(tile);
  }
  // The Carmel ridge to the west and the Nazareth hills across the Jezreel Valley to the east.
  const ridgeMat = new THREE.MeshStandardMaterial({ color: '#6f8070', roughness: 1 });
  const far = new THREE.MeshStandardMaterial({ color: '#8d9aa0', roughness: 1 });
  const hill = new THREE.SphereGeometry(1, 20, 10);
  for (let i = 0; i < 12; i++) { const m = new THREE.Mesh(hill, ridgeMat); m.position.set(minX - 500 + Math.sin(i * 1.7) * 120, 20, minZ - 200 + i * 360); m.scale.set(520, 160 + (i % 4) * 40, 380); scene.add(m); }
  for (let i = 0; i < 10; i++) { const m = new THREE.Mesh(hill, far); m.position.set(maxX + 2600 + Math.sin(i) * 300, -40, minZ + i * 450); m.scale.set(700, 260 + (i % 3) * 60, 520); scene.add(m); }
}
