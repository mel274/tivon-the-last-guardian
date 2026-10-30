/** Driveable cars: individual meshes (not batched) so they can move when the player takes the wheel. */
import * as THREE from 'three';
import { ROADS, AREAS, VEHICLE, nearestRoad, orientedBox, pointInPolygon, landmark } from './geo';
import { surfaceHeight } from './terrain';
import { Kit, Frame, PRIMS } from './kit';
import type { Collider, LocalText } from './types';

const bodyMat = (color: string) => new THREE.MeshStandardMaterial({ color, roughness: .32, metalness: .12 });

export interface DriveableCar {
  id: string;
  group: THREE.Group;
  yaw: number;
  speed: number;
  color: string;
  occupied: boolean;
  collider: Collider;
}

const COLORS = ['#c9ced3', '#2f3d4a', '#8b1e1e', '#d9d3c4', '#3f5a3a', '#1d1f22', '#b7a078', '#4a6a8a', '#e8e2d4', '#6b3a2a'];
let seed = 4242;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const pick = <T>(a: T[]) => a[Math.floor(rnd() * a.length)];

function buildMesh(color: string): THREE.Group {
  const g = new THREE.Group();
  const mat = bodyMat(color);
  const body = new THREE.Mesh(PRIMS.box, mat); body.scale.set(1.72, .62, 4.1); body.position.y = .55; body.castShadow = true; body.receiveShadow = true;
  const cabin = new THREE.Mesh(PRIMS.box, mat); cabin.scale.set(1.56, .5, 2.2); cabin.position.set(0, 1.08, -.25); cabin.castShadow = true;
  const glassMat = new THREE.MeshStandardMaterial({ color: '#2e3d42', roughness: .15, metalness: .2 });
  for (const [x, y, z, sx, sy, sz] of [[0, 1.1, .9, 1.4, .42, .05], [0, 1.1, -1.38, 1.4, .4, .05], [.79, 1.1, -.25, .03, .38, 1.9], [-.79, 1.1, -.25, .03, .38, 1.9]] as number[][]) {
    const w = new THREE.Mesh(PRIMS.box, glassMat); w.scale.set(sx, sy, sz); w.position.set(x, y, z); g.add(w);
  }
  const wheelMat = new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: .9 });
  for (const s of [-1, 1]) for (const zz of [-1.3, 1.3]) {
    const wh = new THREE.Mesh(PRIMS.cyl, wheelMat); wh.scale.set(.33, .2, .33); wh.rotation.z = Math.PI / 2; wh.position.set(s * .82, .33, zz); wh.castShadow = true; g.add(wh);
  }
  const lightMat = new THREE.MeshStandardMaterial({ color: '#f3f0e5', emissive: '#f3f0e5', emissiveIntensity: .15 });
  const tailMat = new THREE.MeshStandardMaterial({ color: '#a33a30', emissive: '#a33a30', emissiveIntensity: .1 });
  for (const s of [-1, 1]) {
    const fl = new THREE.Mesh(PRIMS.box, lightMat); fl.scale.set(.38, .14, .03); fl.position.set(s * .58, .62, 2.06); g.add(fl);
    const tl = new THREE.Mesh(PRIMS.box, tailMat); tl.scale.set(.34, .14, .03); tl.position.set(s * .6, .65, -2.06); g.add(tl);
  }
  g.add(body, cabin);
  return g;
}

function makeCollider(x: number, z: number, yaw: number, y: number): Collider {
  const f = new Frame(x, z, yaw, y), r = f.rect(0, 0, 1.85, 4.3), [cx, cz] = f.at(0, 0);
  const aligned = Math.abs(f.sin * f.cos) < .01;
  return { ...r, minY: y, maxY: y + 1.5, obb: aligned ? undefined : { cx, cz, hx: .925, hz: 2.15, c: f.cos, s: f.sin } };
}

export function syncCarCollider(car: DriveableCar) {
  const c = makeCollider(car.group.position.x, car.group.position.z, car.yaw, car.group.position.y);
  Object.assign(car.collider, c);
}

/** Place a limited set of enterable cars around town (kerbs + car parks). Static scenery cars stay batched. */
export function buildDriveableCars(kit: Kit): DriveableCar[] {
  seed = 4242;
  const cars: DriveableCar[] = [];
  const add = (x: number, z: number, yaw: number, color: string) => {
    if (cars.length >= 48) return;
    const y = surfaceHeight(x, z);
    const group = buildMesh(color);
    group.position.set(x, y, z); group.rotation.y = yaw;
    kit.root.add(group);
    const id = `car_${cars.length}`;
    const collider = makeCollider(x, z, yaw, y);
    kit.ctx.colliders.push(collider);
    const label: LocalText = { he: 'רכב · E לנהיגה', en: 'Car · E to drive' };
    kit.register(id, group, label, 4.5);
    cars.push({ id, group, yaw, speed: 0, color, occupied: false, collider });
  };

  for (const road of ROADS) {
    if (!VEHICLE.has(road.kind) || road.kind.startsWith('trunk') || road.kind === 'service') continue;
    for (let i = 5; i < road.points.length - 5; i += 7) {
      if (rnd() > .22) continue;
      const [ax, az] = road.points[i], [bx, bz] = road.points[i + 1] ?? road.points[i];
      const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1, side = rnd() < .5 ? 1 : -1;
      const x = ax + dz / l * side * (road.width / 2 - 1.15), z = az - dx / l * side * (road.width / 2 - 1.15);
      const near = nearestRoad(x, z); if (near.dist > road.width / 2 + .5) continue;
      add(x, z, Math.atan2(dx, dz), pick(COLORS));
    }
  }
  for (const a of AREAS) if (a.kind === 'parking') {
    const box = orientedBox(a.points), f = new Frame(box.cx, box.cz, box.rot);
    for (let u = -box.w / 2 + 2.5; u < box.w / 2 - 2; u += 3.2) for (const v of [-box.d / 2 + 3.2, box.d / 2 - 3.2]) {
      if (cars.length >= 48 || rnd() > .4) continue;
      const [x, z] = f.at(u, v); if (!pointInPolygon(x, z, a.points)) continue;
      add(x, z, box.rot + (v < 0 ? 0 : Math.PI), pick(COLORS));
    }
  }
  // Starter cars by Amali and the Zeid centre so the player always finds one nearby.
  try {
    const a = landmark('amali'); add(a.x + 8, a.z + 6, Math.PI * .15, '#c9ced3');
    const m = landmark('mandu'); add(m.x - 14, m.z + 10, -Math.PI * .4, '#2f3d4a');
  } catch { /* landmarks missing in tests */ }
  kit.ctx.vehicles = cars;
  return cars;
}
