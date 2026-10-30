import * as THREE from 'three';

/** World-space ("box-projected") texturing so merged, scaled and instanced geometry all get
 *  metre-true texture density without per-mesh UVs. The photographic atlas
 *  (public/textures/tivon-material-atlas.png, original AI-generated) supplies limestone,
 *  plaster, asphalt and paving; grass, roof tiles, wood and soil are generated on canvases. */
export type Surface = 'limestone' | 'plaster' | 'asphalt' | 'paving' | 'grass' | 'tiles' | 'wood' | 'soil' | 'cavestone';
interface Slot { texture?: THREE.Texture; mean: THREE.Vector3; users: Set<THREE.MeshStandardMaterial> }
const slots = new Map<Surface, Slot>();
const slot = (s: Surface) => { let v = slots.get(s); if (!v) { v = { mean: new THREE.Vector3(1, 1, 1), users: new Set() }; slots.set(s, v); } return v; };
const hasDOM = typeof document !== 'undefined' && typeof Image !== 'undefined';

const toLinear = (c: number) => { c /= 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; };
function install(surface: Surface, canvas: HTMLCanvasElement) {
  const s = slot(surface);
  try {
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < data.length; i += 64) { r += toLinear(data[i]); g += toLinear(data[i + 1]); b += toLinear(data[i + 2]); n++; }
    s.mean.set(r / n, g / n, b / n);
  } catch { /* tainted or stub canvas: keep neutral mean */ }
  const t = new THREE.CanvasTexture(canvas); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 16;
  t.generateMipmaps = true; s.texture = t;
  s.users.forEach(m => { m.map = t; m.needsUpdate = true; });
}

function proceduralCanvas(surface: Surface): HTMLCanvasElement | null {
  if (!hasDOM) return null;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
  const c = canvas.getContext('2d'); if (!c) return null;
  let n = surface.length * 7919;
  const r = () => { n = (n * 1664525 + 1013904223) >>> 0; return n / 4294967296; };
  if (surface === 'grass' || surface === 'soil') {
    c.fillStyle = surface === 'grass' ? '#8d8c5a' : '#8a7454'; c.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 26000; i++) {
      const g = surface === 'grass';
      c.fillStyle = g ? (r() > .5 ? `rgba(${70 + r() * 60},${95 + r() * 60},${40 + r() * 30},.55)` : `rgba(${150 + r() * 50},${135 + r() * 40},${80 + r() * 30},.45)`)
        : `rgba(${100 + r() * 70},${80 + r() * 50},${55 + r() * 30},.5)`;
      const x = r() * 512, y = r() * 512;
      if (g) c.fillRect(x, y, 1 + r() * 1.5, 2 + r() * 5); else c.fillRect(x, y, 1 + r() * 4, 1 + r() * 3);
    }
    for (let i = 0; i < 260; i++) { c.fillStyle = `rgba(${120 + r() * 40},${105 + r() * 30},${80},.35)`; c.beginPath(); c.arc(r() * 512, r() * 512, 2 + r() * 9, 0, 7); c.fill(); }
  } else if (surface === 'tiles') {
    c.fillStyle = '#9a4a32'; c.fillRect(0, 0, 512, 512);
    for (let y = 0; y < 512; y += 32) for (let x = (y / 32 % 2) * 21; x < 540; x += 42) {
      const l = 80 + r() * 40; c.fillStyle = `rgb(${150 + l * .4},${70 + l * .2},${45 + l * .1})`;
      c.beginPath(); c.ellipse(x, y + 20, 19, 18, 0, Math.PI, 0); c.lineTo(x + 19, y + 32); c.lineTo(x - 19, y + 32); c.fill();
      c.fillStyle = 'rgba(60,25,15,.35)'; c.fillRect(x - 19, y + 29, 38, 3);
    }
  } else if (surface === 'wood') {
    c.fillStyle = '#9a7650'; c.fillRect(0, 0, 512, 512);
    for (let y = 0; y < 512; y += 2) { c.fillStyle = `rgba(${60 + r() * 50},${40 + r() * 30},${20},${.08 + r() * .1})`; c.fillRect(0, y, 512, 1 + r() * 2); }
    for (let x = 0; x < 512; x += 64) { c.fillStyle = 'rgba(40,25,10,.35)'; c.fillRect(x, 0, 2, 512); }
  } else if (surface === 'cavestone') {
    c.fillStyle = '#a89c80'; c.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 9000; i++) { c.fillStyle = `rgba(${r() > .5 ? '235,222,190' : '60,55,40'},${r() * .16})`; c.fillRect(r() * 512, r() * 512, r() * 14 + 1, r() * 4 + 1); }
    c.strokeStyle = 'rgba(50,45,32,.18)'; c.lineWidth = 2;
    for (let i = 0; i < 26; i++) { c.beginPath(); const y = r() * 512; c.moveTo(0, y); for (let x = 0; x <= 512; x += 32) c.lineTo(x, y + r() * 10 - 5); c.stroke(); }
  }
  return canvas;
}

