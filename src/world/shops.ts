import * as THREE from 'three';
import { Kit, MAT, NIGHT, Frame, PRIMS, SHIRTS, PANTS } from './kit';
import { window_ } from './scenery';

/** Storefront units for the commercial rows. Fronts are original approximations: names
 *  come from OSM/press where known (see src/game/landmarks.ts), otherwise generic Hebrew
 *  trade names. Units are viewed through glass; only story venues are enterable. */
export type ShopType = 'falafel' | 'pizza' | 'salon' | 'bakery' | 'pharmacy' | 'bank' | 'grocery' | 'books' | 'flowers' | 'bikes' | 'clothes' | 'organic' | 'cafe' | 'grill' | 'post' | 'office' | 'burger' | 'discount';
export interface ShopSpec { type: ShopType; width: number; he: string; en?: string; sign?: string; ink?: string; awning?: string | null; landmark?: string; seating?: number }

const glass = (kit: Kit, f: Frame, lx: number, y: number, lz: number, w: number, h: number) => {
  const [x, z] = f.at(lx, lz); kit.B.place(PRIMS.box, NIGHT.shopWindow, x, f.y + y, z, w, h, .03, f.rot, null, false);
};

/** A shop unit whose glass line sits at local z = fz, spanning lx ± width/2. `height` is the
 *  glazing height; the signboard sits just above it (lower it to fit under a balcony). */
