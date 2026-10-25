import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { WorldContext, LocalText } from './types';
import { worldMaterial } from './materials';
import { surfaceHeight } from './terrain';

/** Shared builders. All geometry is original and procedural. Static parts are written into
 *  a chunked batcher (one mesh per 64 m tile and material) so the larger town stays cheap
 *  to draw and still frustum-culls; animated people, signs and story objects stay separate. */
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const UNIT_CYL = new THREE.CylinderGeometry(1, 1, 1, 12);
const UNIT_CYL6 = new THREE.CylinderGeometry(1, 1, 1, 6);
const UNIT_SPHERE = new THREE.SphereGeometry(1, 12, 9);
const UNIT_ICO = new THREE.IcosahedronGeometry(1, 1);
const UNIT_CONE4 = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1).rotateY(Math.PI / 4);
const UNIT_CONE = new THREE.ConeGeometry(1, 1, 10);
export const PRIMS = { box: UNIT_BOX, cyl: UNIT_CYL, cyl6: UNIT_CYL6, sphere: UNIT_SPHERE, ico: UNIT_ICO, roof: UNIT_CONE4, cone: UNIT_CONE };

type Item = { geo: THREE.BufferGeometry; m: THREE.Matrix4; c: THREE.Color | null };
export class Batcher {
  private buckets = new Map<string, { material: THREE.Material; shadow: boolean; items: Item[] }>();
  constructor(private root: THREE.Object3D, private chunk = 160) {}
  add(geo: THREE.BufferGeometry, material: THREE.Material, m: THREE.Matrix4, color?: THREE.ColorRepresentation | null, shadow = true) {
    const e = m.elements, cx = Math.floor(e[12] / this.chunk), cz = Math.floor(e[14] / this.chunk);
    const key = `${material.uuid}|${shadow}|${cx},${cz}`;
    let b = this.buckets.get(key); if (!b) { b = { material, shadow, items: [] }; this.buckets.set(key, b); }
    b.items.push({ geo, m, c: color == null ? null : new THREE.Color(color) });
  }
  private tmp = new THREE.Object3D();
  place(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, rotY = 0, color?: THREE.ColorRepresentation | null, shadow = true, rotX = 0, rotZ = 0) {
    const t = this.tmp; t.position.set(x, y, z); t.rotation.set(rotX, rotY, rotZ, 'YXZ'); t.scale.set(sx, sy, sz); t.updateMatrix();
    this.add(geo, mat, t.matrix.clone(), color, shadow);
  }
  box(mat: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number, rotY = 0, color?: THREE.ColorRepresentation | null, shadow = true) { this.place(UNIT_BOX, mat, x, y, z, w, h, d, rotY, color, shadow); }
  cyl(mat: THREE.Material, x: number, y: number, z: number, r: number, h: number, color?: THREE.ColorRepresentation | null, shadow = true) { this.place(UNIT_CYL, mat, x, y, z, r, h, r, 0, color, shadow); }
  /** Box in a local frame (origin ox,oz rotated by rot) — convenient for oriented buildings. */
  lbox(f: Frame, mat: THREE.Material, lx: number, y: number, lz: number, w: number, h: number, d: number, color?: THREE.ColorRepresentation | null, shadow = true) {
    const [x, z] = f.at(lx, lz); this.box(mat, x, f.y + y, z, w, h, d, f.rot, color, shadow);
  }
  flush() {
    const v = new THREE.Vector3(), n = new THREE.Vector3(), nm = new THREE.Matrix3();
    this.buckets.forEach(b => {
      let vc = 0, ic = 0; const colored = b.items.some(i => i.c);
      for (const it of b.items) { vc += it.geo.attributes.position.count; ic += it.geo.index ? it.geo.index.count : it.geo.attributes.position.count; }
      const pos = new Float32Array(vc * 3), nor = new Float32Array(vc * 3), col = colored ? new Float32Array(vc * 3) : null;
      const idx = vc > 65535 ? new Uint32Array(ic) : new Uint16Array(ic);
      let vo = 0, io = 0;
      for (const it of b.items) {
        const p = it.geo.attributes.position, q = it.geo.attributes.normal; nm.getNormalMatrix(it.m);
        for (let i = 0; i < p.count; i++) {
          v.fromBufferAttribute(p, i).applyMatrix4(it.m); n.fromBufferAttribute(q, i).applyMatrix3(nm).normalize();
          const o = (vo + i) * 3; pos[o] = v.x; pos[o + 1] = v.y; pos[o + 2] = v.z; nor[o] = n.x; nor[o + 1] = n.y; nor[o + 2] = n.z;
          if (col) { const c = it.c ?? WHITE; col[o] = c.r; col[o + 1] = c.g; col[o + 2] = c.b; }
        }
        if (it.geo.index) { const src = it.geo.index.array; for (let i = 0; i < src.length; i++) idx[io++] = src[i] + vo; }
        else for (let i = 0; i < p.count; i++) idx[io++] = vo + i;
        vo += p.count;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      if (col) g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.setIndex(new THREE.BufferAttribute(idx, 1)); g.computeBoundingSphere(); g.computeBoundingBox();
      const mesh = new THREE.Mesh(g, b.material); mesh.castShadow = b.shadow; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false; mesh.updateMatrix();
      this.root.add(mesh);
    });
    this.buckets.clear();
  }
}
const WHITE = new THREE.Color(1, 1, 1);
/** Frames within ~0.5° of the axes keep plain axis-aligned colliders. */
const aligned = (f: Frame) => Math.abs(f.sin * f.cos) < .01;

/** An oriented local frame: +z is "out of the front", x runs along the façade. */
export class Frame {
  readonly cos: number; readonly sin: number;
  constructor(public x: number, public z: number, public rot: number, public y = surfaceHeight(x, z)) { this.cos = Math.cos(rot); this.sin = Math.sin(rot); }
  at(lx: number, lz: number): [number, number] { return [this.x + lx * this.cos + lz * this.sin, this.z - lx * this.sin + lz * this.cos]; }
  /** Axis-aligned bounds of a local rectangle, used for colliders. */
  rect(lx: number, lz: number, w: number, d: number) {
    const pts = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([a, b]) => this.at(lx + a, lz + b));
    return { minX: Math.min(...pts.map(p => p[0])), maxX: Math.max(...pts.map(p => p[0])), minZ: Math.min(...pts.map(p => p[1])), maxZ: Math.max(...pts.map(p => p[1])) };
  }
}

