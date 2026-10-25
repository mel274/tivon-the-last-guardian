import * as THREE from 'three';
import { MAT, NIGHT, Frame, PRIMS, SHIRTS, PANTS, type Kit, type Batcher, type SignStyle } from './kit';
import type { LocalText } from './types';

/** Walk-in shop kit: a shell (floor, ceiling, walls, glazed front with a real doorway, signboard,
 *  one light, counter and keeper) furnished by an interior set. Everything static is batched; only
 *  canvas signs, painted logos and people are their own meshes. Furniture that a person could not
 *  walk through gets a collider, except inside the reserved aisle from the door to the keeper.
 *  Shop names and staff are game approximations; staff and dialogue are fictional. */
export interface Rect { lx: number; lz: number; w: number; d: number }
export interface CounterSpec { lx: number; lz: number; w: number; d?: number; h?: number; color: string; top?: string; mat?: THREE.Material }
export interface KeeperLook { shirt: string; pants?: string; apron?: string; dress?: boolean; gray?: boolean; beard?: boolean }
export interface InteriorSet {
  name: string; he: string; en: string;
  /** Suggested inner width and depth in metres; sets adapt to other sizes and drop what does not fit. */
  size: [number, number];
  floor: string; floorMat?: THREE.Material; wall: string; ceiling?: string; light?: string;
  sign: { bg: string; fg: string };
  look?: KeeperLook;
  counter?(r: Room): CounterSpec | null;
  /** Keeper spot [lx, lz] and optionally the customer's spot [sx, sz]; default: behind the counter. */
  keeper?(r: Room): [number, number] | [number, number, number, number];
  noKeeper?: boolean;
  /** Ceiling spotlights instead of the default flat panels. */
  spots?: boolean;
  /** Custom outside signboard (centre lx, y, lz on the façade, board size w×h). */
  signboard?(r: Room, lx: number, y: number, lz: number, w: number, h: number): void;
  furnish(r: Room): void;
}
export interface WalkInOptions {
  w: number; d: number; h?: number;
  door: { lx: number; width?: number };
  sign: { he: string; en?: string; bg: string; fg: string; lx?: number; y?: number; w?: number } | null;
  keeper?: { id: string; label: LocalText; shirt?: string; lx?: number; lz?: number } | null;
  set: InteriorSet;
  front: 'glass' | 'wall';
  /** Walls a neighbour or the host building already provides (skipped here). */
  shared?: { left?: boolean; right?: boolean; back?: boolean };
  ceiling?: boolean; light?: boolean;
}

const HALF = Math.PI / 2;
const RED_LAMP = new THREE.MeshStandardMaterial({ color: '#ff3a24', emissive: '#ff1a0a', emissiveIntensity: 1.4, roughness: .4 });
const MIRROR = new THREE.MeshStandardMaterial({ color: '#c9d4d8', roughness: .06, metalness: .9 });
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
const overlap = (a: Rect, lx: number, lz: number, w: number, d: number) => Math.abs(lx - a.lx) < (w + a.w) / 2 - .001 && Math.abs(lz - a.lz) < (d + a.d) / 2 - .001;

/** Interior layout helpers in the shop's frame (origin front-centre at floor level, +z to the street). */
export class Room {
  readonly B: Batcher; readonly x0: number; readonly x1: number; readonly zb: number; readonly zf = -.24;
  readonly aisle: Rect[] = []; readonly keep: Rect[] = [];
  counter: { lx: number; lz: number; w: number; d: number; h: number } | null = null;
  keeperAt: [number, number] | null = null; stand: [number, number] = [0, -1];
  constructor(readonly kit: Kit, readonly f: Frame, readonly w: number, readonly d: number, readonly h: number, readonly door: { lx: number; width: number }, readonly wall: string, readonly id: string) {
    this.B = kit.B; this.x0 = -w / 2 + .2; this.x1 = w / 2 - .2; this.zb = -d + .2;
  }
  rand(i: number) { const x = Math.sin((i + 1) * 12.9898 + (hash(this.id) % 1000) * 78.233) * 43758.5453; return x - Math.floor(x); }
  /** A footprint lies inside the room and clear of the aisle and of furniture already placed. */
  fits(lx: number, lz: number, w: number, d: number) {
    return lx - w / 2 >= this.x0 - .01 && lx + w / 2 <= this.x1 + .01 && lz - d / 2 >= this.zb - .01 && lz + d / 2 <= this.zf + .01
      && !this.aisle.some(a => overlap(a, lx, lz, w, d)) && !this.keep.some(a => overlap(a, lx, lz, w, d));
  }
  reserve(lx: number, lz: number, w: number, d: number) { this.keep.push({ lx, lz, w, d }); }
  /** Keep a 1.4 m walkway from the doorway to (sx, sz): straight in, then sideways. */
  path(sx: number, sz: number) {
    const dx = this.door.lx; this.aisle.push({ lx: dx, lz: (.5 + sz - .7) / 2, w: 1.4, d: .5 - sz + .7 }, { lx: (dx + sx) / 2, lz: sz, w: Math.abs(sx - dx) + 1.4, d: 1.4 });
  }
  /** A sub-frame for rotated furniture. */
  at(lx: number, lz: number, rot = 0) { const [x, z] = this.f.at(lx, lz); return new Frame(x, z, this.f.rot + rot, this.f.y); }
  box(lx: number, y: number, lz: number, w: number, h: number, d: number, c: string, m: THREE.Material = MAT.plain, shadow = false) { this.B.lbox(this.f, m, lx, y, lz, w, h, d, c, shadow); }
  hit(lx: number, lz: number, w: number, d: number, h = 1.2) { this.kit.lcollide(this.f, lx, h / 2, lz, w, h, d); }
  /** Drawn, collidable and reserved; skipped (returns false) where it would block the aisle. */
  solid(lx: number, y: number, lz: number, w: number, h: number, d: number, c: string, m: THREE.Material = MAT.plain) {
    if (!this.fits(lx, lz, w, d)) return false;
    this.box(lx, y, lz, w, h, d, c, m, true); this.hit(lx, lz, w, d, y + h / 2); this.reserve(lx, lz, w, d); return true;
  }
  /** Claim a footprint: collider plus reservation. */
  claim(lx: number, lz: number, w: number, d: number, h = 1.2) { if (!this.fits(lx, lz, w, d)) return false; this.hit(lx, lz, w, d, h); this.reserve(lx, lz, w, d); return true; }
  prim(geo: THREE.BufferGeometry, m: THREE.Material, lx: number, y: number, lz: number, sx: number, sy: number, sz: number, c: string | null, rot = 0, rx = 0, rz = 0) {
    const [x, z] = this.f.at(lx, lz); this.B.place(geo, m, x, this.f.y + y, z, sx, sy, sz, this.f.rot + rot, c, false, rx, rz);
  }
  cyl(lx: number, y: number, lz: number, r: number, h: number, c: string, m: THREE.Material = MAT.plain, six = false) { this.prim(six ? PRIMS.cyl6 : PRIMS.cyl, m, lx, y, lz, r, h, r, c); }
  /** Cylinder lying along local x ('x') or z ('z'). */
  bar(lx: number, y: number, lz: number, r: number, len: number, along: 'x' | 'z', c: string, m: THREE.Material = MAT.metal, six = true) { this.prim(six ? PRIMS.cyl6 : PRIMS.cyl, m, lx, y, lz, r, len, r, c, 0, along === 'z' ? HALF : 0, along === 'x' ? HALF : 0); }
  glass(lx: number, y: number, lz: number, w: number, h: number, d: number) { this.prim(PRIMS.box, NIGHT.shopWindow, lx, y, lz, w, h, d, null); }
  glow(lx: number, y: number, lz: number, w: number, h: number, d: number) { this.prim(PRIMS.box, NIGHT.bulb, lx, y, lz, w, h, d, null); }
  sign(lx: number, y: number, lz: number, w: number, h: number, text: string, s: SignStyle, face = 0) { return this.kit.sign(this.f, lx, y, lz, w, h, text, s, face); }
  paint(lx: number, y: number, lz: number, w: number, h: number, draw: (c: CanvasRenderingContext2D, W: number, H: number) => void, face = 0) { return this.kit.painted(this.f, lx, y, lz, w, h, draw, face); }
  person(lx: number, lz: number, o: { shirt: string; pants: string; seed: number; angle?: number; seated?: boolean; gray?: boolean; apron?: string; beard?: boolean; dress?: boolean }) { return this.kit.person(this.f, lx, lz, o); }
  /** A standing extra at the first free spot among candidates (people have no colliders). */
  extra(spots: Array<[number, number]>, o: { shirt: string; pants: string; seed: number; angle?: number; apron?: string; gray?: boolean }) {
    const p = spots.find(([x, z]) => this.fits(x, z, .5, .5)); if (!p) return null; this.reserve(p[0], p[1], .5, .5); return this.person(p[0], p[1], o);
  }
  /** First candidate spot where a footprint fits. */
  first(spots: Array<[number, number]>, w: number, d: number) { return spots.find(([x, z]) => this.fits(x, z, w, d)) ?? null; }
  plant(lx: number, y: number, lz: number, size = 1, pot = '#a2643f') { const [x, z] = this.f.at(lx, lz); this.kit.plant(x, this.f.y + y, z, size, pot); }
  bottle(lx: number, y: number, lz: number, c: string) { const [x, z] = this.f.at(lx, lz); this.kit.bottle(x, this.f.y + y, z, c); }
  /** Faces of the side walls: sign rotation that faces into the room from the left (+x) or right (−x) wall. */
  get faceL() { return HALF; }
  get faceR() { return -HALF; }
  /** Greedy packing of footprints (w×d plus `gap`) into a region, front rows first. */
  pack(x0: number, x1: number, z0: number, z1: number, w: number, d: number, max: number, fn: (lx: number, lz: number) => void, gap = .3) {
    let n = 0;
    for (let z = z1 - d / 2; z >= z0 + d / 2 - .001 && n < max; z -= .25) for (let x = x0 + w / 2; x <= x1 - w / 2 + .001 && n < max; x += .25) {
      if (!this.fits(x, z, w, d) || !this.edgeOK(x, z, w, d, gap)) continue;
      fn(x, z); this.reserve(x, z, w + gap * .5, d + gap * .5); n++;
    }
    return n;
  }
  /** Gap rule relaxed against the room walls (furniture may stand flush to a wall). */
  private edgeOK(x: number, z: number, w: number, d: number, gap: number) {
    const others = [...this.aisle, ...this.keep];
    return !others.some(a => overlap(a, x, z, w + gap, d + gap));
  }
  /** Split a wall run into segments of about `seg` metres and build those that fit. side: 'L' | 'R' along z, 'B' along x. */
  run(side: 'L' | 'R' | 'B', from: number, to: number, dep: number, seg: number, fn: (lx: number, lz: number, len: number) => void) {
    const n = Math.max(1, Math.round((to - from) / seg)), len = (to - from) / n;
    for (let i = 0; i < n; i++) {
      const m = from + (i + .5) * len;
      const [lx, lz, w, d] = side === 'B' ? [m, this.zb + dep / 2, len - .04, dep] : [side === 'L' ? this.x0 + dep / 2 : this.x1 - dep / 2, m, dep, len - .04];
      if (!this.fits(lx, lz, w, d)) continue;
      fn(lx, lz, len - .04); this.hit(lx, lz, w, d, 1.6); this.reserve(lx, lz, w, d);
    }
  }
  /** Open shelving (no collider of its own; `run`/`claim` add it). Runs along x or z, optionally two-sided. */
  shelves(lx: number, lz: number, len: number, dep: number, hgt: number, levels: number, along: 'x' | 'z', item: (i: number, k: number) => string | null, o: { frame?: string; board?: string; pitch?: number; shape?: 'box' | 'can' | 'book' | 'bottle' | 'bag'; ih?: number; two?: boolean; back?: string; face?: 1 | -1 } = {}) {
    const fr = o.frame ?? '#6f777a', bd = o.board ?? '#d9dadb', pitch = o.pitch ?? .28, gap = (hgt - .15) / levels;
    const X = (u: number, v: number): [number, number] => along === 'x' ? [lx + u, lz + v] : [lx + v, lz + u];
    const dims = (a: number, b: number): [number, number] => along === 'x' ? [a, b] : [b, a];
    for (const e of [-1, 1]) { const [x, z] = X(e * (len / 2 - .02), 0), [w, d] = dims(.04, dep); this.box(x, hgt / 2, z, w, hgt, d, fr, MAT.metal); }
    if (o.back) { const face = o.face ?? 1, [x, z] = X(0, o.two ? 0 : -face * (dep / 2 - .01)), [w, d] = dims(len, .02); this.box(x, hgt / 2, z, w, hgt, d, o.back); }
    const n = Math.max(1, Math.floor((len - .1) / pitch)), sides = o.two ? [-1, 1] : [o.face ?? 1];
    for (let k = 0; k < levels; k++) {
      const y = .1 + k * gap, [w, d] = dims(len, dep); this.box(lx, y, lz, w, .03, d, bd, MAT.plain, false);
      const ih = Math.min(o.ih ?? gap * .7, gap - .06);
      for (const s of sides) for (let i = 0; i < n; i++) {
        const c = item(i + (s > 0 ? 0 : 97), k); if (!c) continue;
        const u = -len / 2 + .05 + (i + .5) * (len - .1) / n, v = o.two ? s * dep / 4 : s * .02, [x, z] = X(u, v), it = pitch * .8, id = (o.two ? dep / 2 : dep) * .75;
        switch (o.shape ?? 'box') {
          case 'can': { const r = Math.min(it, id) / 2; this.prim(PRIMS.cyl6, MAT.gloss, x, y + ih / 2 + .015, z, r, ih, r, c); if (i % 4 === 0) this.prim(PRIMS.box, MAT.metal, x, y + ih + .02, z, r * 1.2, .012, r * 1.2, '#c9cbcc'); break; }
          case 'bottle': { const r = Math.min(it, id) / 3; this.prim(PRIMS.cyl6, MAT.gloss, x, y + ih * .38 + .015, z, r, ih * .75, r, c); this.prim(PRIMS.cyl6, MAT.gloss, x, y + ih * .85, z, r * .4, ih * .25, r * .4, c); break; }
          case 'book': { const [bw, bdp] = dims(it * .9, id); this.box(x, y + ih * (.8 + this.rand(i * 7 + k) * .2) / 2 + .015, z, bw, ih * (.8 + this.rand(i * 7 + k) * .2), bdp, c, MAT.plain); break; }
          case 'bag': { const [bw, bdp] = dims(it, id * .5); this.box(x, y + ih / 2 + .015, z, bw, ih, bdp, c, MAT.gloss); break; }
          default: { const [bw, bdp] = dims(it, id); this.box(x, y + ih / 2 + .015, z, bw, ih, bdp, c, MAT.plain); }
        }
      }
    }
    const [w, d] = dims(len, dep); this.box(lx, hgt, lz, w, .04, d, fr, MAT.metal);
  }
  /** Glass display case on a cabinet; `fill` gets item spots on the inner shelf. */
  vitrine(lx: number, lz: number, w: number, d: number, h: number, base: string, fill: (x: number, y: number, z: number, i: number) => void, step = .22, solid = true, y0 = 0) {
    if (solid && !this.fits(lx, lz, w, d)) return false;
    const hb = y0 + h - .42;
    if (h > .5) this.box(lx, (y0 + hb) / 2, lz, w, hb - y0, d, base, MAT.gloss, true);
    this.box(lx, hb + .01, lz, w, .02, d, '#efece6');
    this.glass(lx, hb + .21, lz, w - .02, .4, d - .02); this.box(lx, h, lz, w + .02, .02, d + .02, '#b9bcbd', MAT.metal);
    this.glow(lx, h - .03, lz, w - .1, .015, .04);
    const nx = Math.max(1, Math.floor((w - .1) / step)), nz = Math.max(1, Math.floor((d - .1) / step));
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) fill(lx - w / 2 + .05 + (i + .5) * (w - .1) / nx, hb + .02, lz - d / 2 + .05 + (j + .5) * (d - .1) / nz, i * 31 + j);
    if (solid) { this.hit(lx, lz, w, d, y0 + h); this.reserve(lx, lz, w, d); }
    return true;
  }
  /** Café table with two or four chairs (collider over the whole set). */
  table(lx: number, lz: number, o: { seats?: 2 | 4; top?: string; chair?: string; plastic?: boolean; size?: number; round?: boolean; plate?: boolean; diner?: number } = {}) {
    const s = o.size ?? .7, four = o.seats === 4;
    this.kit.table(this.f, lx, lz, { square: o.round ? undefined : s, r: o.round ? s / 2 : undefined, top: o.top ?? '#f1efe8', cups: 1, plate: o.plate });
    const seats: Array<[number, number, number]> = [[-.62, 0, HALF], [.62, 0, -HALF]]; if (four) seats.push([0, -.62, 0], [0, .62, Math.PI]);
    for (const [dx, dz, a] of seats) this.kit.chair(this.f, lx + dx, lz + dz, a, o.chair ?? '#f1efe8', 0, o.plastic ?? true);
    if (o.diner !== undefined) this.person(lx - .64, lz, { shirt: SHIRTS[o.diner % SHIRTS.length], pants: PANTS[o.diner % PANTS.length], seed: o.diner, seated: true, angle: HALF });
    this.hit(lx, lz, 1.5, four ? 1.5 : .8, .95);
  }
  /** Picture frame flat on a wall: side 'L' | 'R' | 'B'; `u` runs along the wall. */
  picture(side: 'L' | 'R' | 'B', u: number, y: number, w: number, h: number, top: string, bottom: string, frame = '#1d1d1d') {
    const t = .03, P = (o: number): [number, number] => side === 'B' ? [u, this.zb + o] : [side === 'L' ? this.x0 + o : this.x1 - o, u];
    const D = (a: number, b: number): [number, number, number] => side === 'B' ? [a, b, t] : [t, b, a];
    { const [x, z] = P(.015), [a, b, c] = D(w, h); this.box(x, y, z, a, b, c, frame); }
    { const [x, z] = P(.035), [a, b, c] = D(w - .06, (h - .06) * .55); this.box(x, y + (h - .06) * .225, z, a, b, c, top); }
    { const [x, z] = P(.035), [a, b, c] = D(w - .06, (h - .06) * .45); this.box(x, y - (h - .06) * .275, z, a, b, c, bottom); }
  }
  /** Hanging pendant lamp, batched (bulb uses the night-glow material). */
  pendant(lx: number, lz: number, drop = .8, shade = '#1f1f1d') {
    const top = this.h; this.cyl(lx, top - drop / 2, lz, .006, drop, '#222', MAT.metal, true);
    this.prim(PRIMS.cone, MAT.metal, lx, top - drop - .08, lz, .17, .18, .17, shade); this.prim(PRIMS.box, NIGHT.bulb, lx, top - drop - .17, lz, .08, .05, .08, null);
  }
  /** Flat ceiling light panels. */
  panels() {
    const nx = Math.max(1, Math.round(this.w / 3)), nz = Math.max(1, Math.round(this.d / 3));
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) { const x = -this.w / 2 + (i + .5) * this.w / nx, z = -this.d + (j + .5) * this.d / nz; this.box(x, this.h - .012, z, .62, .02, .62, '#e4e4de', MAT.metal); this.glow(x, this.h - .026, z, .56, .01, .56); }
  }
  /** Recessed ceiling spotlights. */
  spots(step = 1.6) {
    for (let x = this.x0 + step / 2; x < this.x1; x += step) for (let z = this.zb + step / 2; z < this.zf; z += step) { this.cyl(x, this.h - .02, z, .07, .03, '#d9d9d6', MAT.metal, true); this.prim(PRIMS.cyl6, NIGHT.bulb, x, this.h - .04, z, .05, .01, .05, null); }
  }
}