let atlasRequested = false;
function requestTextures() {
  if (atlasRequested || !hasDOM) return; atlasRequested = true;
  for (const s of ['grass', 'soil', 'tiles', 'wood', 'cavestone'] as Surface[]) { const cv = proceduralCanvas(s); if (cv) install(s, cv); }
  const img = new Image(); img.src = import.meta.env.BASE_URL + 'textures/tivon-material-atlas.png';
  img.onload = () => {
    (['limestone', 'plaster', 'asphalt', 'paving'] as Surface[]).forEach((name, index) => {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
      const w = img.width / 2, h = img.height / 2;
      canvas.getContext('2d')!.drawImage(img, index % 2 * w + 4, Math.floor(index / 2) * h + 4, w - 8, h - 8, 0, 0, 512, 512);
      install(name, canvas);
    });
  };
}

/** Facade material for footprint-extruded buildings. A per-vertex `bld` attribute carries
 *  (style, base height, roof height): walls get world-projected plaster or stone with a
 *  procedural grid of windows per 3 m storey (some lit after dusk); roofs (style ≥ 9) get a
 *  plain concrete finish. `night` is driven by the game clock. */
export const BUILDING_UNIFORMS = { night: { value: 0 } };
const buildingCache = new Map<string, THREE.MeshStandardMaterial>();
export function buildingMaterial(surface: 'plaster' | 'limestone'): THREE.MeshStandardMaterial {
  const cached = buildingCache.get(surface); if (cached) return cached;
  requestTextures();
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .9 });
  const s = slot(surface); s.users.add(m); if (s.texture) m.map = s.texture;
  const uniforms = { tpScale: { value: 1 / (surface === 'plaster' ? 3.2 : 2.2) }, tpMean: { value: s.mean }, night: BUILDING_UNIFORMS.night, tpStrength: { value: surface === 'plaster' ? .5 : 1 } };
  m.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 bld; varying vec3 vBld; varying vec3 vTpPos; varying vec3 vTpNormal;')
      .replace('#include <project_vertex>', '#include <project_vertex>\n vBld = bld; vTpPos = (modelMatrix * vec4(transformed, 1.0)).xyz; vTpNormal = normalize(mat3(modelMatrix) * objectNormal);');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vBld; varying vec3 vTpPos; varying vec3 vTpNormal; uniform float tpScale; uniform vec3 tpMean; uniform float night; uniform float tpStrength;
