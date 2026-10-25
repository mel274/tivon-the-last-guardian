import * as THREE from 'three';
import { landmark, footprintAt, orientedBox, BUILDINGS, type P2 } from './geo';
import { surfaceHeight } from './terrain';
import { Kit, MAT, NIGHT, Frame, PRIMS, SHIRTS, PANTS } from './kit';
import { shopUnit, enterableShop, type ShopSpec } from './shops';
import { reserve, facingStreet } from './benGurion';
import { extrude, groundRange } from './scenery';
import { paveArea } from './streets';
import { ZEID } from './layout';

/** The Zeid commercial centre at the Kiryat Tivon junction, built to the plan the owner approved
 *  (layout.ts; docs/zeid-plan/zeid-plan.html, revision 3.1): the two-level building on Route 75
 *  with its full-length balcony, Mandu's bar strip (Café Beinenu by day) and backyard, the stair
 *  down to the lower plaza, the ground-floor shops behind a roofed strip, the closed Rav-Kav
 *  section, the upper-plaza walkway with the drugstore and the falafel row, and Zohar cinema. */
const sub = (P: Frame, lx: number, lz: number, rot = 0, dy = 0) => { const [x, z] = P.at(lx, lz); return new Frame(x, z, P.rot + rot, P.y + dy); };
export const MANDU_FLOOR = ZEID.upper - ZEID.lower;

/** Falafel Luli's sign as photographed: a yellow board with an arched lower edge, red lettering
 *  with a black shadow, and a red panel on the left reading "טעם של פעם" with "כשר" below. */
function luliSign(c: CanvasRenderingContext2D, W: number, H: number) {
  const arch = (x: number) => H * .97 - Math.sin(Math.PI * x / W) * H * .34;
  c.beginPath(); c.moveTo(0, H * .05); c.lineTo(W, 0);
  for (let x = W; x >= 0; x -= W / 40) c.lineTo(x, arch(x));
  c.closePath(); c.fillStyle = '#f5e23a'; c.fill();
  c.save(); c.clip(); c.fillStyle = '#e0261f'; c.beginPath(); c.moveTo(0, 0); c.lineTo(W * .27, 0); c.lineTo(W * .17, H); c.lineTo(0, H); c.closePath(); c.fill(); c.restore();
  c.textAlign = 'center'; c.textBaseline = 'middle'; c.direction = 'rtl';
  c.font = `900 ${H * .44}px "Arial Black", Arial, sans-serif`;
  c.fillStyle = '#1d1d1b'; c.fillText('פלאפל לולי', W * .615 + H * .035, H * .4 + H * .035, W * .64);
  c.fillStyle = '#e0261f'; c.fillText('פלאפל לולי', W * .615, H * .4, W * .64);
  c.fillStyle = '#f5e23a'; c.font = `800 ${H * .2}px Arial, sans-serif`; c.fillText('טעם', W * .1, H * .2); c.fillText('פעם', W * .1, H * .74);
  c.font = `italic 700 ${H * .2}px Georgia, serif`; c.fillText('של', W * .1, H * .47);
  c.fillStyle = '#b0477a'; c.font = `700 ${H * .15}px Arial, sans-serif`; c.fillText('כשר', W * .27, H * .66);
}
/** A blue awning valance with a scalloped edge. */
function scallops(c: CanvasRenderingContext2D, W: number, H: number) {
  c.fillStyle = '#3d7fc4'; c.fillRect(0, 0, W, H * .5);
  const n = 12, r = W / n / 2; for (let i = 0; i < n; i++) { c.beginPath(); c.arc(r + i * 2 * r, H * .5, r, 0, Math.PI); c.fill(); }
}

/** Shopfronts in order along a footprint edge from a to b, facing away from the building.
 *  Each unit is [distance from a to the unit centre, spec]. Returns the frame and a function
 *  turning a distance along the edge into the frame's local x. */
function rowOnEdge(kit: Kit, poly: P2[], a: P2, b: P2, y: number, units: Array<[number, ShopSpec]>, depth = .35) {
  const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz), mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
  const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length, cz = poly.reduce((s, p) => s + p[1], 0) / poly.length;
  let rot = Math.atan2(-dz, dx); // local +x runs from a to b
  const flip = Math.sin(rot) * (mx - cx) + Math.cos(rot) * (mz - cz) < 0; // local +z must point outwards
  if (flip) rot += Math.PI;
  const f = new Frame(mx, mz, rot, y), lx = (t: number) => (flip ? -1 : 1) * (t - L / 2);
  for (const [t, spec] of units) shopUnit(kit, f, lx(t), .3, spec, depth);
  return { f, lx };
}