function shopFront(r: Room, kind: 'glass' | 'wall') {
  const { w, h, kit, f } = r, dw = r.door.width, dl = r.door.lx - dw / 2, dr = r.door.lx + dw / 2, hd = Math.min(2.3, h - .35), Z = -.08, fr = '#2d3532';
  for (const [a, b] of [[-w / 2, dl], [dr, w / 2]]) {
    if (b - a < .04) continue;
    const m = (a + b) / 2, len = b - a; kit.lcollide(f, m, h / 2, Z, len, h, .16);
    if (kind === 'glass') {
      r.box(m, .15, Z, len, .3, .12, fr, MAT.metal); r.glass(m, (h + .3) / 2, Z, len - .04, h - .3, .03);
      const n = Math.max(1, Math.round(len / 2.2)); for (let i = 1; i < n; i++) r.box(a + i * len / n, h / 2, Z, .06, h, .1, fr, MAT.metal);
    } else if (len >= 1.6) {
      r.box(m, .45, Z, len, .9, .2, r.wall, MAT.plaster); r.box(m, (h + 2.3) / 2, Z, len, h - 2.3, .2, r.wall, MAT.plaster);
      for (const e of [a + .2, b - .2]) r.box(e, 1.6, Z, .4, 1.4, .2, r.wall, MAT.plaster);
      r.glass(m, 1.6, Z, len - .4, 1.4, .03); r.box(m, .92, Z + .06, len - .4, .04, .16, '#d9d2c4', MAT.stone);
    } else r.box(m, h / 2, Z, len, h, .2, r.wall, MAT.plaster);
  }
  for (const x of [-w / 2 + .04, dl, dr, w / 2 - .04]) r.box(x, h / 2, Z, .08, h, .14, fr, MAT.metal);
  r.box(r.door.lx, hd, Z, dw, .1, .14, fr, MAT.metal); r.box(0, h - .04, Z, w, .08, .14, fr, MAT.metal);
  if (kind === 'glass') r.glass(r.door.lx, (hd + h) / 2, Z, dw, h - hd, .03); else r.box(r.door.lx, (hd + h) / 2, Z, dw, h - hd, .2, r.wall, MAT.plaster);
  r.box(r.door.lx, .01, Z, dw, .02, .2, '#8d918f', MAT.metal);
  // The door leaf stands open, swung inward against the roomier side.
  const right = w / 2 - dr >= dl + w / 2, hx = right ? dr + .04 : dl - .04, lw = dw - .08, lz = Z - .06 - lw / 2;
  r.glass(hx, hd / 2, lz, .025, hd - .12, lw - .06);
  r.box(hx, .07, lz, .05, .12, lw, fr, MAT.metal); r.box(hx, hd - .07, lz, .05, .08, lw, fr, MAT.metal); r.box(hx, hd / 2, lz - lw / 2 + .025, .05, hd - .1, .05, fr, MAT.metal);
  r.box(hx + (right ? .05 : -.05), 1.05, lz - lw / 2 + .12, .02, .9, .03, '#b9bcbd', MAT.metal);
  r.reserve(hx + (right ? .15 : -.15), lz, .36, lw + .2);
}

/** Build a walk-in shop. The frame's origin is the front-centre at floor level, local +z points
 *  out to the street; the room spans lx −w/2…w/2 and lz −d…0 (walls included). */
export function walkInShop(kit: Kit, f: Frame, o: WalkInOptions) {
  const { w, d, set } = o, h = o.h ?? 3.2, B = kit.B;
  const r = new Room(kit, f, w, d, h, { lx: o.door.lx, width: o.door.width ?? 1.4 }, set.wall, o.keeper?.id ?? set.name);
  B.lbox(f, set.floorMat ?? MAT.tiles, 0, .01, -d / 2, w, .02, d, set.floor, false); kit.lground(f, 0, -d / 2, w, d, .02);
  if (o.ceiling !== false) B.lbox(f, MAT.plain, 0, h + .05, -d / 2, w, .1, d, set.ceiling ?? '#f2efe8', false);
  if (!o.shared?.back) kit.solid(f, MAT.plaster, 0, h / 2, -d + .1, w, h, .2, set.wall);
  r.box(0, .05, r.zb + .012, w - .4, .1, .024, '#5d564c');
  for (const s of [-1, 1]) {
    if (!(s < 0 ? o.shared?.left : o.shared?.right)) kit.solid(f, MAT.plaster, s * (w / 2 - .1), h / 2, -d / 2, .2, h, d, set.wall);
    r.box(s * (w / 2 - .212), .05, -d / 2, .024, .1, d - .4, '#5d564c');
  }
  shopFront(r, o.front);
  if (o.sign) {
    const sw = Math.min(w - .3, o.sign.w ?? 6.5), sx = o.sign.lx ?? 0, sy = o.sign.y ?? h + .45;
    if (set.signboard) set.signboard(r, sx, sy, .16, sw, .8);
    else { B.lbox(f, MAT.plain, sx, sy, .1, sw + .1, .86, .14, o.sign.bg); kit.sign(f, sx, sy, .18, sw - .2, .72, o.sign.he, { bg: o.sign.bg, fg: o.sign.fg, sub: o.sign.en, weight: 800, glow: .2 }); }
  }
  // Counter, keeper spot and the customer's spot in front of it; the aisle keeps the way clear.
  const c = set.counter?.(r) ?? null;
  if (c) {
    const cd = c.d ?? .7, ch = c.h ?? 1.02; r.counter = { lx: c.lx, lz: c.lz, w: c.w, d: cd, h: ch };
    r.box(c.lx, (ch - .04) / 2, c.lz, c.w, ch - .04, cd, c.color, c.mat ?? MAT.plain, true);
    r.box(c.lx, ch - .02, c.lz + .02, c.w + .06, .04, cd + .08, c.top ?? '#e9e4da', MAT.gloss);
    r.box(c.lx, .05, c.lz + cd / 2 - .03, c.w - .04, .1, .06, '#2a2a28');
    r.hit(c.lx, c.lz, c.w, cd, ch); r.reserve(c.lx, c.lz, c.w, cd);
  }
  const kp = set.keeper?.(r);
  let kx = o.keeper?.lx ?? kp?.[0] ?? r.counter?.lx ?? 0, kz = o.keeper?.lz ?? kp?.[1] ?? (r.counter ? r.counter.lz - r.counter.d / 2 - .4 : r.zb + 1.2);
  if (set.noKeeper || !o.keeper) { kx = kp?.[0] ?? r.door.lx; kz = kp?.[1] ?? -d / 2; }
  r.keeperAt = [kx, kz];
  r.stand = kp && kp.length === 4 && o.keeper?.lx === undefined ? [kp[2], kp[3]] : [kx, Math.min(-.9, r.counter && kx > r.counter.lx - r.counter.w / 2 && kx < r.counter.lx + r.counter.w / 2 ? r.counter.lz + r.counter.d / 2 + .8 : kz + 1.2)];
  r.path(...r.stand); r.reserve(kx, kz, .7, .6);
  set.furnish(r);
  if (o.ceiling !== false) { if (set.spots) r.spots(); else r.panels(); }
  if (o.light !== false) { const [x, z] = f.at(0, -d / 2); kit.light(x, f.y + h - .4, z, set.light ?? '#fff1dc', 10, Math.max(w, d) + 4); }
  let keeper: ReturnType<Kit['person']> | null = null;
  if (o.keeper && !set.noKeeper) {
    const L = set.look ?? { shirt: '#667b77' };
    keeper = kit.person(f, kx, kz, { shirt: o.keeper.shirt ?? L.shirt, pants: L.pants ?? '#2f3433', apron: L.apron, dress: L.dress, gray: L.gray, beard: L.beard, seed: hash(o.keeper.id) % 251 });
    kit.register(`keeper_${o.keeper.id}`, keeper.focus, o.keeper.label, 4.4);
  }
  return { room: r, keeper, stand: f.at(...r.stand), door: f.at(o.door.lx, 0) };
}

