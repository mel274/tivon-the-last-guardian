import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { buildTown } from './Town';
import { PlayerController } from '../player/PlayerController';
import type { WorldContext } from './types';
import { ZEID, ROUTE75_RAIL } from './layout';

// The Zeid centre's upper plaza, falafel-row lane, garden path and the Route 75 guardrail,
// checked with the real colliders, floors and the player capsule.
let world: WorldContext;
let player: PlayerController;
const allOpen = { cavesEntered: true, hiddenOpened: true, spiritFreed: true };

beforeAll(() => {
  const noop = () => undefined;
  const context = new Proxy({}, { get: () => noop, set: () => true });
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => context }) });
  vi.stubGlobal('window', { addEventListener: noop });
  world = { scene: new THREE.Scene(), colliders: [], interactables: [], npcs: [], grounds: [], groups: {}, lights: [], vehicles: [] };
  buildTown(world); world.scene.updateMatrixWorld(true);
  player = new PlayerController(new THREE.PerspectiveCamera(), world);
}, 60000);

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
  const on = (x: number, z: number, y: number, tol = .6) => (floors.get(`${snap(x).toFixed(1)},${snap(z).toFixed(1)}`) ?? []).some(f => Math.abs(f - y) < tol);
  return { size: seen.size, has: (x: number, z: number) => at(x, z) !== undefined, feet: at, on };
}

describe('Zeid upper plaza, lane and garden path', () => {
  it('reaches the lane, the pizza window, the porch, Falafel Chen, the backyard and the garden from the bus stair', () => {
    const { x, z0 } = ZEID.busStair, p = ZEID.row.along;
    const r = walk([x, z0 - 1], [-260, -90, -870, -790]);
    for (const [name, [tx, tz]] of [['lane', [-221.6, -837.5]], ['pizza window', p(27, 2.5)], ['drugstore porch', [-217, -840.5]], ['Falafel Chen', p(3.5, 2)]] as Array<[string, [number, number]]>)
      expect(r.on(tx, tz, ZEID.upper), name).toBe(true);
    const [gx, gz] = ZEID.at(ZEID.frame.HW - .05, -ZEID.frame.HD - 2.6), [yx, yz] = ZEID.at(ZEID.frame.HW - 3, -ZEID.frame.HD - 2.6);
    expect(r.on(yx, yz, ZEID.upper), 'backyard').toBe(true);
    expect(r.has(gx, gz), 'east gate').toBe(true);
  });

  it('walks the garden path to the Hannah Szenes garden', () => {
    const [sx, sz] = ZEID.gardenPath[0], r = walk([sx, sz], [-260, -60, -870, -780]);
    expect(r.has(-104, -827)).toBe(true);
  });
});

describe('Route 75 guardrail', () => {
  it('blocks stepping across it east of the bus stop', () => {
    const solid = ROUTE75_RAIL.filter((p, i) => !p.gap && ROUTE75_RAIL[i + 1] && !ROUTE75_RAIL[i + 1].gap && p.x > -140);
    expect(solid.length).toBeGreaterThan(20);
    for (const p of [solid[3], solid[Math.floor(solid.length / 2)]]) {
      const mid = ROUTE75_RAIL[ROUTE75_RAIL.indexOf(p) + 1], mx = (p.x + mid.x) / 2, mz = (p.z + mid.z) / 2;
      player.camera.position.y = player.groundAt(mx, mz) + 1.7;
      expect(player.blocked(mx, mz, allOpen), `rail at x=${mx.toFixed(0)}`).toBe(true);
      expect(player.blocked(mx + p.nx * 1.5, mz + p.nz * 1.5, allOpen), `pavement behind rail at x=${mx.toFixed(0)}`).toBe(false);
    }
  });
});