/** Coarse 2 m occupancy grid so generated houses and trees keep off roads and landmarks. */
export class Occupancy {
  private cells = new Set<number>();
  private k(ix: number, iz: number) { return (ix + 2000) * 4096 + (iz + 2000); }
  mark(minX: number, maxX: number, minZ: number, maxZ: number) { for (let x = Math.floor(minX / 2); x <= Math.floor(maxX / 2); x++) for (let z = Math.floor(minZ / 2); z <= Math.floor(maxZ / 2); z++) this.cells.add(this.k(x, z)); }
  free(minX: number, maxX: number, minZ: number, maxZ: number) { for (let x = Math.floor(minX / 2); x <= Math.floor(maxX / 2); x++) for (let z = Math.floor(minZ / 2); z <= Math.floor(maxZ / 2); z++) if (this.cells.has(this.k(x, z))) return false; return true; }
  markDisc(x: number, z: number, r: number) { this.mark(x - r, x + r, z - r, z + r); }
  /** Oriented-rectangle versions (sampled every metre), so rotated buildings pack tightly. */
  private samples(f: Frame, lx: number, lz: number, w: number, d: number, fn: (x: number, z: number) => boolean) {
    for (let u = -w / 2; u <= w / 2 + .01; u += Math.min(1, w)) for (let v = -d / 2; v <= d / 2 + .01; v += Math.min(1, d)) { const [x, z] = f.at(lx + u, lz + v); if (!fn(x, z)) return false; }
    return true;
  }
  freeRect(f: Frame, lx: number, lz: number, w: number, d: number) { return this.samples(f, lx, lz, w, d, (x, z) => !this.cells.has(this.k(Math.floor(x / 2), Math.floor(z / 2)))); }
  markRect(f: Frame, lx: number, lz: number, w: number, d: number) { this.samples(f, lx, lz, w, d, (x, z) => { this.cells.add(this.k(Math.floor(x / 2), Math.floor(z / 2))); return true; }); }
}

