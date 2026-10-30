import * as THREE from 'three';
import { landmark, footprintAt, orientedBox, nearestRoad, pointInPolygon, ROADS, VEHICLE, BUILDINGS, type P2 } from './geo';
import { surfaceHeight } from './terrain';
import { Kit, MAT, NIGHT, Frame, PRIMS, SHIRTS, PANTS } from './kit';
import { commercialBlock, enterableShop, type ShopSpec } from './shops';
import { BENGURION } from './layout';
import { groundRange, extrude, solarHeater } from './scenery';

/** The old centre around Ben Gurion Square. The pedestrian street (from Street View and the
 *  satellite view) climbs from HaShkedim to Get Phone between two rows of shops under ash
 *  trees; shop names follow Google Maps pins. Amali stands on its OSM footprint and follows its
 *  public identity (logo, purple and off-white brand, ceramic two-tone cups, light wood, a
 *  compact drum roaster) and the press note that the building was once a cinema. */
export const reserve = (kit: Kit, f: Frame, w: number, d: number, lz = 0, pad = 1.5) => kit.occ.markRect(f, 0, lz, w + pad * 2, d + pad * 2);
const AMALI_PURPLE = '#4a2c6b', AMALI_LAVENDER = '#b8a2d4', AMALI_CREAM = '#f6f1ea';
const vehicleRoads = ROADS.filter(r => VEHICLE.has(r.kind));

/** A frame on a footprint's oriented box whose local +z faces the nearest street. */
export function facingStreet(cx: number, cz: number, rot: number, w: number, d: number) {
  const road = nearestRoad(cx, cz, vehicleRoads); const tx = road.px - cx, tz = road.pz - cz;
  let best = { rot, w, d, score: -Infinity };
  for (let k = 0; k < 4; k++) { const r = rot + k * Math.PI / 2, score = Math.sin(r) * tx + Math.cos(r) * tz; if (score > best.score) best = { rot: r, w: k % 2 ? d : w, d: k % 2 ? w : d, score }; }
  return best;
}