// ——— interior sets ———
const PAINT = ['#d23c2b', '#e88a2b', '#f2d24a', '#9cc43a', '#3f8f4a', '#2e8a8a', '#2f6fb0', '#2b3f8a', '#6b3f8a', '#b8467a', '#f2efe6', '#c9b28a', '#8a5a3a', '#4a4a4a', '#e8d9b8', '#7fb3d5'];
const PACKS = ['#d23c2b', '#f2efe6', '#2f6fb0', '#3f8f4a', '#f2d24a', '#e88a2b', '#6b3f8a', '#1d1d1d'];
const menu = (r: Room, lx: number, y: number, lz: number, w: number, h: number, text: string, bg = '#1d1d1b', fg = '#f3d36b', face = 0) => r.sign(lx, y, lz, w, h, text, { bg, fg, weight: 700, border: true }, face);

const restaurant: InteriorSet = {
  name: 'restaurant', he: 'קצביית טבעון', en: 'BUTCHER TIVON · GRILL', size: [9, 10],
  floor: '#6b5a4a', wall: '#efe4d2', light: '#ffd9a8', sign: { bg: '#5a1d18', fg: '#f6e6c8' }, look: { shirt: '#f4f1ea', pants: '#2b2b2b', apron: '#7a2a22' },
  counter: r => { const w = Math.min(4.4, r.w * .5); return { lx: r.x1 - w / 2 - .5, lz: r.zb + 1.75, w, color: '#4a2a22', top: '#d8d4cc' }; },
  furnish(r) {
    const c = r.counter!, { x0, x1, zb, zf } = r;
    // Refrigerated meat display on the counter: trays of cuts, skewers and sausages under glass.
    r.box(c.lx, c.h + .03, c.lz + .05, c.w - .1, .02, c.d - .15, '#f2f2f0', MAT.metal); r.glass(c.lx, c.h + .25, c.lz + .1, c.w - .1, .44, c.d - .3);
    r.prim(PRIMS.box, NIGHT.shopWindow, c.lx, c.h + .3, c.lz + c.d / 2 - .1, c.w - .1, .02, .3, null, 0, -.9);
    const n = Math.floor((c.w - .2) / .34);
    for (let i = 0; i < n; i++) {
      const x = c.lx - c.w / 2 + .27 + i * .34; r.box(x, c.h + .05, c.lz + .08, .3, .02, .42, '#e9e9e6', MAT.metal);
      for (let j = 0; j < 4; j++) r.box(x + (j % 2 - .5) * .13, c.h + .08, c.lz + (j < 2 ? -.04 : .18), .11, .04, .16, ['#a8302a', '#c4504a', '#8e2420', '#d07a6a', '#b84a3a'][(i + j) % 5], MAT.gloss);
      if (i % 3 === 2) for (let j = 0; j < 4; j++) r.bar(x, c.h + .11, c.lz - .05 + j * .07, .018, .26, 'x', '#7a3a24', MAT.gloss);
    }
    r.box(c.lx, c.h - .5, c.lz + c.d / 2 + .005, c.w - .3, .25, .01, '#d8b25a', MAT.metal);
    // Grill line on the back wall: steel base, glowing coals, grate, skewers, hood and duct.
    const gw = Math.min(c.w - .2, 3), gx = c.lx;
    r.box(gx, .43, zb + .35, gw, .86, .62, '#8f9396', MAT.metal); r.box(gx, .87, zb + .35, gw - .08, .04, .54, '#e0602a', MAT.gloss);
    for (let i = 0; i < Math.floor(gw / .09); i++) r.box(gx - gw / 2 + .06 + i * .09, .91, zb + .35, .02, .02, .56, '#1a1a18', MAT.metal);
    for (let i = 0; i < Math.floor(gw / .22); i++) { r.bar(gx - gw / 2 + .15 + i * .22, .95, zb + .35, .006, .6, 'z', '#c9c9c9'); for (let j = 0; j < 4; j++) r.box(gx - gw / 2 + .15 + i * .22, .95, zb + .17 + j * .12, .05, .05, .07, j % 2 ? '#8a3a22' : '#b05a32', MAT.gloss); }
    r.hit(gx, zb + .35, gw, .62, 1); r.box(gx, 2.15, zb + .42, gw + .2, .36, .8, '#a7abae', MAT.metal); r.box(gx, (2.33 + r.h) / 2, zb + .3, .45, r.h - 2.33, .45, '#a7abae', MAT.metal);
    // Cold-room door, hooks rail with hanging cuts, and the wainscot.
    if (c.lx - c.w / 2 - x0 > 1.4) { r.box(x0 + .85, 1.05, zb + .03, 1, 2.1, .06, '#d9dcdc', MAT.metal); r.box(x0 + 1.2, 1.1, zb + .08, .06, .3, .05, '#2a2a28', MAT.metal); r.sign(x0 + .85, 1.75, zb + .07, .7, .2, 'חדר קירור', { bg: '#2f6fb0', fg: '#fff' }); }
    r.bar(c.lx, 2.55, c.lz - .55, .015, c.w - .4, 'x', '#b9bcbd');
    for (let i = 0; i < 5; i++) { const x = c.lx - c.w / 2 + .5 + i * (c.w - 1) / 4; r.box(x, 2.45, c.lz - .55, .01, .16, .01, '#888'); r.prim(PRIMS.cyl6, MAT.gloss, x, 2.2, c.lz - .55, .07, .32, .05, '#9a2a24'); }
    for (const s of [-1, 1]) r.box(s < 0 ? x0 + .015 : x1 - .015, .55, -r.d / 2, .03, 1.1, r.d - .4, '#6a4a32', MAT.wood);
    menu(r, x0 + .02, 2.05, zb + 1.7, Math.min(2.6, c.lz - zb + .6), 1.15, 'סטייק אנטריקוט ₪98 · פרגית ₪62\nקבב ₪58 · שישליק ₪64\nהמבורגר הבית ₪56 · צ׳יפס ₪18', '#1d1d1b', '#f6e6c8', r.faceL);
    // Drinks fridge at the front corner on the counter side.
    if (r.solid(x1 - .4, 1, zf - 1.2, .7, 2, .8, '#d8dadb', MAT.metal)) {
      r.glass(x1 - .76, 1.05, zf - 1.2, .02, 1.7, .7); r.box(x1 - .4, 2.05, zf - 1.2, .72, .12, .82, '#c8302a');
      for (let k = 0; k < 4; k++) for (let i = 0; i < 4; i++) r.cyl(x1 - .5, .5 + k * .42, zf - 1.45 + i * .16, .035, .24, ['#c8302a', '#2f6f3a', '#e8a02a', '#1d1d1d'][(i + k) % 4], MAT.gloss, true);
    }
    // Dining room: up to four tables for four.
    let seed = 7; r.pack(x0 + .1, x1 - .1, c.lz + c.d / 2 + 1.3, zf - .3, 1.5, 1.5, 4, (x, z) => { r.table(x, z, { seats: 4, top: '#efe8da', chair: '#6a2a22', plastic: false, plate: true, diner: seed % 3 ? undefined : seed }); r.bottle(x + .15, .78, z + .12, '#7a2a1a'); seed += 5; }, .45);
    r.sign(0, 2.75, zb + .03, Math.min(3, r.w - 1), .4, 'קצביית טבעון · מאז 1984', { bg: '#5a1d18', fg: '#f6e6c8', weight: 800 });
  },
};

const print: InteriorSet = {
  name: 'print', he: 'דפוס והעתקות', en: 'PRINT & COPY', size: [7, 8],
  floor: '#b9b6ae', floorMat: MAT.plain, wall: '#f1f0ea', light: '#f4f6ff', sign: { bg: '#1f3d6b', fg: '#ffffff' }, look: { shirt: '#2f4a6b', pants: '#2b2b2b' },
  counter: r => ({ lx: (r.x0 + r.x1) / 2 + .3, lz: r.zb + 1.9, w: Math.min(2.8, r.w * .42), color: '#2f4a6b', top: '#e6e6e2' }),
  furnish(r) {
    const c = r.counter!, { x0, x1, zb, zf } = r;
    const copier = (x: number, z: number, face: number) => {
      const g = r.at(x, z, face), B = r.B;
      B.lbox(g, MAT.plain, 0, .45, 0, .7, .9, .62, '#e9e9e4'); B.lbox(g, MAT.plain, 0, .93, -.02, .66, .06, .58, '#d6d6d0'); B.lbox(g, MAT.plain, 0, 1.0, -.04, .64, .08, .5, '#3a3d40');
      for (let k = 0; k < 3; k++) B.lbox(g, MAT.plain, 0, .15 + k * .22, .315, .64, .015, .01, '#9a9c9a');
      B.lbox(g, MAT.gloss, .2, .98, .27, .2, .03, .1, '#1d1d1d'); B.lbox(g, NIGHT.bulb, .2, .995, .27, .15, .005, .07);
      B.lbox(g, MAT.plain, .44, .7, 0, .18, .3, .45, '#d6d6d0'); B.lbox(g, MAT.plain, .44, .86, 0, .2, .02, .3, '#f8f8f6');
    };
    // Production printer behind the counter and a stack of output.
    r.box(c.lx, .7, zb + .45, Math.min(2, c.w), 1.4, .75, '#e4e4de', MAT.plain, true); r.hit(c.lx, zb + .45, Math.min(2, c.w), .75, 1.4); r.box(c.lx, 1.42, zb + .45, Math.min(2, c.w) - .1, .06, .7, '#2f4a6b');
    r.box(c.lx + Math.min(2, c.w) / 2 - .3, 1.3, zb + .84, .3, .2, .02, '#1d1d1d', MAT.gloss); r.glow(c.lx + Math.min(2, c.w) / 2 - .3, 1.3, zb + .85, .26, .16, .005);
    for (let k = 0; k < 4; k++) r.box(c.lx, .2 + k * .3, zb + .83, Math.min(2, c.w) - .2, .02, .01, '#9a9c9a');
    // Counter: cutter, binding machine, paper stacks, register.
    r.box(c.lx - c.w / 2 + .35, c.h + .03, c.lz, .5, .04, .4, '#5a5d60', MAT.metal); r.prim(PRIMS.box, MAT.metal, c.lx - c.w / 2 + .35, c.h + .12, c.lz + .18, .5, .02, .04, '#c8302a', 0, 0, .35);
    r.box(c.lx + c.w / 2 - .35, c.h + .1, c.lz - .05, .4, .18, .3, '#3a3d40', MAT.gloss);
    for (let i = 0; i < 3; i++) r.box(c.lx - .2 + i * .25, c.h + .05 + i * .02, c.lz + .1, .21, .08 + i * .04, .3, '#f8f8f6');
    // Wide-format plotter with a paper roll and a fresh print on the left wall.
    const pz = zb + 1.6;
    if (r.claim(x0 + .45, pz, .75, 2.5)) {
      for (const e of [-1, 1]) r.box(x0 + .45, .45, pz + e * 1.1, .4, .9, .06, '#3a3d40', MAT.metal);
      r.box(x0 + .45, 1.0, pz, .55, .32, 2.4, '#2a2c2e', MAT.gloss); r.bar(x0 + .62, .95, pz, .07, 2.2, 'z', '#f8f8f6', MAT.plain);
      r.prim(PRIMS.box, MAT.plain, x0 + .8, .8, pz, .4, .01, 1.9, '#3f8fb0', 0, 0, -.6); r.box(x0 + .45, 1.18, pz + .9, .2, .04, .3, '#1d1d1d', MAT.gloss);
    }
    // Copiers along the walls, front zone.
    for (const [x, face] of [[x0 + .4, HALF], [x1 - .4, -HALF]] as const) for (let z = zf - .6; z > c.lz + c.d / 2 + .6; z -= 1.1) if (r.claim(x, z, .65, .85)) copier(x, z, face);
    // Paper shelves on the right wall: reams in white and pastel colours.
    r.run('R', zb + .2, c.lz + .6, .45, 1.6, (x, z, len) => r.shelves(x, z, len, .45, 2.1, 5, 'z', (i, k) => ['#f8f8f6', '#f8f8f6', '#f2d24a', '#7fb3d5', '#f4b0c0', '#9cc43a', '#f8f8f6'][(i + k * 2) % 7], { pitch: .32, ih: .14, face: -1, back: '#d9dadb' }));
    // Laminator on a side table by the counter.
    const lx = c.lx - c.w / 2 - .7;
    if (r.solid(lx, .4, c.lz, .9, .8, .55, '#c9cbcc', MAT.metal)) {
      r.box(lx, .87, c.lz, .55, .14, .3, '#2a2c2e', MAT.gloss); r.box(lx, .9, c.lz + .17, .4, .005, .1, '#e8f4f8'); r.glow(lx + .2, .95, c.lz + .14, .03, .02, .02);
      r.bar(lx, .85, c.lz - .2, .06, .4, 'x', '#dfe8ea', MAT.gloss);
    }
    r.sign(c.lx, 2.45, zb + .03, Math.min(3, c.w + .4), .5, 'הדפסה · צילום · כריכה · למינציה', { bg: '#1f3d6b', fg: '#fff', weight: 700 });
    for (let i = 0; i < 3; i++) r.picture('L', zf - .6 - i * 1.1, 2.15, .8, .6, ['#e88a2b', '#2f6fb0', '#9cc43a'][i], '#f2efe6');
    for (let i = 0; i < 4; i++) r.box(x1 - .5 - (i % 2) * .4, .15 + Math.floor(i / 2) * .3, zf - .4, .36, .28, .26, '#c9a77c', MAT.plain, true);
  },
};