export function buildKiryatAmal(kit: Kit, skip: Set<string>) {
  const U = ZEID.upper, Lw = ZEID.lower, B = kit.B, F = MANDU_FLOOR;
  const { HW, HD, BAL, STW, ARC0 } = ZEID.frame;
  skip.add(ZEID.building.id);
  // M: building frame at the lower plaza (+x east along Route 75, +z south); Mu: the upper level.
  const M = new Frame(ZEID.frame.x, ZEID.frame.z, ZEID.frame.rot, Lw), Mu = sub(M, 0, 0, 0, F);
  const W = (lx: number, lz: number) => M.at(lx, lz);
  groundFloor(kit, M);

  // ——— Upper floor: two blocks of shops either side of Mandu's bar strip, all facing the balcony ———
  kit.lground(M, 0, 0, HW * 2, HD * 2, F);
  const block = (x0: number, x1: number) => extrude(kit, [W(x0, -HD), W(x1, -HD), W(x1, BAL), W(x0, BAL)], U, U + 4.4, '#ece4d2', false);
  block(-HW, -7.7); block(-2.3, HW);
  const upperShops: Array<[number, ShopSpec]> = [
    [-16.95, { type: 'grill', width: 8.3, he: 'בוצ׳ר טבעון', en: 'BUTCHER TIVON · מסעדת בשרים', sign: '#3a2a22', ink: '#f0d9b5', awning: null, seating: 3 }],
    [-10.15, { type: 'office', width: 4.5, he: 'דפוס', en: 'PRINTING · צילום מסמכים', sign: '#f2efe6', ink: '#2b4a7a', awning: null }],
    [.85, { type: 'office', width: 6, he: 'ביתן הצילום של איציק', en: 'ITZIK · CAMERAS & PHOTO', sign: '#1d1d1b', ink: '#f4c542', awning: null }],
    [8, { type: 'office', width: 7.6, he: 'סטודיו פילאטיס', en: 'PILATES STUDIO', sign: '#e8efe9', ink: '#3d7a63', awning: null }],
    [16.65, { type: 'discount', width: 9, he: 'חלק טמבור', en: 'PAINT & BUILDING SUPPLIES', sign: '#f2c230', ink: '#1d1d1b', awning: null }],
  ];
  for (const [lx, spec] of upperShops) shopUnit(kit, Mu, lx, BAL + .4, spec, .35, 3.2);

  // ——— Mandu: the narrow north–south bar strip, open to the backyard (north) and the balcony (south) ———
  const Bf = sub(M, -5, (BAL - HD) / 2, 0, F), half = (BAL + HD) / 2; // strip local z runs −half … half
  B.lbox(Bf, MAT.plain, 0, 3.95, 0, 5.4, .3, half * 2, '#2a2622');
  B.lbox(Bf, MAT.wood, 0, .02, 0, 5.2, .04, half * 2 - .2, '#6b4b33', false);
  B.lbox(Bf, MAT.wood, -1.6, .55, .5, .8, 1.1, 7, '#3d2a1e'); B.lbox(Bf, MAT.gloss, -1.6, 1.12, .5, 1, .06, 7.2, '#1c1714'); kit.lcollide(Bf, -1.6, .55, .5, 1, 1.1, 7.2);
  for (let k = 0; k < 3; k++) { B.lbox(Bf, MAT.wood, -2.35, 1.4 + k * .55, .5, .3, .04, 7, '#3d2a1e'); for (let i = 0; i < 14; i++) { const [x, z] = Bf.at(-2.35, -3 + i * .5); kit.bottle(x, Bf.y + 1.43 + k * .55, z, ['#5e693b', '#705033', '#ad8a54', '#3a5a6a'][(i + k) % 4]); } }
  for (let i = 0; i < 6; i++) kit.stool(Bf, -.8, -2 + i * 1);
  // Wooden stair to the mezzanine of vintage goods and books.
  for (let i = 0; i < 9; i++) B.lbox(Bf, MAT.wood, 2.05, .2 + i * .3, -4.9 + i * .32, .9, .08, .32, '#5c4029');
  B.lbox(Bf, MAT.wood, 1.95, 2.9, -2.1, 1.2, .1, 2.6, '#5c4029');
  for (let i = 0; i < 6; i++) B.lbox(Bf, MAT.matte, 2.35, 3.2, -3.2 + i * .45, .25, .4, .32, SHIRTS[i % SHIRTS.length]);
  for (let i = 0; i < 4; i++) { const [x, z] = Bf.at(0, -3.5 + i * 2.4); kit.pendant(x, Bf.y + 3.8, z, 1.1, '#2a4a3a'); }
  { const [x, z] = Bf.at(0, 0); kit.light(x, Bf.y + 3, z, '#ffb466', 12, 12); }
  // Shopfront onto the balcony: glass either side of a wide door.
  for (const sx of [-1, 1]) {
    B.lbox(Bf, MAT.metal, sx * 1.85, 1.6, half, 1.7, 3.2, .08, '#2d3532');
    const [gx, gz] = Bf.at(sx * 1.85, half + .05); const g = new THREE.Mesh(PRIMS.box, NIGHT.shopWindow); g.position.set(gx, Bf.y + 1.7, gz); g.rotation.y = Bf.rot; g.scale.set(1.5, 2.8, .03); kit.root.add(g);
    kit.lcollide(Bf, sx * 1.85, 1.6, half, 1.7, 3.2, .2);
  }
  B.lbox(Bf, MAT.metal, 0, 3.35, half, 5.4, .3, .1, '#2d3532');
  const bartender = kit.person(Bf, -2.1, -.5, { shirt: '#2d3a33', pants: '#2b2b28', seed: 9, beard: true, angle: Math.PI / 2 });
  kit.register('bartender', bartender.focus, { he: 'מאחורי הבר', en: 'Behind the bar' }, 4.4);
  kit.anchor(Bf, 'brewer_mandu', -1.6, 1.4, 3.3, { he: 'מכונת הקפה של קפה בינינו', en: 'Café Beinenu espresso machine' }, 3.4);
  { const [x, z] = Bf.at(-1.6, 3.3); B.box(MAT.metal, x, Bf.y + 1.4, z, .5, .45, .9, M.rot, '#c8ccce'); }
  // Day/night signs: Café Beinenu by day, Mandu after dark (the game swaps them).
  const day = new THREE.Group(), night = new THREE.Group(); kit.root.add(day, night); kit.ctx.groups.mandu_day = day; kit.ctx.groups.mandu_night = night;
  kit.sign(Mu, -5, 3.75, BAL + .25, 4.6, .8, 'קפה בינינו', { bg: '#efe6d2', fg: '#4b3a26', sub: 'CAFÉ BEINENU · קפה ופולים', weight: 800 }, 0, day);
  kit.sign(Mu, -5, 3.75, BAL + .27, 4.6, .8, 'מנדו', { bg: '#1f2a26', fg: '#ffcf6e', sub: 'MANDU BAR', weight: 800, glow: 1 }, 0, night);
  kit.sign(Mu, -5, 3.4, -HD - .25, 4.6, .8, 'מנדו · קפה בינינו', { bg: '#1f2a26', fg: '#ffcf6e', sub: 'MANDU · CAFÉ BEINENU', weight: 800, glow: .8 }, Math.PI);
  kit.anchor(Mu, 'landmark_mandu', -5, 1.8, BAL + 2.2, landmark('mandu').name, 3.6);
  kit.sign(Mu, -3.4, 2.85, BAL + 1, 1.15, .8, 'קפה בינינו\nמנדו בר', { bg: '#7a5230', fg: '#f3d48a', sub: 'אמנות וינטג׳', weight: 800 }, Math.PI / 2);
  B.lbox(Mu, MAT.metal, -3.4, 3.7, BAL + 1, .03, .9, .03, '#2b2b28');

  // ——— Balcony: the whole south side, railing, roof on slim posts ———
  B.lbox(Mu, MAT.paving, 0, .02, (BAL + HD) / 2, HW * 2, .04, HD - BAL, '#cbbfa8', false);
  B.lbox(Mu, MAT.plain, 0, 4.3, (BAL + HD) / 2 + .05, HW * 2 + .2, .14, HD - BAL + .3, '#f1eee6');
  // Wooden-slat piers carry the roof; between them a stucco parapet with a wooden cap.
  for (let x = -HW + .35; x <= HW; x += (HW * 2 - .7) / 10) {
    for (let k = 0; k < 22; k++) B.lbox(Mu, MAT.wood, x + (k % 2 ? .04 : -.04), .1 + k * .19, HD - .32, .62, .15, .62, k % 2 ? '#4a3426' : '#36261b');
    kit.lcollide(Mu, x, 2.1, HD - .32, .62, 4.2, .62);
  }
  B.lbox(Mu, MAT.plasterRough, 0, .5, HD - .14, HW * 2, 1, .24, '#ece7dc'); B.lbox(Mu, MAT.wood, 0, 1.03, HD - .2, HW * 2, .06, .42, '#a5774b');
  kit.lcollide(Mu, 0, .55, HD - .14, HW * 2, 1.1, .28);
  B.lbox(Mu, MAT.plasterRough, HW - .12, .5, (BAL + HD) / 2, .24, 1, HD - BAL, '#ece7dc'); kit.lcollide(Mu, HW - .12, .55, (BAL + HD) / 2, .28, 1.1, HD - BAL);
  for (let x = -HW + 1.5; x < HW; x += 3.1) { B.lbox(Mu, MAT.plain, x, 4.08, (BAL + HD) / 2, .26, .32, HD - BAL, '#c23a2e'); B.lbox(Mu, MAT.plain, x + 1.55, 4.2, (BAL + HD) / 2, 1.2, .05, .14, '#f8f6ee', false); }
  B.lbox(Mu, MAT.wood, 0, 4.55, HD + .06, HW * 2 + .2, .5, .1, '#36261b');
  B.lbox(Mu, MAT.plain, 0, 3.78, HD - .12, HW * 2 - .6, .22, .22, '#e8dfc8');
  for (const [lx, n] of [[-11, 2], [-8.2, 1], [-.4, 2], [2.4, 1]] as Array<[number, number]>) {
    kit.table(Mu, lx, 6.7, { square: 1.1, top: '#efe7d4', cups: 2 });
    kit.person(Mu, lx - .7, 6.7, { shirt: SHIRTS[Math.abs(Math.round(lx * 3)) % SHIRTS.length], pants: PANTS[Math.abs(Math.round(lx)) % 6], seed: 530 + Math.round(lx * 7), seated: true, angle: Math.PI / 2 });
    if (n > 1) kit.person(Mu, lx + .7, 6.7, { shirt: SHIRTS[Math.abs(Math.round(lx * 5) + 3) % SHIRTS.length], pants: PANTS[Math.abs(Math.round(lx) + 2) % 6], seed: 545 + Math.round(lx * 7), seated: true, angle: -Math.PI / 2, dress: true });
  }
  for (let x = -12; x <= 3; x += 5) { const [px, pz] = Mu.at(x, (BAL + HD) / 2); kit.pendant(px, Mu.y + 4.2, pz, .6, '#1d1d1b'); }
  { const [x, z] = Mu.at(-5, (BAL + HD) / 2); kit.light(x, Mu.y + 3.6, z, '#ffc98a', 9, 12); }
  // The storyteller sits just outside Mandu's door, beside the bar.
  const storyteller = kit.person(Mu, -3.4, 5.3, { shirt: '#8b8c83', pants: '#484940', seed: 12, seated: true, angle: Math.PI / 2, gray: true, beard: true });
  kit.chair(Mu, -3.4, 5.3, Math.PI / 2, '#1f1f1d'); kit.table(Mu, -2.6, 5.3, { r: .4, top: '#4a3426', cups: 0, bottle: true });
  kit.register('storyteller', storyteller.focus, { he: 'המספר · האיש אפור־השיער', en: 'Storyteller · the gray-haired man' }, 4.4);

  // ——— Backyard behind the building, level with the upper plaza ———
  const bd = 5.2, Y = sub(M, 0, -HD - bd / 2, 0, F);
  B.lbox(Y, MAT.soil, -1.25, .03, 0, HW * 2 + 2.5, .06, bd, '#b9a98c', false);
  for (let x = -19; x <= 19; x += 3.2) { for (const z of [-2, 2]) { B.lbox(Y, MAT.wood, x, 1.5, z, .16, 3, .16, '#5c4029'); kit.lcollide(Y, x, 1.5, z, .16, 3, .16); } B.lbox(Y, MAT.wood, x, 3, 0, .12, .2, 4.4, '#5c4029'); }
  for (const z of [-2, 2]) B.lbox(Y, MAT.wood, 0, 3.1, z, 39, .2, .2, '#5c4029');
  B.lbox(Y, MAT.gloss, 0, 3.22, 0, 39, .03, 4.4, '#d9d3c0');
  for (let i = 0; i < 6; i++) {
    const lx = -9.5 + i * 3.8; kit.table(Y, lx, -.2, { square: 1, top: '#9a7449', cups: 0, bottle: true }); kit.stool(Y, lx - .8, -.2); kit.stool(Y, lx + .8, -.2);
    if (i % 2 === 0) kit.person(Y, lx - .8, -.2, { shirt: SHIRTS[i + 2], pants: PANTS[i % 6], seed: 500 + i, seated: true, angle: Math.PI / 2, y: .3 });
    if (i % 3 === 1) kit.person(Y, lx + .8, -.2, { shirt: SHIRTS[i + 7], pants: PANTS[(i + 3) % 6], seed: 510 + i, seated: true, angle: -Math.PI / 2, y: .3, dress: true });
  }
  for (let x = -18; x < 18.5; x += .7) { const [bx, bz] = Y.at(x, 1.6 + .3 * Math.sin(x)); const b = new THREE.Mesh(PRIMS.sphere, NIGHT.bulb); b.position.set(bx, Y.y + 2.7, bz); b.scale.setScalar(.05); kit.root.add(b); }
  { const [x, z] = Y.at(0, 0); kit.light(x, Y.y + 2.5, z, '#ffb466', 10, 14); }
  // Fence on Mandu's side; a gated side entrance with bushes at the west end, from the upper plaza.
  const fence = (lx: number, lz: number, w: number, d: number) => { B.lbox(Y, MAT.wood, lx, .6, lz, w, 1.2, d, '#7a5a3c'); kit.lcollide(Y, lx, .6, lz, w, 1.2, Math.max(d, .1)); };
  fence(-1.25, -bd / 2 + .05, HW * 2 + 2.5, .06);
  fence(HW - .05, 0, .06, bd);
  fence(-HW - 2.45, -1.85, .06, 1.5); fence(-HW - 2.45, 1.85, .06, 1.5);
  fence(-HW - 1.25, bd / 2 - .05, 2.5, .06);
  for (const z of [-1.9, 1.9]) for (const dz of [-.5, .5]) { const [x, zz] = Y.at(-HW - 3.3, z + dz); B.place(PRIMS.ico, MAT.foliage, x, Y.y + .6, zz, .9, .75, .9, z, '#4f7a43'); }
  // The bank of bushes up to Route 75, with a railing at the road edge.
  for (let x = -HW - 1; x <= HW; x += 2.2) for (const z of [-bd / 2 - 1.2, -bd / 2 - 3]) { const [bx, bz] = Y.at(x + (z > -4 ? 0 : 1.1), z); B.place(PRIMS.ico, MAT.foliage, bx, surfaceHeight(bx, bz) + .55, bz, 1.4, .9, 1.2, x, ['#4f7a43', '#5c7f45', '#46703c'][Math.abs(Math.round(x)) % 3]); }
  { const R = sub(M, 0, -HD - 9.4); B.lbox(R, MAT.metal, 0, .9, 0, HW * 2, .06, .06, '#8a9093'); for (let x = -HW; x <= HW; x += 2) B.lbox(R, MAT.metal, x, .45, 0, .06, .9, .06, '#8a9093'); kit.lcollide(R, 0, .5, 0, HW * 2, 1, .1); }
  const local = kit.person(Y, 9, 1.4, { shirt: '#425b50', pants: '#3b3d3a', seed: 261, angle: Math.PI });
  kit.register('local', local.focus, { he: 'שיחה מקומית', en: 'A local conversation' }, 3.4);

  // ——— Stair outside the balcony: down from the upper plaza (west) to the lower plaza (east) ———
  const steps = Math.ceil(F / .175), run = (ARC0 + HW) / steps;
  for (let i = 0; i < steps; i++) {
    const S = sub(M, -HW + i * run + run / 2, HD + STW / 2), h = F - (i + 1) * (F / steps);
    if (h > .01) { B.lbox(S, MAT.stone, 0, h / 2 + .01, 0, run + .02, h + .02, STW, '#ddd0b3'); kit.lcollide(S, 0, h / 2, 0, run, h, STW); kit.lground(S, 0, 0, run, STW, h); }
    B.lbox(S, MAT.plasterRough, 0, (h + .95) / 2, STW / 2 - .1, run + .02, h + .95, .22, '#ebe5d6'); B.lbox(S, MAT.metal, 0, h + 1.02, STW / 2 - .28, run + .02, .05, .05, '#b9bcbd');
    kit.lcollide(S, 0, h + .55, STW / 2 - .1, run, 1.1, .22);
  }
  // Retaining wall with a parapet where the upper plaza meets the lower plaza.
  { const [[ax, az], [bx, bz]] = ZEID.retaining, L = Math.hypot(bx - ax, bz - az), r = Math.atan2(-(bz - az), bx - ax), f = new Frame((ax + bx) / 2, (az + bz) / 2, r, Lw);
    kit.solid(f, MAT.stone, 0, (F + 1) / 2, 0, L, F + 1, .45, '#d8caa8'); }

  // ——— From the bus stop on Route 75 down to the upper plaza ———
  { const { x: sx0, z0, z1 } = ZEID.busStair, top = ZEID.road + .14, n = Math.ceil((top - U) / .17), r = (z1 - z0) / n;
    for (let i = 0; i < n; i++) { const z = z0 + (i + .5) * r, h = top - (i + 1) * (top - U) / n, f = new Frame(sx0, z, 0, U); B.lbox(f, MAT.stone, 0, (h - U) / 2 - .2, 0, 3, h - U + .4, r + .02, '#ddd0b3'); kit.ground(sx0 - 1.5, sx0 + 1.5, z - r / 2, z + r / 2, h); }
    for (const sx of [-1.6, 1.6]) B.box(MAT.stone, sx0 + sx, U + .4, (z0 + z1) / 2, .2, 1.2, z1 - z0 + .4, 0, '#d8caa8');
    // Bushes along the plaza's top edge on either side of the stair.
    for (let x = -199; x <= -168; x += 1.8) if (Math.abs(x - sx0) > 2.4) { const z = -849.3 + (x + 199) * .035; B.place(PRIMS.ico, MAT.foliage, x, U + .5, z, 1.1, .8, .9, x, '#4f7a43'); } }
  { const f = new Frame(-171.4, -846.3, 0, U);
    kit.solid(f, MAT.plasterRough, 0, 1.3, 0, 2.4, 2.6, 2.4, '#e8c84a'); B.lbox(f, MAT.plain, 0, .12, 0, 2.6, .24, 2.6, '#f2efe6');
    B.place(PRIMS.roof, MAT.tiles, f.x, U + 3.15, f.z, 2.05, 1.1, 2.05, Math.PI / 4, '#b4563b');
    B.lbox(f, MAT.plain, 0, 2.2, 1.21, .5, .5, .03, '#f4f4f0'); B.lbox(f, MAT.wood, .5, 1.05, 1.21, .8, 2, .03, '#e9e4d8');
    B.lbox(f, MAT.gloss, -1.65, 1.05, .9, .42, .62, .32, '#f2c230'); B.lbox(f, MAT.metal, -1.65, .4, .9, .06, .8, .06, '#f2c230'); kit.lcollide(f, -1.65, .7, .9, .45, 1.4, .35); }
  { const f = new Frame(ZEID.busStop[0], ZEID.busStop[1], Math.PI, ZEID.road + .14);
    B.lbox(f, MAT.metal, 0, 2.5, 0, 4.4, .08, 1.6, '#3c4a44'); for (const s of [-2.1, 2.1]) B.lbox(f, MAT.metal, s, 1.25, -.6, .06, 2.5, .06, '#3c4a44');
    B.lbox(f, MAT.wood, 0, .45, -.4, 3.6, .06, .45, '#8a6a48');
    kit.sign(f, 2.4, 2.6, .5, .8, 1, 'צומת\nקריית טבעון', { bg: '#f2f2ee', fg: '#1c3f6b', weight: 700 });
    kit.person(f, -.8, -.4, { shirt: '#3d4f6b', pants: '#2f3b4f', seed: 560, seated: true, angle: 0 }); }

  // ——— Upper plaza: walkway with benches and picnic tables; the drugstore and the falafel row ———
  paveArea(kit, ZEID.upperPlaza, '#b8765f', .06, U); paveArea(kit, ZEID.lowerPlaza, '#a96d5c', .055, Lw);
  for (const [cx, cz, r] of [[-150, -811, .62], [-150, -811, -.62], [-139, -812.5, .62], [-139, -812.5, -.62]] as Array<[number, number, number]>) B.lbox(new Frame(cx, cz, r, Lw), MAT.paving, 0, .07, 0, 15, .02, .35, '#ddd2bc', false);
  const tree = (x: number, z: number, y: number) => { const f = new Frame(x, z, 0, y); B.lbox(f, MAT.stone, 0, .25, 0, 1.6, .5, 1.6, '#ddd0b2'); B.cyl(MAT.plain, x, y + 2.2, z, .14, 3.6, '#6f6250'); for (let j = 0; j < 6; j++) { const a = j * 1.05 + x; B.place(PRIMS.ico, MAT.foliage, x + Math.cos(a) * 1.4, y + 4.3 + (j % 3) * .4, z + Math.sin(a) * 1.4, 1.8, 1.2, 1.8, a, j % 2 ? '#4e6e3a' : '#5c7c42'); } kit.collide(x - .8, x + .8, z - .8, z + .8, y, y + .5); };
  for (const [x, z] of [[-188, -826], [-181, -840.5], [-193, -816.5]] as P2[]) tree(x, z, U);
  const picnic = (x: number, z: number, r: number) => { const f = new Frame(x, z, r, U); B.lbox(f, MAT.wood, 0, .75, 0, 1.9, .06, .8, '#8a6a48'); for (const s of [-.75, .75]) B.lbox(f, MAT.wood, 0, .45, s, 1.9, .05, .3, '#8a6a48'); B.lbox(f, MAT.wood, 0, .36, 0, .1, .72, .1, '#6a4e34'); kit.lcollide(f, 0, .4, 0, 1.9, .8, 1.9); return f; };
  const bench = (x: number, z: number, r: number) => { const f = new Frame(x, z, r, U); B.lbox(f, MAT.wood, 0, .45, 0, 1.8, .06, .45, '#8a6a48'); B.lbox(f, MAT.wood, 0, .75, -.22, 1.8, .4, .05, '#8a6a48'); kit.lcollide(f, 0, .4, 0, 1.8, .8, .5); return f; };
  for (const [x, z, r] of [[-187, -844.5, .1], [-174, -833, 1.4], [-184, -820, .2]] as Array<[number, number, number]>) {
    const f = picnic(x, z, r), [ux, uz] = f.at(1.4, .9);
    B.lbox(new Frame(ux, uz, 0, U), MAT.stone, 0, .06, 0, .6, .12, .6, '#c9c6bd'); B.cyl(MAT.metal, ux, U + 1.3, uz, .03, 2.6, '#d9d9d6'); B.place(PRIMS.cone, MAT.plain, ux, U + 2.2, uz, .28, 1.5, .28, 0, '#e6dccb');
  }
  const seated = picnic(-195, -831.5, .35); kit.person(seated, 0, -.75, { shirt: '#c4b59a', pants: '#4a4038', seed: 570, seated: true, gray: true });
  for (const [x, z, r] of [[-226, -838.6, Math.PI - .34], [-211, -834.4, -.34], [-170.5, -827, -Math.PI / 2]] as Array<[number, number, number]>) bench(x, z, r);
  for (let i = 0; i < 3; i++) {
    kit.person(new Frame(-226 + i * 14, -837.8 + i * 1.2, 0, U), 0, 0, { shirt: SHIRTS[(i * 4 + 3) % SHIRTS.length], pants: PANTS[i % 6], seed: 575 + i });
    const npc = kit.ctx.npcs[kit.ctx.npcs.length - 1]; npc.kind = 'walk'; npc.speed = 1.1 + i * .15; npc.progress = i * .3;
    npc.path = [[-229, U, -838.4], [-205, U, -835.4], [-182, U, -834 + i * 2]];
  }
  const drug = BUILDINGS.find(b => b.id === ZEID.drugstore.id), fal = BUILDINGS.find(b => b.id === ZEID.falafelRow.id);
  if (drug) {
    const row = rowOnEdge(kit, drug.points, [-216.8, -839.6], [-203.9, -835.1], U + .02, [
      [4.1, { type: 'discount', width: 7.4, he: 'דראגסטור הצומת', en: 'DRUGSTORE · CANDY · TOTO', sign: '#c62d3a', ink: '#ffffff', awning: '#9a2430' }],
      [9.6, { type: 'office', width: 3.2, he: 'טוטו · לוטו', en: 'TOTO · LOTTO', sign: '#1f5aa6', ink: '#ffffff', awning: null }],
    ]);
    B.lbox(row.f, MAT.metal, row.lx(12.2), 1.1, .45, .8, 1.7, .6, '#5a6a72'); B.lbox(row.f, MAT.gloss, row.lx(12.2), 1.5, .76, .5, .3, .03, '#2a8ad1');
    kit.sign(row.f, row.lx(12.2), 2.25, .78, .8, .3, 'כספומט', { bg: '#1f5aa6', fg: '#ffffff', weight: 800 });
    kit.lcollide(row.f, row.lx(12.2), .85, .45, .8, 1.7, .6);
  }
  if (fal) {
    const row = rowOnEdge(kit, fal.points, [-216.5, -835.5], [-203, -830.6], U + .02, [
      [1.9, { type: 'falafel', width: 3.4, he: 'פלאפל חן', en: 'FALAFEL CHEN', sign: '#f6d53b', ink: '#1d4d27', awning: '#2e7d3c' }],
      [5.5, { type: 'salon', width: 3.4, he: 'מספרה', en: 'BARBER', sign: '#1d2b3a', ink: '#f2f2ee', awning: null }],
      [9.1, { type: 'falafel', width: 3.4, he: ' ', sign: '#dcd8cf', ink: '#dcd8cf', awning: null }], // its own painted sign is added below
      [12.6, { type: 'pizza', width: 3.4, he: 'פיצה', en: 'PIZZA', sign: '#b8321f', ink: '#fff3d6', awning: '#2e7d3c' }],
    ]);
    const lx = row.lx(9.1);
    kit.painted(row.f, lx, 3.95, .58, 3.3, 1.05, luliSign);
    { const [ax, az] = row.f.at(lx, 1.05); B.place(PRIMS.box, MAT.plain, ax, U + 4.72, az, 3.5, .05, 1.3, row.f.rot, '#3d7fc4', true, .3); }
    kit.painted(row.f, lx, 4.42, 1.68, 3.5, .36, scallops);
    kit.anchor(row.f, 'landmark_falafel_luli', lx, 2.3, 1.2, landmark('falafel_luli').name, 3.4);
  }

  // ——— Lower plaza and Zohar cinema, which faces the building ———
  for (const [x, z] of [[-152, -815], [-138, -814], [-148, -806.5]] as P2[]) tree(x, z, Lw);
  for (const [x, z] of [[-157, -813], [-130, -813], [-158, -807.5]] as P2[]) { B.cyl(MAT.metal, x, Lw + 2, z, .06, 4, '#2d3330'); const g = new THREE.Mesh(PRIMS.sphere, NIGHT.bulb); g.position.set(x, Lw + 4.1, z); g.scale.setScalar(.22); kit.root.add(g); kit.light(x, Lw + 3.9, z, '#ffd49b', 9, 14); }
  skip.add(ZEID.cinema.id);
  const cin = BUILDINGS.find(b => b.id === ZEID.cinema.id);
  if (cin) {
    const g = groundRange(cin.points), cbox = extrude(kit, cin.points, g.lo - .5, g.lo + 8.5, '#e1d8c6', false, { roofColor: '#8f8b80' });
    const cf = new Frame(cbox.cx, cbox.cz, cbox.rot, g.lo + 8.5);
    for (let v = -cbox.d / 2 + 2; v < cbox.d / 2 - 1; v += 2.4) { const [x, z] = cf.at(0, v); B.place(PRIMS.box, MAT.gloss, x, cf.y + .55, z, cbox.w - 3, .06, 1.9, cbox.rot, '#24384a', true, -.35); }
    const row = rowOnEdge(kit, cin.points, [-133.9, -810.4], [-108.7, -807.1], Lw + .02, [
      [6, { type: 'cafe', width: 7, he: 'אווה ובתיה', en: 'EVA & BATYA · CAFÉ', sign: '#f3e9d6', ink: '#6b3f2a', awning: '#9a6a46', seating: 2 }],
      [17, { type: 'office', width: 10, he: 'אולם זוהר', en: 'ZOHAR HALL · CINEMA', sign: '#1c2230', ink: '#ffd27a', awning: '#2a2d30' }],
    ]);
    kit.anchor(row.f, 'landmark_zohar', row.lx(17), 2.3, 2, landmark('zohar').name, 4.2);
  }
  kit.occ.mark(-235, -100, -858, -795);
  return { M, U, Lw, bar: sub(M, -5, (BAL - HD) / 2, 0, F), plaza: sub(M, 0, HD + 6) };
}