export function shopUnit(kit: Kit, f: Frame, lx: number, fz: number, s: ShopSpec, depth = 4, height = 3.6) {
  const B = kit.B, w = s.width, H = height, sign = s.sign ?? '#233a30', ink = s.ink ?? '#f4ecd6';
  // Interior: floor, back wall, side walls (visible through the glass).
  B.lbox(f, MAT.paving, lx, .05, fz - depth / 2, w - .2, .1, depth, '#d8d0c0', false);
  B.lbox(f, MAT.plaster, lx, H / 2, fz - depth, w, H, .2, s.type === 'pharmacy' || s.type === 'bank' ? '#f2f2ee' : '#efe5d2');
  B.lbox(f, MAT.plain, lx, H - .05, fz - depth / 2, w, .1, depth, '#f4efe4', false);
  // Frame, glazing, door, signboard, awning.
  for (const sx of [-1, 1]) B.lbox(f, MAT.metal, lx + sx * (w / 2 - .06), H / 2, fz, .12, H, .14, '#2d3532');
  B.lbox(f, MAT.metal, lx, .25, fz, w, .5, .14, '#2d3532');
  B.lbox(f, MAT.metal, lx, H - .05, fz, w, .1, .14, '#2d3532');
  glass(kit, f, lx, (H - .7) / 2 + .5, fz, w - .2, H - .7);
  B.lbox(f, MAT.metal, lx + w * .28, 1.25, fz + .02, .06, Math.min(2.5, H - 1), .08, '#2d3532');
  B.lbox(f, MAT.plain, lx, H + .45, fz + .12, w - .1, .9, .14, sign);
  kit.sign(f, lx, H + .45, fz + .2, w - .4, .78, s.he, { bg: sign, fg: ink, sub: s.en, weight: 800, glow: .15 });
  if (s.awning !== null) {
    const [ax, az] = f.at(lx, fz + .75);
    B.place(PRIMS.box, MAT.plain, ax, f.y + H - .25, az, w - .1, .06, 1.5, f.rot, s.awning ?? '#6a7a5c', true, .22);
  }
  kit.lcollide(f, lx, H / 2, fz, w, H, .3);
  if (depth < 1) {
    // Shallow storefront on an existing building: lit backdrop with goods silhouettes.
    const palette = ['#c94a3a', '#e6c64a', '#4b86b5', '#6aa04a', '#e88a3a', '#f1efe8', '#8a5a3a'];
    for (let k = 0; k < 3; k++) for (let i = 0; i < Math.floor(w / .6); i++) B.lbox(f, MAT.plain, lx - w / 2 + .4 + i * .6, .7 + k * .7, fz - depth + .08, .45, .45, .04, palette[(i * 3 + k + s.he.length) % palette.length], false);
    shopSeating(kit, f, lx, fz, s);
    return;
  }
  const d = (lz: number) => fz - .4 - lz; // depth from glass
  const prop = (lxx: number, y: number, lz: number, ww: number, hh: number, dd: number, c: string, m: THREE.Material = MAT.plain) => B.lbox(f, m, lx + lxx, y, d(lz), ww, hh, dd, c, false);
  switch (s.type) {
    case 'falafel': case 'burger': case 'grill': {
      prop(0, .55, .8, w * .75, 1.1, .7, '#d9d4c8'); prop(0, 1.13, .8, w * .75, .06, .75, '#b9b5ab', MAT.metal);
      const bins = ['#c23b2b', '#5f9b3a', '#e5c33c', '#e2832e', '#7b3a6b', '#f3eee0', '#9cb84a'];
      for (let i = 0; i < 7; i++) prop(-w * .33 + i * w * .11, 1.19, .8, w * .09, .06, .35, bins[i]);
      if (s.type === 'falafel') { const [cx, cz] = f.at(lx + w * .3, d(2.6)); B.place(PRIMS.cone, MAT.matte, cx, f.y + 1.2, cz, .22, .9, .22, 0, '#8a5a2e'); B.place(PRIMS.cyl, MAT.metal, cx, f.y + 1.2, cz, .02, 1.4, .02, 0, '#999'); }
      prop(-w * .3, 1.1, 2.6, .8, .5, .6, '#a9aaa4', MAT.metal);
      kit.sign(f, lx, Math.min(2.85, H - .6), d(3.5) + .02, Math.min(3.4, w - .6), .7, s.type === 'falafel' ? 'פלאפל · שווארמה · סביח · צ׳יפס' : s.type === 'burger' ? 'המבורגר · צ׳יפס · שתייה' : 'גריל · שיפודים · סלטים', { bg: '#1d1d1b', fg: '#f3d36b', weight: 700 });
      kit.person(f, lx - w * .15, d(1.6), { shirt: '#f2f0ea', pants: '#2b2b2b', seed: Math.floor(lx * 7) & 255, apron: '#3a4a3a', angle: 0 });
      break;
    }
    case 'pizza': {
      prop(0, .55, .8, w * .75, 1.1, .7, '#d9d4c8'); prop(0, 1.13, .8, w * .75, .06, .75, '#c9c2b2', MAT.stone);
      for (let i = 0; i < 3; i++) { const [px, pz] = f.at(lx - w * .25 + i * w * .25, d(.8)); B.place(PRIMS.cyl, MAT.matte, px, f.y + 1.18, pz, .2, .03, .2, 0, '#e2b04a', false); }
      const [ox, oz] = f.at(lx + w * .15, d(3.1)); B.place(PRIMS.sphere, MAT.stone, ox, f.y + 1.1, oz, .9, .75, .8, 0, '#b8643a');
      B.place(PRIMS.box, MAT.matte, ox, f.y + 1.1, oz + .5, .5, .3, .1, f.rot, '#1d1d1b');
      kit.person(f, lx - w * .15, d(1.6), { shirt: '#f2f0ea', pants: '#2b2b2b', seed: Math.floor(lx * 5) & 255, apron: '#7a2a22', angle: 0 });
      break;
    }
    case 'salon': {
      for (let i = 0; i < 2; i++) {
        const cx = -w * .22 + i * w * .44; prop(cx, 2, 3.4, 1, 1.2, .05, '#c8d6d8', MAT.gloss);
        prop(cx, .5, 2.4, .6, .5, .6, '#1e1e1e', MAT.gloss); prop(cx, .9, 2.65, .6, .7, .12, '#1e1e1e', MAT.gloss); prop(cx, .25, 2.4, .1, .5, .1, '#888', MAT.metal);
      }
      prop(0, .45, .6, w * .5, .4, .4, '#6b4e3a', MAT.wood);
      const [px, pz] = f.at(lx - w / 2 + .35, fz + .2); const pole = new THREE.Mesh(new THREE.CylinderGeometry(.1, .1, .9, 12), barberPole()); pole.position.set(px, f.y + 2.2, pz); kit.root.add(pole);
      kit.person(f, lx - w * .22, d(2.5), { shirt: '#5a6f7e', pants: '#2b2f36', seed: 41, seated: true, angle: 0 });
      kit.person(f, lx - w * .22 + .5, d(2.0), { shirt: '#1d1d1d', pants: '#1d1d1d', seed: 17, angle: Math.PI * .8 });
      break;
    }
    case 'bakery': case 'cafe': {
      prop(0, .55, .9, w * .7, 1.1, .7, '#efe6d2'); prop(0, 1.25, .9, w * .7, .3, .65, '#e4f0ee', MAT.gloss);
      for (let i = 0; i < 10; i++) { const [bx, bz] = f.at(lx - w * .3 + i * w * .065, d(.9)); B.place(PRIMS.sphere, MAT.matte, bx, f.y + 1.2, bz, .08, .05, .12, f.rot, ['#c48a43', '#a8692e', '#d9a95e'][i % 3], false); }
      for (let k = 0; k < 3; k++) { prop(0, .9 + k * .6, 3.6, w * .8, .05, .4, '#8a6a48', MAT.wood); for (let i = 0; i < 7; i++) { const [bx, bz] = f.at(lx - w * .35 + i * w * .11, d(3.6)); B.place(PRIMS.sphere, MAT.matte, bx, f.y + 1.02 + k * .6, bz, .16, .08, .1, f.rot, '#b9813f', false); } }
      break;
    }
    case 'pharmacy': {
      for (let k = 0; k < 4; k++) prop(0, .5 + k * .55, 3.6, w * .85, .04, .35, '#f6f6f4');
      for (let k = 0; k < 4; k++) for (let i = 0; i < 9; i++) prop(-w * .38 + i * w * .095, .65 + k * .55, 3.6, .14, .24, .1, ['#3c7fb5', '#e9e9e4', '#d14c4c', '#4fa36b'][(i + k) % 4]);
      prop(0, .55, 1.2, w * .6, 1.1, .6, '#ffffff');
      const [cx, cz] = f.at(lx + w / 2 + .05, fz + .6); kit.sign(null, cx, f.y + 3.1, cz, .7, .7, '✚', { bg: '#1f8a4c', fg: '#ffffff', weight: 900, glow: .6 }, f.rot + Math.PI / 2);
      break;
    }
    case 'bank': {
      prop(0, .55, 1.8, w * .7, 1.1, .6, '#d9d6cf');
      const [ax, az] = f.at(lx - w * .3, fz + .1); B.place(PRIMS.box, MAT.metal, ax, f.y + 1.2, az, .7, 1.6, .3, f.rot, '#7d8287');
      break;
    }
    case 'grocery': case 'organic': case 'discount': {
      for (let k = 0; k < 4; k++) for (let i = 0; i < 3; i++) { prop(-w * .3 + i * w * .3, .4 + k * .5, 2.2, w * .22, .04, 2.6, '#ddd'); for (let j = 0; j < 6; j++) prop(-w * .3 + i * w * .3, .55 + k * .5, 1 + j * .45, w * .2, .26, .3, ['#c94a3a', '#e6c64a', '#4b86b5', '#6aa04a', '#e88a3a', '#f1efe8'][(i + j + k) % 6]); }
      if (s.type !== 'discount') for (let i = 0; i < 3; i++) { const [cx, cz] = f.at(lx - w * .3 + i * .7, fz + .7); B.place(PRIMS.box, MAT.wood, cx, f.y + .35, cz, .55, .3, .4, f.rot, '#9a7449'); for (let j = 0; j < 5; j++) B.place(PRIMS.sphere, MAT.matte, cx - .18 + j * .09, f.y + .55, cz, .06, .06, .06, 0, ['#d23c2b', '#e88a2b', '#7aa83a'][i], false); }
      break;
    }
    case 'books': {
      for (const sx of [-1, 1]) for (let k = 0; k < 5; k++) { prop(sx * w * .3, .4 + k * .5, 3.5, w * .35, .04, .35, '#7a5a3c', MAT.wood); for (let i = 0; i < 9; i++) prop(sx * w * .3 - w * .15 + i * w * .036, .55 + k * .5, 3.5, w * .03, .26, .24, ['#8b3a2e', '#2e4c6b', '#c9a24a', '#3f6a4a', '#e9e2cf'][(i + k) % 5]); }
      prop(0, .45, 1.5, w * .5, .9, .8, '#8a6a48', MAT.wood);
      break;
    }
    case 'flowers': {
      for (let i = 0; i < 6; i++) { const [cx, cz] = f.at(lx - w * .35 + i * w * .14, fz + .55); B.place(PRIMS.cyl, MAT.metal, cx, f.y + .2, cz, .15, .4, .15, 0, '#8d9496'); for (let j = 0; j < 5; j++) B.place(PRIMS.sphere, MAT.matte, cx + Math.cos(j) * .08, f.y + .55 + j * .03, cz + Math.sin(j) * .08, .07, .07, .07, 0, ['#d94a6a', '#f2d24a', '#f2f0ee', '#b84ad9', '#f28a3a'][(i + j) % 5], false); }
      prop(0, .5, 2.5, w * .7, 1, .6, '#6a7d5a');
      break;
    }
    case 'bikes': {
      for (let i = 0; i < 3; i++) for (const zz of [-.35, .35]) { const [cx, cz] = f.at(lx - w * .3 + i * w * .3 + zz, d(1.8)); const wheel = new THREE.Mesh(new THREE.TorusGeometry(.33, .03, 6, 18), new THREE.MeshStandardMaterial({ color: '#1d1d1d', roughness: .5 })); wheel.position.set(cx, f.y + .38, cz); wheel.rotation.y = f.rot + Math.PI / 2; kit.root.add(wheel); }
      for (let i = 0; i < 3; i++) prop(-w * .3 + i * w * .3, .75, 1.8, .06, .5, .7, ['#c73a2e', '#2e6ac7', '#d9d02e'][i], MAT.gloss);
      break;
    }
    case 'clothes': {
      for (let i = 0; i < 2; i++) { prop(-w * .2 + i * w * .4, 1.6, 2.2, .04, .04, 2, '#888', MAT.metal); for (let j = 0; j < 8; j++) prop(-w * .2 + i * w * .4, 1.2, 1.4 + j * .22, .5, .8, .05, SHIRTS[(i * 8 + j) % SHIRTS.length]); }
      break;
    }
    case 'post': { prop(0, .55, 1.6, w * .7, 1.1, .6, '#e6e1d6'); const [mx, mz] = f.at(lx + w * .35, fz + .5); B.place(PRIMS.box, MAT.gloss, mx, f.y + .7, mz, .5, 1.1, .45, f.rot, '#d23a2c'); break; }
    case 'office': default: { prop(0, .4, 2, w * .6, .8, 1.1, '#cfc9bc'); break; }
  }
  shopSeating(kit, f, lx, fz, s);
}
/** Outdoor tables for food venues. */
function shopSeating(kit: Kit, f: Frame, lx: number, fz: number, s: ShopSpec) {
  const w = s.width;
  for (let i = 0; i < (s.seating ?? 0); i++) {
    const tx = lx - w / 2 + 1 + i * 1.9; if (tx > lx + w / 2 - .6) break;
    kit.table(f, tx, fz + 2.2, { square: .7, top: '#f1efe8', cups: 1, plate: true });
    kit.chair(f, tx - .6, fz + 2.2, Math.PI / 2, '#f1efe8', 0, true); kit.chair(f, tx + .6, fz + 2.2, -Math.PI / 2, '#f1efe8', 0, true);
    if (i % 2 === 0) kit.person(f, tx - .62, fz + 2.2, { shirt: SHIRTS[(i * 3 + Math.floor(lx)) & 7], pants: PANTS[i % PANTS.length], seed: (i * 13 + Math.floor(lx * 3)) & 255, seated: true, angle: Math.PI / 2 });
  }
}