const camera: InteriorSet = {
  name: 'camera', he: 'צילום איציק', en: 'ITZIK · CAMERA & PHOTO', size: [6, 8],
  floor: '#4a4644', wall: '#ece8e0', light: '#fff4e4', spots: true, sign: { bg: '#141414', fg: '#f2c84b' }, look: { shirt: '#3a3f46', pants: '#2b2b2b', gray: true },
  counter: r => { const w = Math.min(2.4, r.w * .42); return { lx: r.x1 - w / 2 - .4, lz: r.zb + 2, w, color: '#1c1c1c', top: '#d8d4cc' }; },
  furnish(r) {
    const c = r.counter!, { x0, x1, zb, zf } = r;
    const cam = (x: number, y: number, z: number, i: number) => {
      if (i % 3 === 2) { r.cyl(x, y + .06, z, .04, .12, '#1d1d1d', MAT.gloss, true); r.cyl(x, y + .125, z, .038, .01, '#c9a24a', MAT.metal, true); return; }
      r.box(x, y + .05, z, .13, .09, .06, i % 4 ? '#1d1d1d' : '#b9bcbd', MAT.gloss); r.bar(x, y + .045, z + .06, .032, .07, 'z', '#2a2a2a', MAT.gloss); r.box(x - .03, y + .1, z, .04, .02, .04, '#1d1d1d');
    };
    // Glass counter with cameras, a register and a print kiosk.
    r.glass(c.lx, c.h + .2, c.lz, c.w - .1, .36, c.d - .1); r.box(c.lx, c.h + .02, c.lz, c.w - .1, .01, c.d - .1, '#f2efe6');
    for (let i = 0; i < Math.floor(c.w / .3); i++) cam(c.lx - c.w / 2 + .2 + i * .3, c.h + .02, c.lz + (i % 2 ? .12 : -.08), i);
    r.box(c.lx - c.w / 2 + .3, c.h + .45, c.lz - .1, .35, .26, .2, '#2a2a2a', MAT.gloss);
    // Display cases along both walls.
    for (const [x, s] of [[x0 + .35, 1], [x1 - .35, -1]] as const) for (let z = zf - .8; z > c.lz + c.d / 2 + .6; z -= 1.6) if (r.vitrine(x, z, .6, 1.5, 1.05, '#1c1c1c', cam, .26)) r.sign(x + s * .31, .45, z, 1.2, .2, 'מצלמות · עדשות · אביזרים', { bg: '#1c1c1c', fg: '#f2c84b' }, s > 0 ? r.faceL : r.faceR);
    // Lens cabinet behind the counter.
    r.shelves(c.lx, zb + .22, Math.min(2.2, c.w), .35, 2.2, 5, 'x', (i, k) => k === 0 ? null : (i + k) % 3 ? '#1d1d1d' : '#d9dadb', { pitch: .2, shape: 'can', ih: .18, back: '#2a2a2a', frame: '#1c1c1c', board: '#3a3a3a' });
    r.glass(c.lx, 1.2, zb + .41, Math.min(2.2, c.w), 2.1, .02); r.hit(c.lx, zb + .22, Math.min(2.2, c.w), .4, 2.2);
    // Photo prints on the walls.
    for (const [side, from, to] of [['L', zf - .4, zb + 2.4], ['R', zf - .4, c.lz + 1]] as const) for (let z = from, i = 0; z - .45 > to; z -= .95, i++) {
      r.picture(side, z - .45, 2.05, .75, .55, ['#7fb3d5', '#f2b06a', '#a9c4de', '#e8d9b8'][i % 4], ['#5a7a4a', '#8a5a3a', '#3f6a8a', '#c9a24a'][(i + 1) % 4]);
      r.picture(side, z - .45, 2.75, .55, .42, ['#d9d2c4', '#6b8aa8', '#f2d24a'][i % 3], ['#3a3a3a', '#7a8a5a', '#a86a4a'][i % 3]);
    }
    for (let i = 0, u = c.lx - c.w / 2 - .6; i < 3 && u - .35 > x0 + 1.7; i++, u -= .9) r.picture('B', u, 2.45, .7, .5, '#a9c4de', '#5a7a4a');
    // Developing corner: a curtained darkroom with trays, an enlarger and a red safelight.
    const dw = 1.6, dd = 1.5, dx = x0 + dw / 2, dz = zb + dd / 2;
    if (r.claim(dx, dz, dw, dd, 2.3)) {
      r.box(x0 + dw - .03, 1.15, dz + .2, .06, 2.3, dd - .4, '#2a2a2a'); r.box(x0 + .3, 1.15, zb + dd - .03, .6, 2.3, .06, '#2a2a2a');
      r.box(x0 + dw - .03, 2.25, zb + dd - .1, .06, .1, .3, '#2a2a2a');
      for (let i = 0; i < 6; i++) r.box(x0 + .65 + i * .16, 1.1, zb + dd - .02, .15, 2.1, .04, i % 2 ? '#141414' : '#1d1d1d', MAT.plain);
      r.box(x0 + .35, .45, dz - .1, .6, .9, 1.1, '#3a3a3a'); r.box(x0 + .35, .91, dz - .1, .62, .03, 1.12, '#1d1d1d');
      for (let i = 0; i < 3; i++) { r.box(x0 + .35, .95, zb + .25 + i * .32, .42, .05, .28, '#f2efe6'); r.box(x0 + .35, .97, zb + .25 + i * .32, .38, .01, .24, ['#c9b48a', '#d2c9a8', '#b8c4b0'][i]); }
      r.box(x0 + 1.05, 1.0, zb + .3, .22, .05, .3, '#1d1d1d'); r.cyl(x0 + 1.05, 1.45, zb + .2, .025, .9, '#9a9c9a', MAT.metal, true); r.box(x0 + 1.05, 1.75, zb + .3, .2, .25, .22, '#2a2a2a', MAT.gloss);
      r.bar(x0 + .8, 2.0, zb + .6, .006, dw - .2, 'x', '#ddd'); for (let i = 0; i < 4; i++) r.box(x0 + .3 + i * .3, 1.85, zb + .6, .2, .26, .005, '#f2efe6');
      r.prim(PRIMS.box, RED_LAMP, x0 + .4, 2.3, zb + .15, .16, .12, .1, null); r.box(x0 + .4, 2.38, zb + .12, .2, .04, .12, '#1d1d1d');
      r.prim(PRIMS.box, RED_LAMP, x0 + dw - .03, 2.4, dz + .4, .07, .07, .07, null);
      r.sign(x0 + dw + .005, 2.1, dz + .45, .5, .16, 'חדר חושך', { bg: '#7a1a14', fg: '#fff' }, r.faceL);
    }
  },
};

const pilates: InteriorSet = {
  name: 'pilates', he: 'סטודיו פילאטיס', en: 'PILATES STUDIO', size: [8, 10],
  floor: '#c9a77c', floorMat: MAT.wood, wall: '#f4efe8', light: '#fff1e0', sign: { bg: '#e8ddd0', fg: '#5a4636' }, look: { shirt: '#2a2a2a', pants: '#2a2a2a' },
  counter: r => ({ lx: r.door.lx > 0 ? r.x0 + .85 : r.x1 - .85, lz: r.zf - 2.1, w: 1.5, d: .6, color: '#e8ddd0', top: '#c9a77c' }),
  furnish(r) {
    const c = r.counter!, { x0, x1, zb, zf } = r, mx = r.door.lx > 0 ? x1 : x0, ms = mx === x1 ? -1 : 1, bx = mx === x1 ? x0 : x1;
    r.box(c.lx, c.h + .06, c.lz - .1, .35, .02, .25, '#1d1d1d', MAT.gloss); r.prim(PRIMS.box, MAT.gloss, c.lx, c.h + .2, c.lz - .2, .35, .22, .015, '#1d1d1d', 0, -.2); r.plant(c.lx + .5, c.h, c.lz - .1, .5, '#e8ddd0');
    // Mirror wall with a frame.
    const ml = Math.min(r.d - 1.2, zf - zb - .6), mz = (zb + .2 + zb + .2 + ml) / 2;
    r.prim(PRIMS.box, MIRROR, mx + ms * .015, 1.45, mz, .02, 2.3, ml, null); r.box(mx + ms * .01, .28, mz, .03, .04, ml + .04, '#9a9c9a', MAT.metal); r.box(mx + ms * .01, 2.62, mz, .03, .04, ml + .04, '#9a9c9a', MAT.metal);
    // Wall bar (barre) on the opposite wall.
    const bl = Math.min(4, r.d - 3); r.bar(bx - ms * .13, 1.0, zb + .4 + bl / 2, .022, bl, 'z', '#c9a77c', MAT.wood, false);
    for (let i = 0; i <= 2; i++) r.box(bx - ms * .07, 1.0, zb + .4 + i * bl / 2, .12, .04, .04, '#9a9c9a', MAT.metal);
    // Three reformers along the room, heads to the back.
    const reformer = (x: number, z: number) => {
      const g = r.at(x, z), B = r.B, wood = '#b48a5c';
      for (const s of [-1, 1]) { B.lbox(g, MAT.wood, s * .3, .27, 0, .07, .1, 2.4, wood); for (const e of [-1.1, 1.1]) B.lbox(g, MAT.metal, s * .3, .11, e, .06, .22, .06, '#9a9c9a'); }
      for (const e of [-1.17, 1.17]) B.lbox(g, MAT.wood, 0, .27, e, .66, .1, .07, wood);
      B.lbox(g, MAT.plain, 0, .38, -.5, .58, .08, .75, '#2e5c5a'); B.lbox(g, MAT.plain, 0, .44, -.8, .3, .05, .15, '#2e5c5a');
      for (const s of [-1, 1]) B.lbox(g, MAT.plain, s * .13, .52, -.6, .08, .15, .1, '#2e5c5a');
      for (const s of [-1, 1]) B.lbox(g, MAT.metal, s * .27, .55, .95, .03, .5, .03, '#b9bcbd');
      { const [px, pz] = g.at(0, .95); B.place(PRIMS.cyl6, MAT.metal, px, g.y + .8, pz, .02, .56, .02, g.rot, '#b9bcbd', false, 0, HALF); }
      for (let i = 0; i < 4; i++) { const [px, pz] = g.at(-.15 + i * .1, .1); B.place(PRIMS.cyl6, MAT.metal, px, g.y + .3, pz, .012, .7, .012, g.rot, ['#f2d24a', '#d23c2b', '#2f6fb0', '#3f8f4a'][i], false, HALF); }
      for (const s of [-1, 1]) { B.lbox(g, MAT.metal, s * .3, .7, -1.17, .04, .8, .04, '#9a9c9a'); B.lbox(g, MAT.plain, s * .3, .8, -.6, .01, .01, 1.1, '#2a2a2a'); B.lbox(g, MAT.plain, s * .3, .62, -.1, .08, .02, .12, '#1d1d1d'); }
    };
    const n = r.pack(x0 + .3, x1 - .3, zb + .3, c.lz - .3, .8, 2.5, 3, (x, z) => { reformer(x, z); r.hit(x, z, .75, 2.45, .55); }, .55);
    if (n < 3) r.pack(x0 + .3, x1 - .3, zb + .3, zf - .3, .8, 2.5, 3 - n, (x, z) => { reformer(x, z); r.hit(x, z, .75, 2.45, .55); }, .4);
    // Mats on the floor and rolled in a basket, small balls and rings on a low shelf.
    const sx = bx - ms * .35, sz = zf - .9;
    if (r.claim(sx, sz, .5, 1.2, .6)) {
      r.box(sx, .3, sz, .45, .6, 1.15, '#e8ddd0', MAT.wood); for (let i = 0; i < 4; i++) r.bar(sx, .62, sz - .45 + i * .3, .07, .5, 'x', ['#8fb3a8', '#c9a0b8', '#a8b88f', '#6b7a8a'][i], MAT.plain);
      for (let i = 0; i < 3; i++) r.prim(PRIMS.ico, MAT.gloss, sx, .82, sz - .3 + i * .3, .1, .1, .1, ['#c94a6a', '#4a8ac9', '#e8c84a'][i]);
    }
    for (let i = 0; i < 2; i++) { const z = zf - .9 - i * .9, x = r.door.lx + ms * 1.4; if (r.fits(x, z, .65, 1.8)) r.box(x, .025, z, .6, .01, 1.75, ['#8fb3a8', '#c9a0b8'][i]); }
    r.sign(bx - ms * .015, 2.3, zb + 1.6, 2.2, .45, 'נשימה · יציבה · תנועה', { bg: '#f4efe8', fg: '#5a4636', weight: 600 }, ms > 0 ? r.faceR : r.faceL);
    r.extra([[mx + ms * .9, zb + 1], [mx + ms * .9, zb + 3.2], [0, zb + .8], [bx - ms, zb + 1]], { shirt: '#8fb3a8', pants: '#2a2a2a', seed: 23, angle: -ms * HALF });
    if (r.fits(bx - ms * .35, zb + .35, .5, .5)) r.plant(bx - ms * .35, 0, zb + .35, 1.1, '#d9d2c4');
  },
};