export function buildBenGurion(kit: Kit, skip: Set<string>) {
  // ——— The pedestrian street ———
  const [ax, az] = BENGURION.a, [bx, bz] = BENGURION.b;
  const L = Math.hypot(ax - bx, az - bz), dirX = (ax - bx) / L, dirZ = (az - bz) / L;
  const S = new Frame((ax + bx) / 2, (az + bz) / 2, Math.atan2(dirX, dirZ)); // local +z → HaShkedim (SE), +x → north-east
  const at = (along: number, off: number) => S.at(off, L / 2 - along);
  // Clear OSM buildings standing in the street and its two rows (OSM merges the block).
  const inCorridor = (x: number, z: number) => { const dx = x - S.x, dz = z - S.z, lx = dx * S.cos - dz * S.sin, lz = dx * S.sin + dz * S.cos, along = L / 2 - lz; return Math.abs(lx) < 20 && along > -4 && along < L + 13; };
  const probes: P2[] = []; for (let along = -3; along < L + 13; along += 3) for (let off = -19; off <= 19; off += 4) probes.push(at(along, off));
  for (const b of BUILDINGS) if (b.points.some(([x, z]) => inCorridor(x, z)) || probes.some(([x, z]) => pointInPolygon(x, z, b.points))) skip.add(b.id);
  kit.occ.markRect(S, 0, 0, 44, L + 26);
  // Stepped paving following the climb, in alternating bands of grey and rose stone.
  for (let along = -3; along < L + 1.5; along += 1.5) {
    const [x, z] = at(along, 0), y = surfaceHeight(x, z);
    kit.B.box(MAT.paving, x, y - .44, z, 14.6, 1, 1.56, S.rot, Math.floor(along / 4.5) % 2 ? '#cfc4b4' : '#c9b4aa', false);
    for (const s of [-1, 1]) { const [ex, ez] = at(along, s * 7.3); kit.B.box(MAT.stone, ex, y - .35, ez, .3, 1, 1.56, S.rot, '#e3d6b8', false); }
  }
  // Ash trees in raised planters, benches, a green-umbrella kiosk and lamps.
  for (let along = 4; along < L - 2; along += 7.5) for (const off of [-3.8, 3.8]) {
    const [x, z] = at(along, off), y = surfaceHeight(x, z);
    kit.B.box(MAT.stone, x, y + .2, z, 1.6, .5, 1.6, S.rot, '#ddd0b2'); kit.collide(x - .8, x + .8, z - .8, z + .8, y, y + .5);
    kit.B.cyl(MAT.plain, x, y + 2.4, z, .14, 4, '#6f6250');
    for (let j = 0; j < 6; j++) { const a = j * 1.05 + along; kit.B.place(PRIMS.ico, MAT.foliage, x + Math.cos(a) * 1.3, y + 4.6 + (j % 3) * .5, z + Math.sin(a) * 1.3, 1.7, 1.2, 1.7, a, j % 2 ? '#6e8a3e' : '#7d9a48'); }
    const [qx, qz] = at(along + 2.2, off * .45); kit.B.box(MAT.wood, qx, surfaceHeight(qx, qz) + .45, qz, .45, .06, 1.7, S.rot, '#8a6a48');
  }
  { const [x, z] = at(L * .62, 1.2), y = surfaceHeight(x, z), K = new Frame(x, z, S.rot, y);
    kit.solid(K, MAT.plaster, 0, 1.2, 0, 2.2, 2.4, 1.8, '#e9dfc9'); kit.sign(K, 0, 2.05, .92, 2, .4, 'קיוסק', { bg: '#2f6b55', fg: '#ffffff' });
    K.y = y; kit.B.lbox(K, MAT.plain, 1.8, 2.6, 1.6, .06, 2.6, .06, '#444'); kit.B.place(PRIMS.cone, MAT.plain, ...(() => { const [ux, uz] = K.at(1.8, 1.6); return [ux, y + 2.75, uz] as const; })(), 1.7, .45, 1.7, 0, '#2f7a4a');
    for (let i = 0; i < 2; i++) { kit.table(K, 1.2 + i * 1.4, 2.6, { square: .7, top: '#f1efe8', cups: 1 }); kit.chair(K, .6 + i * 1.4, 2.6, Math.PI / 2, '#f1efe8', 0, true); } }
  for (const along of [2, 16, 30, 44]) for (const off of [-6.6, 6.6]) { const [x, z] = at(along, off), y = surfaceHeight(x, z); kit.B.cyl(MAT.metal, x, y + 2, z, .06, 4, '#2d3330'); const g = new THREE.Mesh(PRIMS.sphere, NIGHT.bulb); g.position.set(x, y + 4.1, z); g.scale.setScalar(.22); kit.root.add(g); if (along === 16 || along === 44) kit.light(x, y + 3.9, z, '#ffd49b', 9, 14); }
  kit.sign(new Frame(...at(-1.5, 5.6), S.rot), 0, 1.6, 0, 2.4, .7, 'כיכר בן גוריון', { bg: '#efe6cf', fg: '#2d4235', sub: 'BEN GURION SQUARE', border: true });
  // Shop rows: blocks of two units stepping up with the street.
  const row = (side: 1 | -1, along: number, w: number, d: number, units: ShopSpec[], o: { floors?: number; stone?: boolean; wall?: string } = {}) => {
    const [x, z] = at(along, side * (7.4 + d / 2)), [fx, fz] = at(along, side * 7.4);
    const f = new Frame(x, z, S.rot + (side === 1 ? -Math.PI / 2 : Math.PI / 2), surfaceHeight(fx, fz));
    commercialBlock(kit, f, w, d, units, { floors: o.floors ?? 2, wall: o.wall ?? '#ece3cf', stone: o.stone, colonnade: side === 1 });
    reserve(kit, f, w, d, 0, .6);
    return f;
  };
  // North-east side (units listed from the top of the street down).
  const ne1 = row(1, 10, 14, 10, [{ type: 'office', width: 7, he: 'BM נדל״ן', en: 'BM REAL ESTATE', sign: '#1f3550', ink: '#f2f2f2', awning: null }, { type: 'falafel', width: 7, he: 'ארבס חומוס', en: 'ARBES HUMMUS', sign: '#f2c230', ink: '#1f3b1f', awning: '#2f6b35', seating: 3 }]);
  const ne2 = row(1, 24, 14, 10, [{ type: 'bakery', width: 7, he: 'לחם ארז', en: 'LEHEM EREZ', sign: '#5b3a24', ink: '#fbe8c6', awning: '#8a5a33', seating: 2 }, { type: 'office', width: 7, he: 'מאני גרם', en: 'MONEYGRAM · EXCHANGE', sign: '#d23a2c', ink: '#ffffff', awning: null }]);
  const ne3 = row(1, 38, 14, 10, [{ type: 'cafe', width: 7, he: 'שני · מאפייה', en: 'SHANY BAKERY', sign: '#f2dfc5', ink: '#7a3d1f', awning: '#b8754a', seating: 2 }, { type: 'clothes', width: 7, he: 'אופנה', en: 'BOUTIQUE', sign: '#e6d7b8', ink: '#5a3b5b', awning: '#5a3b5b' }]);
  // South-west side (units listed from the bottom of the street up).
  const sw1 = row(-1, 9.5, 15, 12, [{ type: 'office', width: 15, he: 'המועצה המקומית קריית טבעון', en: 'KIRYAT TIVON LOCAL COUNCIL', sign: '#e8e1cf', ink: '#2d4235', awning: null }], { floors: 3, stone: true, wall: '#e6dcc6' });
  const sw2 = row(-1, 24, 14, 10, [{ type: 'pharmacy', width: 6, he: 'דני', en: 'VITAMINS & SUPPLEMENTS', sign: '#2a7a4a', ink: '#ffffff', awning: '#2a7a4a' }, { type: 'organic', width: 8, he: 'ניצת הדובדבן', en: 'HEALTH FOOD', sign: '#7a2b3a', ink: '#f6ecd8', awning: '#7a2b3a' }]);
  const sw3 = row(-1, 38, 14, 10, [{ type: 'grocery', width: 6, he: 'אטליז', en: 'BUTCHER', sign: '#8c1f1f', ink: '#ffffff', awning: '#8c1f1f' }, { type: 'flowers', width: 8, he: 'חיננית', en: 'HINANIT · FLOWERS', sign: '#f3efe6', ink: '#a3416a', awning: '#6f8a4f' }]);
  // Get Phone at the top of the street, facing down it; Dima runs it.
  const [gx, gz] = at(L + 5.5, 0), gp = new Frame(gx, gz, S.rot, surfaceHeight(...at(L + .5, 0)));
  enterableShop(kit, gp, 10, 9, { he: 'Get Phone', sub: 'גט פון · סלולר ומעבדת מחשבים', bg: '#14366b', fg: '#ffffff', keeperId: 'dima', keeperLabel: { he: 'דימה · גט פון', en: 'Dima · Get Phone' }, keeperShirt: '#1d3f7a', poster: 'חדש בטבעון!\nמעבדה למחשבים' });
  reserve(kit, gp, 10, 9, 0, .5);
  for (const s of [-1, 1]) for (let i = 0; i < 6; i++) { const [x, z] = at(L - 1 + i * .45, s * 6.3); kit.B.box(MAT.stone, x, surfaceHeight(...at(L - 1, 0)) + i * .16 - .3, z, 2.2, .6, .45, S.rot, '#ddd0b3'); }
  // Back rows: flats over the shops, filling the block OSM maps as one merged building.
  for (const [a0, a1, o0, o1, lv] of [[2, 44, 17.6, 25, 3], [18, 47, -19.6, -28, 3], [-2, 16, -19.8, -26, 2]] as Array<[number, number, number, number, number]>) {
    const poly: P2[] = [at(a0, o0), at(a1, o0), at(a1, o1), at(a0, o1)];
    const g = groundRange(poly); extrude(kit, poly, g.lo - .5, g.hi + lv * 3, lv === 3 ? '#ece3cf' : '#e4dccd', false);
    const c = at((a0 + a1) / 2, (o0 + o1) / 2); for (let i = 0; i < Math.floor((a1 - a0) / 8); i++) { const q = at(a0 + 4 + i * 8, (o0 + o1) / 2); solarHeater(kit, q[0], g.hi + lv * 3, q[1], S.rot); }
    void c;
  }
  // Strollers and shoppers.
  for (let i = 0; i < 5; i++) {
    kit.person(S, (i % 2 ? 2 : -2), L / 2 - 6 - i * 8, { shirt: SHIRTS[(i * 5 + 2) % SHIRTS.length], pants: PANTS[i % 6], seed: 400 + i, dress: i === 3 });
    const npc = kit.ctx.npcs[kit.ctx.npcs.length - 1]; const off = i % 2 ? 2 : -2;
    npc.kind = 'walk'; npc.speed = 1 + i * .1; npc.progress = i * .2;
    npc.path = [at(1, off), at(L - 2, off)].map(([x, z]) => [x, surfaceHeight(x, z), z] as [number, number, number]);
  }
  kit.person(S, 3.8, L / 2 - 6.2, { shirt: '#c4b59a', pants: '#4a4038', seed: 411, seated: true, angle: -Math.PI / 2, gray: true });
  for (const [id, f, lx, lz] of [['arbes', ne1, 3.5, 5.6], ['bm_realestate', ne1, -3.5, 5.6], ['moneygram', ne2, 3.5, 5.6], ['council', sw1, 0, 6.6], ['dani', sw2, -4, 5.6], ['nitzat', sw2, 3, 5.6], ['bg_butcher', sw3, -4, 5.6], ['hinanit', sw3, 3, 5.6]] as Array<[string, Frame, number, number]>) kit.anchor(f, `landmark_${id}`, lx, 2.3, lz, landmark(id).name, 3.6);
  kit.anchor(gp, 'landmark_get_phone', 3.5, 2.3, 5.4, landmark('get_phone').name, 3.6);
  kit.anchor(ne3, 'landmark_bg_bakery', -3.5, 2.3, 5.6, landmark('bg_bakery').name, 3.6);
  kit.anchor(ne3, 'landmark_bg_boutique', 3.5, 2.3, 5.6, landmark('bg_boutique').name, 3.6);
  kit.anchor(new Frame(...at(L * .5, 0), S.rot), 'landmark_bengurion_square', 0, 1.6, 0, landmark('bengurion_square').name, 4);

  // ——— Amali on its footprint ———
  const al = landmark('amali'), fp = footprintAt(al.x, al.z, 20);
  let cx = al.x, cz = al.z, rot = 0;
  if (fp) { skip.add(fp.id); const box = orientedBox(fp.points); cx = box.cx; cz = box.cz; rot = box.rot; }
  const face = facingStreet(cx, cz, rot, 13, 18);
  const corners: P2[] = [[-6.5, -9], [6.5, -9], [6.5, 9], [-6.5, 9]].map(([u, v]) => new Frame(cx, cz, face.rot, 0).at(u, v));
  const amaliFrame = amali(kit, new Frame(cx, cz, face.rot, groundRange(corners).hi));
  kit.anchor(amaliFrame, 'landmark_amali', 4.5, 2.2, 9.6, al.name, 3.4);
  foundersMemorial(kit);
  return amaliFrame;
}

