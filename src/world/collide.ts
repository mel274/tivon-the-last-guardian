import * as THREE from 'three';
import type { Collider } from './types';

/** Collision helpers that honour oriented boxes (buildings on angled streets). The axis-aligned
 *  min/max bounds stay on every collider for spatial hashing and cheap rejection. */
export function toLocal(c: { obb?: Collider['obb'] }, x: number, z: number): [number, number] {
  const o = c.obb!; const dx = x - o.cx, dz = z - o.cz;
  return [dx * o.c - dz * o.s, dx * o.s + dz * o.c];
}
/** Horizontal distance² from (x,z) to the collider footprint. */
export function footprintDistance2(c: Collider, x: number, z: number): number {
  if (!c.obb) {
    const nx = Math.max(c.minX, Math.min(x, c.maxX)), nz = Math.max(c.minZ, Math.min(z, c.maxZ));
    return (x - nx) ** 2 + (z - nz) ** 2;
  }
  const [lx, lz] = toLocal(c, x, z), o = c.obb;
  const nx = Math.max(-o.hx, Math.min(lx, o.hx)), nz = Math.max(-o.hz, Math.min(lz, o.hz));
  return (lx - nx) ** 2 + (lz - nz) ** 2;
}
const box = new THREE.Box3(), hit = new THREE.Vector3(), lray = new THREE.Ray();
/** Distance along the ray to the collider, or null. */
export function rayDistance(c: Collider, ray: THREE.Ray): number | null {
  if (!c.obb) {
    box.min.set(c.minX, c.minY, c.minZ); box.max.set(c.maxX, c.maxY, c.maxZ);
    return ray.intersectBox(box, hit) ? hit.distanceTo(ray.origin) : null;
  }
  const o = c.obb; const [ox, oz] = toLocal(c, ray.origin.x, ray.origin.z);
  const d = ray.direction; lray.origin.set(ox, ray.origin.y, oz); lray.direction.set(d.x * o.c - d.z * o.s, d.y, d.x * o.s + d.z * o.c);
  box.min.set(-o.hx, c.minY, -o.hz); box.max.set(o.hx, c.maxY, o.hz);
  return lray.intersectBox(box, hit) ? hit.distanceTo(lray.origin) : null;
}