const paint: InteriorSet = {
  name: 'paint', he: 'חלק טמבור', en: 'PAINT & BUILDING SUPPLIES', size: [8, 10],
  floor: '#9a9a94', floorMat: MAT.paving, wall: '#f0ede6', light: '#f6f4ec', sign: { bg: '#e8432e', fg: '#ffffff' }, look: { shirt: '#e8432e', pants: '#3b3d3a' },
  counter: r => ({ lx: (r.x0 + r.x1) / 2 + .4, lz: r.zb + 1.75, w: Math.min(2.6, r.w * .33), color: '#e8432e', top: '#ece8e0' }),
  furnish(r) {
    const c = r.counter!, { x0, x1, zb, zf } = r;
    const cans = (i: number, k: number) => PAINT[(i * 5 + k * 3 + (i >> 2)) % PAINT.length];
    // Full-height shelving of paint cans on both side walls.
    for (const s of ['L', 'R'] as const) r.run(s, zb + .2, zf - .4, .5, 1.8, (x, z, len) => r.shelves(x, z, len, .5, 2.6, 6, 'z', cans, { pitch: .24, shape: 'can', ih: .26, face: s === 'L' ? 1 : -1, back: '#e8e4dc', frame: '#3a4a5a', board: '#b9bcbd' }));
    // Pegboard of tools on the back wall.
    const pw = Math.min(r.w - 1.6, 4.4);
    r.box(c.lx, 1.75, zb + .02, pw, 1.5, .03, '#c8a87a', MAT.wood);
    for (let i = 0; i < Math.floor(pw / .32); i++) for (let k = 0; k < 4; k++) {
      const x = c.lx - pw / 2 + .2 + i * .32, y = 1.25 + k * .35, t = (i + k * 3) % 6, z = zb + .07;
      if (t === 0) { r.box(x, y, z, .03, .26, .03, '#8a5a3a', MAT.wood); r.box(x, y + .13, z, .12, .04, .04, '#3a3a3a', MAT.metal); }
      else if (t === 1) { r.box(x, y + .05, z, .03, .12, .03, ['#d23c2b', '#f2d24a', '#2f6fb0'][i % 3], MAT.gloss); r.box(x, y - .07, z, .008, .14, .008, '#b9bcbd', MAT.metal); }
      else if (t === 2) r.box(x, y, z, .05, .24, .015, '#9a9c9a', MAT.metal);
      else if (t === 3) r.box(x, y, z, .1, .1, .05, '#f2d24a', MAT.gloss);
      else if (t === 4) { r.box(x, y, z, .2, .1, .01, '#b9bcbd', MAT.metal); r.box(x + .1, y, z, .06, .08, .03, '#1d1d1d'); }
      else { r.cyl(x, y, z + .02, .04, .2, '#e8e4dc', MAT.plain, true); r.box(x, y + .12, z, .01, .1, .01, '#3a3a3a'); }
    }
    r.sign(c.lx, 2.75, zb + .04, pw, .32, 'כלי עבודה · אינסטלציה · חשמל', { bg: '#3a4a5a', fg: '#fff', weight: 700 });
    // Tint machine with its carousel of colourants, and the shaker beside it.
    const tx = c.lx + c.w / 2 + .55, tz = c.lz - .15;
    if (r.claim(tx, tz, .75, .7, 1.6)) {
      r.box(tx, .5, tz, .7, 1, .65, '#f2efe6', MAT.gloss, true); r.box(tx, .25, tz + .2, .3, .02, .3, '#9a9c9a', MAT.metal); r.cyl(tx, .37, tz + .2, .1, .22, '#f2efe6', MAT.gloss, true);
      r.cyl(tx, 1.1, tz, .3, .18, '#d9dadb', MAT.metal);
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; r.cyl(tx + Math.cos(a) * .24, 1.32, tz + Math.sin(a) * .24, .045, .28, PAINT[i], MAT.gloss, true); }
      r.cyl(tx, 1.45, tz, .05, .3, '#3a3a3a', MAT.metal, true); r.box(tx + .2, 1.05, tz + .33, .18, .12, .02, '#1d1d1d', MAT.gloss); r.glow(tx + .2, 1.05, tz + .34, .14, .08, .005);
    }
    const sx = c.lx - c.w / 2 - .5; if (r.claim(sx, c.lz - .2, .6, .6, 1.1)) { r.box(sx, .55, c.lz - .2, .6, 1.1, .6, '#5a6a7a', MAT.metal, true); r.glass(sx, .7, c.lz + .1, .4, .4, .02); }
    // Counter: colour fan decks, swatch stand, register.
    r.box(c.lx - .5, c.h + .02, c.lz + .1, .5, .02, .25, '#f2efe6'); for (let i = 0; i < 6; i++) r.prim(PRIMS.box, MAT.plain, c.lx - .5, c.h + .04, c.lz + .1, .05, .01, .22, PAINT[i * 2], i * .2);
    r.box(c.lx + .5, c.h + .12, c.lz - .1, .35, .2, .25, '#2a2a2a', MAT.gloss);
    for (let i = 0; i < 4; i++) for (let k = 0; k < 6; k++) r.box(c.lx - c.w / 2 + .2 + i * .1, .25 + k * .12, c.lz + c.d / 2 + .01, .08, .1, .01, PAINT[(i * 6 + k) % PAINT.length]);
    // Stacked 18-litre buckets and a roller-and-brush gondola where there is room.
    const bx = (r.door.lx > 0 ? x0 : x1) + (r.door.lx > 0 ? 1.1 : -1.1);
    if (r.claim(bx, zf - .8, .9, .9, .9)) for (let i = 0; i < 4; i++) { const x = bx + (i % 2 - .5) * .38, z = zf - .8 + (i < 2 ? -.19 : .19); r.cyl(x, .2, z, .17, .4, '#f2efe6', MAT.gloss); r.cyl(x, .41, z, .17, .02, PAINT[i * 3], MAT.plain); r.cyl(x, .62, z + (i < 2 ? .1 : -.1), .15, .4, '#f2efe6', MAT.gloss); }
    r.pack(x0 + 1, x1 - 1, c.lz + c.d / 2 + 1.2, zf - 1.2, 2, .7, 1, (x, z) => { r.shelves(x, z, 2, .7, 1.5, 4, 'x', (i, k) => k % 2 ? '#f2d24a' : '#d9dadb', { two: true, shape: 'can', pitch: .2, ih: .16, back: '#3a4a5a' }); r.hit(x, z, 2, .7, 1.5); }, .6);
    r.sign(c.lx, c.h + .7, c.lz - .25, .9, .3, 'גוונים לפי דוגמה', { bg: '#fff', fg: '#e8432e', weight: 700 });
  },
};

const chocolate: InteriorSet = {
  name: 'chocolate', he: 'מישי · בוטיק שוקולד', en: 'MISHI CHOCOLATE', size: [7.3, 6],
  floor: '#7a5640', floorMat: MAT.wood, wall: '#f3e6d4', light: '#ffdcb0', sign: { bg: '#3b2416', fg: '#f2d9b0' }, look: { shirt: '#3b2416', pants: '#2b2b2b', apron: '#f2d9b0' },
  counter: r => ({ lx: (r.x0 + r.x1) / 2, lz: r.zb + 1.6, w: Math.min(3.2, r.w * .45), color: '#3b2416', top: '#f2e8d8' }),
  furnish(r) {
    const c = r.counter!, { x0, x1, zb, zf } = r, BR = ['#3b2416', '#5a3420', '#7a4a2a', '#c9a24a', '#e8d9b8', '#2a1a10', '#a0522d'];
    const pralines = (x: number, y: number, z: number, i: number) => {
      r.box(x, y + .01, z, .19, .015, .19, '#f2e8d8');
      for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) r.box(x - .06 + a * .06, y + .035, z - .06 + b * .06, .045, .03, .045, BR[(i + a + b * 2) % BR.length], MAT.gloss);
    };
    // Glass case on the counter, a till and ribbon spools.
    r.vitrine(c.lx - .3, c.lz + .05, c.w - 1, c.d - .1, .42, '#3b2416', pralines, .22, false, c.h);
    r.box(c.lx + c.w / 2 - .35, c.h + .1, c.lz - .1, .3, .18, .25, '#1d1d1d', MAT.gloss);
    for (let i = 0; i < 3; i++) r.bar(c.lx + c.w / 2 - .45 + i * .12, c.h + .05, c.lz + .2, .05, .04, 'x', ['#c9a24a', '#b8467a', '#f2efe6'][i]);
    // Free-standing display case by the window.
    const vx = r.door.lx > 0 ? x0 + .95 : x1 - .95; r.vitrine(vx, zf - .7, 1.5, .7, 1.05, '#3b2416', pralines);
    // Gift-box shelves behind the counter and on the side walls.
    const gift = (i: number, k: number) => ['#b8467a', '#c9a24a', '#3b2416', '#f2efe6', '#7a2a3a', '#2e5c5a'][(i * 2 + k) % 6];
    const sl = Math.min(r.w - 1.2, c.w + 1.4), sn = Math.floor((sl - .1) / .3);
    r.shelves(c.lx, zb + .2, sl, .32, 2.3, 5, 'x', gift, { pitch: .3, ih: .16, back: '#5a3420', frame: '#3b2416', board: '#7a4a2a' }); r.hit(c.lx, zb + .2, sl, .36, 2.3);
    for (let i = 0; i < sn; i++) for (let k = 0; k < 5; k++) r.box(c.lx - sl / 2 + .05 + (i + .5) * (sl - .1) / sn, .1 + k * .43 + .18, zb + .22, .03, .01, .2, '#f2d9b0');
    for (const s of ['L', 'R'] as const) r.run(s, c.lz + c.d / 2 + .9, zf - .3, .35, 1.5, (x, z, len) => r.shelves(x, z, len, .35, 1.9, 4, 'z', gift, { pitch: .3, ih: .18, back: '#5a3420', frame: '#3b2416', board: '#7a4a2a', face: s === 'L' ? 1 : -1 }));
    // A round gift table with stacked boxes.
    r.pack(x0 + .6, x1 - .6, c.lz + c.d / 2 + .8, zf - .5, .9, .9, 1, (x, z) => {
      r.cyl(x, .38, z, .05, .76, '#3b2416', MAT.metal); r.cyl(x, .77, z, .45, .04, '#f2e8d8', MAT.wood);
      for (let i = 0; i < 5; i++) { const a = i * 1.26; r.box(x + Math.cos(a) * .22, .82 + (i % 2) * .05, z + Math.sin(a) * .22, .18, .08 + (i % 2) * .1, .14, gift(i, 1), MAT.gloss); }
      r.hit(x, z, .9, .9, .9);
    }, .4);
    for (let i = 0; i < 3; i++) r.pendant(c.lx - c.w / 3 + i * c.w / 3, c.lz, .9, '#c9a24a');
    r.sign(c.lx, 2.6, zb + .03, Math.min(2.8, r.w - 1), .36, 'שוקולד בעבודת יד · מארזי מתנה', { bg: '#3b2416', fg: '#f2d9b0', weight: 600 });
  },
};

