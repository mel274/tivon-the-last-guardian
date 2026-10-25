import * as THREE from 'three';
import type { Game } from './Game';

/** Development-only camera helpers for inspecting the map (exposed as window.__views). */
export function installDevViews(g: Game) {
  const any = g as unknown as { renderer: THREE.WebGLRenderer; scene: THREE.Scene; sun: THREE.DirectionalLight; terrain?: THREE.Object3D; skyDome: { update: (...a: unknown[]) => void }; world: Game['world']; frame: () => void };
  const freeze = () => { any.renderer.setAnimationLoop(null); const o = document.querySelector<HTMLElement>('#overlay'); if (o) o.style.display = 'none'; };
  const lights = (cam: THREE.Camera) => { const v = new THREE.Vector3(); any.world.lights.map(l => ({ l, d: l.getWorldPosition(v).distanceToSquared(cam.position) })).sort((a, b) => a.d - b.d).forEach((o, i) => { o.l.visible = i < 6; }); };
  const views = {
    top(cx: number, cz: number, half: number) {
      freeze(); const a = innerWidth / innerHeight, cam = new THREE.OrthographicCamera(-half * a, half * a, half, -half, 1, 2000);
      cam.position.set(cx, 700, cz); cam.up.set(0, 0, -1); cam.lookAt(cx, 0, cz);
      const fog = any.scene.fog as THREE.Fog; fog.near = 4e4; fog.far = 5e4;
      any.sun.position.set(cx - 30, 800, cz + 20); any.sun.target.position.set(cx, 0, cz); any.sun.target.updateMatrixWorld();
      Object.assign(any.sun.shadow.camera, { left: -half * 1.6, right: half * 1.6, top: half * 1.6, bottom: -half * 1.6, far: 1600 }); any.sun.shadow.camera.updateProjectionMatrix();
      if (any.terrain) any.terrain.visible = true; lights(cam); any.renderer.render(any.scene, cam); return any.renderer.info.render.calls;
    },
    look(x: number, y: number, z: number, tx: number, ty: number, tz: number, fov = 66) {
      freeze(); const cam = new THREE.PerspectiveCamera(fov, innerWidth / innerHeight, .1, 1400); cam.position.set(x, y, z); cam.lookAt(tx, ty, tz);
      const fog = any.scene.fog as THREE.Fog; fog.near = 220; fog.far = 950;
      any.sun.position.set(x - 35, y + 55, z + 28); any.sun.target.position.set(x, y, z); any.sun.target.updateMatrixWorld();
      Object.assign(any.sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, far: 300 }); any.sun.shadow.camera.updateProjectionMatrix();
      for (let i = 0; i < 80; i++) any.skyDome.update(cam, new THREE.Vector3(-35, 55, 28), 0, false, false, 0);
      lights(cam); any.renderer.render(any.scene, cam); return any.renderer.info.render.calls;
    },
    resume() { any.renderer.setAnimationLoop(() => any.frame()); },
  };
  Object.assign(window, { __views: views });
}