export const MAT = {
  plaster: worldMaterial('plaster', { vertexColors: true, scale: 3.2, strength: .55 }),
  plasterRough: worldMaterial('plaster', { vertexColors: true, scale: 2.6, strength: 1 }),
  stone: worldMaterial('limestone', { vertexColors: true, scale: 2.2, strength: 1 }),
  paving: worldMaterial('paving', { vertexColors: true, scale: 2.2, strength: .9 }),
  asphalt: worldMaterial('asphalt', { vertexColors: true, scale: 3.5, strength: .9, roughness: .96 }),
  tiles: worldMaterial('tiles', { vertexColors: true, scale: 2.4, strength: 1 }),
  wood: worldMaterial('wood', { vertexColors: true, scale: 1.4, strength: .9, roughness: .75 }),
  soil: worldMaterial('soil', { vertexColors: true, scale: 3, strength: 1, roughness: 1 }),
  plain: worldMaterial(null, { vertexColors: true, roughness: .85 }),
  matte: worldMaterial(null, { vertexColors: true, roughness: 1 }),
  metal: worldMaterial(null, { vertexColors: true, roughness: .45, metalness: .55 }),
  gloss: worldMaterial(null, { vertexColors: true, roughness: .25, metalness: .1 }),
  foliage: worldMaterial(null, { vertexColors: true, roughness: .95 }),
};
/** Window glass and lamp globes glow after dusk; the game scales their emissive intensity. */
export const NIGHT = {
  window: new THREE.MeshStandardMaterial({ color: '#2f4547', roughness: .12, metalness: .5, emissive: '#ffcf8a', emissiveIntensity: 0 }),
  shopWindow: new THREE.MeshStandardMaterial({ color: '#9fb5b0', roughness: .08, metalness: .2, transparent: true, opacity: .32, emissive: '#ffd9a0', emissiveIntensity: 0, depthWrite: false }),
  bulb: new THREE.MeshStandardMaterial({ color: '#ffe3b0', emissive: '#ffc070', emissiveIntensity: .25 }),
};