function amali(kit: Kit, f: Frame) {
  const B = kit.B, W = 13, D = 18, H = 7, F = D / 2;
  const wall = '#f3efe7', oak = '#c9a77c', steel = '#1e2120';
  B.lbox(f, MAT.stone, 0, -.7, 0, W + .4, 1.5, D + .4, '#d9ccb0');
  B.lbox(f, MAT.wood, 0, .04, 0, W - .4, .08, D - .4, '#c7a98a', false);
  kit.lground(f, 0, 0, W - .3, D - .3, .08);
  for (const sx of [-1, 1]) kit.solid(f, MAT.plaster, sx * (W / 2 - .15), H / 2, 0, .3, H, D, wall);
  kit.solid(f, MAT.plaster, 0, H / 2, -F + .15, W, H, .3, wall);
  B.lbox(f, MAT.plain, 0, H + .15, 0, W + .3, .3, D + .3, '#e6e0d4');
  B.lbox(f, MAT.plain, 0, H + .55, 0, W + .3, .5, D + .3, '#efe9dc');
  // Roof plant: the roaster's flue and a solar heater.
  { const [x, z] = f.at(-5.2, -6.8); B.place(PRIMS.cyl, MAT.metal, x, f.y + H + 1.2, z, .12, 2.4, .12, 0, '#9a9d9f'); }
  // Façade: tall black-steel glazing (the cinema hall's height) under an off-white parapet.
  B.lbox(f, MAT.plaster, 0, 5.75, F - .15, W, 2.5, .3, '#efe9dc');
  for (const mx of [-6.35, -4, -1.25, 1.25, 4, 6.35]) B.lbox(f, MAT.metal, mx, 2.25, F, .12, 4.5, .16, steel);
  B.lbox(f, MAT.metal, 0, 4.45, F, W, .14, .16, steel); B.lbox(f, MAT.metal, 0, 3.05, F, W, .08, .14, steel); B.lbox(f, MAT.metal, 0, .2, F, W, .4, .16, steel);
  const pane = (a: number, b: number, y0: number, y1: number) => { const [x, z] = f.at((a + b) / 2, F); B.place(PRIMS.box, NIGHT.shopWindow, x, f.y + (y0 + y1) / 2, z, b - a - .1, y1 - y0 - .05, .03, f.rot, null, false); };
  for (const [a, b] of [[-6.35, -4], [-4, -1.25], [1.25, 4], [4, 6.35]]) pane(a, b, .4, 4.4);
  pane(-1.25, 1.25, 3.1, 4.4);
  kit.lcollide(f, -3.9, 2.25, F, 5.3, 4.5, .3); kit.lcollide(f, 3.9, 2.25, F, 5.3, 4.5, .3);
  // The café's own logo (user-supplied image): white wordmark on blue, flanked by purple.
  logoSign(kit, f, 0, 5.75, F + .04, 2.3);
  for (const sx of [-1, 1]) B.lbox(f, MAT.plain, sx * 3.6, 5.75, F + .02, 4.4, .5, .04, AMALI_PURPLE, false);
  logoSign(kit, f, 0, 5.75, -F + .32, 1.4);
  B.lbox(f, MAT.metal, 0, 3.35, F + .9, 4.2, .08, 1.8, AMALI_PURPLE);
  for (const sx of [-1.9, 1.9]) B.lbox(f, MAT.metal, sx, 3.9, F + 1.4, .03, 1.2, .03, steel);
  // Pavement seating, planters and an A-board.
  for (const lx of [-4.6, 4.6]) {
    kit.table(f, lx, F + 1.5, { r: .38, top: '#d9c4a2', cups: 2 });
    kit.chair(f, lx - .65, F + 1.5, Math.PI / 2, '#2a2b2a'); kit.chair(f, lx + .65, F + 1.5, -Math.PI / 2, '#2a2b2a');
  }
  for (const lx of [-6.2, 6.2]) { const [x, z] = f.at(lx, F + .6); kit.plant(x, f.y, z, 1.7, '#e8e2d6'); }
  kit.sign(f, 2.2, .55, F + 2.6, .6, .8, 'קפה\nספיישלטי', { bg: AMALI_PURPLE, fg: AMALI_CREAM, weight: 700 }, .4);
  kit.person(f, -4.6 - .66, F + 1.5, { shirt: '#c4b59a', pants: '#3b3d3a', seed: 52, seated: true, angle: Math.PI / 2 });

  // ——— Interior ———
  // Counter of pale oak with a white top; espresso machine, two grinders, pastry case.
  B.lbox(f, MAT.wood, -1.5, .53, -2.6, 7.4, 1.05, .8, oak); B.lbox(f, MAT.gloss, -1.5, 1.08, -2.6, 7.6, .06, .9, '#f2f0ea');
  kit.lcollide(f, -1.5, .55, -2.6, 7.6, 1.1, .9);
  for (let i = 0; i < 18; i++) B.lbox(f, MAT.wood, -5.1 + i * .42, .53, -2.18, .04, 1, .03, '#a98559');
  const brewer = new Frame(...f.at(-2.4, -2.75), f.rot, f.y + 1.11);
  B.lbox(brewer, MAT.metal, 0, .25, 0, 1.05, .5, .55, '#c8ccce'); B.lbox(brewer, MAT.gloss, 0, .52, 0, 1.08, .05, .58, '#1b1c1c');
  B.lbox(brewer, MAT.gloss, 0, .14, .3, .9, .1, .1, '#1b1c1c');
  for (const gx of [-.25, .25]) { const [x, z] = brewer.at(gx, .3); B.place(PRIMS.cyl, MAT.metal, x, brewer.y + .3, z, .05, .1, .05, 0, '#9ea3a6'); B.place(PRIMS.box, MAT.metal, x, brewer.y + .23, z + 0, .08, .02, .2, f.rot, '#222'); kit.cup(x, brewer.y + .02, z + 0, '#e9e4da', AMALI_PURPLE); }
  for (let i = 0; i < 5; i++) { const [x, z] = brewer.at(-.4 + i * .2, -.1); kit.cup(x, brewer.y + .55, z, '#f1ece2', ['#2f4a6b', '#1b1c1c', AMALI_PURPLE][i % 3]); }
  kit.anchor(f, 'brewer', -2.4, 1.55, -2.75, { he: 'מכונת האספרסו · עמדת חליטה', en: 'Espresso machine · brewing station' }, 3.6);
  for (const [gx, beans] of [[-3.7, '#4a2e1c'], [-4.35, '#7a5233']] as Array<[number, string]>) {
    B.lbox(f, MAT.gloss, gx, 1.32, -2.75, .22, .42, .3, '#1c1d1d');
    const [x, z] = f.at(gx, -2.75); B.place(PRIMS.cone, MAT.gloss, x, f.y + 1.68, z, .12, .3, .12, 0, beans, true, Math.PI);
  }
  // Pastry case.
  { const [x, z] = f.at(.7, -2.6); B.place(PRIMS.box, NIGHT.shopWindow, x, f.y + 1.36, z, 1.3, .5, .65, f.rot, null, false);
    for (let i = 0; i < 8; i++) { const [px, pz] = f.at(.25 + (i % 4) * .3, -2.75 + Math.floor(i / 4) * .28); B.place(PRIMS.sphere, MAT.matte, px, f.y + 1.18, pz, .1, .05, .1, 0, ['#d7a35a', '#b9783d', '#efd8a8', '#8c5a3a'][i % 4], false); } }
  B.lbox(f, MAT.gloss, 1.75, 1.2, -2.6, .3, .2, .22, '#222');
  // Back bar and shelving wall of coffee bags and ceramics.
  B.lbox(f, MAT.wood, 0, .47, -8.2, 11.6, .94, .7, oak); B.lbox(f, MAT.gloss, 0, .96, -8.2, 11.7, .05, .75, '#f2f0ea');
  kit.lcollide(f, 0, .5, -8.2, 11.7, 1, .75);
  for (let k = 0; k < 3; k++) {
    B.lbox(f, MAT.wood, 0, 1.6 + k * .55, -8.62, 11.4, .04, .32, oak);
    for (let i = 0; i < 22; i++) {
      const lx = -5.4 + i * .51;
      if (k < 2) { B.lbox(f, MAT.matte, lx, 1.8 + k * .55, -8.62, .26, .36, .14, AMALI_CREAM, false); B.lbox(f, MAT.matte, lx, 1.78 + k * .55, -8.54, .26, .08, .005, AMALI_PURPLE, false); }
      else { const [x, z] = f.at(lx, -8.6); kit.cup(x, f.y + 1.62 + k * .55, z, ['#efe7d6', '#1d1d1d', '#d9cbb4'][i % 3], ['#2f4a6b', '#efe7d6', AMALI_PURPLE, '#1d1d1d'][i % 4]); }
    }
  }
  for (let i = 0; i < 9; i++) { const [x, z] = f.at(-4.5 + i * .5, -8.1); kit.cup(x, f.y + .99, z, '#efe7d6', ['#2f4a6b', '#1d1d1d', AMALI_PURPLE][i % 3]); }
  kit.sign(f, 0, 4.4, -F + .32, 5.2, .9, 'קפה ספיישלטי · קלייה מקומית', { bg: AMALI_CREAM, fg: AMALI_PURPLE, weight: 600 });
  // Former cinema: projection port high on the back wall and a small plaque.
  B.lbox(f, MAT.plain, 3.5, 6, -F + .31, .7, .45, .02, '#1a1a1a', false);
  kit.sign(f, -4.6, 2.9, -F + .32, 1.5, .5, 'פעם היה כאן קולנוע', { bg: '#efe8d8', fg: '#3a3a36', sub: 'ONCE A CINEMA', weight: 600 });
  // Drum roaster with a viewing window, flue and jute sacks of green beans.
  { const r = new Frame(...f.at(-5.3, -6.6), f.rot + Math.PI / 2, f.y);
    B.lbox(r, MAT.metal, 0, .35, 0, .7, .7, .65, '#2b2d2c'); B.lbox(r, MAT.gloss, 0, 1.05, 0, .8, .7, .75, '#1c1d1d');
    const [x, z] = r.at(0, .39); B.place(PRIMS.cyl, MAT.gloss, x, r.y + 1.08, z, .2, .04, .2, r.rot, '#7c5a3a', true, Math.PI / 2);
    B.lbox(r, MAT.metal, .45, .95, .1, .3, .08, .5, '#8c8f90'); B.lbox(r, MAT.metal, 0, 1.55, -.1, .25, .3, .25, '#8c8f90');
    const [fx, fz] = r.at(0, -.1); B.place(PRIMS.cyl, MAT.metal, fx, r.y + 4.3, fz, .1, 5.2, .1, 0, '#9a9d9f');
    kit.lcollide(r, 0, .7, 0, .9, 1.4, .9);
    for (let i = 0; i < 3; i++) { const [sx, sz] = f.at(-5.8 + i * .65, -4.4); B.place(PRIMS.sphere, MAT.matte, sx, f.y + .32, sz, .3, .34, .26, i, '#b79f72'); } }
  // Communal table with laptops.
  B.lbox(f, MAT.wood, -1.3, .74, 3.5, 1, .06, 4.8, oak);
  for (const lz of [1.4, 5.6]) B.lbox(f, MAT.metal, -1.3, .37, lz, .9, .72, .06, steel);
  kit.lcollide(f, -1.3, .4, 3.5, 1, .8, 4.8);
  for (const sx of [-1, 1]) { B.lbox(f, MAT.wood, -1.3 + sx * .85, .44, 3.5, .38, .06, 4.6, oak); kit.lcollide(f, -1.3 + sx * .85, .25, 3.5, .38, .5, 4.6); }
  for (let i = 0; i < 4; i++) { const [x, z] = f.at(-1.3 + (i % 2 ? .25 : -.25), 1.8 + i * 1.1); kit.cup(x, f.y + .77, z, '#efe7d6', i % 2 ? AMALI_PURPLE : '#2f4a6b'); }
  kit.table(f, -1.3, 2.2, { y: -.01, r: .01, cups: 0, laptop: true }); kit.table(f, -1.3, 4.6, { y: -.01, r: .01, cups: 0, laptop: true });
  kit.person(f, -2.15, 2.2, { shirt: '#3d4f6b', pants: '#2f3b4f', seed: 21, seated: true, angle: Math.PI / 2 });
  kit.person(f, -.45, 3.4, { shirt: '#c4b59a', pants: '#3b3d3a', seed: 33, seated: true, angle: -Math.PI / 2, gray: true });
  kit.person(f, -2.15, 4.6, { shirt: '#9c6b8a', pants: '#25303d', seed: 47, seated: true, angle: Math.PI / 2, dress: true });
  // Window bar with stools, small tables along the right wall, cushioned bench on the left.
  for (const [a, b] of [[-6.1, -1.6], [1.6, 6.1]]) { B.lbox(f, MAT.wood, (a + b) / 2, 1.05, F - .55, b - a, .05, .4, oak); for (let s = a + .4; s < b; s += .9) kit.stool(f, s, F - 1.1); }
  kit.person(f, 3.2, F - 1.1, { shirt: '#e0dccf', pants: '#3b3d3a', seed: 64, seated: true, y: .3, angle: 0 });
  for (const lz of [-.4, 2.4, 5.2]) { kit.table(f, 4.7, lz, { r: .4, top: '#d9c4a2', cups: 2, plate: lz > 0 }); kit.chair(f, 4.0, lz, Math.PI / 2, '#2a2b2a'); kit.chair(f, 5.5, lz, -Math.PI / 2, '#2a2b2a'); }
  kit.person(f, 5.55, 2.4, { shirt: '#7b3f3a', pants: '#2f3a33', seed: 75, seated: true, angle: -Math.PI / 2 });
  kit.person(f, 4.0, -.4, { shirt: '#6e8a82', pants: '#4a4038', seed: 88, seated: true, angle: Math.PI / 2 });
  B.lbox(f, MAT.wood, -6.0, .45, 3.5, .6, .45, 5, '#7d5c3e'); B.lbox(f, MAT.matte, -6.0, .72, 3.5, .55, .1, 4.9, '#8d9f8a');
  for (const lz of [1.9, 5.1]) kit.table(f, -5.0, lz, { r: .35, top: '#d9c4a2', cups: 1 });
  B.lbox(f, MAT.matte, -6.0, .72, 3.5, .55, .1, 4.9, AMALI_LAVENDER);
  kit.person(f, 1.2, -1.3, { shirt: '#425b50', pants: '#3b3d3a', seed: 91, angle: Math.PI });
  for (const [lx, lz] of [[-6, 8], [6, -5.6], [-5.9, -.6], [2.8, 7.6]]) { const [x, z] = f.at(lx, lz); kit.plant(x, f.y + .08, z, 1.9, '#e9e3d8'); }
  for (let i = 0; i < 4; i++) { const [x, z] = f.at(-1.3, 1.6 + i * 1.3); kit.pendant(x, f.y + H, z, 3.6); }
  for (let i = 0; i < 4; i++) { const [x, z] = f.at(-4.5 + i * 2, -2.6); kit.pendant(x, f.y + H, z, 4.2, AMALI_PURPLE); }
  { const [x, z] = f.at(0, 0); kit.light(x, f.y + 4.8, z, '#ffd9a8', 22, 16); const [bx, bz] = f.at(-1, -5.5); kit.light(bx, f.y + 3.5, bz, '#ffd9a8', 12, 10); }
  const barista = kit.person(f, -1.2, -3.7, { shirt: '#ece7db', pants: '#2f2f2c', seed: 4, apron: AMALI_PURPLE });
  kit.register('barista', barista.focus, { he: 'שיחה עם הבריסטה', en: 'Talk to the barista' }, 4.4);
  reserve(kit, f, W, D, 1, 2);
  return f;
}