/** Ground floor at the lower plaza, from the west: the closed section (Rav-Kav centre, flower
 *  shop) entered by an east-facing door inside the roofed strip; then Zeid 1 (building site),
 *  Mishi and Oranim pharmacy, as deep as the upper floor, behind the roofed strip under the
 *  balcony. The slab overhead is the upper floor and the balcony. */
function groundFloor(kit: Kit, M: Frame) {
  const B = kit.B, F = MANDU_FLOOR, { HW, HD, BAL, STW, ARC0 } = ZEID.frame, wall = '#e6dcc8', SH = 3; // shopfront height under the slab
  // Shell: the north wall retains the backyard; end walls; the slab.
  kit.solid(M, MAT.plaster, 0, F / 2, -HD + .15, HW * 2, F, .3, wall);
  kit.solid(M, MAT.plaster, -HW + .15, F / 2, STW / 2, .3, F, HD * 2 + STW, wall);
  kit.solid(M, MAT.plaster, HW - .15, F / 2, (BAL - HD) / 2, .3, F, HD + BAL, wall);
  B.lbox(M, MAT.plain, 0, F - .15, 0, HW * 2, .3, HD * 2, '#d8d0c0');
  for (const x of [ARC0, -3.5, 4]) kit.solid(M, MAT.plaster, x, F / 2, (BAL - HD) / 2, .25, F, HD + BAL, wall);
  // The closed section: its south wall under the balcony edge, its east wall with the door.
  kit.solid(M, MAT.plaster, (ARC0 - HW) / 2, F / 2, HD - .15, ARC0 + HW, F, .3, wall);
  const door0 = 5.4, door1 = 7;
  kit.solid(M, MAT.plaster, ARC0, F / 2, (BAL + door0) / 2, .3, F, door0 - BAL, wall);
  kit.solid(M, MAT.plaster, ARC0, F / 2, (door1 + HD) / 2, .3, F, HD - door1, wall);
  B.lbox(M, MAT.plaster, ARC0, (2.4 + F) / 2, (door0 + door1) / 2, .3, F - 2.4, door1 - door0, wall);
  B.lbox(M, MAT.metal, ARC0 + .16, 1.2, (door0 + door1) / 2, .04, 2.4, door1 - door0, '#2d3532');
  kit.sign(M, ARC0 + .2, 2.85, (door0 + door1) / 2, 2.6, .5, 'רב־קו · פרחים', { bg: '#1f6fb0', fg: '#ffffff', sub: 'RAV-KAV · FLOWERS', weight: 800 }, Math.PI / 2);
  // Inside: a corridor under the balcony with the two shops on its north side.
  B.lbox(M, MAT.paving, (ARC0 - HW) / 2, .04, (BAL + HD) / 2, ARC0 + HW - .4, .08, HD - BAL - .3, '#d8d0c0', false);
  shopUnit(kit, M, -18.3, BAL, { type: 'office', width: 5.2, he: 'מרכז רב־קו', en: 'RAV-KAV CENTRE', sign: '#1f6fb0', ink: '#ffffff', awning: null }, 4, SH);
  shopUnit(kit, M, -13.1, BAL, { type: 'flowers', width: 4.4, he: 'פרחים', en: 'FLOWER SHOP', sign: '#f3efe6', ink: '#a3416a', awning: null }, 4, SH);
  kit.person(M, -18.3, BAL - 1.6, { shirt: '#1f6fb0', pants: '#2b2f36', seed: 590, angle: 0 });
  kit.anchor(M, 'landmark_ravkav', -18.3, 2, BAL + 1.4, { he: 'מרכז רב־קו', en: 'Rav-Kav centre' }, 3.4);
  { const [x, z] = M.at((ARC0 - HW) / 2, (BAL + HD) / 2); kit.light(x, M.y + F - .7, z, '#f4f1e6', 8, 10); }
  // The roofed strip: paving, columns along the balcony edge, lights.
  B.lbox(M, MAT.paving, (ARC0 + HW) / 2, .03, (BAL + HD) / 2, HW - ARC0, .06, HD - BAL, '#d6ccb8', false);
  for (let x = ARC0 + 2.4; x < HW; x += 4.6) { B.lbox(M, MAT.plaster, x, (F - .3) / 2, HD - .2, .3, F - .3, .3, '#f2efe8'); kit.lcollide(M, x, (F - .3) / 2, HD - .2, .3, F - .3, .3); }
  for (const x of [-4, 10]) { const [lx, lz] = M.at(x, (BAL + HD) / 2); kit.light(lx, M.y + F - .6, lz, '#f6e7c8', 7, 10); }
  // Zeid 1 — young people's centre, behind construction hoarding.
  const z1 = (ARC0 - 3.5) / 2;
  B.lbox(M, MAT.wood, z1, 1.3, BAL + .25, 6.6, 2.6, .12, '#c9a46a'); kit.lcollide(M, z1, 1.3, BAL + .25, 6.6, 2.6, .3);
  for (let x = z1 - 3.2; x <= z1 + 3.2; x += 1.6) B.lbox(M, MAT.metal, x, 1.85, BAL + .45, .05, 3.7, .05, '#8a8f92');
  for (const y of [1.5, 3]) B.lbox(M, MAT.metal, z1, y, BAL + .45, 6.6, .05, .05, '#8a8f92');
  kit.sign(M, z1, 1.5, BAL + .33, 4.6, 1.3, 'זייד 1', { bg: '#f2c230', fg: '#1d1d1b', sub: 'מרכז צעירים · בבנייה · ZEID 1 YOUTH CENTRE', weight: 900 });
  kit.sign(M, z1 + 2.6, 2.3, BAL + .33, 1.2, .8, 'זהירות!\nאתר בנייה', { bg: '#d63a2c', fg: '#ffffff', weight: 800 });
  for (let i = 0; i < 3; i++) B.lbox(M, MAT.gloss, z1 - 2.4 + i * 2.4, .5, BAL + 1, .9, 1, .4, i % 2 ? '#ffffff' : '#d63a2c');
  // Mishi and the pharmacy, which runs to the building's east end.
  shopUnit(kit, M, .25, BAL, { type: 'bakery', width: 7.3, he: 'מישי · בוטיק שוקולד', en: 'MISHI CHOCOLATE', sign: '#3b2416', ink: '#f2d9b0', awning: null }, 4, SH);
  shopUnit(kit, M, 12.65, BAL, { type: 'pharmacy', width: 17.1, he: 'בית מרקחת אורנים', en: 'ORANIM PHARMACY', sign: '#f4f6f2', ink: '#1f8a4c', awning: null }, 4, SH);
  kit.anchor(M, 'landmark_oranim_pharmacy', 12.65, 2.2, BAL + 1.4, { he: 'בית מרקחת אורנים', en: 'Oranim pharmacy' }, 3.4);
  kit.anchor(M, 'landmark_mishi', .25, 2.2, BAL + 1.4, { he: 'מישי · בוטיק שוקולד', en: 'Mishi chocolate boutique' }, 3.4);
  kit.anchor(M, 'landmark_zeid1', z1, 2.2, BAL + 1.6, { he: 'זייד 1 · מרכז צעירים', en: 'Zeid 1 youth centre' }, 3.6);
}

