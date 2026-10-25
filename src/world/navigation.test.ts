import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { buildTown } from './Town';
import { buildCaves, CAVE_PLAN, caveCeiling } from './Caves';
import { buildTerrain, surfaceHeight } from './terrain';
import { PlayerController } from '../player/PlayerController';
import type { WorldContext, Interactable } from './types';
import { rayDistance } from './collide';
import { ZEID } from './layout';

// Geometry-only integration checks: use real generated colliders, floors, the player capsule
// and targeting rays; rendering and input are tested separately.
let world: WorldContext;
let player: PlayerController;
const allOpen = { cavesEntered: true, hiddenOpened: true, spiritFreed: true };
/** Floors through the catacomb: hall, chambers, hidden crypt, arena, archive, foot of the daylight stair. */
const CAVE_FLOORS: Array<[number, number]> = [[126, 104], [108, 118], [144, 118], [108, 140], [126, 142], [144, 140], [126, 156], [126, 178], [126, 196], [126, 226], [126, 254], [126, 256]];

beforeAll(() => {
  const noop = () => undefined;
  const context = new Proxy({}, { get: () => noop, set: () => true });
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => context }) });
  vi.stubGlobal('window', { addEventListener: noop });
  world = { scene: new THREE.Scene(), colliders: [], interactables: [], npcs: [], grounds: [], groups: {}, lights: [] };
  buildTown(world); buildCaves(world); world.scene.updateMatrixWorld(true);
  player = new PlayerController(new THREE.PerspectiveCamera(), world);
}, 60000);

/** Breadth-first walk on a 0.5 m grid that tracks floor height (stairs, upper storeys).
 *  Cells are keyed by position and storey, so a terrace above a street is its own node. */
function walk(from: [number, number], bounds: [number, number, number, number], flags: Record<string, boolean> = allOpen) {
  const snap = (v: number) => Math.round(v * 2) / 2;
  const key = (x: number, z: number, f: number) => `${x.toFixed(1)},${z.toFixed(1)},${Math.round(f / 2.5)}`;
  const start: [number, number] = [snap(from[0]), snap(from[1])];
  const seen = new Set<string>(), best = new Map<string, number>();
  const floors = new Map<string, number[]>();
  const visit = (x: number, z: number, f: number) => { const xz = `${x.toFixed(1)},${z.toFixed(1)}`; best.set(xz, Math.max(best.get(xz) ?? -Infinity, f)); (floors.get(xz) ?? floors.set(xz, []).get(xz)!).push(f); };
  const sy = player.groundAt(start[0], start[1]);
  seen.add(key(...start, sy)); visit(...start, sy);
  const queue: Array<[number, number, number]> = [[start[0], start[1], sy]];
  for (let i = 0; i < queue.length; i++) {
    const [x, z, feet] = queue[i];
    for (const [dx, dz] of [[.5, 0], [-.5, 0], [0, .5], [0, -.5]]) {
      const nx = x + dx, nz = z + dz;
      if (nx < bounds[0] || nx > bounds[1] || nz < bounds[2] || nz > bounds[3]) continue;
      const nf = player.groundAt(nx, nz, feet), k = key(nx, nz, nf);
      if (seen.has(k) || nf > feet + .5 || nf < feet - 3) continue;
      player.camera.position.y = Math.max(feet, nf) + 1.7;
      if (player.blocked(nx, nz, flags) || player.blocked(x + dx / 2, z + dz / 2, flags)) continue;
      seen.add(k); visit(nx, nz, nf); queue.push([nx, nz, nf]);
    }
  }
  const at = (x: number, z: number) => best.get(`${snap(x).toFixed(1)},${snap(z).toFixed(1)}`);
  /** Reached (x, z) standing within `tol` of height y (tells a balcony from the arcade below it). */
  const on = (x: number, z: number, y: number, tol = .6) => (floors.get(`${snap(x).toFixed(1)},${snap(z).toFixed(1)}`) ?? []).some(f => Math.abs(f - y) < tol);
  return { size: seen.size, has: (x: number, z: number) => at(x, z) !== undefined, feet: at, on };
}
const local = (name: string, lx: number, lz: number): [number, number] => {
  const g = world.groups[name], c = Math.cos(g.rotation.y), s = Math.sin(g.rotation.y);
  return [g.position.x + lx * c + lz * s, g.position.z - lx * s + lz * c];
};