export interface SignStyle { bg?: string; fg?: string; font?: string; sub?: string; border?: boolean; align?: 'center' | 'right' | 'left'; weight?: number; glow?: number }
export class Kit {
  readonly B: Batcher; readonly occ = new Occupancy();
  constructor(public ctx: WorldContext, public root: THREE.Object3D) { this.B = new Batcher(root); }
  collide(minX: number, maxX: number, minZ: number, maxZ: number, minY: number, maxY: number, gate?: string) { this.ctx.colliders.push({ minX, maxX, minZ, maxZ, minY, maxY, gate }); }
  /** Collider for a local box in a frame. */
  lcollide(f: Frame, lx: number, y: number, lz: number, w: number, h: number, d: number) {
    const r = f.rect(lx, lz, w, d), [cx, cz] = f.at(lx, lz);
    this.ctx.colliders.push({ ...r, minY: f.y + y - h / 2, maxY: f.y + y + h / 2, obb: aligned(f) ? undefined : { cx, cz, hx: w / 2, hz: d / 2, c: f.cos, s: f.sin } });
  }
  /** Solid local box: drawn and collidable. */
  solid(f: Frame, mat: THREE.Material, lx: number, y: number, lz: number, w: number, h: number, d: number, color?: THREE.ColorRepresentation) { this.B.lbox(f, mat, lx, y, lz, w, h, d, color); this.lcollide(f, lx, y, lz, w, h, d); }
  ground(minX: number, maxX: number, minZ: number, maxZ: number, y: number) { this.ctx.grounds.push({ minX, maxX, minZ, maxZ, y }); }
  lground(f: Frame, lx: number, lz: number, w: number, d: number, y: number) {
    const r = f.rect(lx, lz, w, d), [cx, cz] = f.at(lx, lz);
    this.ctx.grounds.push({ ...r, y: f.y + y, obb: aligned(f) ? undefined : { cx, cz, hx: w / 2, hz: d / 2, c: f.cos, s: f.sin } });
  }
  register(id: string, object: THREE.Object3D, label: LocalText, radius = 3.8) {
    // A story role replaces the default "chat with a local" target on the same character.
    const prev = this.ctx.interactables.findIndex(i => i.object === object); if (prev >= 0) this.ctx.interactables.splice(prev, 1);
    object.userData.interactionId = id; this.ctx.interactables.push({ id, object, label, radius });
  }
  /** An invisible interaction anchor at a local point of a frame. */
  anchor(f: Frame, id: string, lx: number, y: number, lz: number, label: LocalText, radius = 3.6) {
    const o = new THREE.Object3D(); const [x, z] = f.at(lx, lz); o.position.set(x, f.y + y, z); this.root.add(o); this.register(id, o, label, radius); return o;
  }
  light(x: number, y: number, z: number, color = '#ffcb82', intensity = 14, distance = 14) {
    const l = new THREE.PointLight(color, intensity, distance, 2); l.position.set(x, y, z); this.root.add(l); this.ctx.lights.push(l); return l;
  }
  /** Canvas sign, double-sided plane. Hebrew lines render right-to-left. */
  sign(f: Frame | null, lx: number, y: number, lz: number, w: number, h: number, main: string, s: SignStyle = {}, faceRot = 0, parent: THREE.Object3D = this.root) {
    const canvas = document.createElement('canvas'); const px = Math.min(1024, Math.max(256, Math.round(w * 180)));
    canvas.width = px; canvas.height = Math.max(32, Math.round(px * h / w));
    const c = canvas.getContext('2d')!; const W = canvas.width, H = canvas.height;
    c.fillStyle = s.bg ?? '#233a30'; c.fillRect(0, 0, W, H);
    if (s.border) { c.strokeStyle = s.fg ?? '#f2e8cf'; c.globalAlpha = .45; c.lineWidth = Math.max(2, H * .04); c.strokeRect(H * .07, H * .07, W - H * .14, H - H * .14); c.globalAlpha = 1; }
    c.fillStyle = s.fg ?? '#f2e8cf'; c.textBaseline = 'middle';
    const align = s.align ?? 'center'; c.textAlign = align; const ax = align === 'center' ? W / 2 : align === 'right' ? W - H * .25 : H * .25;
    const lines = main.split('\n'); const hasSub = !!s.sub;
    const mainH = hasSub ? H * .62 : H; const lh = mainH / lines.length;
    lines.forEach((line, i) => {
      c.direction = /[א-ת]/.test(line) ? 'rtl' : 'ltr';
      c.font = `${s.weight ?? 700} ${lh * .62}px ${s.font ?? 'Arial, "Segoe UI", sans-serif'}`;
      c.fillText(line, ax, lh * (i + .54), W * .92);
    });
    if (s.sub) { c.direction = /[א-ת]/.test(s.sub) ? 'rtl' : 'ltr'; c.font = `400 ${H * .17}px Arial, sans-serif`; c.globalAlpha = .85; c.fillText(s.sub, ax, H * .8, W * .92); c.globalAlpha = 1; }
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
    const mat = new THREE.MeshStandardMaterial({ map: texture, roughness: .7, side: THREE.DoubleSide });
    if (s.glow) { mat.emissive.set('#ffffff'); mat.emissiveMap = texture; mat.emissiveIntensity = s.glow; }
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    if (f) { const [x, z] = f.at(lx, lz); mesh.position.set(x, f.y + y, z); mesh.rotation.y = f.rot + faceRot; } else { mesh.position.set(lx, y, lz); mesh.rotation.y = faceRot; }
    parent.add(mesh); return mesh;
  }