let logoMaterial: THREE.MeshStandardMaterial | null = null;
/** Square sign using public/textures/amali-logo.png (supplied by the user for this game). */
function logoSign(kit: Kit, f: Frame, lx: number, y: number, lz: number, size: number) {
  if (!logoMaterial) {
    logoMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .6, emissive: '#ffffff', emissiveIntensity: .12 });
    if (typeof Image !== 'undefined') new THREE.TextureLoader().load(import.meta.env.BASE_URL + 'textures/amali-logo.png', t => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; logoMaterial!.map = t; logoMaterial!.emissiveMap = t; logoMaterial!.needsUpdate = true; });
    else logoMaterial.color.set('#005186');
  }
  const [x, z] = f.at(lx, lz); const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), logoMaterial);
  m.position.set(x, f.y + y, z); m.rotation.y = f.rot; kit.root.add(m);
}

function foundersMemorial(kit: Kit) {
  const l = landmark('founders_garden'); const f = new Frame(l.x, l.z, .3), B = kit.B;
  B.lbox(f, MAT.paving, 0, .06, 0, 3, .12, 40, '#d6cdb9', false); B.lbox(f, MAT.paving, 0, .06, 0, 34, .12, 3, '#d6cdb9', false);
  // Memorial to the fallen of 1948: stone wall with a plaque and a flame bowl.
  B.lbox(f, MAT.stone, 0, 1.4, -6, 7, 2.8, .9, '#e2d3b1'); kit.lcollide(f, 0, 1.4, -6, 7, 2.8, .9);
  B.lbox(f, MAT.stone, 0, .2, -4.8, 8.5, .4, 2, '#d7c7a3');
  kit.sign(f, 0, 1.7, -5.53, 3.6, 1, 'יזכור', { bg: '#cbbd9c', fg: '#3b3225', sub: 'לזכר הנופלים במלחמת העצמאות', weight: 700 });
  { const [x, z] = f.at(0, -4.4); B.place(PRIMS.cyl, MAT.metal, x, f.y + .65, z, .35, .2, .35, 0, '#3a3a36'); }
  kit.anchor(f, 'landmark_founders_garden', 0, 1.5, -5, landmark('founders_garden').name, 4);
  // Playground and benches.
  B.lbox(f, MAT.soil, 9, .04, 8, 9, .08, 8, '#cdb48a', false);
  for (const sx of [-1.4, 1.4]) { const [x, z] = f.at(9 + sx, 8); B.place(PRIMS.box, MAT.metal, x, f.y + 1.2, z, .08, 2.4, .08, f.rot, '#c0392b', true, 0, sx > 0 ? -.2 : .2); }
  B.lbox(f, MAT.metal, 9, 2.35, 8, 3, .08, .08, '#c0392b');
  for (const sx of [-.6, .6]) { B.lbox(f, MAT.metal, 9 + sx, 1.3, 8, .02, 1.9, .02, '#555'); B.lbox(f, MAT.gloss, 9 + sx, .45, 8, .4, .05, .2, '#1f6fb0'); }
  { const [x, z] = f.at(11.5, 5.5); B.place(PRIMS.box, MAT.gloss, x, f.y + .9, z, .7, .06, 3, f.rot, '#e7b416', true, .55); }
  for (const [lx, lz] of [[-5, 4], [5, -12], [-6, -14]]) { B.lbox(f, MAT.wood, lx, .45, lz, 1.8, .06, .45, '#8a6a48'); B.lbox(f, MAT.wood, lx, .75, lz - .22, 1.8, .4, .05, '#8a6a48'); }
  kit.person(f, 8, 6, { shirt: '#e88a3a', pants: '#2f3b4f', seed: 140 });
  kit.person(f, -5, 4, { shirt: '#b69c8a', pants: '#5a5446', seed: 141, seated: true, angle: 0 });
  reserve(kit, f, 8, 8, -5, .5); reserve(kit, f, 10, 10, 8, .2);
  kit.occ.mark(f.x - 2, f.x + 2, f.z - 20, f.z + 20);
}