float bHash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }`)
      .replace('#include <map_fragment>', `
  vec3 bN = normalize(vTpNormal); float bStyle = vBld.x; vec3 bGlow = vec3(0.0);
  if (bStyle >= 8.5 || abs(bN.y) > 0.6) {
    float g = bHash(floor(vTpPos.xz * 1.7)) * 0.08; diffuseColor.rgb *= 0.92 + g;
  } else {
#ifdef USE_MAP
    vec2 tpUv = abs(bN.x) > abs(bN.z) ? vTpPos.zy : vTpPos.xy;
    vec3 tpCol = texture2D(map, tpUv * tpScale).rgb;
    diffuseColor.rgb *= mix(vec3(1.0), tpCol / max(tpMean, vec3(0.02)), tpStrength);
#endif
    vec2 t = normalize(vec2(-bN.z, bN.x));
    float along = dot(vTpPos.xz, t), up = vTpPos.y - vBld.y, top = vBld.z - vBld.y;
    float bay = along / 3.1, fl = up / 3.0;
    vec2 cell = vec2(floor(bay), floor(fl)), f = vec2(fract(bay), fract(fl));
    float winW = bStyle > 1.5 && bStyle < 2.5 ? 0.42 : 0.3;
    float isWin = step(0.5 - winW, f.x) * step(f.x, 0.5 + winW) * step(0.32, f.y) * step(f.y, 0.82) * step(0.6, up) * step(up, top - 0.7);
    float frame = isWin * (1.0 - step(0.5 - winW + 0.04, f.x) * step(f.x, 0.5 + winW - 0.04) * step(0.36, f.y) * step(f.y, 0.78));
    float rnd = bHash(cell + floor(vBld.y * 7.0));
    vec3 glass = mix(vec3(0.12, 0.16, 0.18), vec3(0.32, 0.38, 0.42), smoothstep(0.32, 0.82, f.y) * 0.6 + rnd * 0.2);
    float shutter = step(0.72, rnd) * step(0.55, f.y);
    glass = mix(glass, vec3(0.78, 0.76, 0.7), shutter);
    diffuseColor.rgb = mix(diffuseColor.rgb, glass, isWin * (1.0 - frame));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.92, 0.88), frame);
    float lit = step(0.55, bHash(cell * 1.7 + 3.1)) * night * isWin * (1.0 - frame) * (1.0 - shutter);
    bGlow = vec3(1.0, 0.78, 0.48) * lit * 0.9;
    float ledge = step(0.0, up) * (1.0 - step(0.12, abs(fract(fl) - 0.0))) * 0.0;
    diffuseColor.rgb *= 1.0 - ledge;
  }`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += bGlow;');
  };
  m.customProgramCacheKey = () => `bld-${surface}`;
  buildingCache.set(surface, m);
  return m;
}

export interface WorldMaterialOptions { color?: THREE.ColorRepresentation; roughness?: number; metalness?: number; scale?: number; strength?: number; vertexColors?: boolean; emissive?: THREE.ColorRepresentation; emissiveIntensity?: number; side?: THREE.Side }
const cache = new Map<string, THREE.MeshStandardMaterial>();
/** A MeshStandardMaterial whose map is sampled in world space (metres / scale). */
export function worldMaterial(surface: Surface | null, o: WorldMaterialOptions = {}): THREE.MeshStandardMaterial {
  const key = JSON.stringify([surface, o]);
  const cached = cache.get(key); if (cached) return cached;
  requestTextures();
  const m = new THREE.MeshStandardMaterial({ color: o.color ?? '#ffffff', roughness: o.roughness ?? .92, metalness: o.metalness ?? 0, vertexColors: !!o.vertexColors, side: o.side ?? THREE.FrontSide });
  if (o.emissive) { m.emissive.set(o.emissive); m.emissiveIntensity = o.emissiveIntensity ?? 1; }
  if (surface) {
    const s = slot(surface); s.users.add(m); if (s.texture) m.map = s.texture;
    const uniforms = { tpScale: { value: 1 / (o.scale ?? 2.5) }, tpStrength: { value: o.strength ?? 1 }, tpMean: { value: s.mean } };
    m.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vTpPos; varying vec3 vTpNormal;')
        .replace('#include <project_vertex>', '#include <project_vertex>\n vTpPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\n#ifdef USE_INSTANCING\n vTpPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;\n vTpNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);\n#else\n vTpNormal = normalize(mat3(modelMatrix) * objectNormal);\n#endif');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vTpPos; varying vec3 vTpNormal; uniform float tpScale; uniform float tpStrength; uniform vec3 tpMean;')
        .replace('#include <map_fragment>', `#ifdef USE_MAP
  vec3 tpN = abs(normalize(vTpNormal));
  vec2 tpUv = tpN.y > max(tpN.x, tpN.z) ? vTpPos.xz : (tpN.x > tpN.z ? vTpPos.zy : vTpPos.xy);
  vec4 tpTex = texture2D(map, tpUv * tpScale);
  vec3 tpDetail = texture2D(map, tpUv * tpScale * 0.173 + 0.31).rgb;
  vec3 tpCol = tpTex.rgb * mix(vec3(1.0), tpDetail / max(tpMean, vec3(0.02)), 0.35);
  diffuseColor.rgb *= mix(vec3(1.0), tpCol / max(tpMean, vec3(0.02)), tpStrength);
#endif`);
    };
    m.customProgramCacheKey = () => `tp-${surface}`;
  }
  cache.set(key, m);
  return m;
}