  /** Double-sided plane painted by `draw` on a canvas (for shop logos); transparent where unpainted. */
  painted(f: Frame, lx: number, y: number, lz: number, w: number, h: number, draw: (c: CanvasRenderingContext2D, W: number, H: number) => void, faceRot = 0) {
    const canvas = document.createElement('canvas'); canvas.width = Math.min(1024, Math.max(256, Math.round(w * 220))); canvas.height = Math.max(32, Math.round(canvas.width * h / w));
    draw(canvas.getContext('2d')!, canvas.width, canvas.height);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: texture, roughness: .7, side: THREE.DoubleSide, alphaTest: .5 }));
    const [x, z] = f.at(lx, lz); mesh.position.set(x, f.y + y, z); mesh.rotation.y = f.rot + faceRot; this.root.add(mesh); return mesh;
  }

  // ——— furniture ———
  chair(f: Frame, lx: number, lz: number, angle: number, color = '#4f5d48', y = 0, plastic = false) {
    const g = new Frame(...f.at(lx, lz), f.rot + angle, f.y + y);
    const m = plastic ? MAT.gloss : MAT.wood;
    this.B.lbox(g, m, 0, .45, 0, .44, .05, .44, color); this.B.lbox(g, m, 0, .76, -.2, .44, .5, .05, color);
    for (const dx of [-.18, .18]) for (const dz of [-.18, .18]) this.B.lbox(g, MAT.metal, dx, .22, dz, .035, .45, .035, plastic ? color : '#2b2b28');
  }
  stool(f: Frame, lx: number, lz: number, y = 0, color = '#3b2a1e') {
    const [x, z] = f.at(lx, lz); this.B.cyl(MAT.wood, x, f.y + y + .74, z, .19, .06, color); this.B.cyl(MAT.metal, x, f.y + y + .37, z, .03, .74, '#222'); this.B.cyl(MAT.metal, x, f.y + y + .3, z, .16, .02, '#333');
  }
  table(f: Frame, lx: number, lz: number, opts: { y?: number; r?: number; square?: number; top?: string; cups?: number; bottle?: boolean; plate?: boolean; laptop?: boolean } = {}) {
    const y = f.y + (opts.y ?? 0); const [x, z] = f.at(lx, lz); const top = opts.top ?? '#b48a5c';
    if (opts.square) this.B.box(MAT.wood, x, y + .75, z, opts.square, .05, opts.square, f.rot, top); else this.B.cyl(MAT.wood, x, y + .75, z, opts.r ?? .5, .05, top);
    this.B.cyl(MAT.metal, x, y + .37, z, .04, .74, '#2a2a27'); this.B.cyl(MAT.metal, x, y + .02, z, .26, .04, '#2a2a27');
    for (let i = 0; i < (opts.cups ?? 2); i++) { const a = f.rot + i * 2.3 + lx; this.cup(x + Math.cos(a) * .22, y + .78, z + Math.sin(a) * .22); }
    if (opts.bottle) this.bottle(x - .05, y + .78, z + .08, '#5c6a37');
    if (opts.plate) { this.B.cyl(MAT.gloss, x + .12, y + .785, z - .1, .14, .015, '#f2efe6'); this.B.place(PRIMS.sphere, MAT.matte, x + .12, y + .81, z - .1, .07, .03, .06, 0, '#c99a52'); }
    if (opts.laptop) { this.B.box(MAT.metal, x - .1, y + .79, z, .34, .02, .24, f.rot + .3, '#b9bcc0'); this.B.place(PRIMS.box, MAT.metal, x - .1, y + .9, z - .11, .34, .22, .015, f.rot + .3, '#9da1a6', true, -.25); }
  }
  cup(x: number, y: number, z: number, color = '#efe7d6', glaze = '#2f4a6b') {
    this.B.place(PRIMS.cyl, MAT.gloss, x, y + .045, z, .04, .07, .04, 0, color, false);
    this.B.place(PRIMS.cyl, MAT.gloss, x, y + .09, z, .041, .025, .041, 0, glaze, false);
  }
  bottle(x: number, y: number, z: number, color: string) {
    this.B.place(PRIMS.cyl, MAT.gloss, x, y + .12, z, .035, .24, .035, 0, color, false);
    this.B.place(PRIMS.cyl, MAT.gloss, x, y + .29, z, .013, .1, .013, 0, color, false);
    this.B.place(PRIMS.cyl, MAT.matte, x, y + .12, z, .036, .07, .036, 0, '#efe6cf', false);
  }
  plant(x: number, y: number, z: number, size = 1, pot = '#a2643f') {
    this.B.place(PRIMS.cyl, MAT.matte, x, y + .2 * size, z, .2 * size, .4 * size, .2 * size, 0, pot);
    for (let i = 0; i < 4; i++) this.B.place(PRIMS.ico, MAT.foliage, x + Math.cos(i * 1.7) * .12 * size, y + (.55 + i * .08) * size, z + Math.sin(i * 1.7) * .12 * size, .24 * size, .3 * size, .24 * size, i, i % 2 ? '#56743f' : '#6c8a4a');
  }
  pendant(x: number, y: number, z: number, drop = .9, shade = '#1f1f1d') {
    this.B.place(PRIMS.cyl, MAT.metal, x, y - drop / 2, z, .006, drop, .006, 0, '#222', false);
    this.B.place(PRIMS.cone, MAT.metal, x, y - drop - .08, z, .18, .2, .18, 0, shade, false);
    const bulb = new THREE.Mesh(PRIMS.sphere, NIGHT.bulb); bulb.position.set(x, y - drop - .2, z); bulb.scale.setScalar(.06); this.root.add(bulb);
  }
  /** Low-poly character built from capsules, merged into one mesh per material. */
  person(f: Frame, lx: number, lz: number, opts: { shirt: string; pants: string; seed: number; angle?: number; seated?: boolean; gray?: boolean; y?: number; apron?: string; beard?: boolean; dress?: boolean }, parent: THREE.Object3D = this.root) {
    const [x, z] = f.at(lx, lz); const seated = !!opts.seated, s = opts.seed;
    const g = new THREE.Group(); g.position.set(x, f.y + (opts.y ?? 0), z); g.rotation.y = f.rot + (opts.angle ?? 0); parent.add(g);
    g.userData.animated = true;
    const parts: THREE.BufferGeometry[] = [];
    const put = (color: string, geo: THREE.BufferGeometry, px: number, py: number, pz: number, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) => {
      const m = new THREE.Matrix4().compose(new THREE.Vector3(px, py, pz), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, rz)), new THREE.Vector3(sx, sy, sz));
      let gg = geo.clone().applyMatrix4(m); if (gg.index) gg = gg.toNonIndexed(); gg.deleteAttribute('uv');
      const c = new THREE.Color(color), n = gg.attributes.position.count, col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
      gg.setAttribute('color', new THREE.BufferAttribute(col, 3)); parts.push(gg);
    };
    const skin = ['#c8936f', '#e0b494', '#a9744f', '#8a5a3c', '#e7c3a5'][s % 5];
    const hair = opts.gray ? '#b4b0a6' : ['#2d211a', '#4a3424', '#1c1a18', '#6d5236', '#8a6a44'][s % 5];
    const shoe = '#2a2826';
    const cap = (r: number, l: number) => new THREE.CapsuleGeometry(r, l, 4, 8);
    const hipY = seated ? .5 : .92, torsoY = hipY + .33;
    // Torso & hips
    put(opts.shirt, cap(.17, .3), 0, torsoY, 0, 1.05, 1, .72);
    put(opts.dress ? opts.shirt : opts.pants, cap(.155, .08), 0, hipY + .02, 0, 1.05, 1, .78);
    if (opts.apron) put(opts.apron, PRIMS.box, 0, torsoY - .12, .12, .3, .5, .02);
    // Neck, head, hair
    put(skin, PRIMS.cyl, 0, torsoY + .3, 0, .05, .1, .05);
    put(skin, PRIMS.sphere, 0, torsoY + .45, .01, .11, .13, .115);
    put(hair, PRIMS.sphere, 0, torsoY + .5, -.015, .118, .1, .12);
    if (s % 3 === 1 && !opts.gray) put(hair, cap(.07, .12), 0, torsoY + .4, -.08, 1, 1, .8);
    if (opts.beard || opts.gray) put(hair, PRIMS.sphere, 0, torsoY + .38, .06, .085, .07, .06);
    put('#1c1a18', PRIMS.sphere, -.04, torsoY + .47, .105, .014, .014, .01); put('#1c1a18', PRIMS.sphere, .04, torsoY + .47, .105, .014, .014, .01);
    // Arms
    const armDrop = .2 + (s % 3) * .25;
    for (const side of [-1, 1]) {
      put(opts.shirt, cap(.055, .22), side * .22, torsoY + .03, .02, 1, 1, 1, -armDrop * .6, side * .12);
      put(skin, cap(.045, .18), side * .25, torsoY - .22, .08 + armDrop * .12, 1, 1, 1, -armDrop, side * .05);
    }
    // Legs
    for (const side of [-1, 1]) {
      if (seated) { put(opts.pants, cap(.07, .32), side * .09, hipY - .02, .2, 1, 1, 1, Math.PI / 2); put(opts.pants, cap(.06, .32), side * .09, .26, .4); put(shoe, PRIMS.box, side * .09, .04, .45, .1, .07, .22); }
      else if (opts.dress) { put(skin, cap(.05, .5), side * .08, .42, 0); put(shoe, PRIMS.box, side * .08, .04, .04, .1, .07, .22); }
      else { put(opts.pants, cap(.07, .66), side * .09, .48, 0); put(shoe, PRIMS.box, side * .09, .04, .04, .11, .08, .24); }
    }
    if (opts.dress) put(opts.shirt, new THREE.CylinderGeometry(.17, .27, .55, 10), 0, hipY - .2, 0);
    // One mesh per character: colours live in vertex attributes.
    const merged = mergeGeometries(parts, false); parts.forEach(x => x.dispose());
    const mesh = new THREE.Mesh(merged, PERSON_MAT); mesh.castShadow = true; g.add(mesh);
    this.ctx.npcs.push({ object: g, phase: s, origin: g.position.clone(), kind: 'talk' });
    const focus = new THREE.Object3D(); focus.position.set(0, torsoY + .4, 0); g.add(focus);
    this.register(`npc_${this.ctx.npcs.length}`, focus, { he: 'שיחה עם תושב/ת', en: 'Chat with a local' }, 3.2);
    return { group: g, focus };
  }
}
const PERSON_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .82 });
/** Merge loose meshes that share a material (glass panes, bulbs, ...) into 64 m chunks. */
export function mergeLooseMeshes(root: THREE.Object3D) {
  const buckets = new Map<string, THREE.Mesh[]>();
  for (const child of root.children) {
    if (!(child instanceof THREE.Mesh) || child instanceof THREE.InstancedMesh || Array.isArray(child.material) || child.userData.interactionId) continue;
    if (!Object.values(NIGHT).includes(child.material as THREE.MeshStandardMaterial)) continue;
    const k = `${child.material.uuid}|${Math.floor(child.position.x / 64)},${Math.floor(child.position.z / 64)}`;
    let a = buckets.get(k); if (!a) { a = []; buckets.set(k, a); } a.push(child);
  }
  buckets.forEach(list => {
    if (list.length < 2) return;
    const geos = list.map(m => { m.updateMatrix(); let g = m.geometry.clone().applyMatrix4(m.matrix); if (g.index) g = g.toNonIndexed(); for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k); if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); return g; });
    const merged = mergeGeometries(geos, false); geos.forEach(g => g.dispose()); if (!merged) return;
    const mesh = new THREE.Mesh(merged, list[0].material); mesh.castShadow = list[0].castShadow; mesh.receiveShadow = true; root.add(mesh);
    list.forEach(m => m.removeFromParent());
  });
}
export const SHIRTS = ['#a27f57', '#6e8a82', '#a6a17d', '#625c6a', '#b69c8a', '#425b50', '#ad795d', '#8693a0', '#3d4f6b', '#c4b59a', '#7b3f3a', '#e0dccf', '#2f3a33', '#9c6b8a'];
export const PANTS = ['#3b3d3a', '#2f3b4f', '#5a5446', '#4a4038', '#25303d', '#6d6658'];
