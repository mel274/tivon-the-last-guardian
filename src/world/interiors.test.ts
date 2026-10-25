import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { PlayerController } from '../player/PlayerController';
import type { WorldContext } from './types';
import { Kit, Frame } from './kit';
import { walkInShop, INTERIORS } from './interiors';

// Each interior set is built alone on flat ground (y = 0, rot 0) and walked with the real player
// capsule on a 0.5 m grid: in through the door to the keeper, and never through a wall.
const X = 126, Z = 60;
beforeAll(() => {
  const noop = () => undefined;
  const context = new Proxy({}, { get: () => noop, set: () => true });
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => context }) });
  vi.stubGlobal('window', { addEventListener: noop });
});

function build(name: string, w: number, d: number, doorLx: number, front: 'glass' | 'wall' = 'glass') {
  const world: WorldContext = { scene: new THREE.Scene(), colliders: [], interactables: [], npcs: [], grounds: [], groups: {}, lights: [] };
  const kit = new Kit(world, world.scene), set = INTERIORS[name];
  kit.ground(X - 30, X + 30, Z - 30, Z + 30, 0);
  const shop = walkInShop(kit, new Frame(X, Z, 0, 0), { w, d, door: { lx: doorLx }, sign: { he: set.he, en: set.en, ...set.sign }, keeper: set.noKeeper ? null : { id: name, label: { he: 'שיחה', en: 'Talk' } }, set, front });
  kit.B.flush(); world.scene.updateMatrixWorld(true);
  return { world, shop, player: new PlayerController(new THREE.PerspectiveCamera(), world) };
}

/** Breadth-first walk on a 0.5 m grid (adapted from navigation.test.ts). */
function walk(player: PlayerController, from: [number, number], bounds: [number, number, number, number]) {
  const snap = (v: number) => Math.round(v * 2) / 2, key = (x: number, z: number) => `${x.toFixed(1)},${z.toFixed(1)}`;
  const start: [number, number] = [snap(from[0]), snap(from[1])], seen = new Set<string>([key(...start)]);
  const queue: Array<[number, number, number]> = [[start[0], start[1], player.groundAt(start[0], start[1])]];
  for (let i = 0; i < queue.length; i++) {
    const [x, z, feet] = queue[i];
    for (const [dx, dz] of [[.5, 0], [-.5, 0], [0, .5], [0, -.5]]) {
      const nx = x + dx, nz = z + dz, k = key(nx, nz);
      if (seen.has(k) || nx < bounds[0] || nx > bounds[1] || nz < bounds[2] || nz > bounds[3]) continue;
      const nf = player.groundAt(nx, nz, feet); if (nf > feet + .5 || nf < feet - 3) continue;
      player.camera.position.y = Math.max(feet, nf) + 1.7;
      if (player.blocked(nx, nz, {}) || player.blocked(x + dx / 2, z + dz / 2, {})) continue;
      seen.add(k); queue.push([nx, nz, nf]);
    }
  }
  return { cells: queue.map(([x, z]) => [x, z] as [number, number]), has: (x: number, z: number) => seen.has(key(snap(x), snap(z))) };
}

function triangles(root: THREE.Object3D) {
  let tris = 0, meshes = 0;
  root.traverse(o => { if (o instanceof THREE.Mesh) { meshes++; const g = o.geometry as THREE.BufferGeometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3; } });
  return { tris, meshes };
}

const names = Object.keys(INTERIORS);
const report: string[] = [];
describe('walk-in shop interiors', () => {
  for (const name of names) {
    const set = INTERIORS[name];
    // The suggested size with the door off-centre, and a narrow unit with the door on the other side.
    const cases: Array<[number, number, number, 'glass' | 'wall']> = [[set.size[0], set.size[1], set.size[0] * .22, 'glass'], [Math.max(4.4, set.size[0] * .7), Math.max(5.5, set.size[1] * .75), -Math.max(4.4, set.size[0] * .7) * .2, 'wall']];
    for (const [w, d, door, front] of cases) it(`${name} ${w.toFixed(1)}×${d.toFixed(1)} (${front}): door to keeper, solid walls`, () => {
      const { world, shop, player } = build(name, w, d, door, front);
      const bounds: [number, number, number, number] = [X - w / 2 - 4, X + w / 2 + 4, Z - d - 4, Z + 4];
      const r = walk(player, [X + door, Z + 3], bounds);
      const keeper = world.interactables.find(i => i.id === `keeper_${name}`);
      if (set.noKeeper) {
        expect(keeper).toBeUndefined();
        expect(r.cells.some(([x, z]) => z < Z - d * .55 && Math.abs(x - X) < w / 2), `${name}: back of the empty unit reachable`).toBe(true);
      } else {
        expect(keeper, `${name}: keeper registered`).toBeDefined();
        const p = keeper!.object.getWorldPosition(new THREE.Vector3());
        const near = Math.min(...r.cells.map(([x, z]) => Math.hypot(x - p.x, z - p.z)));
        expect(near, `${name}: closest reachable cell to the keeper`).toBeLessThan(2);
      }
      // Close the doorway: from inside, nothing outside the walls may be reachable.
      world.colliders.push({ minX: X + door - .9, maxX: X + door + .9, minZ: Z - .3, maxZ: Z + .3, minY: -1, maxY: 5 });
      const inside = walk(player, [X + shop.room.stand[0], Z + shop.room.stand[1]], bounds);
      expect(inside.cells.length, `${name}: inside start is free`).toBeGreaterThan(4);
      for (const [x, z, what] of [[X + door, Z + 3, 'street'], [X - w / 2 - .7, Z - d / 2, 'left'], [X + w / 2 + .7, Z - d / 2, 'right'], [X, Z - d - .7, 'back']] as const) expect(inside.has(x, z), `${name}: ${what} reachable through a wall`).toBe(false);
      // Batched: only signs/painted logos (textured) and people are loose meshes.
      const loose: string[] = [];
      world.scene.traverse(o => { if (o instanceof THREE.Mesh && o.matrixAutoUpdate && !(o.material as THREE.MeshStandardMaterial).map && !o.parent?.userData.animated) loose.push(o.uuid); });
      expect(loose, `${name}: unbatched meshes`).toEqual([]);
      if (front === 'glass') { const t = triangles(world.scene); report.push(`${name.padEnd(12)} ${String(Math.round(t.tris)).padStart(6)} tris, ${t.meshes} meshes, ${world.colliders.length} colliders`); }
    });
  }
  it('reports triangle counts', () => { console.log(`interior triangles (suggested size, incl. people and signs):\n${report.join('\n')}`); expect(report.length).toBeGreaterThan(0); });
});
