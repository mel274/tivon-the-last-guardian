import * as THREE from 'three';

/** Gradient sky dome with a soft sun and drifting cloud bands; follows the camera. */
export class Sky {
  readonly mesh: THREE.Mesh;
  readonly uniforms = {
    top: { value: new THREE.Color('#6f9fc8') }, horizon: { value: new THREE.Color('#d9e3e0') }, ground: { value: new THREE.Color('#a8ae9a') },
    sunDir: { value: new THREE.Vector3(-.5, .6, .4).normalize() }, sunColor: { value: new THREE.Color('#fff1cf') }, time: { value: 0 }, cloud: { value: .55 }, stars: { value: 0 },
  };
  constructor(scene: THREE.Scene) {
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 ground; uniform vec3 sunDir; uniform vec3 sunColor; uniform float time; uniform float cloud; uniform float stars; varying vec3 vDir;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
        float fbm(vec2 p){ float v=0.0, a=.5; for(int i=0;i<5;i++){ v+=a*n(p); p*=2.03; a*=.5; } return v; }
        void main(){
          vec3 d = normalize(vDir); float y = d.y;
          vec3 col = y > 0.0 ? mix(horizon, top, pow(clamp(y,0.0,1.0), .55)) : mix(horizon, ground, clamp(-y*4.0,0.0,1.0));
          float s = max(dot(d, normalize(sunDir)), 0.0);
          col += sunColor * (pow(s, 900.0) * 3.0 + pow(s, 12.0) * .25 + pow(s, 3.0) * .08);
          if (y > 0.0) {
            vec2 uv = d.xz / (y + .15) * .9 + vec2(time * .004, time * .0015);
            float c = smoothstep(.5, .85, fbm(uv * 1.3)) * cloud * smoothstep(0.0, .25, y);
            vec3 cc = mix(vec3(1.0), sunColor, .25) * (0.75 + .35 * s);
            col = mix(col, cc * mix(1.0, .55, 1.0 - clamp(length(top), 0.0, 1.0)), c * .8);
            float st = step(.9985, h(floor(d.xz / (y + .2) * 220.0))) * stars * smoothstep(.05, .4, y);
            col += vec3(st);
          }
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), material);
    this.mesh.scale.setScalar(500); this.mesh.frustumCulled = false; this.mesh.renderOrder = -1;
    scene.add(this.mesh);
  }
  /** dusk: 0 day → 1 night; dawn: warm sunrise palette; underground: near black. */
  update(camera: THREE.Camera, sunDir: THREE.Vector3, dusk: number, dawn: boolean, underground: boolean, t: number) {
    this.mesh.position.copy(camera.position);
    const u = this.uniforms; u.time.value = t; u.sunDir.value.copy(sunDir).normalize();
    const day = { top: new THREE.Color('#5f95c4'), hor: new THREE.Color('#d6e2df'), sun: new THREE.Color('#fff2d2') };
    const night = { top: new THREE.Color('#0d1730'), hor: new THREE.Color('#3b4a63'), sun: new THREE.Color('#ffb070') };
    const sunrise = { top: new THREE.Color('#6d86b0'), hor: new THREE.Color('#f2c18e'), sun: new THREE.Color('#ffc27a') };
    const target = dawn ? sunrise : { top: day.top.clone().lerp(night.top, dusk), hor: day.hor.clone().lerp(night.hor, dusk).lerp(new THREE.Color('#e7a77a'), Math.sin(dusk * Math.PI) * .45), sun: day.sun.clone().lerp(night.sun, dusk) };
    if (underground) { target.top = new THREE.Color('#05080a'); target.hor = new THREE.Color('#0b1112'); }
    u.top.value.lerp(target.top, .03); u.horizon.value.lerp(target.hor, .03); u.sunColor.value.lerp(target.sun, .03);
    u.stars.value += ((dusk > .6 && !underground ? 1 : 0) - u.stars.value) * .02;
    u.cloud.value = .5 - dusk * .25;
  }
}
