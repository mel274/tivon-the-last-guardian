import * as THREE from 'three';
import { landmark, footprintAt, orientedBox, nearestRoad, ROADS, BUILDINGS, POIS } from './geo';
import { surfaceHeight } from './terrain';
import { Kit, MAT, NIGHT, Frame, PRIMS } from './kit';
import { extrude, groundRange } from './scenery';
import { streetLamp } from './streets';
import { horseAndRider } from './horse';

/** Landmarks recreated from photos and OSM footprints: the water tower lookout, the Library &
 *  Memorial Center with its rail monument, Yad LaBanim, the Alexander Zaid statue, the park
 *  entrance, and examinable plaques for the other places in src/game/landmarks.ts. */
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
      const f = new Frame(box.cx, box.cz, box.rot, g.lo); const face = nearestRoad(box.cx, box.cz, ROADS.filter(r => r.name === 'המגדל'));
      const rot = Math.atan2(face.px - box.cx, face.pz - box.cz), ef = new Frame(box.cx + Math.sin(rot) * (Math.min(box.w, box.d) / 2 + .3), box.cz + Math.cos(rot) * (Math.min(box.w, box.d) / 2 + .3), rot, g.lo);
      kit.sign(ef, 0, 4.2, .15, 7, .8, 'ספרייה ומרכז ההנצחה', { bg: '#e8e2d4', fg: '#2d3c4a', sub: 'קריית טבעון · LIBRARY & MEMORIAL CENTER', weight: 700 });
      B.lbox(ef, MAT.metal, 0, 1.4, .1, 3.6, 2.8, .12, '#2b3235');
      kit.anchor(ef, 'landmark_library', 2.5, 2, 1.5, landmark('library').name, 4.5);
      void f;
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

  // ——— Plaques for the remaining landmarks ———
  for (const id of ['gali_pool', 'momos', 'rimonim', 'great_oak', 'mitzpe_sharon', 'mitzpe_roni', 'burger_saloon', 'adawi', 'paz', 'szenes_pool', 'post_zevulun', 'mda', 'founders_garden', 'synagogue', 'bank', 'shalva', 'bg_hair', 'bg_bakery', 'bg_falafel', 'pharmacy', 'zol_stock', 'rani_organic', 'braaap', 'bg_post', 'bg_books', 'ka_shawarma', 'ka_hair', 'ka_market']) {
    const l = landmark(id); const fp = footprintAt(l.x, l.z, 15);
    let x = l.x, z = l.z;
    if (fp) { const b = orientedBox(fp.points), r = nearestRoad(b.cx, b.cz); const dx = r.px - b.cx, dz = r.pz - b.cz, d = Math.hypot(dx, dz) || 1, out = Math.min(b.w, b.d) / 2 + 1.2; x = b.cx + dx / d * out; z = b.cz + dz / d * out; }
    const y = surfaceHeight(x, z);
    B.cyl(MAT.metal, x, y + .9, z, .04, 1.8, '#555');
    kit.sign(null, x, y + 1.85, z, 1.4, .42, l.name.he, { bg: '#efe6cf', fg: '#2d4235', border: true, weight: 700 }, Math.atan2(x - (fp ? orientedBox(fp.points).cx : x), z - (fp ? orientedBox(fp.points).cz : z)));
    tag(id, x, z, y);
  }
}
