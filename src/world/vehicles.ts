/** Every parked car is an individual mesh that the player can enter and drive. */
import * as THREE from 'three';
import { surfaceHeight } from './terrain';
import { Kit, Frame, PRIMS } from './kit';
import type { Collider, LocalText } from './types';

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

/** Spawn one enterable car. Used by street parking, car parks and garden driveways. */
export function spawnDriveableCar(kit: Kit, x: number, z: number, yaw: number, color: string): DriveableCar {
  if (!kit.ctx.vehicles) kit.ctx.vehicles = [];
  const y = surfaceHeight(x, z);
  const group = buildMesh(color);
  group.position.set(x, y, z); group.rotation.y = yaw;
  group.updateMatrixWorld(true);
  kit.root.add(group);
  const id = `car_${kit.ctx.vehicles.length}`;
  const collider = makeCollider(x, z, yaw, y);
  kit.ctx.colliders.push(collider);
  const label: LocalText = { he: 'E · לנהוג ברכב', en: 'E · Drive vehicle' };
  kit.register(id, group, label, 6);
  // Floating enter marker — always visible above the roof so the prompt is obvious.
  const tip = document.createElement('canvas'); tip.width = 128; tip.height = 64;
  const c = tip.getContext('2d')!; c.fillStyle = '#000000cc'; c.fillRect(8, 8, 112, 48); c.strokeStyle = '#f0c400'; c.lineWidth = 4; c.strokeRect(8, 8, 112, 48);
  c.fillStyle = '#f0c400'; c.font = 'bold 36px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('E', 64, 34);
  const marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(tip), transparent: true, depthTest: false }));
  marker.scale.set(1.6, .8, 1); marker.position.set(0, 2.4, 0); marker.name = 'enter_marker'; group.add(marker);
  const car: DriveableCar = { id, group, yaw, speed: 0, color, occupied: false, collider };
  kit.ctx.vehicles.push(car);
  return car;
}