const pharmacy: InteriorSet = {
  name: 'pharmacy', he: 'בית מרקחת', en: 'PHARMACY', size: [12, 10],
  floor: '#eceeea', wall: '#f7f7f4', light: '#f4f8ff', sign: { bg: '#f4f6f2', fg: '#1f8a4c' }, look: { shirt: '#ffffff', pants: '#3b4a5a' },
  counter: r => ({ lx: (r.x0 + r.x1) / 2 + (r.door.lx > 0 ? -.6 : .6), lz: r.zb + 1.8, w: Math.min(4, r.w * .38), color: '#ffffff', top: '#1f8a4c' }),
  furnish(r) {
    const c = r.counter!, { x0, x1, zb, zf } = r, MED = ['#ffffff', '#3c7fb5', '#e9e9e4', '#d14c4c', '#4fa36b', '#f2d24a', '#9a6bb8', '#f2b0a0'];
    const meds = (i: number, k: number) => MED[(i * 3 + k + (i >> 3)) % MED.length];
    // Dispensary shelves and the pharmacist's counter: tills, card terminals, a lip-balm stand.
    const sl = Math.min(r.w - 1, c.w + 1.6);
    r.shelves(c.lx, zb + .2, sl, .35, 2.3, 7, 'x', meds, { pitch: .16, ih: .14, back: '#e9f2ec', frame: '#d9dadb', board: '#ffffff' }); r.hit(c.lx, zb + .2, sl, .38, 2.3);
    r.sign(c.lx, 2.72, zb + .03, Math.min(3.2, sl), .38, '✚ מרשמים · ייעוץ רוקח/ת', { bg: '#1f8a4c', fg: '#fff', weight: 700 });
    for (const s of [-1, 1]) { const x = c.lx + s * c.w / 4; r.prim(PRIMS.box, MAT.gloss, x, c.h + .22, c.lz - .12, .38, .26, .03, '#1d1d1d', 0, -.15); r.cyl(x, c.h + .06, c.lz - .1, .03, .1, '#3a3a3a', MAT.metal, true); r.box(x + .22, c.h + .04, c.lz + .15, .08, .05, .14, '#2a2a2a', MAT.gloss); }
    r.box(c.lx, c.h + .09, c.lz + .2, .32, .16, .14, '#f2efe6'); for (let i = 0; i < 6; i++) r.cyl(c.lx - .1 + (i % 3) * .1, c.h + .2, c.lz + .17 + (i > 2 ? .05 : 0), .015, .06, MED[i + 1], MAT.gloss, true);
    r.box(c.lx, .55, c.lz + c.d / 2 + .005, c.w - .2, .5, .01, '#1f8a4c');
    // Wall shelving of cosmetics and over-the-counter products.
    for (const s of ['L', 'R'] as const) r.run(s, zb + .3, zf - .5, .4, 1.8, (x, z, len) => r.shelves(x, z, len, .4, 2, 6, 'z', meds, { pitch: .15, ih: .17, face: s === 'L' ? 1 : -1, back: '#e9f2ec', frame: '#d9dadb', board: '#ffffff' }));
    // Two or three double-sided aisles.
    const za = c.lz + c.d / 2 + 1.3, zz = zf - .9, len = Math.min(3.6, zz - za);
    if (len > 1.2) r.pack(x0 + 1, x1 - 1, za, zz, .8, len, 3, (x, z) => {
      r.shelves(x, z, len, .8, 1.6, 4, 'z', meds, { two: true, pitch: .18, ih: .2, back: '#e9f2ec', frame: '#d9dadb', board: '#ffffff' }); r.hit(x, z, .8, len, 1.6);
      r.box(x, 1.78, z + len / 2 - .05, .78, .26, .03, '#1f8a4c'); r.sign(x, 1.78, z + len / 2 - .03, .7, .2, ['טיפוח · קוסמטיקה', 'ויטמינים', 'תינוקות', 'היגיינה'][Math.abs(Math.round(x * 3)) % 4], { bg: '#1f8a4c', fg: '#fff' });
    }, 1.2);
    // Blood-pressure kiosk: seat, cuff unit and screen.
    const bp = r.first([[x0 + .55, zf - .7], [x1 - .55, zf - .7], [x0 + .55, c.lz + c.d / 2 + 1.2], [x1 - .55, c.lz + c.d / 2 + 1.2]], .9, .9);
    if (bp) {
      const [x, z] = bp, s = x < 0 ? 1 : -1; r.claim(x, z, .9, .9, 1.3);
      r.box(x - s * .15, .25, z, .5, .5, .5, '#e9e9e4', MAT.gloss); r.box(x - s * .15, .48, z, .48, .06, .48, '#2f6fb0'); r.box(x - s * .38, .75, z, .08, .5, .5, '#2f6fb0');
      r.box(x + s * .2, .45, z - .1, .25, .9, .4, '#ffffff', MAT.gloss); r.bar(x + s * .1, .82, z - .1, .09, .28, 'x', '#3a3a3a', MAT.plain, false);
      r.prim(PRIMS.box, MAT.gloss, x + s * .2, 1.12, z - .1, .02, .22, .3, '#1d1d1d', 0, 0, s * .3); r.glow(x + s * .19 - s * .01, 1.12, z - .1, .005, .16, .24);
      r.sign(x + s * .2, 1.38, z - .1, .5, .16, 'מד לחץ דם', { bg: '#2f6fb0', fg: '#fff' }, s > 0 ? -HALF : HALF);
    }
    // Basket stack by the door and the green cross in the window.
    const bk = r.first([[r.door.lx + 1.3, zf - .35], [r.door.lx - 1.3, zf - .35]], .45, .35);
    if (bk) { r.claim(bk[0], bk[1], .45, .35, .5); for (let i = 0; i < 5; i++) r.box(bk[0], .1 + i * .06, bk[1], .42, .16, .3, '#d23c2b', MAT.gloss); }
    r.sign(x1 - .5, r.h - .55, -.13, .5, .5, '✚', { bg: '#1f8a4c', fg: '#ffffff', weight: 900, glow: .6 });
  },
};

const flowers: InteriorSet = {
  name: 'flowers', he: 'פרחים', en: 'FLOWER SHOP', size: [4.4, 6],
  floor: '#8f8a80', floorMat: MAT.paving, wall: '#eef0ea', light: '#fff4e0', sign: { bg: '#f3efe6', fg: '#a3416a' }, look: { shirt: '#6a8a5a', pants: '#2f3b4f', apron: '#3f5a3a' },
  counter: r => ({ lx: (r.x0 + r.x1) / 2 + (r.door.lx > 0 ? -.3 : .3), lz: r.zb + 1.7, w: Math.min(2.2, r.w * .5), color: '#7a5a3c', top: '#e8e0cc', mat: MAT.wood }),
  furnish(r) {
    const c = r.counter!, { x0, x1, zb, zf } = r, FL = ['#d94a6a', '#f2d24a', '#f2f0ee', '#b84ad9', '#f28a3a', '#e8304a', '#f4b0c0', '#7a4ad9'];
    const bunch = (x: number, y: number, z: number, i: number, n = 7) => {
      r.prim(PRIMS.ico, MAT.foliage, x, y + .3, z, .1, .08, .1, '#56743f');
      for (let j = 0; j < n; j++) { const a = j * 2.4 + i, rr = .085 * (j % 3 ? 1 : .35), hx = x + Math.cos(a) * rr, hz = z + Math.sin(a) * rr; r.cyl((x + hx) / 2, y + .2, (z + hz) / 2, .006, .4, '#4a7a3a', MAT.plain, true); r.prim(PRIMS.cyl6, MAT.matte, hx, y + .42 + (j % 3) * .04, hz, .05, .04, .05, FL[(i * 3 + j) % FL.length]); }
    };
    const bucket = (x: number, z: number, i: number, y = 0, s = 1) => { r.prim(PRIMS.cyl6, MAT.metal, x, y + .18 * s, z, .13 * s, .36 * s, .13 * s, '#8d9496'); bunch(x, y + .3 * s - .1, z, i); };
    // Wrapping table: kraft roll, ribbon spools, a sheet of paper and a bouquet in a vase.
    const rx = c.lx - c.w / 2 + .5; r.bar(rx, c.h + .15, c.lz - .18, .08, .8, 'x', '#c9a26a', MAT.plain); for (const e of [-1, 1]) r.box(rx + e * .43, c.h + .09, c.lz - .18, .03, .18, .12, '#3a3a3a', MAT.metal);
    for (let i = 0; i < 5; i++) r.bar(c.lx + .25 + i * .08, c.h + .06, c.lz - .2, .045, .03, 'x', FL[i], MAT.gloss);
    r.box(c.lx - .15, c.h + .005, c.lz + .15, .55, .005, .38, '#c9a26a'); r.box(c.lx + .2, c.h + .02, c.lz + .15, .02, .01, .14, '#3a3a3a', MAT.metal);
    r.cyl(c.lx + .55, c.h + .12, c.lz + .1, .07, .24, '#a8c8d8', MAT.gloss, true); bunch(c.lx + .55, c.h + .02, c.lz + .1, 3, 9);
    // Glass flower cooler on one side wall, flower buckets on stands along the other.
    const sL = r.door.lx > 0, cx = sL ? x0 + .4 : x1 - .4, s = sL ? 1 : -1, cl = Math.min(1.6, zf - zb - 1.5), cz = zb + .2 + cl / 2;
    if (r.claim(cx, cz, .8, cl, 2.1)) {
      r.box(cx - s * .38, 1.05, cz, .04, 2.1, cl, '#e9e9e4', MAT.metal); r.box(cx, 2.08, cz, .8, .06, cl, '#e9e9e4', MAT.metal); r.box(cx, .03, cz, .8, .06, cl, '#e9e9e4', MAT.metal);
      for (const e of [-1, 1]) r.box(cx, 1.05, cz + e * (cl / 2 - .02), .8, 2.1, .04, '#e9e9e4', MAT.metal);
      r.glass(cx + s * .39, 1.05, cz, .02, 1.98, cl - .06); r.box(cx + s * .39, 1.05, cz, .03, 1.98, .04, '#9a9c9a', MAT.metal); r.glow(cx, 2.02, cz, .5, .02, cl - .2);
      r.box(cx, 1.0, cz, .76, .03, cl - .06, '#cfd3d4', MAT.metal);
      for (let k = 0; k < 2; k++) for (let i = 0; i < Math.floor((cl - .1) / .34); i++) bucket(cx, cz - cl / 2 + .22 + i * .34, i + k * 5, .06 + k * .96, .8);
      r.sign(cx, 2.24, cz, .7, .2, 'פרחים טריים', { bg: '#3f5a3a', fg: '#fff' }, s > 0 ? HALF : -HALF);
    }
    r.run(sL ? 'R' : 'L', zb + .3, zf - .3, .5, 1.3, (x, z, len) => {
      r.box(x, .2, z, .5, .4, len, '#7a5a3c', MAT.wood); r.box(x - s * .12, .55, z, .25, .3, len, '#7a5a3c', MAT.wood);
      for (let i = 0; i < Math.floor(len / .3); i++) { const zz = z - len / 2 + .15 + i * .3; bucket(x + s * .1, zz, i * 2, .4, .8); bucket(x - s * .12, zz + .1, i * 2 + 1, .7, .7); }
    });
    // Buckets on the floor by the window and hanging plants.
    r.pack(x0 + .2, x1 - .2, c.lz + c.d / 2 + .9, zf - .1, .34, .34, 4, (x, z) => { bucket(x, z, Math.round(x * 7 + z)); r.hit(x, z, .3, .3, .6); }, .15);
    for (let i = 0; i < 2; i++) { const x = x0 + .6 + i * (x1 - x0 - 1.2), z = zf - .5; r.cyl(x, r.h - .5, z, .004, 1, '#3a3a3a', MAT.metal, true); r.cyl(x, r.h - 1.05, z, .14, .16, '#c9b28a', MAT.plain, true); for (let j = 0; j < 4; j++) r.prim(PRIMS.ico, MAT.foliage, x + Math.cos(j * 1.6) * .1, r.h - 1.15 - j * .08, z + Math.sin(j * 1.6) * .1, .1, .16, .1, '#56743f'); }
    if (r.fits(x1 - .35, zb + .35, .5, .5) && !sL) r.plant(x1 - .35, 0, zb + .35, 1.3, '#d9d2c4'); else if (r.fits(x0 + .35, zb + .35, .5, .5)) r.plant(x0 + .35, 0, zb + .35, 1.3, '#d9d2c4');
    r.shelves(c.lx, zb + .18, Math.min(2.2, r.w - 2), .28, 2.2, 3, 'x', (i, k) => k === 0 ? null : ['#a8c8d8', '#f2efe6', '#c9a26a', '#e8e4dc'][(i + k) % 4], { pitch: .3, shape: 'can', ih: .26, frame: '#7a5a3c', board: '#c9a26a' });
  },
};

