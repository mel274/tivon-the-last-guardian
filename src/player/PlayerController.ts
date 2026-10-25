import * as THREE from 'three';
import type { WorldContext, Collider } from '../world/types';
import { surfaceHeight } from '../world/terrain';
import { WORLD } from '../world/geo';
import { footprintDistance2, toLocal } from '../world/collide';

type Ground = WorldContext['grounds'][number];
const inside = (g: Ground, x: number, z: number) => {
  if (x < g.minX || x > g.maxX || z < g.minZ || z > g.maxZ) return false;
  if (!g.obb) return true;
  const [lx, lz] = toLocal(g, x, z); return Math.abs(lx) <= g.obb.hx && Math.abs(lz) <= g.obb.hz;
};
/** Highest step the character climbs without jumping (stairs are 0.18 m). */
export const STEP = .5;

export class PlayerController {
  keys = new Set<string>();
  yaw = 0; pitch = 0; verticalVelocity = 0; grounded = true;
  sensitivity = 1; invertY = false; moving = false; sprinting = false;
  touchMove = new THREE.Vector2();
  private radius = .29;
  private grid = new Map<number, Collider[]>(); private indexed = 0;
  private groundGrid = new Map<number, WorldContext['grounds']>(); private groundsIndexed = 0;
  constructor(public camera: THREE.PerspectiveCamera, private world: WorldContext) {
    camera.rotation.order = 'YXZ';
    window.addEventListener('blur', () => this.clear());
  }
  clear() { this.keys.clear(); this.touchMove.set(0, 0); }
  look(dx: number, dy: number) {
    this.yaw -= dx * .002 * this.sensitivity;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * .002 * this.sensitivity * (this.invertY ? -1 : 1), -1.45, 1.45);
  }
  // 8 m spatial hashes; rebuilt lazily if the world adds colliders or floors later.
  private key(ix: number, iz: number) { return (ix + 512) * 1024 + (iz + 512); }
  private index() {
    if (this.indexed === this.world.colliders.length) return;
    this.grid.clear();
    for (const c of this.world.colliders) for (let x = Math.floor(c.minX / 8); x <= Math.floor(c.maxX / 8); x++) for (let z = Math.floor(c.minZ / 8); z <= Math.floor(c.maxZ / 8); z++) {
      const k = this.key(x, z); let a = this.grid.get(k); if (!a) { a = []; this.grid.set(k, a); } a.push(c);
    }
    this.indexed = this.world.colliders.length;
  }
  private indexGrounds() {
    if (this.groundsIndexed === this.world.grounds.length) return;
    this.groundGrid.clear();
    for (const g of this.world.grounds) for (let x = Math.floor(g.minX / 8); x <= Math.floor(g.maxX / 8); x++) for (let z = Math.floor(g.minZ / 8); z <= Math.floor(g.maxZ / 8); z++) {
      const k = this.key(x, z); let a = this.groundGrid.get(k); if (!a) { a = []; this.groundGrid.set(k, a); } a.push(g);
    }
    this.groundsIndexed = this.world.grounds.length;
  }
  /** Floor under (x,z). With `feet`, picks the highest floor the character can stand on from
   *  that height (multi-storey buildings, stairs, caves under the hill). Without it, an explicit
   *  floor wins over the terrain (legacy behaviour for teleports and fixtures). */
  groundAt(x: number, z: number, feet?: number) {
    this.indexGrounds();
    const list = this.groundGrid.get(this.key(Math.floor(x / 8), Math.floor(z / 8))) ?? [];
    const surface = surfaceHeight(x, z);
    if (feet === undefined) {
      let y = surface;
      for (const g of list) if (inside(g, x, z)) y = g.y;
      return y;
    }
    let best = -Infinity, lowest = surface <= feet + STEP ? surface : Infinity;
    if (surface <= feet + STEP) best = surface;
    for (const g of list) if (inside(g, x, z)) {
      if (g.y <= feet + STEP && g.y > best) best = g.y;
      if (g.y < lowest) lowest = g.y;
    }
    if (best === -Infinity) best = Math.min(lowest, surface);
    return best;
  }
  /** Colliders whose 8 m cells fall within `r` metres of (x, z). */
  collidersNear(x: number, z: number, r: number) {
    this.index(); const out = new Set<Collider>();
    for (let ix = Math.floor((x - r) / 8); ix <= Math.floor((x + r) / 8); ix++) for (let iz = Math.floor((z - r) / 8); iz <= Math.floor((z + r) / 8); iz++) for (const c of this.grid.get(this.key(ix, iz)) ?? []) out.add(c);
    return out;
  }
  blocked(x: number, z: number, flags: Record<string, boolean>) {
    if (x < WORLD.minX || x > WORLD.maxX || z < WORLD.minZ || z > WORLD.maxZ) return true;
    this.index();
    const feet = this.camera.position.y - 1.7;
    const list = this.grid.get(this.key(Math.floor(x / 8), Math.floor(z / 8)));
    if (!list) return false;
    return list.some(c => {
      if (c.gate && flags[c.gate]) return false;
      if (feet + .2 >= c.maxY || feet + 1.65 <= c.minY) return false;
      return footprintDistance2(c, x, z) < this.radius ** 2;
    });
  }
  tick(dt: number, flags: Record<string, boolean>, wake: number, intox: number, reducedMotion: boolean, time: number) {
    const forward = Number(this.keys.has('KeyW') || this.keys.has('ArrowUp')) - Number(this.keys.has('KeyS') || this.keys.has('ArrowDown')) - this.touchMove.y;
    const right = Number(this.keys.has('KeyD')) - Number(this.keys.has('KeyA')) + this.touchMove.x;
    if (this.keys.has('ArrowLeft')) this.yaw += dt * 1.5;
    if (this.keys.has('ArrowRight')) this.yaw -= dt * 1.5;
    this.moving = Math.abs(forward) + Math.abs(right) > .08;
    this.sprinting = this.keys.has('ShiftLeft') && this.moving && wake > 15;
    const velocity = new THREE.Vector2(right, -forward).normalize().multiplyScalar((this.sprinting ? 9 : 5.2) * (wake < 18 ? .65 : 1));
    const dx = (velocity.x * Math.cos(this.yaw) + velocity.y * Math.sin(this.yaw)) * dt;
    const dz = (-velocity.x * Math.sin(this.yaw) + velocity.y * Math.cos(this.yaw)) * dt;
    const pos = this.camera.position;
    if (!this.blocked(pos.x + dx, pos.z, flags)) pos.x += dx;
    if (!this.blocked(pos.x, pos.z + dz, flags)) pos.z += dz;
    if (this.grounded && this.keys.has('Space')) { this.verticalVelocity = 5.2; this.grounded = false; this.keys.delete('Space'); }
    this.verticalVelocity -= dt * 15;
    pos.y += this.verticalVelocity * dt;
    const floor = this.groundAt(pos.x, pos.z, pos.y - 1.7 + Math.max(0, this.verticalVelocity * dt)) + 1.7;
    if (pos.y <= floor) { pos.y = floor; this.verticalVelocity = 0; this.grounded = true; }
    else if (pos.y - floor > .35 && this.verticalVelocity <= 0) this.grounded = false;
    else if (this.verticalVelocity <= 0) { pos.y = floor; this.verticalVelocity = 0; this.grounded = true; }
    this.camera.rotation.set(this.pitch, this.yaw, reducedMotion ? 0 : Math.sin(time * 1.4) * intox / 100 * .012);
  }
  restore(p: { x: number; y: number; z: number; yaw: number; pitch: number }) {
    this.camera.position.set(p.x, p.y, p.z); this.yaw = p.yaw; this.pitch = p.pitch;
    this.camera.rotation.set(this.pitch, this.yaw, 0); this.verticalVelocity = 0; this.clear();
  }
  snapshot() { const p = this.camera.position; return { x: p.x, y: p.y, z: p.z, yaw: this.yaw, pitch: this.pitch }; }
}