/** בית התוכנה והמחשב, HaBonim 2, on its OSM footprint. */
export function buildComputerShop(kit: Kit, skip: Set<string>) {
  const l = landmark('computer_shop'), fp = footprintAt(l.x, l.z, 30);
  let cx = l.x, cz = l.z, rot = 0;
  if (fp) { skip.add(fp.id); const b = orientedBox(fp.points); cx = b.cx; cz = b.cz; rot = b.rot; }
  const face = facingStreet(cx, cz, rot, 12, 12);
  const corners: P2[] = [[-6, -6], [6, -6], [6, 6], [-6, 6]].map(([u, v]) => new Frame(cx, cz, face.rot, 0).at(u, v));
  const f = new Frame(cx, cz, face.rot, groundRange(corners).hi);
  enterableShop(kit, f, 12, 12, { he: 'בית התוכנה והמחשב', sub: 'HABONIM 2 · COMPUTERS & REPAIRS', bg: '#3d5051', fg: '#ece6cf', keeperId: 'shopkeeper', keeperLabel: { he: 'ציוד לטיול', en: 'Shop for equipment' } });
  kit.anchor(f, 'landmark_computer_shop', 4, 2.4, 7, l.name, 3.6);
  reserve(kit, f, 12, 12, 0, 1.5);
  void surfaceHeight; void MAT;
  return f;
}