// ——— Al-HaKav (public transport service centre), from the owner's reference photos ———
const LIME = '#9cc43a', PURPLE = '#7a2a7a', ALHAKAV_SUB = 'מרכז שירות לתחבורה הציבורית';
/** The "על-הקו" mark: a lime rounded blob with white lettering and a stylised white figure. */
function alhakavMark(c: CanvasRenderingContext2D, cx: number, cy: number, bh: number) {
  const bw = bh * 1.75, TAU = Math.PI * 2;
  c.fillStyle = LIME; c.beginPath(); c.ellipse(cx, cy, bw / 2, bh / 2, -.06, 0, TAU); c.fill();
  c.beginPath(); c.ellipse(cx + bw * .3, cy - bh * .2, bw * .2, bh * .32, .4, 0, TAU); c.fill();
  c.fillStyle = '#ffffff'; c.beginPath(); c.arc(cx + bw * .31, cy - bh * .28, bh * .085, 0, TAU); c.fill();
  c.strokeStyle = '#ffffff'; c.lineCap = 'round'; c.lineWidth = bh * .075;
  c.beginPath(); c.moveTo(cx + bw * .3, cy - bh * .13); c.quadraticCurveTo(cx + bw * .37, cy + bh * .08, cx + bw * .27, cy + bh * .3); c.stroke();
  c.beginPath(); c.moveTo(cx + bw * .31, cy - bh * .07); c.lineTo(cx + bw * .42, cy - bh * .22); c.stroke();
  c.textAlign = 'center'; c.textBaseline = 'middle'; c.direction = 'rtl'; c.font = `900 ${bh * .4}px Arial, "Segoe UI", sans-serif`; c.fillText('על-הקו', cx - bw * .1, cy + bh * .03, bw * .62);
}
function alhakavSub(c: CanvasRenderingContext2D, x: number, y: number, size: number, maxW: number, color = PURPLE) {
  c.fillStyle = color; c.textAlign = 'center'; c.textBaseline = 'middle'; c.direction = 'rtl'; c.font = `700 ${size}px Arial, "Segoe UI", sans-serif`; c.fillText(ALHAKAV_SUB, x, y, maxW);
}
function blueSign(kind: 'wheelchair' | 'loop') {
  return (c: CanvasRenderingContext2D, W: number, H: number) => {
    const s = Math.min(W, H), TAU = Math.PI * 2; c.fillStyle = '#1f5fbf'; c.fillRect(0, 0, W, H); c.strokeStyle = '#fff'; c.fillStyle = '#fff'; c.lineCap = 'round'; c.lineWidth = s * .07;
    if (kind === 'wheelchair') {
      c.beginPath(); c.arc(s * .46, s * .2, s * .07, 0, TAU); c.fill();
      c.beginPath(); c.moveTo(s * .44, s * .31); c.lineTo(s * .44, s * .55); c.lineTo(s * .64, s * .55); c.lineTo(s * .73, s * .78); c.stroke();
      c.beginPath(); c.moveTo(s * .44, s * .42); c.lineTo(s * .6, s * .42); c.stroke();
      c.beginPath(); c.arc(s * .42, s * .64, s * .2, Math.PI * .1, Math.PI * 1.55); c.stroke();
    } else {
      c.beginPath(); c.arc(s * .45, s * .38, s * .2, Math.PI * .95, Math.PI * 2.25); c.stroke();
      c.beginPath(); c.moveTo(s * .6, s * .52); c.quadraticCurveTo(s * .45, s * .62, s * .45, s * .8); c.stroke();
      c.beginPath(); c.moveTo(s * .2, s * .85); c.lineTo(s * .8, s * .2); c.stroke();
      c.font = `900 ${s * .3}px Arial, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('T', s * .78, s * .74);
    }
  };
}
const alhakavSeats = (r: Room) => { const c = r.counter!, n = Math.max(2, Math.min(4, Math.floor(c.w / 1.7))); return Array.from({ length: n }, (_, i) => c.lx - c.w / 2 + (i + .5) * c.w / n); };
const alhakav: InteriorSet = {
  name: 'alhakav', he: 'על-הקו', en: 'PUBLIC TRANSPORT SERVICE CENTRE', size: [10, 8],
  floor: '#d9d9d4', wall: '#f7f7f5', ceiling: '#f4f4f2', light: '#f6f8ff', spots: true, sign: { bg: '#ffffff', fg: PURPLE }, look: { shirt: LIME, pants: '#2f3a33' },
  counter: r => ({ lx: (r.x0 + r.x1) / 2 + (r.door.lx > 0 ? -.4 : .4), lz: r.zb + 1.9, w: Math.min(6, r.w - 2.2), color: LIME, top: '#f4f4f2', h: 1.05 }),
  keeper: r => { const c = r.counter!, x = alhakavSeats(r).reduce((a, b) => Math.abs(b - r.door.lx) < Math.abs(a - r.door.lx) ? b : a); return [x, c.lz - c.d / 2 - .4]; },
  signboard(r, lx, y, lz, w, h) {
    r.box(lx, y, lz - .07, w + .1, h + .08, .12, '#ffffff');
    r.paint(lx, y, lz, w, h, (c, W, H) => { c.fillStyle = '#ffffff'; c.fillRect(0, 0, W, H); alhakavMark(c, W * .78, H * .5, H * .82); alhakavSub(c, W * .36, H * .52, H * .3, W * .6); });
  },
  furnish(r) {
    const c = r.counter!, { x0, x1, zb, zf, h } = r, seats = alhakavSeats(r), sw = c.w / seats.length, [kx] = r.keeperAt!;
    // Counter front: the logo panel, blue accessibility signs; desks: partitions, screens, card printers.
    const mid = seats[Math.floor((seats.length - 1) / 2)] + (seats.length % 2 ? 0 : sw / 2);
    r.paint(mid, .58, c.lz + c.d / 2 + .012, Math.min(1.7, sw * .9), .62, (g, W, H) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H); alhakavMark(g, W / 2, H * .4, H * .62); alhakavSub(g, W / 2, H * .86, H * .12, W * .94); });
    r.paint(seats[0] - sw / 2 + .3, .82, c.lz + c.d / 2 + .012, .24, .24, blueSign('wheelchair'));
    r.paint(kx + sw / 2 - .3, .82, c.lz + c.d / 2 + .012, .24, .24, blueSign('loop'));
    for (let i = 0; i <= seats.length; i++) r.glass(c.lx - c.w / 2 + i * sw, c.h + .32, c.lz, .02, .6, c.d - .04);
    seats.forEach((x, i) => {
      r.glass(x, c.h + .37, c.lz + c.d / 2 - .04, sw - .12, .5, .015); r.box(x, c.h + .63, c.lz + c.d / 2 - .04, sw - .1, .03, .03, '#d9dadb', MAT.metal);
      r.box(x - .15, c.h + .3, c.lz - .12, .5, .32, .03, '#1d1d1d', MAT.gloss); r.glow(x - .15, c.h + .3, c.lz - .14, .46, .28, .005); r.box(x - .15, c.h + .08, c.lz - .1, .05, .14, .05, '#3a3a3a', MAT.metal);
      r.box(x - .15, c.h + .03, c.lz + .06, .4, .02, .14, '#2a2a2a');
      if (i % 2 === 0) { r.box(x + .38, c.h + .1, c.lz - .05, .3, .18, .34, '#e9e9e4', MAT.gloss); r.box(x + .38, c.h + .12, c.lz + .13, .2, .01, .02, '#1d1d1d'); r.box(x + .38, c.h + .04, c.lz + .2, .09, .002, .056, '#1f5fbf'); }
      r.prim(PRIMS.box, MAT.gloss, x + .3, c.h + .12, c.lz + .2, .16, .1, .02, '#1d1d1d', 0, -.4);
      r.sign(x, c.h + .78, c.lz + c.d / 2 - .04, .3, .18, `${i + 1}`, { bg: PURPLE, fg: '#fff', weight: 900 });
      if (x !== kx) { r.kit.chair(r.f, x, c.lz - c.d / 2 - .45, 0, '#2a2a2a', 0, true); if (i === seats.length - 1 || seats.length < 3) r.person(x, c.lz - c.d / 2 - .4, { shirt: LIME, pants: '#3b3d3a', seed: 31 + i, dress: i % 2 === 1 }); }
    });
    // Purple chevrons on the white wall leading to the counter, the queue display, plaques.
    const chevrons = (g: CanvasRenderingContext2D, W: number, H: number) => { g.strokeStyle = PURPLE; g.lineWidth = H * .16; g.lineCap = 'round'; g.lineJoin = 'round'; for (let i = 0; i < 6; i++) { const x = W * (.08 + i * .16); g.beginPath(); g.moveTo(x, H * .2); g.lineTo(x + H * .3, H * .5); g.lineTo(x, H * .8); g.stroke(); } };
    r.paint(x0 + .012, 2.35, Math.max(zb + 1.6, zf - 3.2) , 2.6, .45, chevrons, HALF);
    r.paint(x1 - .012, 2.35, Math.max(zb + 1.6, zf - 3.2), 2.6, .45, chevrons, -HALF);
    r.sign(c.lx, 2.55, zb + .03, 1.6, .4, 'תור 047  ←  עמדה 2', { bg: '#141414', fg: '#ff5a3a', weight: 800, glow: .5 });
    r.paint(c.lx + Math.min(2.4, c.w / 2), 2.5, zb + .015, 1.5, .5, (g, W, H) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H); alhakavMark(g, W * .8, H * .5, H * .8); alhakavSub(g, W * .34, H * .5, H * .17, W * .6); });
    r.sign(x0 + .015, 1.65, zf - .55, .5, .3, 'משרד התחבורה\nוהבטיחות בדרכים', { bg: '#ffffff', fg: '#1d3f7a', weight: 700, border: true }, HALF);
    r.sign(x0 + .015, 1.65, zf - 1.15, .5, .3, 'הרשות הלאומית\nלתחבורה ציבורית', { bg: '#ffffff', fg: '#1d3f7a', weight: 700, border: true }, HALF);
    // Split air-conditioner high on the right wall.
    const az = (zb + zf) / 2; r.box(x1 - .12, h - .45, az, .22, .3, 1, '#f4f4f2', MAT.gloss); r.box(x1 - .235, h - .56, az, .01, .05, .9, '#9a9c9a', MAT.metal); r.glow(x1 - .235, h - .4, az + .4, .005, .02, .02);
    // Green roll-up banner by the door, angled to the room.
    const s = r.door.lx > (x0 + x1) / 2 ? -1 : 1, ban = r.first([[r.door.lx + s * 1.6, zf - .45], [r.door.lx - s * 1.6, zf - .45], [r.door.lx + s * 1.6, zf - 1.6]], .9, .5);
    if (ban) {
      const [bx, bz] = ban, side = bx > r.door.lx ? 1 : -1; r.claim(bx, bz, .9, .5, 2.1);
      r.box(bx, .04, bz, .9, .08, .25, '#9a9c9a', MAT.metal); r.cyl(bx, 1.1, bz - .08, .012, 2.1, '#9a9c9a', MAT.metal, true);
      r.paint(bx, 1.12, bz, .85, 2, (g, W, H) => {
        g.fillStyle = LIME; g.fillRect(0, 0, W, H); g.fillStyle = '#ffffff'; g.fillRect(W * .06, H * .04, W * .88, H * .2);
        alhakavMark(g, W / 2, H * .12, H * .15); alhakavSub(g, W / 2, H * .29, H * .03, W * .9, '#ffffff');
        g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.direction = 'rtl'; g.font = `700 ${H * .036}px Arial, sans-serif`;
        ['טעינת רב-קו', 'הנפקת כרטיס אישי', 'עדכון פרופיל נוסע', 'הנחות לסטודנטים ולאזרחים ותיקים', 'מידע על קווים ותחנות'].forEach((t, i) => g.fillText(t, W / 2, H * (.42 + i * .085), W * .9));
        g.fillStyle = PURPLE; g.fillRect(0, H * .88, W, H * .12);
      }, -side * Math.PI / 4);
    }
    // Queue-ticket machine on the other side of the door; waiting chairs facing the counter.
    const tk = r.first([[r.door.lx - s * 1.5, zf - .45], [r.door.lx - s * 1.5, zf - 1.4], [r.door.lx + s * 1.5, zf - 1.6]], .5, .45);
    if (tk) {
      const [tx, tz] = tk; r.claim(tx, tz, .5, .45, 1.4);
      r.box(tx, .55, tz, .42, 1.1, .32, '#f4f4f2', MAT.gloss); r.box(tx, .3, tz + .165, .42, .5, .01, LIME); r.prim(PRIMS.box, MAT.gloss, tx, 1.25, tz + .02, .4, .32, .05, '#1d1d1d', 0, -.35); r.glow(tx, 1.25, tz + .05, .34, .26, .005);
      r.box(tx, .9, tz + .17, .16, .02, .02, '#1d1d1d'); r.box(tx, .86, tz + .19, .06, .06, .005, '#f8f8f6'); r.sign(tx, 1.52, tz, .42, .14, 'קחו מספר', { bg: PURPLE, fg: '#fff' });
    }
    r.pack(x0 + .3, x1 - .3, c.lz + c.d / 2 + 1.5, zf - .7, 2.3, .6, 2, (x, z) => {
      r.box(x, .36, z, 2.2, .04, .06, '#7a7d80', MAT.metal); for (const e of [-1, 1]) { r.box(x + e * 1.0, .18, z, .05, .36, .5, '#7a7d80', MAT.metal); }
      for (let i = 0; i < 4; i++) { const sx = x - .825 + i * .55; r.box(sx, .44, z, .48, .06, .44, '#3a3d40', MAT.gloss); r.prim(PRIMS.box, MAT.gloss, sx, .72, z + .22, .48, .5, .05, '#3a3d40', 0, .12); }
      r.hit(x, z, 2.3, .55, .9);
    }, .9);
    const lf = r.first([[x1 - .3, zf - .5], [x0 + .3, zf - 1.8]], .4, .3); if (lf) { r.claim(lf[0], lf[1], .4, .3, 1.4); r.box(lf[0], .7, lf[1], .36, 1.4, .26, '#d9dadb', MAT.metal); for (let k = 0; k < 4; k++) r.box(lf[0], .5 + k * .25, lf[1] + .1, .3, .2, .02, [LIME, '#ffffff', PURPLE, '#f2d24a'][k]); }
    if (r.fits(x1 - .35, zb + .35, .5, .5)) r.plant(x1 - .35, 0, zb + .35, 1.2, '#e9e9e4');
  },
};

const cinemaLobby: InteriorSet = {
  name: 'cinemaLobby', he: 'קולנוע זוהר', en: 'ZOHAR CINEMA · EVA & BATYA CAFÉ', size: [14, 10],
  floor: '#3a3330', wall: '#3a2f2c', ceiling: '#2a2524', light: '#ffd9a0', spots: true, sign: { bg: '#1a1414', fg: '#f2c84b' }, look: { shirt: '#7a1f24', pants: '#1d1d1d' },
  counter: r => { const w = Math.min(2.8, r.w * .3); return { lx: r.x0 + w / 2 + .4, lz: r.zb + 1.8, w, color: '#7a1f24', top: '#d8b25a' }; },
  furnish(r) {
    const c = r.counter!, { x0, x1, zb, zf, h } = r;
    // The café counter (Eva & Batya) and its barista, a second keeper with her own walkway.
    const cw = Math.min(3, r.w * .3), cx = x1 - cw / 2 - .4, cz = zb + 1.8, cd = .7, ch = 1.02, bz = cz - cd / 2 - .4;
    r.box(cx, (ch - .04) / 2, cz, cw, ch - .04, cd, '#d9c3a0', MAT.wood, true); r.box(cx, ch - .02, cz + .02, cw + .06, .04, cd + .08, '#f2ece0', MAT.gloss); r.hit(cx, cz, cw, cd, ch); r.reserve(cx, cz, cw, cd);
    r.reserve(cx, bz, .7, .6); r.path(cx, cz + cd / 2 + .8);
    const barista = r.person(cx, bz, { shirt: '#2a2a2a', pants: '#1d1d1d', seed: 77, apron: '#d9c3a0', dress: true });
    r.kit.register(`keeper_${r.id}_barista`, barista.focus, { he: 'הזמנה מהבריסטה', en: 'Order from the barista' }, 4.4);
    // Espresso machine, grinder, cups; a pastry case with croissants and cake.
    const ex = cx + cw / 2 - .55; r.box(ex, ch + .22, cz - .12, .7, .4, .45, '#c9cbcc', MAT.metal); r.box(ex, ch + .44, cz - .12, .72, .04, .47, '#2a2a2a', MAT.metal);
    for (const e of [-1, 1]) { r.cyl(ex + e * .18, ch + .12, cz + .12, .04, .06, '#3a3a3a', MAT.metal, true); r.box(ex + e * .18, ch + .02, cz + .14, .14, .02, .12, '#1d1d1d', MAT.metal); }
    for (let i = 0; i < 4; i++) { const [x, z] = r.f.at(ex - .24 + i * .16, cz - .2); r.kit.cup(x, r.f.y + ch + .46, z, '#f2efe6', '#7a1f24'); }
    r.cyl(ex - .55, ch + .2, cz - .15, .08, .4, '#1d1d1d', MAT.gloss, true); r.prim(PRIMS.cone, MAT.gloss, ex - .55, ch + .48, cz - .15, .1, .18, .1, '#5a3a20');
    r.vitrine(cx - cw / 2 + .7, cz + .05, 1.2, cd - .1, .42, '#d9c3a0', (x, y, z, i) => { if (i % 2) r.prim(PRIMS.ico, MAT.matte, x, y + .04, z, .07, .035, .045, '#c48a43', i); else { r.cyl(x, y + .04, z, .08, .07, ['#f2e8d8', '#5a3420', '#e8b0b8'][i % 3], MAT.matte, true); } }, .2, false, ch);
    r.sign(cx, 2.5, zb + .03, Math.min(2.8, cw), .7, 'אווה ובתיה\nקפה · מאפה · כריכים', { bg: '#f2ece0', fg: '#5a3420', weight: 700 });
    r.sign(cx, 1.75, zb + .03, Math.min(2.4, cw - .2), .5, 'אספרסו ₪9 · הפוך ₪14\nקרואסון ₪12 · עוגה ₪18', { bg: '#1d1d1b', fg: '#f2ece0', weight: 600 });
    r.shelves(cx, zb + .15, Math.min(2.4, cw), .25, 1.4, 2, 'x', (i, k) => ['#f2efe6', '#c9a24a', '#5a3420'][(i + k) % 3], { pitch: .2, shape: 'can', ih: .14, frame: '#5a3420', board: '#d9c3a0' }); r.hit(cx, zb + .15, Math.min(2.4, cw), .28, 1.4);
    // Ticket counter: glass screen, ticket printer, showtimes above.
    r.glass(c.lx, c.h + .4, c.lz + c.d / 2 - .05, c.w - .1, .7, .015); r.box(c.lx, c.h + .77, c.lz + c.d / 2 - .05, c.w - .06, .04, .04, '#d8b25a', MAT.metal);
    r.box(c.lx + .5, c.h + .1, c.lz - .05, .25, .18, .3, '#2a2a2a', MAT.gloss); r.prim(PRIMS.box, MAT.gloss, c.lx - .3, c.h + .22, c.lz - .12, .4, .26, .03, '#1d1d1d', 0, -.15);
    r.sign(c.lx, 2.45, zb + .03, Math.min(2.6, c.w), .75, 'קופה · הקרנות היום\n17:00 · 19:30 · 21:45', { bg: '#141414', fg: '#f2c84b', weight: 700, glow: .4 });
    r.sign(c.lx, 3 > h - .3 ? h - .3 : 2.95, c.lz + c.d / 2, 1.2, .26, 'כרטיסים · TICKETS', { bg: '#7a1f24', fg: '#f2c84b', weight: 800, glow: .3 });
    // Double doors into the hall, with a closing rope.
    const hx = (c.lx + c.w / 2 + cx - cw / 2) / 2;
    r.box(hx, 1.2, zb + .02, 2.1, 2.4, .04, '#1d1d1d', MAT.metal);
    for (const e of [-1, 1]) {
      r.box(hx + e * .46, 1.15, zb + .05, .9, 2.25, .05, '#5a1a1e', MAT.plain); r.bar(hx + e * .46, 1.65, zb + .08, .1, .02, 'z', '#2a2a2a', MAT.gloss, false);
      r.box(hx + e * .12, 1.05, zb + .1, .04, .5, .03, '#d8b25a', MAT.metal);
      for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) r.box(hx + e * .46 + (i - 1) * .25, .45 + j * .25, zb + .08, .025, .025, .01, '#d8b25a', MAT.metal);
    }
    r.sign(hx, 2.55, zb + .04, 1.1, .3, 'אולם 1 · HALL 1', { bg: '#141414', fg: '#ff9a3a', weight: 800, glow: .6 });
    if (r.claim(hx, zb + 1.1, 2.2, .2, 1)) { for (const e of [-1, 1]) { r.cyl(hx + e * 1.05, .48, zb + 1.1, .03, .95, '#d8b25a', MAT.metal, true); r.cyl(hx + e * 1.05, .02, zb + 1.1, .14, .04, '#d8b25a', MAT.metal, true); } r.prim(PRIMS.cyl6, MAT.plain, hx, .85, zb + 1.1, .02, 2.05, .02, '#9a1a24', 0, 0, HALF); }
    // Film posters (invented titles) in lit frames on both walls.
    const films: Array<[string, string, string]> = [['הלילה שבעמק', 'עכשיו בקולנוע', '#1d2a44'], ['שומר הגבעה', 'בקרוב', '#4a2a1a'], ['קיץ בטבעון', 'עכשיו בקולנוע', '#2e5c5a'], ['רכבת הלילה', 'בקרוב', '#3a1a3a'], ['האור האחרון', 'הקרנת בכורה', '#5a3a14'], ['מסע אל הכרמל', 'משפחה', '#2a4a2a']];
    let fi = 0;
    for (const [side, x, face] of [['L', x0, HALF], ['R', x1, -HALF]] as const) for (let z = zf - .9; z > zb + 3 && fi < films.length; z -= 1.4) {
      const [t, sub, bg] = films[fi++], s = side === 'L' ? 1 : -1;
      r.box(x + s * .03, 1.65, z, .05, 1.35, .98, '#d8b25a', MAT.metal); r.sign(x + s * .065, 1.65, z, .86, 1.22, t, { bg, fg: '#f2e8cf', sub, weight: 800, glow: .25 }, face);
    }
    // Popcorn machine by the ticket counter.
    const pc = r.first([[c.lx + c.w / 2 + .45, c.lz + .2], [x0 + .4, c.lz + c.d / 2 + 1]], .6, .5);
    if (pc) {
      const [px, pz] = pc; r.claim(px, pz, .6, .5, 1.6);
      r.box(px, .45, pz, .55, .9, .45, '#c8302a', MAT.gloss); r.glass(px, 1.2, pz, .53, .6, .43); r.box(px, 1.0, pz, .5, .18, .4, '#f2d86a', MAT.matte);
      r.cyl(px, 1.38, pz, .1, .08, '#b9bcbd', MAT.metal, true); r.box(px, 1.53, pz, .57, .06, .47, '#c8302a', MAT.gloss); r.sign(px, 1.65, pz + .1, .5, .16, 'פופקורן', { bg: '#c8302a', fg: '#f2d86a', weight: 800 });
    }
    // Small café tables in front of the café counter, and a lobby bench.
    let seed = 3; r.pack(hx - .4, x1 - .1, cz + cd / 2 + 1.4, zf - .2, 1.5, .8, 4, (x, z) => { r.table(x, z, { round: true, size: .6, top: '#f2ece0', chair: '#1d1d1d', plastic: false, diner: seed % 2 ? seed : undefined }); seed += 3; }, .5);
    r.pack(x0 + .1, hx, c.lz + c.d / 2 + 1.4, zf - .2, 1.8, .5, 1, (x, z) => { r.box(x, .42, z, 1.8, .08, .45, '#7a1f24', MAT.plain, true); for (const e of [-1, 1]) r.box(x + e * .8, .2, z, .06, .4, .4, '#1d1d1d', MAT.metal); r.hit(x, z, 1.8, .45, .5); }, .4);
    for (let x = x0 + .8; x < x1; x += 1.6) r.glow(x, h - .03, zb + .5, .5, .02, .06);
  },
};

export const INTERIORS: Record<string, InteriorSet> = { restaurant, print, camera, pilates, paint, chocolate, pharmacy, flowers, alhakav, cinemaLobby };
