/** Every parked car is an individual mesh that the player can enter and drive. */
import * as THREE from 'three';
import { surfaceHeight } from './terrain';
import { Kit, Frame, PRIMS } from './kit';
import type { Collider, LocalText } from './types';
import { footprintDistance2 } from './collide';

export interface DriveableCar {
  id: string;
  group: THREE.Group;
  yaw: number;
  speed: number;
  color: string;
  occupied: boolean;
  collider: Collider;
}

const bodyMat = (color: string) => new THREE.MeshStandardMaterial({ color, roughness: .32, metalness: .12 });

function buildMesh(color: string): THREE.Group {
  const g = new THREE.Group();
  g.name = 'driveable_car';
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
  return { ...r, minY: y, maxY: y + 1.5, obb: aligned ? undefined : { cx, cz, hx: .925, hz: 2.15, c: f.cos, s: f.sin }, vehicle: true };
}

export function syncCarCollider(car: DriveableCar) {
  const c = makeCollider(car.group.position.x, car.group.position.z, car.yaw, car.group.position.y);
  Object.assign(car.collider, c);
}

const MAX_CARS = 140;

/** True if the player capsule fits beside the car (left or right door). */
function hasEnterSpot(colliders: Collider[], x: number, z: number, yaw: number, self?: Collider): boolean {
  for (const side of [1, -1]) {
    for (const dist of [2.4, 3.1, 3.8]) {
      const ang = yaw + side * Math.PI / 2;
      const sx = x + Math.sin(ang) * dist, sz = z + Math.cos(ang) * dist;
      const y = surfaceHeight(sx, sz);
      let clear = true;
      for (const c of colliders) {
        if (c === self || c.gate) continue;
        if (y + .2 >= c.maxY || y + 1.65 <= c.minY) continue;
        if (footprintDistance2(c, sx, sz) < .35 ** 2) { clear = false; break; }
      }
      if (clear) return true;
    }
  }
  return false;
}

/** Drop cars sealed by later walls/hedges so every remaining car is enterable.
 *  `blocked` should match PlayerController.blocked (flags, radius, skipCollider). */
export function pruneUnreachableCars(
  ctx: { vehicles: DriveableCar[]; colliders: Collider[]; interactables: { id: string }[]; grounds: { y: number }[] },
  blocked: (x: number, z: number, skip: Collider) => boolean,
  groundAt: (x: number, z: number) => number,
) {
  const keep: DriveableCar[] = [];
  for (const car of ctx.vehicles) {
    const p = car.group.position; let ok = false;
    for (const side of [1, -1]) for (const dist of [2.4, 3.1, 3.8]) {
      const ang = car.yaw + side * Math.PI / 2, x = p.x + Math.sin(ang) * dist, z = p.z + Math.cos(ang) * dist;
      // Probe at standing height so floor pads match the live player capsule.
      void groundAt(x, z);
      if (!blocked(x, z, car.collider)) { ok = true; break; }
    }
    if (ok) { keep.push(car); continue; }
    car.group.removeFromParent();
    const ci = ctx.colliders.indexOf(car.collider); if (ci >= 0) ctx.colliders.splice(ci, 1);
    const ii = ctx.interactables.findIndex(i => i.id === car.id); if (ii >= 0) ctx.interactables.splice(ii, 1);
  }
  ctx.vehicles.length = 0;
  ctx.vehicles.push(...keep);
}

/** Spawn one enterable car. Used by street parking, car parks and garden driveways. Skips spots the player can't reach. */
export function spawnDriveableCar(kit: Kit, x: number, z: number, yaw: number, color: string, force = false): DriveableCar | null {
  if (!kit.ctx.vehicles) kit.ctx.vehicles = [];
  if (!force && kit.ctx.vehicles.length >= MAX_CARS) return null;
  if (!force && !hasEnterSpot(kit.ctx.colliders, x, z, yaw)) return null;
  const y = surfaceHeight(x, z);
  const group = buildMesh(color);
  group.position.set(x, y, z); group.rotation.y = yaw;
  group.updateMatrixWorld(true);
  kit.root.add(group);
  const id = `car_${kit.ctx.vehicles.length}`;
  const collider = makeCollider(x, z, yaw, y);
  kit.ctx.colliders.push(collider);
  const label: LocalText = { he: 'לנהוג ברכב', en: 'Drive vehicle' };
  kit.register(id, group, label, 7);
  // Floating enter marker — always visible above the roof so the prompt is obvious.
  const tip = document.createElement('canvas'); tip.width = 160; tip.height = 80;
  const c = tip.getContext('2d')!; c.fillStyle = '#000000ee'; c.fillRect(8, 8, 144, 64); c.strokeStyle = '#f0c400'; c.lineWidth = 5; c.strokeRect(8, 8, 144, 64);
  c.fillStyle = '#f0c400'; c.font = 'bold 48px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('E', 80, 42);
  const marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(tip), transparent: true, depthTest: false, depthWrite: false }));
  marker.scale.set(2.2, 1.1, 1); marker.position.set(0, 2.6, 0); marker.renderOrder = 10; marker.name = 'enter_marker'; group.add(marker);
  const car: DriveableCar = { id, group, yaw, speed: 0, color, occupied: false, collider };
  kit.ctx.vehicles.push(car);
  return car;
}