function canTarget(i: Interactable, x: number, z: number, feet: number): boolean {
  const target = i.object.getWorldPosition(new THREE.Vector3());
  const camera = new THREE.Vector3(x, feet + 1.7, z);
  const offset = target.clone().sub(camera), distance = offset.length();
  if (distance > (i.radius ?? 4.2) || distance < .2) return false;
  const ray = new THREE.Ray(camera, offset.normalize());
  return !world.colliders.some(c => {
    if (c.gate) return false;
    const hit = rayDistance(c, ray);
    return hit !== null && hit < distance - .7;
  });
}

describe('generated world navigation', () => {
  it('walks in through the Amali and computer-shop doorways', () => {
    for (const [name, front] of [['amali', 9], ['shop', 6]] as const) {
      const out = local(name, 0, front + 3), inside = local(name, 2.5, front - 4);
      const r = walk(out, [Math.min(out[0], inside[0]) - 12, Math.max(out[0], inside[0]) + 12, Math.min(out[1], inside[1]) - 12, Math.max(out[1], inside[1]) + 12]);
      expect(r.has(...inside), `${name} interior reachable`).toBe(true);
    }
  });
  it('walks every route of the Zeid centre from the bus stop', () => {
    const { HW, HD, BAL, STW, ARC0 } = ZEID.frame, U = ZEID.upper, L = ZEID.lower, at = ZEID.at;
    const r = walk([ZEID.busStair.x, ZEID.busStair.z0 - 1], [-240, -100, -862, -795]);
    const places: Array<[string, [number, number], number]> = [
      ['upper plaza', [-185, -834], U], ['lane by the falafel row', [-214, -836.6], U], ['lane, west end', [-228.5, -839.3], U],
      ['balcony, west end (from the plaza)', at(-19, 6.2), U], ['balcony at Mandu’s door', at(-5, 7), U], ['balcony, east end', at(19, 6.2), U],
      ['inside Mandu’s bar strip', at(-4.5, -2), U], ['backyard via Mandu', at(5, -HD - 2.6), U], ['backyard side entrance', at(-HW - 1.2, -HD - 2.6), U],
      ['stair top', at(-20.6, HD + STW / 2), U], ['foot of the stair', at(ARC0 + 1.5, HD + STW / 2), L],
      ['roofed strip by Zeid 1', at(ARC0 + 1.2, (BAL + HD) / 2), L], ['roofed strip by the pharmacy', at(15, (BAL + HD) / 2), L],
      ['inside the Rav-Kav section', at(-15.5, (BAL + HD) / 2), L], ['lower plaza by the cinema', [-125, -812.5], L],
    ];
    const missing = places.filter(([, [x, z], y]) => !r.on(x, z, y)).map(([name]) => name);
    expect(missing, 'Zeid places not reachable on foot').toEqual([]);
    // The roofed strip runs under the balcony: the same spot at both levels.
    expect(r.on(...at(15, (BAL + HD) / 2), U), 'balcony above the roofed strip').toBe(true);
    // The Mandu anchor (used for the story zone) is inside the bar strip on the upper floor.
    expect(r.on(...local('mandu', 0, 0), world.groups.mandu.position.y)).toBe(true);
  });
  it('walks from the national park entrance down to the catacomb courtyard and through every space', () => {
    const r = walk([150, -26], [90, 170, -60, 275]);
    expect(r.on(126, 84, 0), 'courtyard reachable from the park entrance').toBe(true);
    const missing = [[126, 92], [126, 96], ...CAVE_FLOORS].filter(([x, z]) => !r.on(x, z, 0)).map(p => p.join(','));
    expect(missing, 'cave floors not reached on foot').toEqual([]);
  });
  it('keeps the hill out of every cave space', () => {
    // The ground is either under the floor or above the ceiling slab, never in the room between.
    const clear = (x: number, z: number, y: number) => y <= .2 || y > caveCeiling(z) + .3 + .5;
    const points: Array<[number, number]> = [];
    for (let z = 86; z <= 110; z += .25) points.push([126, z]);
    for (const [x0, x1, z0, z1] of CAVE_PLAN) { points.push([(x0 + x1) / 2, (z0 + z1) / 2]); for (let x = x0; x <= x1; x += 2) for (let z = z0; z <= z1; z += 2) points.push([x, z]); }
    expect(points.filter(([x, z]) => !clear(x, z, surfaceHeight(x, z))).map(p => p.join(',')), 'ground inside a cave space').toEqual([]);
    // The rendered mesh interpolates an 8 m grid: probe it too, from above and through the doorway.
    const scene = new THREE.Scene(); buildTerrain(scene); scene.updateMatrixWorld(true);
    const plan = new THREE.Box3(new THREE.Vector3(100, -1e3, 74), new THREE.Vector3(162, 1e3, 262));
    const tiles = scene.getObjectsByProperty('name', 'terrain').filter(o => o instanceof THREE.Mesh && o.geometry.boundingBox!.intersectsBox(plan));
    const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0), south = new THREE.Vector3(0, 0, 1);
    const meshIn = points.filter(([x, z]) => { ray.set(new THREE.Vector3(x, 200, z), down); return ray.intersectObjects(tiles, false).some(h => !clear(x, z, h.point.y)); });
    expect(meshIn.map(p => p.join(',')), 'terrain mesh inside a cave space').toEqual([]);
    const doorway: string[] = [];
    for (let x = 123.5; x <= 128.5; x += .5) for (let y = .3; y < 4.3; y += .5) { ray.set(new THREE.Vector3(x, y, 80), south); ray.far = 40; if (ray.intersectObjects(tiles, false).length) doorway.push(`${x},${y}`); }
    expect(doorway, 'terrain seen through the entrance arch').toEqual([]);
  }, 60000);
  it('blocks crossing every story gate until its matching flag is set', () => {
    for (const [z, flag] of [[93, 'cavesEntered'], [167, 'hiddenOpened'], [249, 'spiritFreed']] as const) {
      player.camera.position.y = 1.7;
      for (let x = 123.5; x <= 128.5; x += .25) expect(player.blocked(x, z, {}), `closed ${flag} at ${x}`).toBe(true);
      expect(player.blocked(126, z, { [flag]: true }), `opened ${flag}`).toBe(false);
    }
  });
  it('connects the courtyard, chambers, hidden crypt, arena and overlook', () => {
    const r = walk([126, 80], [96, 168, 72, 275]);
    for (const [x, z] of CAVE_FLOORS) expect(r.on(x, z, 0), `unreachable floor ${x},${z}`).toBe(true);
  });
  it('gives every interaction target an unobstructed standing spot', () => {
    const inaccessible: string[] = [];
    for (const i of world.interactables) {
      const p = i.object.getWorldPosition(new THREE.Vector3()); let found = false;
      for (let x = Math.floor(p.x - 4); x <= Math.ceil(p.x + 4) && !found; x += .5) for (let z = Math.floor(p.z - 4); z <= Math.ceil(p.z + 4) && !found; z += .5) {
        const feet = player.groundAt(x, z, p.y - 1.2);
        player.camera.position.y = feet + 1.7;
        if (!player.blocked(x, z, allOpen) && canTarget(i, x, z, feet)) found = true;
      }
      if (!found) inaccessible.push(i.id);
    }
    expect(inaccessible).toEqual([]);
  });
});