let poleTex: THREE.MeshStandardMaterial | null = null;
function barberPole() {
  if (poleTex) return poleTex;
  const c = document.createElement('canvas'); c.width = 64; c.height = 128; const g = c.getContext('2d')!;
  g.fillStyle = '#f4f4f0'; g.fillRect(0, 0, 64, 128);
  for (let i = -4; i < 8; i++) { g.fillStyle = i % 2 ? '#c8302a' : '#2a4fa0'; g.beginPath(); g.moveTo(0, i * 24); g.lineTo(64, i * 24 + 32); g.lineTo(64, i * 24 + 44); g.lineTo(0, i * 24 + 12); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; poleTex = new THREE.MeshStandardMaterial({ map: t, roughness: .3 }); return poleTex;
}

/** A commercial block: shops along the front, flats or offices above, solar heaters on top.
 *  Returns the frame; local +z faces the street, façade at z = d/2. */
export function commercialBlock(kit: Kit, f: Frame, w: number, d: number, units: ShopSpec[], opts: { floors?: number; wall?: string; stone?: boolean; skipUpper?: boolean; colonnade?: boolean } = {}) {
  const B = kit.B, floors = opts.floors ?? 2, wall = opts.wall ?? '#ece4d2', body = opts.stone ? MAT.stone : MAT.plaster;
  const H1 = 4.6, fh = 3.1, H = H1 + (floors - 1) * fh;
  B.lbox(f, MAT.stone, 0, -.6, 0, w + .3, 1.4, d + .3, '#ddd0b2');
  // Side and back walls (full height), upper façade.
  for (const sx of [-1, 1]) B.lbox(f, body, sx * (w / 2 - .15), H / 2, 0, .3, H, d, wall);
  B.lbox(f, body, 0, H / 2, -d / 2 + .15, w, H, .3, wall);
  kit.lcollide(f, 0, H / 2, -1, w, H, d - 1.6);
  if (!opts.skipUpper) {
    B.lbox(f, body, 0, H1 + (H - H1) / 2, d / 2 - .15, w, H - H1, .3, wall);
    for (let fl = 1; fl < floors; fl++) { const y = H1 + (fl - 1) * fh + 1.6, n = Math.max(1, Math.floor(w / 3.4)); for (let i = 0; i < n; i++) window_(kit, f, -w / 2 + (i + .5) * w / n, y, d / 2, 1.3, 1.35, null, true); }
    B.lbox(f, MAT.plain, 0, H + .3, 0, w, .6, d, wall);
    for (let i = 0; i < Math.max(1, Math.floor(w / 5)); i++) { const [x, z] = f.at(-w / 2 + 2 + i * 4.2, -d / 4); B.place(PRIMS.cyl, MAT.metal, x, f.y + H + 1.35, z, .3, 1.5, .3, f.rot + Math.PI / 2, '#e6e3dc', true, 0, Math.PI / 2); }
  }
  // Ground-floor band above the shopfronts.
  B.lbox(f, body, 0, H1 - .06, d / 2 - .15, w, .12, .3, wall);
  let x = -w / 2;
  for (const u of units) { shopUnit(kit, f, x + u.width / 2, d / 2 - .4, u); x += u.width; }
  if (opts.colonnade) for (let cx = -w / 2 + .3; cx <= w / 2 - .2; cx += w / Math.round(w / 3.4)) { B.lbox(f, MAT.plain, cx, H1 / 2 - .2, d / 2 + 1.6, .32, H1 - .4, .32, '#e9e3d6'); kit.lcollide(f, cx, H1 / 2, d / 2 + 1.6, .32, H1, .32); }
  if (opts.colonnade) B.lbox(f, MAT.plain, 0, H1 - .3, d / 2 + .9, w, .25, 1.9, '#ece6da');
  return { H, H1 };
}

/** A small enterable electronics shop (glass front with a door, counter, display of flashlights
 *  and batteries, shelves of parts) with a named shopkeeper interaction. Local +z faces the street. */
export function enterableShop(kit: Kit, f: Frame, W: number, D: number, o: { he: string; sub: string; bg: string; fg: string; keeperId: string; keeperLabel: { he: string; en: string }; floors?: number; keeperShirt?: string; poster?: string }) {
  const B = kit.B, H = 3.8, Fz = D / 2;
  B.lbox(f, MAT.stone, 0, -.8, 0, W + .3, 1.8, D + .3, '#ddd0b2');
  B.lbox(f, MAT.paving, 0, .04, 0, W - .4, .08, D - .4, '#d9d6cf', false); kit.lground(f, 0, 0, W - .3, D - .3, .08);
  for (const sx of [-1, 1]) kit.solid(f, MAT.plaster, sx * (W / 2 - .15), H / 2, 0, .3, H, D, '#ebe5d8');
  kit.solid(f, MAT.plaster, 0, H / 2, -Fz + .15, W, H, .3, '#ebe5d8');
  B.lbox(f, MAT.plain, 0, H + .15, 0, W + .3, .3, D + .3, '#ddd6c8');
  for (let fl = 1; fl < (o.floors ?? 2); fl++) {
    B.lbox(f, MAT.plaster, 0, H + .3 + (fl - .5) * 3.1, 0, W, 3.1, D, '#e8e0cf');
    for (let lx = -W / 2 + 1.8; lx < W / 2 - 1; lx += 3) window_(kit, f, lx, H + .3 + (fl - 1) * 3.1 + 1.7, Fz, 1.3, 1.3, null, true);
  }
  B.lbox(f, MAT.plain, 0, H + .3 + ((o.floors ?? 2) - 1) * 3.1 + .2, 0, W + .2, .3, D + .2, '#ddd6c8');
  const door = 1.1;
  for (const [a, b] of [[-W / 2 + .1, -door], [door, W / 2 - .1]]) { glass(kit, f, (a + b) / 2, 1.6, Fz, b - a, 2.8); kit.lcollide(f, (a + b) / 2, H / 2, Fz, b - a, H, .3); }
  for (const mx of [-W / 2 + .1, -door, door, W / 2 - .1]) B.lbox(f, MAT.metal, mx, 1.6, Fz, .1, 3.2, .14, '#2b3235');
  B.lbox(f, MAT.metal, 0, 3.2, Fz, W, .12, .14, '#2b3235');
  B.lbox(f, MAT.plain, 0, 3.55, Fz + .1, W, .6, .2, o.bg);
  kit.sign(f, 0, 3.55, Fz + .22, W - 1, .55, o.he, { bg: o.bg, fg: o.fg, sub: o.sub, weight: 800, glow: .3 });
  if (o.poster) kit.sign(f, W / 2 - 1.6, 1.7, Fz + .03, 1.6, 1.1, o.poster, { bg: '#1d3f7a', fg: '#ffffff', weight: 700 });
  B.lbox(f, MAT.plain, 0, .55, -D / 2 + 3.4, W * .66, 1.1, .9, '#929782'); B.lbox(f, MAT.gloss, 0, 1.12, -D / 2 + 3.4, W * .68, .06, 1, '#f0eee8'); kit.lcollide(f, 0, .55, -D / 2 + 3.4, W * .68, 1.1, 1);
  for (let i = 0; i < 5; i++) { const [x, z] = f.at(-W * .25 + i * .5, -D / 2 + 3.5); B.place(PRIMS.cyl, MAT.gloss, x, f.y + 1.2, z, .055, .26, .055, f.rot, '#2f3a33', true, 0, Math.PI / 2); }
  for (let i = 0; i < 6; i++) { const [x, z] = f.at(W * .08 + i * .2, -D / 2 + 3.5); B.place(PRIMS.cyl, MAT.gloss, x, f.y + 1.24, z, .035, .17, .035, 0, '#c9a24a'); }
  kit.sign(f, -W * .15, 1.55, -D / 2 + 3.9, 1.6, .35, 'פנסים · סוללות', { bg: '#f2c84b', fg: '#1d1d1b', weight: 800 });
  for (let k = 0; k < 4; k++) { B.lbox(f, MAT.metal, -W / 2 + .6, .5 + k * .7, 0, .5, .05, D - 3, '#7b8580'); for (let i = 0; i < Math.floor((D - 3) / .9); i++) B.lbox(f, MAT.plain, -W / 2 + .6, .72 + k * .7, -D / 2 + 2 + i * .9, .4, .38, .6, ['#2d3a44', '#c9c9c4', '#476c68', '#b4a886'][(i + k) % 4]); }
  for (let i = 0; i < 3; i++) { B.lbox(f, MAT.gloss, -W * .25 + i * W * .25, 1.8, -D / 2 + .35, 1.4, .9, .06, '#1b1d1e'); B.lbox(f, MAT.gloss, -W * .25 + i * W * .25, 1.8, -D / 2 + .39, 1.25, .75, .02, '#3d6f8f'); }
  const keeper = kit.person(f, W * .1, -D / 2 + 2.4, { shirt: o.keeperShirt ?? '#667b77', pants: '#46514c', seed: 44 });
  kit.register(o.keeperId, keeper.focus, o.keeperLabel, 4.4);
  { const [x, z] = f.at(0, 0); kit.light(x, f.y + 3.3, z, '#f2f4ff', 12, 12); }
  return { H, Fz };
}
