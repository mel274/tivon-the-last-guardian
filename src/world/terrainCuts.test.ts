import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { conformTerrain, type CutSeg } from './terrainCuts';

function quad(y = 5) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([0, y, 0, 16, y, 0, 0, y, 16, 16, y, 16], 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute([.4, .5, .3, .4, .5, .3, .4, .5, .3, .4, .5, .3], 3));
  geo.setIndex([0, 2, 1, 1, 2, 3]);
  geo.computeBoundingBox(); geo.computeBoundingSphere();
  return geo;
}
function seg(ax: number, az: number, bx: number, bz: number, y: number): CutSeg {
  return { ax, az, bx, bz, y, x0: Math.min(ax, bx), x1: Math.max(ax, bx), z0: Math.min(az, bz), z1: Math.max(az, bz) };
}
function height(geo: THREE.BufferGeometry, x: number, z: number) {
  const mesh = new THREE.Mesh(geo);
  const hit = new THREE.Raycaster(new THREE.Vector3(x, 30, z), new THREE.Vector3(0, -1, 0)).intersectObject(mesh)[0];
  return hit ? hit.point.y : null;
}

describe('terrain cuts', () => {
  it('holds the mesh at a floor that contains no grid vertex', () => {
    const geo = quad();
    const y = 0;
    const square: Array<[number, number]> = [[4, 4], [12, 4], [12, 12], [4, 12]];
    const cuts = square.map((p, i) => seg(p[0], p[1], square[(i + 1) % 4][0], square[(i + 1) % 4][1], y));
    conformTerrain(geo, cuts);
    for (const [x, z] of [[6, 6], [8, 5], [11, 11], [5, 10]]) expect(height(geo, x, z), `${x},${z}`).toBeLessThan(.05);
    // Grid corners stay on the hillside. A sample just outside the floor sits on the slope that starts at the cut.
    expect(geo.attributes.position.getY(0)).toBeCloseTo(5);
    expect(geo.attributes.position.getY(3)).toBeCloseTo(5);
    expect(height(geo, 15, 15)).toBeGreaterThan(3);
  });

  it('leaves a mesh alone when nothing crosses it', () => {
    const geo = quad();
    conformTerrain(geo, [seg(30, 30, 40, 32, 0)]);
    expect(height(geo, 8, 8)).toBeCloseTo(5, 5);
  });
});
