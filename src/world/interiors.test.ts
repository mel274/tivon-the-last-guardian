import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import type { WorldContext } from './types';
import { Kit, Frame } from './kit';
import { walkInShop, INTERIORS } from './interiors';

// Light check: every interior set builds without errors at its suggested size and in a narrow unit,
// registers its keeper(s), and stays batched (only signs, painted logos and people are loose meshes).
const X = 126, Z = 60;
beforeAll(() => {
  const noop = () => undefined;
  const context = new Proxy({}, { get: () => noop, set: () => true });
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => context }) });
  vi.stubGlobal('window', { addEventListener: noop });
});

function build(name: string, w: number, d: number, doorLx: number, front: 'glass' | 'wall') {
  const world: WorldContext = { scene: new THREE.Scene(), colliders: [], interactables: [], npcs: [], grounds: [], groups: {}, lights: [] };
  const kit = new Kit(world, world.scene), set = INTERIORS[name];
  kit.ground(X - 30, X + 30, Z - 30, Z + 30, 0);
  walkInShop(kit, new Frame(X, Z, 0, 0), { w, d, door: { lx: doorLx }, sign: { he: set.he, en: set.en, ...set.sign }, keeper: set.noKeeper ? null : { id: name, label: { he: 'שיחה', en: 'Talk' } }, set, front });
  kit.B.flush(); world.scene.updateMatrixWorld(true);
  return world;
}

function triangles(root: THREE.Object3D) {
  let tris = 0, meshes = 0;
  root.traverse(o => { if (o instanceof THREE.Mesh) { meshes++; const g = o.geometry as THREE.BufferGeometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3; } });
  return { tris, meshes };
}

const report: string[] = [];
describe('walk-in shop interiors', () => {
  for (const name of Object.keys(INTERIORS)) {
    const set = INTERIORS[name];
    // The suggested size with the door off-centre, and a narrow unit with the door on the other side.
    const cases: Array<[number, number, number, 'glass' | 'wall']> = [[set.size[0], set.size[1], set.size[0] * .22, 'glass'], [Math.max(4.4, set.size[0] * .7), Math.max(5.5, set.size[1] * .75), -Math.max(4.4, set.size[0] * .7) * .2, 'wall']];
    for (const [w, d, door, front] of cases) it(`${name} ${w.toFixed(1)}×${d.toFixed(1)} (${front}) builds and registers its keeper`, () => {
      const world = build(name, w, d, door, front);
      const keepers = world.interactables.filter(i => i.id.startsWith('keeper_'));
      if (set.noKeeper) expect(keepers).toHaveLength(0); else expect(world.interactables.some(i => i.id === `keeper_${name}`), `${name}: keeper registered`).toBe(true);
      const loose: string[] = [];
      world.scene.traverse(o => { if (o instanceof THREE.Mesh && o.matrixAutoUpdate && !(o.material as THREE.MeshStandardMaterial).map && !o.parent?.userData.animated) loose.push(o.uuid); });
      expect(loose, `${name}: unbatched meshes`).toEqual([]);
      if (front === 'glass') { const t = triangles(world.scene); report.push(`${name.padEnd(12)} ${String(Math.round(t.tris)).padStart(6)} tris, ${t.meshes} meshes, ${world.colliders.length} colliders`); }
    });
  }
  it('reports triangle counts', () => { console.log(`interior triangles (suggested size, incl. people and signs):\n${report.join('\n')}`); expect(report.length).toBeGreaterThan(0); });
});
