import * as THREE from 'three';
import { landmark, footprintAt, orientedBox, nearestRoad, pointInPolygon, ROADS, BUILDINGS, POIS } from './geo';
import { surfaceHeight } from './terrain';
import { Kit, MAT, NIGHT, Frame, PRIMS } from './kit';
import { extrude, groundRange } from './scenery';
import { streetLamp } from './streets';
import { horseAndRider } from './horse';

/** Landmarks recreated from photos and OSM footprints: the water tower lookout, the Library &
 *  Memorial Center with its rail monument, Yad LaBanim, the Alexander Zaid statue, the park
 *  entrance, the town pools, Heichal Shlomo, Rimonim school, the great oak and the lookouts.
 *  Places another builder owns, and a few shops, stay examinable plaques. */
export function buildLandmarks(kit: Kit, skip: Set<string>) {
  const B = kit.B;
  const tag = (id: string, x: number, z: number, _y?: number) => { const f = new Frame(x, z, 0); kit.anchor(f, `landmark_${id}`, 0, 1.8, 0, landmark(id).name, 4.2); };

  // ——— Water tower: weathered concrete shaft, outside ladder, glazed lookout room ———
  { const l = landmark('water_tower'), fp = footprintAt(l.x, l.z, 12); let x = l.x, z = l.z;
    if (fp) { skip.add(fp.id); const b = orientedBox(fp.points); x = b.cx; z = b.cz; }
    const y = surfaceHeight(x, z), conc = '#bdb5a5';
    B.place(new THREE.CylinderGeometry(2.45, 2.85, 1, 20), MAT.plasterRough, x, y + 6.5, z, 1, 13, 1, 0, conc);
    B.place(new THREE.CylinderGeometry(3.5, 3.1, 1, 24), MAT.plasterRough, x, y + 13.3, z, 1, .6, 1, 0, '#b3ab9b');
    const glassRing = new THREE.Mesh(new THREE.CylinderGeometry(3.35, 3.35, 2.3, 24, 1, true), NIGHT.window); glassRing.position.set(x, y + 14.8, z); kit.root.add(glassRing);
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; B.box(MAT.metal, x + Math.cos(a) * 3.38, y + 14.8, z + Math.sin(a) * 3.38, .09, 2.3, .09, -a, '#2f4a3e'); }
    B.place(PRIMS.cyl, MAT.metal, x, y + 13.85, z, 3.4, .12, 3.4, 0, '#2f4a3e'); B.place(PRIMS.cyl, MAT.metal, x, y + 15.75, z, 3.4, .1, 3.4, 0, '#2f4a3e');
    B.place(PRIMS.cyl, MAT.plain, x, y + 16.1, z, 3.95, .35, 3.95, 0, '#4a4f4c');
    B.cyl(MAT.metal, x + 1, y + 18.4, z, .05, 4.4, '#888');
    for (let i = 0; i < 6; i++) B.box(MAT.plain, x + Math.cos(.6) * 2.7, y + 2.4 + i * 1.8, z + Math.sin(.6) * 2.7, .12, .7, .3, -.6, '#3a3a36');
    const la = -2.2; for (const s of [-.25, .25]) B.box(MAT.metal, x + Math.cos(la) * 2.95 - Math.sin(la) * s, y + 7, z + Math.sin(la) * 2.95 + Math.cos(la) * s, .05, 14, .05, 0, '#5a5f5c');
    for (let i = 0; i < 40; i++) B.box(MAT.metal, x + Math.cos(la) * 2.95, y + .4 + i * .33, z + Math.sin(la) * 2.95, .04, .04, .5, -la, '#5a5f5c');
    const an = new Frame(x + 3.4, z + .4, Math.PI / 2, y); kit.solid(an, MAT.plaster, 0, 1.25, 0, 2.6, 2.5, 2.2, '#cfc8b8'); B.lbox(an, MAT.wood, 0, 1.05, 1.12, 1, 2.1, .06, '#3e5a4e');
    kit.collide(x - 2.9, x + 2.9, z - 2.9, z + 2.9, y, y + 13);
    kit.occ.markDisc(x, z, 7);
    kit.sign(new Frame(x - 3.4, z + 2.8, -.6, y), 0, 1.2, 0, 1.8, .55, 'מגדל המים', { bg: '#efe6cf', fg: '#2d4235', sub: 'תצפית היסטורית', border: true });
    tag('water_tower', x - 3.2, z + 3, y); }

  // ——— Library & Memorial Center and the rail monument ———
  { const lib = BUILDINGS.find(b => b.id === '782476466');
    if (lib) {
      skip.add(lib.id); const g = groundRange(lib.points), box = extrude(kit, lib.points, g.lo - .5, g.lo + 7.5, '#d8d2c4', true, { roofColor: '#a8a397' });
      B.place(new THREE.CylinderGeometry(4.2, 4.2, 1, 24), MAT.plain, box.cx, g.lo + 8.6, box.cz, 1, 2.2, 1, 0, '#cfc9bb');
      const sky = new THREE.Mesh(new THREE.ConeGeometry(4.4, 1.8, 24, 1, true), NIGHT.shopWindow); sky.position.set(box.cx, g.lo + 10.6, box.cz); kit.root.add(sky);
      const face = nearestRoad(box.cx, box.cz, ROADS.filter(r => r.name === 'המגדל'));
      const rot = Math.atan2(face.px - box.cx, face.pz - box.cz), sx = Math.sin(rot), sz = Math.cos(rot);
      let dist = .4; while (dist < 48 && pointInPolygon(box.cx + sx * dist, box.cz + sz * dist, lib.points)) dist += .4;
      const ef = new Frame(box.cx + sx * (dist + .2), box.cz + sz * (dist + .2), rot, g.lo);
      kit.sign(ef, 0, 4.2, .15, 7, .8, 'ספרייה ומרכז ההנצחה', { bg: '#e8e2d4', fg: '#2d3c4a', sub: 'קריית טבעון · LIBRARY & MEMORIAL CENTER', weight: 700 });
      B.lbox(ef, MAT.metal, 0, 1.4, .1, 3.6, 2.8, .12, '#2b3235');
      kit.anchor(ef, 'landmark_library', 0, 1.8, 2.4, landmark('library').name, 4.5);
    }
    // Three old railway rails leaning together into a pyramid, rusted, on a low base; a flag beside it.
    const l = landmark('rail_monument'), y = surfaceHeight(l.x, l.z), rust = new THREE.MeshStandardMaterial({ color: '#7a3f22', roughness: .85, metalness: .35 });
    B.place(new THREE.CylinderGeometry(3.8, 4.2, .5, 3), MAT.stone, l.x, y + .25, l.z, 1, 1, 1, 0, '#cfc6b2');
    const apex = new THREE.Vector3(l.x, y + 8.2, l.z), up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < 3; i++) {
      const a = i / 3 * Math.PI * 2 + .3, foot = new THREE.Vector3(l.x + Math.cos(a) * 3.3, y + .5, l.z + Math.sin(a) * 3.3);
      const dir = apex.clone().sub(foot), len = dir.length() + .9, mid = foot.clone().add(apex).multiplyScalar(.5).add(dir.clone().normalize().multiplyScalar(.45));
      const rail = new THREE.Group(); rail.position.copy(mid); rail.quaternion.setFromUnitVectors(up, dir.normalize());
      for (const [w, d, ox] of [[.15, .07, 0], [.06, .22, 0], [.11, .05, .12], [.11, .05, -.12]] as Array<[number, number, number]>) { const m = new THREE.Mesh(PRIMS.box, rust); m.scale.set(w, len, d); m.position.z = ox; m.castShadow = true; rail.add(m); }
      kit.root.add(rail);
      kit.collide(foot.x - .3, foot.x + .3, foot.z - .3, foot.z + .3, y, y + 3);
    }
    const fx = l.x + 5.5, fz = l.z + 2; B.cyl(MAT.metal, fx, y + 4.5, fz, .05, 9, '#d7d7d2');
    kit.sign(null, fx + .8, y + 8.3, fz, 1.5, 1, '✡', { bg: '#ffffff', fg: '#1d4fa0', weight: 400 }, 0);
    kit.sign(new Frame(l.x, l.z + 5, Math.PI, y), 0, .9, 0, 2.6, .6, 'אנדרטת המסילות', { bg: '#cbbd9c', fg: '#2e281d', sub: 'יום השואה · יום הזיכרון', weight: 700 });
    kit.occ.markDisc(l.x, l.z, 9);
    tag('rail_monument', l.x, l.z + 4.5, y); }

  // ——— Yad LaBanim memorial wall ———
  { const p = POIS.find(q => q.n === 'אתר הנצחה לחללי קרית טבעון'), l = landmark('yad_labanim'); const x = p?.x ?? l.x, z = p?.z ?? l.z, y = surfaceHeight(x, z), f = new Frame(x, z, 0, y);
    B.lbox(f, MAT.paving, 0, .06, 2, 16, .12, 10, '#d6cdb9', false);
    kit.solid(f, MAT.stone, 0, 1.8, -2, 11, 3.6, 1.1, '#ddcfae');
    kit.sign(f, 0, 2.1, -1.42, 5, 1.1, 'יד לבנים', { bg: '#c9bb98', fg: '#2e281d', sub: 'לזכר חללי קריית טבעון', weight: 800 });
    { const [bx, bz] = f.at(0, -.9); B.place(PRIMS.cyl, MAT.metal, bx, y + .5, bz, .35, .2, .35, 0, '#3a3a36'); }
    kit.occ.markRect(f, 0, 2, 18, 12);
    tag('yad_labanim', x + 3, z + 2, y); }

  // ——— Alexander Zaid statue: rough boulder pedestal, bronze reliefs, round iron fence ———
  { const l = landmark('zeid_statue'), y = surfaceHeight(l.x, l.z);
    const m = new THREE.Group(); m.position.set(l.x, y, l.z); kit.root.add(m); kit.ctx.groups.statue = m;
    const rock = MAT.stone, rocks: Array<[number, number, number, number, number, number]> = [[0, 1.2, 0, 2.3, 1.4, 2], [.4, 2.3, .3, 1.9, 1.1, 1.6], [-.5, 2.1, -.4, 1.6, 1.2, 1.5], [.1, 3.05, 0, 1.6, .6, 1.4], [-.8, .7, .6, 1.4, 1, 1.2]];
    for (const [rx, ry, rz, sx, sy, sz] of rocks) { const r = new THREE.Mesh(PRIMS.ico, rock); r.position.set(rx, ry, rz); r.scale.set(sx, sy, sz); r.rotation.set(rx, rz, ry); r.castShadow = r.receiveShadow = true; m.add(r); }
    const bronze = new THREE.MeshStandardMaterial({ color: '#4c5a46', roughness: .45, metalness: .6 });
    const statue = horseAndRider(bronze); statue.position.y = 3.3; statue.rotation.y = Math.PI / 2; statue.scale.setScalar(1.15); m.add(statue);
    const mf = new Frame(l.x, l.z, Math.PI / 2, y);
    kit.sign(mf, 0, 1.7, 2.2, 1.6, .7, 'אלכסנדר זייד\nשומר בישראל', { bg: '#5d5a44', fg: '#e8dcb8', weight: 800 }, -.15);
    kit.sign(mf, -1.2, 1.4, 1.9, 1, .6, 'חרישה · מרעה', { bg: '#55604a', fg: '#d9cfa8', weight: 400 }, .5);
    kit.collide(l.x - 2.4, l.x + 2.4, l.z - 2.4, l.z + 2.4, y, y + 3.4);
    B.place(PRIMS.cyl, MAT.soil, l.x, y + .02, l.z, 7.5, .06, 7.5, 0, '#c9b896', false);
    for (let i = 0; i < 40; i++) { const a = i / 40 * Math.PI * 2; if (Math.abs(a - Math.PI / 2) < .25) continue; B.cyl(MAT.metal, l.x + Math.cos(a) * 6.5, y + .55, l.z + Math.sin(a) * 6.5, .03, 1.1, '#1d1d1b'); }
    for (const h of [.25, 1.05]) for (let i = 0; i < 40; i++) { const a0 = i / 40 * Math.PI * 2, a1 = (i + 1) / 40 * Math.PI * 2; if (Math.abs(a0 - Math.PI / 2) < .3) continue; const am = (a0 + a1) / 2; B.box(MAT.metal, l.x + Math.cos(am) * 6.5, y + h, l.z + Math.sin(am) * 6.5, .04, .04, 1.03, -am, '#1d1d1b'); }
    for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; if (Math.abs(a - Math.PI / 2) < .3) continue; const r = new Frame(l.x + Math.cos(a) * 6.5, l.z + Math.sin(a) * 6.5, -a, y); kit.lcollide(r, 0, .55, 0, .2, 1.1, 1.8); }
    const t = new THREE.Object3D(); const [tx, tz] = mf.at(0, 4); t.position.set(tx, y + 1.4, tz); kit.root.add(t);
    kit.register('statue', t, { he: 'האנדרטה על הגבעה', en: 'The hilltop memorial' }, 4.6);
    kit.occ.markDisc(l.x, l.z, 9); }

  // ——— Beit She'arim National Park entrance ———
  { const l = landmark('park_gate'), y = surfaceHeight(l.x, l.z), pav = new Frame(l.x, l.z, Math.PI, y);
    kit.solid(pav, MAT.stone, -5.5, 1.4, 0, 4, 2.8, 4, '#e0cfa8'); B.lbox(pav, MAT.wood, -5.5, 3, 0, 5, .3, 5, '#6b4a33');
    for (const s of [-3.4, 3.4]) B.lbox(pav, MAT.metal, s, 1.1, 0, .1, 2.2, .1, '#5c4a33');
    B.lbox(pav, MAT.metal, 0, 2.25, 0, 6.9, .14, .14, '#5c4a33');
    kit.sign(pav, 0, 2.75, -.12, 5.5, .8, 'גן לאומי בית שערים', { bg: '#6b4a2b', fg: '#f6ecd2', sub: 'BEIT SHE’ARIM NATIONAL PARK', weight: 700 }, Math.PI);
    kit.anchor(pav, 'landmark_park_gate', 0, 2, -1.5, l.name, 4.5);
    streetLamp(kit, l.x + 8, l.z, 0, true);
    kit.sign(null, 131, surfaceHeight(131, 70) + 1.4, 70, 2.2, 1, 'מערת הארונות ←\nמערות המשחק →', { bg: '#6b4a2b', fg: '#f6ecd2', weight: 700 }, Math.PI);
    B.cyl(MAT.wood, 131, surfaceHeight(131, 70) + .7, 70.05, .06, 1.4, '#5c4a33');
    kit.occ.markDisc(l.x, l.z, 8); kit.occ.mark(106, 146, 62, 92); }

  // ——— Route 75 junction gantry ———
  { const j = nearestRoad(-185, -858, ROADS.filter(r => r.kind === 'trunk')), rot = Math.atan2(j.dx, j.dz), f = new Frame(j.px, j.pz, rot);
    for (const s of [-1, 1]) kit.solid(f, MAT.metal, s * 8.5, 3.2, 0, .3, 6.4, .3, '#7a7f7c');
    B.lbox(f, MAT.metal, 0, 6.3, 0, 17.4, .25, .25, '#7a7f7c');
    kit.sign(f, 0, 5.5, .15, 7, 1.4, 'חיפה · קריית טבעון · נצרת', { bg: '#1f6b3a', fg: '#ffffff', sub: 'ROUTE 75 · HAIFA · NAZARETH', weight: 700, border: true }); }

  // Deck ring around a basin. Water is a thin sheet at deck-y + 0.05 with no collider; the coping walls collide.
  const basin = (f: Frame, w: number, d: number, pw: number, pd: number, deck: string, floor: string, wall: string, wallH: number) => {
    const mx = (w - pw) / 2, mz = (d - pd) / 2, yc = .05;
    B.lbox(f, MAT.paving, 0, yc, -(pd + mz) / 2, w, .1, mz, deck, false);
    B.lbox(f, MAT.paving, 0, yc, (pd + mz) / 2, w, .1, mz, deck, false);
    B.lbox(f, MAT.paving, -(pw + mx) / 2, yc, 0, mx, .1, pd, deck, false);
    B.lbox(f, MAT.paving, (pw + mx) / 2, yc, 0, mx, .1, pd, deck, false);
    B.lbox(f, MAT.paving, 0, .01, 0, pw - .15, .04, pd - .15, floor, false);
    const wt = .3, wy = yc + wallH / 2;
    kit.solid(f, MAT.plaster, 0, wy, pd / 2, pw + wt, wallH, wt, wall);
    kit.solid(f, MAT.plaster, 0, wy, -pd / 2, pw + wt, wallH, wt, wall);
    kit.solid(f, MAT.plaster, pw / 2, wy, 0, wt, wallH, pd, wall);
    kit.solid(f, MAT.plaster, -pw / 2, wy, 0, wt, wallH, pd, wall);
  };
  const waterSheet = (f: Frame, pw: number, pd: number, color: string) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(pw - .55, .03, pd - .55), new THREE.MeshStandardMaterial({ color, roughness: .06, metalness: .12, transparent: true, opacity: .88, depthWrite: false }));
    mesh.position.set(f.x, f.y + .035, f.z); mesh.rotation.y = f.rot; kit.root.add(mesh);
  };
  const faceRoad = (x: number, z: number, rot: number) => { const road = nearestRoad(x, z); return Math.sin(rot) * (road.px - x) + Math.cos(rot) * (road.pz - z) < 0 ? rot + Math.PI : rot; };

  // ——— Gali Tivon: sports pool on Alonim. The basin stays inside the OSM footprint when one is within 15 m. ———
  { const l = landmark('gali_pool'), fp = footprintAt(l.x, l.z, 15);
    let x = l.x, z = l.z, rot: number, w = 25, d = 16;
    if (fp) {
      skip.add(fp.id); const b = orientedBox(fp.points); x = b.cx; z = b.cz; rot = b.rot; w = b.w; d = b.d;
      if (d > w) { rot += Math.PI / 2; const t = w; w = d; d = t; }
    } else { const road = nearestRoad(x, z); rot = Math.atan2(road.px - x, road.pz - z); }
    rot = faceRoad(x, z, rot);
    const y = surfaceHeight(x, z), f = new Frame(x, z, rot, y);
    const pw = Math.min(20, w - 8), pd = Math.min(9, d - 4.4), mx = (w - pw) / 2;
    basin(f, w, d, pw, pd, '#d5d0c4', '#8f9c9a', '#cfc8ba', .48);
    waterSheet(f, pw, pd, '#1a6aaf');
    B.lbox(f, MAT.plain, 0, .07, 0, .08, .012, pd - 1.4, '#e7eef3', false);
    const rw = Math.min(5.2, mx - .8), rx = -w / 2 + rw / 2 + .4, rd = Math.min(5.2, d - .8);
    kit.solid(f, MAT.plaster, rx, 1.3, 0, rw, 2.6, rd, '#e4ded0');
    B.lbox(f, MAT.plain, rx, 1.15, rd / 2 + .04, 1.05, 2.15, .06, '#3d4a52');
    for (let i = 0; i < 3; i++) B.lbox(f, MAT.stone, w * .1, .16 + i * .2, d / 2 - .45 - i * .48, Math.min(8, pw * .4), .18, .62, '#c4beb2');
    kit.lcollide(f, w * .1, .45, d / 2 - .9, Math.min(8, pw * .4), .9, 1.6);
    kit.sign(f, rx, 2.2, rd / 2 + .1, 2.8, .6, 'גלי טבעון', { bg: '#0e4d8a', fg: '#f3f8ff', sub: 'GALI TIVON', weight: 800 });
    kit.occ.markRect(f, 0, 0, w + 1, d + 1);
    const [ax, az] = f.at(rx, rd / 2 + 1.4); tag('gali_pool', ax, az, y); }

  // ——— Hannah Szenes pool: smaller, older, greener — not a second Gali. ———
  { const l = landmark('szenes_pool'), fp = footprintAt(l.x, l.z, 15);
    let rot: number;
    if (fp) { skip.add(fp.id); const b = orientedBox(fp.points); rot = faceRoad(l.x, l.z, b.rot); kit.occ.markRect(new Frame(b.cx, b.cz, b.rot), 0, 0, b.w + 1, b.d + 1); }
    else { const road = nearestRoad(l.x, l.z); rot = Math.atan2(road.px - l.x, road.pz - l.z); }
    const y = surfaceHeight(l.x, l.z), f = new Frame(l.x, l.z, rot, y), w = 16, d = 8, pw = 9.2, pd = 4.4;
    basin(f, w, d, pw, pd, '#b7b1a4', '#7d8a78', '#b3ab9c', .3);
    waterSheet(f, pw, pd, '#2c6b56');
    const hx = -w / 2 + 1.55;
    kit.solid(f, MAT.plasterRough, hx, 1.15, 0, 3, 2.3, 3.2, '#cbbfa6');
    B.lbox(f, MAT.wood, hx, 2.38, 0, 3.2, .12, 3.5, '#6b5340');
    B.lbox(f, MAT.plain, hx, 1.15, 1.64, .7, .85, .06, '#243038');
    for (const s of [-.16, .16]) B.lbox(f, MAT.metal, pw / 2 - .36, .32, s, .04, .7, .04, '#8a8f92');
    for (let i = 0; i < 4; i++) B.lbox(f, MAT.metal, pw / 2 - .36, .08 + i * .16, 0, .04, .03, .38, '#8a8f92');
    kit.sign(f, hx, 1.7, 1.75, 2.9, .48, 'בריכת חנה סנש', { bg: '#3d5c48', fg: '#f3f6ef', weight: 700 });
    kit.occ.markRect(f, 0, 0, w + 1, d + 1);
    const [ax, az] = f.at(hx, 2.6); tag('szenes_pool', ax, az, y); }

  // ——— Heichal Shlomo: stone hall, three arched openings, a shallow dome, steps. ———
  { const l = landmark('synagogue'), fp = footprintAt(l.x, l.z, 15);
    let x = l.x, z = l.z, rot: number;
    if (fp) { skip.add(fp.id); const b = orientedBox(fp.points); x = b.cx; z = b.cz; rot = faceRoad(x, z, b.rot); }
    else { const road = nearestRoad(x, z); rot = Math.atan2(road.px - x, road.pz - z); }
    const y = surfaceHeight(x, z), f = new Frame(x, z, rot, y), W = 14, D = 10, H = 5.5;
    kit.solid(f, MAT.stone, 0, H / 2, -D / 2, W, H, .45, '#e4d7b8');
    kit.solid(f, MAT.stone, -W / 2, H / 2, 0, .45, H, D, '#e4d7b8');
    kit.solid(f, MAT.stone, W / 2, H / 2, 0, .45, H, D, '#e4d7b8');
    kit.solid(f, MAT.stone, 0, H / 2, D / 2, W, H, .42, '#e4d7b8');
    B.lbox(f, MAT.wood, -4.8, 1.2, D / 2 + .26, 1.25, 2.4, .08, '#5c4030');
    B.lbox(f, MAT.stone, 0, H + .16, 0, W + .7, .28, D + .7, '#ddd0b4');
    const [dx, dz] = f.at(0, -1.2);
    B.place(PRIMS.cyl, MAT.stone, dx, y + H + .7, dz, 2.15, .85, 2.15, 0, '#e7dcc0');
    B.place(PRIMS.sphere, MAT.stone, dx, y + H + 1.05, dz, 2.2, .95, 2.2, 0, '#f0e6cc');
    for (const wx of [-1.5, 1.7, 4.8]) {
      B.lbox(f, MAT.plain, wx, 2.85, D / 2 + .24, .78, 1.65, .08, '#1b2730');
      B.lbox(f, MAT.plain, wx, 3.78, D / 2 + .24, .62, .38, .08, '#1b2730');
      const [px, pz] = f.at(wx, D / 2 + .26);
      B.place(PRIMS.cyl, MAT.plain, px, y + 3.72, pz, .36, .08, .36, rot, '#1b2730', true, Math.PI / 2);
    }
    for (let i = 0; i < 3; i++) { B.lbox(f, MAT.stone, -4.8, .09 + i * .16, D / 2 + 1.55 - i * .42, 2.8, .18, .46, '#e8dcc4'); kit.lground(f, -4.8, D / 2 + 1.55 - i * .42, 2.8, .46, .18 + i * .16); }
    kit.sign(f, 1.6, 4.7, D / 2 + .28, 3.6, .55, 'היכל שלמה', { bg: '#e8dcc0', fg: '#3a3428', weight: 800 });
    kit.occ.markRect(f, 0, .4, W + 3, D + 5);
    const [ax, az] = f.at(-4.8, D / 2 + 2.2); tag('synagogue', ax, az, y); }

  // ——— Rimonim: two classroom storeys, a fenced yard, low trees. ———
  { const l = landmark('rimonim'), fp = footprintAt(l.x, l.z, 15);
    let x = l.x, z = l.z, rot: number;
    if (fp) { skip.add(fp.id); const b = orientedBox(fp.points); x = b.cx; z = b.cz; rot = faceRoad(x, z, b.rot); }
    else { const road = nearestRoad(x, z); rot = Math.atan2(road.px - x, road.pz - z); }
    const y = surfaceHeight(x, z), f = new Frame(x, z, rot, y), W = 22, D = 8;
    kit.solid(f, MAT.plaster, 0, 3.2, 0, W, 6.4, D, '#f4f0e6');
    B.lbox(f, MAT.plaster, 0, 3.2, D / 2 + .06, W + .2, .14, .1, '#e4ddd0');
    B.lbox(f, MAT.plaster, 0, 6.55, 0, W + .8, .22, D + .6, '#d5cfc2');
    for (let i = -3; i <= 3; i++) if (i !== 0) for (const wy of [1.55, 4.5]) {
      const [px, pz] = f.at(i * 2.7, D / 2 + .08);
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.12), NIGHT.window); pane.position.set(px, y + wy, pz); pane.rotation.y = rot; kit.root.add(pane);
    }
    B.lbox(f, MAT.wood, 0, 1.15, D / 2 + .06, 1.35, 2.3, .08, '#5c4632');
    kit.sign(f, 0, 5.55, D / 2 + .16, 3.4, .62, 'רימונים', { bg: '#1f6b3a', fg: '#f4fff6', weight: 800 });
    const z0 = D / 2 + .4, z1 = z0 + 11, x0 = -10, x1 = 10, fence = '#4d5852';
    B.lbox(f, MAT.paving, 0, .04, (z0 + z1) / 2, x1 - x0, .08, z1 - z0, '#d7d0be', false);
    for (const h of [.42, .92]) {
      B.lbox(f, MAT.metal, x0, h, (z0 + z1) / 2, .04, .04, z1 - z0, fence);
      B.lbox(f, MAT.metal, x1, h, (z0 + z1) / 2, .04, .04, z1 - z0, fence);
      B.lbox(f, MAT.metal, x0 + 4.5, h, z1, 9, .04, .04, fence);
      B.lbox(f, MAT.metal, x1 - 4.5, h, z1, 9, .04, .04, fence);
    }
    kit.lcollide(f, x0, .6, (z0 + z1) / 2, .14, 1.15, z1 - z0);
    kit.lcollide(f, x1, .6, (z0 + z1) / 2, .14, 1.15, z1 - z0);
    kit.lcollide(f, x0 + 4.5, .6, z1, 9, 1.15, .14);
    kit.lcollide(f, x1 - 4.5, .6, z1, 9, 1.15, .14);
    for (const lx of [x0, -5, -1, 1, 5, x1]) { const [px, pz] = f.at(lx, z1); B.cyl(MAT.metal, px, y + .55, pz, .04, 1.1, fence); }
    for (const lz of [z0, (z0 + z1) / 2]) for (const lx of [x0, x1]) { const [px, pz] = f.at(lx, lz); B.cyl(MAT.metal, px, y + .55, pz, .04, 1.1, fence); }
    for (const [lx, lz] of [[-6.5, z0 + 3.2], [6.2, z0 + 6.5], [-5.5, z0 + 8.5]] as Array<[number, number]>) {
      const [px, pz] = f.at(lx, lz);
      B.cyl(MAT.wood, px, y + .85, pz, .07, 1.7, '#6b5844');
      for (let j = 0; j < 4; j++) { const a = j * 1.5 + lx; B.place(PRIMS.ico, MAT.foliage, px + Math.cos(a) * .65, y + 1.7 + (j % 2) * .22, pz + Math.sin(a) * .65, .85, .58, .85, a, j % 2 ? '#4f7a43' : '#5c7f45'); }
      kit.collide(px - .12, px + .12, pz - .12, pz + .12, y, y + 1.5);
    }
    kit.occ.markRect(f, 0, 5.2, 26, 22);
    const [ax, az] = f.at(0, z1 + 1.2); tag('rimonim', ax, az, y); }

  // ——— The great Tabor oak at Gan Ilan. Collide the trunk only. ———
  { const l = landmark('great_oak'), y = surfaceHeight(l.x, l.z);
    B.place(new THREE.CylinderGeometry(.9, 1.45, 1, 8), MAT.wood, l.x, y + .4, l.z, 1, .8, 1, 0, '#4a3b2c');
    B.place(new THREE.CylinderGeometry(.5, .92, 1, 8), MAT.wood, l.x, y + 3.5, l.z, 1, 7, 1, 0, '#5a4632');
    kit.collide(l.x - .9, l.x + .9, l.z - .9, l.z + .9, y, y + 5.2);
    for (const [ox, oy, oz, s, c] of [[0, 8.1, 0, 3.3, '#4e6a38'], [2.8, 7.1, 1.1, 2.7, '#5c7844'], [-2.6, 7.3, .7, 2.8, '#466432'], [1.2, 6.7, -2.9, 2.6, '#56743c'], [-1.5, 7.5, -2.4, 2.5, '#3f5c30'], [3.3, 6.3, -1.5, 2.3, '#5a7640'], [-3.5, 6.5, -.9, 2.4, '#4a6836'], [.5, 9.2, .4, 2.1, '#62804a']] as Array<[number, number, number, number, string]>)
      B.place(PRIMS.ico, MAT.foliage, l.x + ox, y + oy, l.z + oz, s, s * .7, s, ox + oy, c);
    const mk = new Frame(l.x - 4.2, l.z + 1.6, .5, y);
    kit.solid(mk, MAT.stone, 0, .32, 0, 1.7, .64, .5, '#ddd0b2');
    kit.sign(mk, 0, .78, .28, 1.65, .4, 'האלון הגדול · גן אילן', { bg: '#cbbd9c', fg: '#2e281d', weight: 700 });
    kit.occ.markDisc(l.x, l.z, 8);
    const [ax, az] = mk.at(0, 1.3); tag('great_oak', ax, az, y); }

  // ——— Lookouts: a 4 m railing arc, one bench, a plaque. No towers. ———
  const lookout = (id: string, view: number, sub?: string) => {
    const l = landmark(id), road = nearestRoad(l.x, l.z), vx = Math.sin(view), vz = Math.cos(view);
    let nx = -road.dz, nz = road.dx; if (nx * vx + nz * vz < 0) { nx = -nx; nz = -nz; }
    const off = Math.max(0, road.road.width / 2 + 1.8 - road.dist);
    const x = l.x + nx * off, z = l.z + nz * off, y = surfaceHeight(x, z), f = new Frame(x, z, view, y);
    B.lbox(f, MAT.paving, 0, .04, .85, 5.2, .08, 3.4, '#d9d1bf', false);
    const R = 3.4, span = 4 / R, posts: Array<[number, number]> = [];
    for (let i = 0; i <= 4; i++) { const a = -span / 2 + span * i / 4; posts.push([Math.sin(a) * R, Math.cos(a) * 2.2 - .6]); }
    for (let i = 0; i < posts.length; i++) {
      const [px, pz] = f.at(posts[i][0], posts[i][1]); B.cyl(MAT.metal, px, y + .55, pz, .035, 1.1, '#3c4240');
      if (!posts[i + 1]) continue;
      const [x0, z0] = f.at(posts[i][0], posts[i][1]), [x1, z1] = f.at(posts[i + 1][0], posts[i + 1][1]);
      const len = Math.hypot(x1 - x0, z1 - z0), segRot = Math.atan2(-(z1 - z0), x1 - x0);
      for (const h of [.45, .95]) B.box(MAT.metal, (x0 + x1) / 2, y + h, (z0 + z1) / 2, len, .04, .04, segRot, '#3c4240');
      kit.lcollide(new Frame((x0 + x1) / 2, (z0 + z1) / 2, segRot, y), 0, .55, 0, len, 1.1, .12);
    }
    B.lbox(f, MAT.wood, 0, .45, .15, 1.6, .06, .42, '#8a6a48');
    B.lbox(f, MAT.wood, 0, .74, -.06, 1.6, .4, .05, '#8a6a48');
    kit.lcollide(f, 0, .42, .08, 1.6, .84, .5);
    B.lbox(f, MAT.metal, 2.15, .5, .15, .06, 1, .06, '#444');
    kit.sign(f, 2.15, 1.1, .15, 1.5, .46, l.name.he, { bg: '#efe6cf', fg: '#2d4235', border: true, weight: 700, sub }, Math.PI);
    kit.occ.markDisc(x, z, 4.5);
    const [ax, az] = f.at(0, -.7); tag(id, ax, az, y);
  };
  lookout('mitzpe_sharon', Math.PI / 2, 'עמק יזרעאל');
  lookout('mitzpe_roni', -Math.PI / 2);

  // ——— Plaques for the remaining landmarks ———
  for (const id of ['momos', 'burger_saloon', 'adawi', 'paz', 'post_zevulun', 'mda', 'ka_shawarma', 'ka_hair', 'ka_market']) {
    const l = landmark(id); const fp = footprintAt(l.x, l.z, 15);
    let x = l.x, z = l.z;
    if (fp) { const b = orientedBox(fp.points), r = nearestRoad(b.cx, b.cz); const dx = r.px - b.cx, dz = r.pz - b.cz, d = Math.hypot(dx, dz) || 1, out = Math.min(b.w, b.d) / 2 + 1.2; x = b.cx + dx / d * out; z = b.cz + dz / d * out; }
    const y = surfaceHeight(x, z);
    B.cyl(MAT.metal, x, y + .9, z, .04, 1.8, '#555');
    kit.sign(null, x, y + 1.85, z, 1.4, .42, l.name.he, { bg: '#efe6cf', fg: '#2d4235', border: true, weight: 700 }, Math.atan2(x - (fp ? orientedBox(fp.points).cx : x), z - (fp ? orientedBox(fp.points).cz : z)));
    tag(id, x, z, y);
  }
}
