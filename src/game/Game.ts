import * as THREE from 'three';
import { GameModel, type GameState } from './model';
import { townStages } from '../world/Town';
import { buildCaves } from '../world/Caves';
import { buildTerrain } from '../world/terrain';
import { Sky } from '../world/Sky';
import { NIGHT } from '../world/kit';
import { BUILDING_UNIFORMS } from '../world/materials';
import { DISTRICTS } from '../world/geo';
import { ZEID } from '../world/layout';
import type { WorldContext, Interactable } from '../world/types';
import { PlayerController } from '../player/PlayerController';
import { rayDistance } from '../world/collide';
import { AudioSystem } from '../systems/AudioSystem';
import { UI, type Waypoint } from '../ui/UI';
import { findRoute, trimRoute, type GpsRoute } from '../world/gps';
import { landmark } from '../world/geo';

export class Game {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(66, innerWidth / innerHeight, .08, 1400);
  renderer: THREE.WebGLRenderer;
  world: WorldContext = { scene: this.scene, colliders: [], interactables: [], npcs: [], grounds: [], groups: {}, lights: [], vehicles: [] };
  model = new GameModel(); player!: PlayerController;
  audio = new AudioSystem(); ui!: UI;
  playing = false; panel = 'menu'; currentInteraction = '';
  settings = { quality: 'medium', volume: .35, sensitivity: 1, reducedMotion: false, invertY: false };
  private sun = new THREE.DirectionalLight('#ffe1a6', 3.1);
  private sky = new THREE.HemisphereLight('#c4d8d5', '#777551', 2.3);
  private flashlight = new THREE.SpotLight('#fff1cd', 65, 32, .38, .58, 1.4);
  private clock = new THREE.Clock(); private total = 0; private hudTimer = 0; private saveTimer = 0; private fps = 60;
  private target?: Interactable; private dragging = false; private lastHit = -99;
  private chargeCycle = -1; private chargeFrom = new THREE.Vector3(); private chargeTo = new THREE.Vector3();
  private previousBrew = 0; private wasSurvived = false; private endingShown = false;
  private temp = new THREE.Vector3(); private direction = new THREE.Vector3();
  private skyDome!: Sky; private terrain?: THREE.Object3D; private shadowTick = 0;
  private viewDistance = 620; private maxPixelRatio = 1; private pixelRatio = 1; private perf = { t: 0, n: 0 }; private lightPos?: THREE.Vector3[]; private lightOrder: Array<{ light: THREE.Light; d: number }> = [];
  private waypoint: Waypoint | null = null; private route: GpsRoute | null = null; private gpsTimer = 0;
  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.domElement.id = 'game'; this.renderer.domElement.setAttribute('aria-label', 'Tivon 3D game world');
    this.renderer.setSize(innerWidth, innerHeight); this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.1;
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; this.renderer.shadowMap.autoUpdate = false;
    document.querySelector('#app')!.append(this.renderer.domElement);
    this.scene.background = new THREE.Color('#c8d5ca'); this.scene.fog = new THREE.Fog('#c8d5ca', 220, 950);
    this.sun.position.set(-35, 55, 28); this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048); Object.assign(this.sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: .5, far: 220 });
    this.sun.shadow.bias = -.0005; this.sun.shadow.normalBias = .03;
    this.scene.add(this.sun, this.sun.target, this.sky);
    void this.boot().catch(error => { console.error(error); const el = document.querySelector('#loading'); if (el) el.innerHTML = `<p>The 3D world could not start.</p><pre>${String(error)}</pre>`; });
  }
  /** Builds the world in stages behind a progress screen, yielding a frame between stages. */
  private async boot() {
    const lang = (() => { try { return JSON.parse(localStorage.getItem('tivon.settings') || '{}').lang === 'en' ? 'en' : 'he'; } catch { return 'he'; } })();
    const screen = document.createElement('div'); screen.id = 'loading';
    screen.innerHTML = '<h1>TIVON<span>GTA</span></h1><p class="loading-label"></p><div class="loading-bar"><i></i></div><small>KIRYAT TIVON · OPEN WORLD</small>'; document.body.append(screen);
    const total = 10; let n = 0;
    const step = async (he: string, en: string) => {
      n++; screen.querySelector('.loading-label')!.textContent = lang === 'en' ? en : he;
      screen.querySelector<HTMLElement>('.loading-bar i')!.style.width = `${Math.min(100, n / total * 100)}%`;
      // A frame lets the progress bar paint; background tabs get no frames, so a timer stands in.
      await new Promise<void>(r => { let done = false; const go = () => { if (!done) { done = true; r(); } }; requestAnimationFrame(() => setTimeout(go, 0)); setTimeout(go, 120); });
    };
    await step('תבליט ונוף', 'Terrain and landscape'); buildTerrain(this.scene);
    for (const [he, en] of townStages(this.world)) await step(he, en);
    await step('מערות בית שערים', 'The Beit She’arim caves'); buildCaves(this.world);
    this.skyDome = new Sky(this.scene); this.terrain = this.scene.getObjectByName('terrain');
    this.player = new PlayerController(this.camera, this.world);
    this.scene.add(this.camera); this.camera.add(this.flashlight);
    this.flashlight.position.set(.15, -.16, -.12); this.flashlight.target.position.set(0, 0, -10); this.camera.add(this.flashlight.target); this.flashlight.visible = false;
    this.ui = new UI(a => this.action(a));
    try {
      const saved = JSON.parse(localStorage.getItem('tivon.settings') || '{}');
      for (const key of ['quality','volume','sensitivity','reducedMotion','invertY'] as const) if (typeof saved[key] === typeof this.settings[key]) Object.assign(this.settings, { [key]: saved[key] });
      this.ui.setLanguage(saved.lang === 'en' ? 'en' : 'he');
    } catch { /* usable defaults when storage is unavailable */ }
    this.applySettings(); this.bindEvents(); this.menu();
    this.renderer.setAnimationLoop(() => this.frame());
    screen.remove();
    if (import.meta.env.DEV) { Object.assign(window, { __tivon: this }); import('./devViews').then(m => m.installDevViews(this)); }
  }
  private menu() {
    if (this.player?.driving) this.player.exitCar();
    this.ui.updateMinimap(0, 0, 0, false); this.playing = false; this.panel = 'menu'; this.player.clear(); document.exitPointerLock?.(); this.ui.menu(!!GameModel.load());
  }
  private start(state?: GameState) {
    this.waypoint = null; this.route = null;
    this.model = new GameModel(state);
    const p = this.model.state.position, inCaves = p.x > 98 && p.x < 166 && p.z > 74 && p.z < 275;
    // New journeys start outside Amali; saves from the old schematic map re-spawn in town.
    // World 3 is the 1:1 OSM map; positions saved on older layouts re-spawn on Ben Gurion Square.
    if (!state || (this.model.state.world !== 3 && !inCaves)) this.model.state.position = this.spawn();
    this.model.state.world = 3;
    this.player.restore(this.model.state.position);
    this.playing = true; this.endingShown = !!state?.flags.ending; this.wasSurvived = !!state?.encounter.survived;
    this.audio.start(); this.closePanel();
    this.ui.toast(this.ui.t('ברוכים הבאים לכיכר בן גוריון. עמלי מולכם. E לרכב · M למפה וניווט GPS.','Welcome to Ben Gurion Square. Amali is ahead. E for a car · M for the map and GPS.'));
  }
  private spawn() {
    const g = this.world.groups.spawn;
    return { x: g.position.x, y: this.player.groundAt(g.position.x, g.position.z) + 1.7, z: g.position.z, yaw: g.rotation.y, pitch: -.05 };
  }
  private requestLock() { if (navigator.maxTouchPoints > 0 || document.pointerLockElement || !this.playing || this.panel) return; try { const p = this.renderer.domElement.requestPointerLock(); if (p) p.catch(()=>{}); } catch { /* drag and keyboard look remain available */ } }
  private unlock() { this.player.clear(); if (document.pointerLockElement) document.exitPointerLock(); }
  private closePanel() { if (!this.playing) { this.menu(); return; } this.panel = ''; this.ui.close(); this.requestLock(); }
  private openPanel(kind: string) {
    this.panel = kind; this.unlock(); this.model.state.position = this.player.snapshot();
    if (kind === 'inventory') this.ui.inventory(this.model.state);
    else if (kind === 'journal') this.ui.journal(this.model.state, this.model.objective(), this.model.state.phase === 2 ? this.model.catacombSteps() : null);
    else if (kind === 'map') this.ui.map(this.model.state, this.model.state.phase === 2 ? this.model.catacombSteps() : null, this.waypoint, this.route);
    else if (kind === 'settings') this.ui.settings(this.settings);
    else if (kind === 'about') this.ui.about();
    else this.ui.pause();
  }
  private setGps(id: string) {
    try {
      const l = landmark(id);
      this.waypoint = { id, x: l.x, z: l.z, name: l.name };
      const p = this.player.snapshot();
      this.route = findRoute(p.x, p.z, l.x, l.z);
      this.ui.toast(this.ui.t(`ניווט ל־${this.ui.text(l.name)}`, `Route set: ${this.ui.text(l.name)}`));
      if (this.panel === 'map') this.openPanel('map');
    } catch { this.ui.toast(this.ui.t('לא ניתן לנווט ליעד זה.', 'Could not set a route to that place.')); }
  }
  private clearGps(silent = false) {
    this.waypoint = null; this.route = null;
    if (!silent) this.ui.toast(this.ui.t('הניווט בוטל.', 'GPS cleared.'));
    if (this.panel === 'map') this.openPanel('map');
  }
  interact() {
    if (!this.playing || this.panel) return;
    if (this.player.driving) {
      this.player.exitCar();
      this.ui.toast(this.ui.t('יצאתם מהרכב.', 'You left the car.'));
      return;
    }
    // Prefer the aimed car, else the nearest free car within reach (GTA-style proximity enter).
    const aimed = this.target?.id.startsWith('car_') ? this.world.vehicles.find(v => v.id === this.target!.id && !v.occupied) : undefined;
    const near = aimed ?? this.nearestCar(4.2);
    if (near) {
      this.player.enterCar(near);
      this.ui.toast(this.ui.t('WASD לנהיגה · Shift למהירות · E ליציאה', 'WASD to drive · Shift for speed · E to exit'));
      return;
    }
    if (!this.target) return;
    this.currentInteraction = this.target.id; this.panel = 'dialogue'; this.unlock();
    this.ui.dialogue(this.model.interact(this.currentInteraction));
  }
  private nearestCar(maxDist: number) {
    const p = this.camera.position; let best: typeof this.world.vehicles[number] | undefined, bd = maxDist;
    for (const v of this.world.vehicles) {
      if (v.occupied) continue;
      const d = Math.hypot(v.group.position.x - p.x, v.group.position.z - p.z);
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }
  action(action: string) {
    if (action === 'new') { this.start(); return; }
    if (action === 'continue' || action === 'load') {
      const saved = GameModel.load();
      if (saved) this.start(saved); else this.ui.toast(this.ui.t('לא נמצאה שמירה תקינה.','No valid saved journey found.')); return;
    }
    if (action === 'close') { this.closePanel(); return; }
    if (action === 'menu') { if (this.playing) this.save(); this.menu(); return; }
    if (action === 'language') { this.ui.setLanguage(this.ui.lang === 'he' ? 'en' : 'he'); this.persistSettings(); this.menu(); return; }
    if (action === 'save') { this.save(true); return; }
    if (action === 'gpsClear') { this.clearGps(); return; }
    if (action.startsWith('gps:')) { this.setGps(action.slice(4)); return; }
    if (['inventory','journal','map','settings','pause','about'].includes(action)) { this.openPanel(action); return; }
    if (action === 'applySettings') {
      const get = (id: string) => document.getElementById(`setting-${id}`) as HTMLInputElement;
      this.ui.setLanguage(get('language').value === 'en' ? 'en' : 'he');
      this.settings.quality = get('quality').value; this.settings.volume = Number(get('volume').value); this.settings.sensitivity = Number(get('sensitivity').value);
      this.settings.reducedMotion = get('motion').checked; this.settings.invertY = get('invert').checked;
      this.applySettings(); this.persistSettings(); this.closePanel(); return;
    }
    if (action === 'returnTown') {
      this.player.restore(this.spawn()); this.closePanel(); this.save(); return;
    }
    if (action.startsWith('act:')) {
      const a = action.slice(4), msg = this.model.act(a); this.ui.toast(this.ui.text(msg));
      if (a === 'brew' && this.model.state.brewing > 0) { this.audio.noise(1.1,.4,1400); this.closePanel(); }
      else if (this.model.state.encounter.active) this.closePanel();
      else if (this.panel === 'inventory') this.ui.inventory(this.model.state);
      else if (this.panel === 'dialogue') {
        const next = this.model.interact(this.currentInteraction);
        next.text = msg;
        this.ui.dialogue(next);
      }
      this.save();
      if (this.model.state.flags.ending && !this.endingShown) {
        // Climb out of the hill at the Alexander Zaid memorial, facing the valley at sunrise.
        const st = this.world.groups.statue; if (st) { const x = st.position.x + 9, z = st.position.z + 2; this.player.restore({ x, y: this.player.groundAt(x, z) + 1.7, z, yaw: -Math.PI / 2, pitch: .05 }); }
        this.endingShown = true; this.panel = 'ending'; this.unlock(); this.ui.ending();
      }
    }
  }
  private save(manual = false) {
    this.model.state.position = this.player.snapshot(); this.model.state.world = 3; const ok = this.model.save();
    if (manual) this.ui.toast(ok ? this.ui.t('המסע נשמר.','Journey saved.') : this.ui.t('לא ניתן לשמור בדפדפן הזה.','Browser storage is unavailable; saving failed.'));
  }
  private persistSettings() { try { localStorage.setItem('tivon.settings', JSON.stringify({...this.settings,lang:this.ui.lang})); } catch { /* optional */ } }
  private applySettings() {
    this.settings.volume = THREE.MathUtils.clamp(this.settings.volume,0,1); this.settings.sensitivity = THREE.MathUtils.clamp(this.settings.sensitivity,.3,2);
    this.maxPixelRatio = Math.min(devicePixelRatio, this.settings.quality === 'low' ? 1 : this.settings.quality === 'high' ? 1.75 : 1.25);
    this.pixelRatio = this.maxPixelRatio; this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.shadowMap.enabled = this.settings.quality !== 'low';
    // Draw distance and shadow resolution follow the quality setting; fog hides the edge.
    this.viewDistance = this.settings.quality === 'low' ? 380 : this.settings.quality === 'high' ? 1000 : 620;
    this.camera.far = this.viewDistance + 80; this.camera.updateProjectionMatrix();
    const shadowSize = this.settings.quality === 'high' ? 2048 : 1024;
    if (this.sun.shadow.mapSize.x !== shadowSize) { this.sun.shadow.mapSize.set(shadowSize, shadowSize); this.sun.shadow.map?.dispose(); this.sun.shadow.map = null as unknown as THREE.WebGLRenderTarget; }
    this.audio.setVolume(this.settings.volume); this.player.sensitivity = this.settings.sensitivity; this.player.invertY = this.settings.invertY;
  }
  private bindEvents() {
    addEventListener('resize', () => { this.camera.aspect = innerWidth/innerHeight; this.camera.updateProjectionMatrix(); this.renderer.setSize(innerWidth,innerHeight); });
    addEventListener('keydown', e => {
      if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code) && this.playing) e.preventDefault();
      if (e.repeat) return;
      if (e.code === 'Escape' && this.playing) { if (this.panel) this.closePanel(); else this.openPanel('pause'); return; }
      if (!this.playing) return;
      const panels: Record<string,string> = {KeyI:'inventory',KeyJ:'journal',KeyM:'map'};
      if (panels[e.code]) { if (this.panel === panels[e.code]) this.closePanel(); else this.openPanel(panels[e.code]); return; }
      if (this.panel) return;
      if (e.code === 'KeyE') { this.interact(); return; }
      if (e.code === 'KeyF') { this.action('act:toggleFlashlight'); return; }
      this.player.keys.add(e.code);
    });
    addEventListener('keyup', e => this.player.keys.delete(e.code));
    addEventListener('mousemove', e => { if (this.playing && !this.panel && (document.pointerLockElement || this.dragging)) this.player.look(e.movementX,e.movementY); });
    this.renderer.domElement.addEventListener('mousedown', () => { if (!this.panel) { this.dragging = true; this.audio.start(); this.requestLock(); } });
    addEventListener('mouseup', () => this.dragging = false);
    addEventListener('pointerlockchange', () => { if (!document.pointerLockElement) this.player.clear(); });
    addEventListener('blur', () => { if (this.playing && !this.panel) this.openPanel('pause'); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.playing) { this.save(); this.openPanel('pause'); } });
    addEventListener('beforeunload', () => { if(this.playing) this.save(); });
    let touchX = 0, touchY = 0;
    this.renderer.domElement.addEventListener('touchstart', e => { touchX=e.touches[0].clientX;touchY=e.touches[0].clientY; },{passive:true});
    this.renderer.domElement.addEventListener('touchmove',e=>{if(this.playing&&!this.panel){ const t=e.touches[0];this.player.look((t.clientX-touchX)*1.8,(t.clientY-touchY)*1.8);touchX=t.clientX;touchY=t.clientY;e.preventDefault();}},{passive:false});
    const touch = document.createElement('div'); touch.className = 'touch-controls';
    touch.innerHTML = '<button data-key="KeyW">↑</button><button data-key="KeyA">←</button><button data-key="KeyS">↓</button><button data-key="KeyD">→</button><button class="touch-interact">E</button>';
    touch.addEventListener('pointerdown',e=>{const b=(e.target as HTMLElement).closest<HTMLButtonElement>('button');if(!b||this.panel)return;e.preventDefault();if(b.dataset.key)this.player.keys.add(b.dataset.key);else this.interact();});
    const stopTouch=()=>this.player.clear();touch.addEventListener('pointerup',stopTouch);touch.addEventListener('pointerleave',stopTouch);document.body.append(touch);
  }
  private findTarget() {
    this.camera.getWorldDirection(this.direction); let best = 0; this.target = undefined;
    if (this.player.driving) return;
    // Only colliders around the player can block a short interaction ray.
    const nearby = this.player.collidersNear(this.camera.position.x, this.camera.position.z, 6);
    for (const i of this.world.interactables) {
      const isCar = i.id.startsWith('car_');
      if (isCar && this.world.vehicles.find(v => v.id === i.id)?.occupied) continue;
      i.object.updateMatrixWorld(true);
      const o = i.object.matrixWorld.elements; if (Math.abs(o[12] - this.camera.position.x) > 8 || Math.abs(o[14] - this.camera.position.z) > 8) continue;
      i.object.getWorldPosition(this.temp);
      // Characters / cars use a group at their feet; aim at the body.
      if (isCar) this.temp.y += 1.05;
      else if (this.world.npcs.some(n => n.object === i.object)) this.temp.y += 1.35;
      const vector = this.temp.clone().sub(this.camera.position), dist = vector.length();
      const dot = vector.normalize().dot(this.direction);
      // Cars are easier to select: looser aim cone and larger radius.
      if (dist > (i.radius ?? 4.2) || dot < (isCar ? .55 : .84)) continue;
      const ray = new THREE.Ray(this.camera.position, vector);
      let occluded = false;
      for (const c of nearby) {
        if (c.gate || c.vehicle) continue; // a car must not block its own enter prompt
        const hit = rayDistance(c, ray);
        if (hit !== null && hit < dist - .7) { occluded=true;break; }
      }
      if (!occluded && dot - dist * .025 > best) { best=dot-dist*.025;this.target=i; }
    }
  }
  private inside(name: string, w: number, d: number, minY = -Infinity, maxY = Infinity) {
    const g = this.world.groups[name], p = this.camera.position; if (!g) return false;
    const dx = p.x - g.position.x, dz = p.z - g.position.z, c = Math.cos(g.rotation.y), s = Math.sin(g.rotation.y);
    const lx = dx * c - dz * s, lz = dx * s + dz * c, feet = p.y - 1.7;
    return Math.abs(lx) < w / 2 && Math.abs(lz) < d / 2 && feet > minY && feet < maxY;
  }
  private zone() {
    const car=this.player.car, p=car?{x:car.group.position.x,y:car.group.position.y+1.7,z:car.group.position.z}:this.camera.position, g=this.world.groups;
    if(p.z>=261&&p.x>110&&p.x<142)return 'overlook';
    if(p.y<5&&p.z>89.2&&p.z<262&&p.x>100&&p.x<162&&(p.z>96.8||Math.abs(p.x-126)<3.2))return 'caves'; // from the corridor mouth; the hill above stays ≥ 9 m
    if(this.inside('mandu',46,26,g.mandu.position.y-1.2,g.mandu.position.y+5.2))return 'mandu'; // loft floor ~2.3 m; raised strip ceiling
    if(this.inside('amali',13,18,g.amali.position.y-1,g.amali.position.y+6))return 'amali';
    if(this.inside('shop',12,12,g.shop.position.y-1,g.shop.position.y+3.5))return 'shop';
    if(Math.hypot(p.x-DISTRICTS.bengurion.x,p.z-DISTRICTS.bengurion.z)<DISTRICTS.bengurion.r+15)return 'bengurion';
    if(Math.hypot(p.x-DISTRICTS.kiryatamal.x,p.z-DISTRICTS.kiryatamal.z)<DISTRICTS.kiryatamal.r+15)return 'kiryatamal';
    if(p.z>-40)return 'south';
    return 'town';
  }
  private updateEncounter(dt:number) {
    const s=this.model.state, ghost=this.world.groups.ghost;if(!ghost)return;
    ghost.visible=s.phase>=3&&!s.flags.ending;
    if(s.flags.spiritFreed){ghost.position.y=1.2+Math.sin(this.total)*.2;ghost.rotation.y=this.total*.15;return;}
    if(!s.encounter.active){ghost.position.set(126,.2+Math.sin(this.total)*.15,226);return;}
    const cycle=Math.floor(s.encounter.timer/4), stage=s.encounter.timer%4;
    if(cycle!==this.chargeCycle){this.chargeCycle=cycle;this.chargeFrom.copy(ghost.position);this.chargeTo.copy(this.camera.position);this.chargeTo.y=.15;this.audio.noise(.18,.6,450);}
    if(stage>1.3&&stage<3.3){ghost.position.lerpVectors(this.chargeFrom,this.chargeTo,(stage-1.3)/2);ghost.lookAt(this.chargeTo.x,ghost.position.y,this.chargeTo.z);}
    if(stage>1.3&&stage<3.5&&Math.hypot(ghost.position.x-this.camera.position.x,ghost.position.z-this.camera.position.z)<1.6&&this.total-this.lastHit>2){
      this.lastHit=this.total;s.encounter.hits++;s.wakefulness=Math.max(12,s.wakefulness-12);this.audio.noise(.4,.45,800);
      this.ui.toast(this.ui.t('הפרסות מתקרבות. זוזו הצידה כשהאור מתחזק.','The hoofbeats close in. Step aside as the light gathers.'));
      if(s.encounter.hits>=3){s.encounter.hits=0;s.encounter.timer=0;this.chargeCycle=-1;this.player.restore({x:126,y:1.7,z:215,yaw:Math.PI,pitch:0});ghost.position.set(126,0,226);this.ui.toast(this.ui.t('הדף אל פתח האולם. נשמו ונסו שוב.','Pushed back to the chamber entrance. Breathe and try again.'));}
    }
    if(dt<0) return;
  }
  /** Keeps the frame rate up on slower machines: renders fewer pixels when frames run long
   *  (below ~40 fps over two seconds) and restores them when there is headroom. */
  private adaptResolution(dt: number) {
    this.perf.t += dt; this.perf.n++; if (this.perf.t < 2) return;
    const avg = this.perf.t / this.perf.n; this.perf = { t: 0, n: 0 };
    const next = avg > 1 / 40 ? Math.max(.6, this.pixelRatio - .15) : avg < 1 / 58 ? Math.min(this.maxPixelRatio, this.pixelRatio + .1) : this.pixelRatio;
    if (Math.abs(next - this.pixelRatio) > .01) { this.pixelRatio = next; this.renderer.setPixelRatio(next); }
  }
  private frame() {
    const dt=Math.min(this.clock.getDelta(),.05);this.total+=dt;this.fps=THREE.MathUtils.lerp(this.fps,1/Math.max(dt,.001),.02);
    this.adaptResolution(dt);
    const s=this.model.state;
    if(!this.playing){const a=this.world.groups.amali,c=Math.cos(a.rotation.y),sn=Math.sin(a.rotation.y),ox=8+Math.sin(this.total*.03)*4,oz=30;this.camera.position.set(a.position.x+ox*c+oz*sn,a.position.y+15,a.position.z-ox*sn+oz*c);this.camera.lookAt(a.position.x-2*c+4*sn,a.position.y+3,a.position.z+2*sn+4*c);}
    const zone=this.zone(), underground=zone==='caves';
    const dusk=s.flags.spiritFreed?0:s.flags.manduClue?1:s.flags.coffeeDrunk?.75:0;
    const bg=new THREE.Color(underground?'#101817':s.flags.spiritFreed?'#e2c59b':dusk>.5?'#4b6570':'#c5d4c9');
    (this.scene.background as THREE.Color).lerp(bg,.025);(this.scene.fog as THREE.Fog).color.copy(this.scene.background as THREE.Color);
    (this.scene.fog as THREE.Fog).near=underground?5:this.viewDistance*.3-dusk*60;(this.scene.fog as THREE.Fog).far=underground?55:this.viewDistance-dusk*this.viewDistance*.35;
    this.sun.intensity=underground?.03:3.1-dusk*2.7;this.sky.intensity=underground?.09:2.3-dusk*1.6;
    const dawn=!!s.flags.spiritFreed;const sunOff=dawn?new THREE.Vector3(60,22,40):new THREE.Vector3(-35-dusk*30,55-dusk*35,28);
    this.sun.position.copy(this.camera.position).add(sunOff);this.sun.target.position.copy(this.camera.position);this.sun.color.set(dawn?'#ffc58a':dusk>.5?'#ffd2a8':'#ffe1a6');
    this.skyDome.update(this.camera,sunOff,dusk,dawn,underground,this.total);
    if(this.terrain)this.terrain.visible=!underground;
    const night=underground?0:dusk;BUILDING_UNIFORMS.night.value=night;if(this.world.groups.mandu_day){this.world.groups.mandu_day.visible=night<.5;this.world.groups.mandu_night.visible=night>=.5;}NIGHT.window.emissiveIntensity=night*.55;NIGHT.shopWindow.emissiveIntensity=night*.35;NIGHT.bulb.emissiveIntensity=.25+night*2.2;
    this.flashlight.visible=s.flashlightOn&&s.battery>0&&this.playing;
    // Only the nearest local lights stay on (re-sorted a few times a second); bulbs use emissive
    // materials. Static light positions are cached.
    if(!this.lightPos||this.lightPos.length!==this.world.lights.length)this.lightPos=this.world.lights.map(l=>l.getWorldPosition(new THREE.Vector3()));
    if(this.hudTimer===0||!this.lightOrder.length)this.lightOrder=this.world.lights.map((light,i)=>({light,d:(light.parent===this.world.groups.ghost?light.getWorldPosition(this.temp):this.lightPos![i]).distanceToSquared(this.camera.position)})).sort((a,b)=>a.d-b.d);
    const nearby=this.lightOrder;
    // In daylight above ground lamps hardly show, and every active light costs each pixel; keep two.
    const budget=!underground&&night<.3?2:this.settings.quality==='low'?3:6;
    nearby.forEach(({light},i)=>{light.visible=i<budget;});
    for(const [key,g] of Object.entries(this.world.groups))if(key.startsWith('gate_'))g.visible=!s.flags[key.slice(5)];
    const zi=this.world.groups.zeid_interiors;if(zi)zi.visible=Math.hypot(this.camera.position.x-ZEID.frame.x,this.camera.position.z-ZEID.frame.z)<=90; // the Zeid shops' furnishing is only drawn nearby
    const mark=this.world.groups.light_mark;if(mark)mark.visible=(s.flashlightOn&&s.battery>0)||!!s.flags.lightRevealed;
    // Glowing markers on clues not yet recorded, and seals that light as they are pressed.
    const clues:Record<string,string>={inscription_a:'inscriptionA',inscription_b:'inscriptionB',inscription_c:'inscriptionC',map_a:'mapA',map_b:'mapB',light_mark:'lightRevealed'};
    for(const [id,flag] of Object.entries(clues)){const g=this.world.groups[`clue_${id}`];if(g){g.visible=s.phase===2&&!s.flags[flag];g.rotation.y+=dt*1.5;}}
    const lit=[s.flags.sequenceLamp||s.flags.mechanismSolved,s.flags.sequenceTree||s.flags.mechanismSolved,s.flags.mechanismSolved];
    lit.forEach((on,i)=>{const f=this.world.groups[`seal_${i}`]?.userData.face as THREE.MeshStandardMaterial|undefined;if(f)f.emissiveIntensity+=((on?.9:0)-f.emissiveIntensity)*.1;});
    for(const npc of this.world.npcs){
      if(npc.kind==='walk'&&npc.path){const [a,b]=npc.path,len=Math.hypot(b[0]-a[0],b[2]-a[2])||1;npc.progress=((npc.progress??0)+dt*(npc.speed??1)/len/2)%1;const fwd=npc.progress<.5,t=fwd?npc.progress*2:2-npc.progress*2;npc.object.position.set(a[0]+(b[0]-a[0])*t,a[1]+Math.abs(Math.sin(this.total*6+npc.phase))*.03,a[2]+(b[2]-a[2])*t);npc.object.rotation.y=Math.atan2((b[0]-a[0])*(fwd?1:-1),(b[2]-a[2])*(fwd?1:-1));continue;}
      npc.object.rotation.y+=Math.sin(this.total*.7+npc.phase)*dt*.12;npc.object.position.y=npc.origin.y+Math.sin(this.total*1.4+npc.phase)*.015;}
    if(this.playing&&!this.panel){
      for(let i=0;i<3;i++)this.player.tick(dt/3,s.flags,s.wakefulness,s.intoxication,this.settings.reducedMotion,this.total);
      this.model.tick(dt,this.player.sprinting);this.audio.tick(dt,zone,this.player.moving,this.player.sprinting,s.phase,this.player.driving?this.player.speedKmh:0);this.updateEncounter(dt);
      this.findTarget();this.saveTimer+=dt;if(this.saveTimer>12){this.saveTimer=0;this.save();}
      if(this.previousBrew>0&&s.brewing===0){this.audio.tone(1100,.2,.2);this.ui.toast(this.ui.t('הקפה מוכן ונמצא בתיק. I לשתייה.','Coffee is ready in your bag. Press I to drink.'));}
      if(!this.wasSurvived&&s.encounter.survived){this.ui.toast(this.ui.t('השומר נעצר. חפשו את שלושת הזיכרונות באולם.','The guardian falls still. Find the three memories around the chamber.'));this.save();}
      this.wasSurvived=s.encounter.survived;
    }
    this.previousBrew=s.brewing;
    if (this.playing && this.waypoint && this.route) {
      this.gpsTimer += dt;
      if (this.gpsTimer > .45) {
        this.gpsTimer = 0;
        const px = this.player.car?.group.position.x ?? this.camera.position.x, pz = this.player.car?.group.position.z ?? this.camera.position.z;
        this.route = trimRoute(this.route, px, pz);
        if (Math.hypot(px - this.waypoint.x, pz - this.waypoint.z) < 18) {
          this.ui.toast(this.ui.t(`הגעתם: ${this.ui.text(this.waypoint.name)}`, `Arrived: ${this.ui.text(this.waypoint.name)}`));
          this.clearGps(true);
        }
      }
    }
    this.hudTimer+=dt;if(this.playing&&this.hudTimer>.12){this.hudTimer=0;const labels:Record<string,[string,string]>={town:['טבעון','KIRYAT TIVON'],bengurion:['כיכר בן גוריון','BEN GURION SQUARE'],kiryatamal:['קריית עמל · אלכסנדר זייד','KIRYAT AMAL · ALEXANDER ZAID'],south:['הדרך לבית שערים','THE ROAD TO BEIT SHE’ARIM'],overlook:['אור ראשון בעמק','SUNRISE OVER THE VALLEY'],amali:['עמלי','AMALI'],mandu:['מנדו · קומה ב׳','MANDU · UPSTAIRS'],shop:['בית התוכנה והמחשב','COMPUTER SHOP'],caves:[s.phase===2?'בית שערים · קירוב':'האולם הנסתר · בדיוני',s.phase===2?'BEIT SHE’ARIM · INTERPRETATION':'HIDDEN CHAMBERS · FICTION']};const l=labels[zone];const px=this.player.car?.group.position.x??this.camera.position.x,pz=this.player.car?.group.position.z??this.camera.position.z;this.ui.updateHUD(s,this.player.driving?this.ui.t('E · יציאה מהרכב','E · Exit vehicle'):(this.target?this.target.label[this.ui.lang]:null),this.ui.t(l[0],l[1]),this.fps,s.brewing,!!document.pointerLockElement,s.encounter.active?(1-s.encounter.timer/20)*100:0,s.phase===2?this.model.catacombSteps():null,this.waypoint,this.route?.metres??0,this.player.driving?this.player.speedKmh:0);this.ui.updateMinimap(px,pz,this.player.yaw,zone!=='caves'&&!this.panel,this.route,this.waypoint);}
    this.shadowTick = (this.shadowTick + 1) % 2; this.renderer.shadowMap.needsUpdate = this.shadowTick === 0;
    this.renderer.render(this.scene,this.camera);
  }
}
