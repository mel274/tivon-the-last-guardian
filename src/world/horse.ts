import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Original low-poly horse and rider, merged into one mesh. Faces local +z.
 *  Used for the memorial's bronze statue and the spectral guardian. */
export function horseAndRider(material: THREE.Material, rider = true): THREE.Mesh {
  const parts: THREE.BufferGeometry[] = [];
  const put = (g: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz)));
    if (g.index) g = g.toNonIndexed(); g.deleteAttribute('uv'); parts.push(g);
  };
  const cap = (r: number, l: number) => new THREE.CapsuleGeometry(r, l, 4, 10);
  // Barrel, chest and haunches.
  put(cap(.42, 1.2), 0, 1.55, 0, Math.PI / 2, 0, 0, 1, 1, 1.05);
  put(new THREE.SphereGeometry(.48, 12, 9), 0, 1.6, .62, 0, 0, 0, 1, 1.05, 1);
  put(new THREE.SphereGeometry(.47, 12, 9), 0, 1.62, -.68, 0, 0, 0, 1.02, 1.05, 1);
  // Neck, head and muzzle, raised as if reined in.
  put(cap(.2, .75), 0, 2.15, .95, -.75);
  put(cap(.15, .42), 0, 2.62, 1.36, -1.9, 0, 0, 1, 1, .9);
  put(new THREE.SphereGeometry(.13, 10, 8), 0, 2.48, 1.6, 0, 0, 0, .9, .85, 1.2);
  for (const s of [-1, 1]) put(new THREE.ConeGeometry(.05, .2, 6), s * .08, 2.88, 1.22, -.3, 0, s * .2);
  put(new THREE.BoxGeometry(.06, .5, .55), 0, 2.45, .82, -.75); // mane
  // Legs: front pair stepping, hind pair planted.
  for (const s of [-1, 1]) {
    put(cap(.09, .55), s * .25, 1.0, .7, s > 0 ? -.35 : .1); put(cap(.065, .5), s * .25, .42, s > 0 ? .9 : .74, s > 0 ? .25 : 0);
    put(new THREE.CylinderGeometry(.08, .09, .1, 8), s * .25, .07, s > 0 ? 1.0 : .74);
    put(cap(.11, .5), s * .26, 1.05, -.72, .15); put(cap(.065, .5), s * .26, .42, -.82);
    put(new THREE.CylinderGeometry(.08, .09, .1, 8), s * .26, .07, -.82);
  }
  put(cap(.08, .7), 0, 1.35, -1.25, .5); // tail
  if (rider) {
    put(new THREE.BoxGeometry(.6, .08, .75), 0, 2.0, -.05); // saddle
    put(cap(.2, .45), 0, 2.55, -.08, -.08);
    put(new THREE.SphereGeometry(.14, 10, 8), 0, 3.08, -.04);
    put(new THREE.CylinderGeometry(.24, .26, .05, 14), 0, 3.18, -.04); // brimmed hat
    put(new THREE.CylinderGeometry(.13, .15, .16, 12), 0, 3.27, -.04);
    for (const s of [-1, 1]) {
      put(cap(.075, .42), s * .25, 2.05, .12, Math.PI / 2 - .35, 0, s * .15);
      put(cap(.06, .42), s * .3, 1.62, .25, -.15, 0, s * .1);
      put(cap(.055, .38), s * .24, 2.58, .12, -.9, 0, s * .2);
    }
    put(new THREE.CylinderGeometry(.025, .025, 1.3, 6), .38, 2.75, -.25, .35, 0, -.15); // rifle slung across
  }
  const geo = mergeGeometries(parts, false); parts.forEach(p => p.dispose()); geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material); mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}
