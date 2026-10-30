/** Original synthesized ambience. No recordings, remote assets, or sample licenses. */
export class AudioSystem {
  private ctx?: AudioContext; private master?: GainNode;
  private timer = 0; private stepTimer = 0; volume = .35;
  private engine?: OscillatorNode; private engineGain?: GainNode; private engineFilter?: BiquadFilterNode;
  radioOn = false; private radioTimer = 0;
  start() {
    if (!this.ctx) { this.ctx = new AudioContext(); this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination); }
    void this.ctx.resume(); this.master!.gain.value = this.volume * .4;
  }
  setVolume(v: number) { this.volume = v; if (this.master) this.master.gain.value = v * .4; }
  tone(f: number, duration: number, volume = .1, type: OscillatorType = 'sine', endF?: number) {
    if (!this.ctx || !this.master) return;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.value = f;
    if (endF) o.frequency.exponentialRampToValueAtTime(endF, this.ctx.currentTime + duration);
    g.gain.setValueAtTime(0, this.ctx.currentTime); g.gain.linearRampToValueAtTime(volume, this.ctx.currentTime + .015); g.gain.exponentialRampToValueAtTime(.001, this.ctx.currentTime + duration);
    o.connect(g); g.connect(this.master); o.start(); o.stop(this.ctx.currentTime + duration + .02);
  }
  noise(duration: number, level = .1, cutoff = 700) {
    if (!this.ctx || !this.master) return;
    const size = Math.ceil(this.ctx.sampleRate * duration), buffer = this.ctx.createBuffer(1, size, this.ctx.sampleRate);
    const values = buffer.getChannelData(0);
    for (let i = 0; i < size; i++) values[i] = (Math.random() * 2 - 1) * (1 - i / size) ** 2;
    const source = this.ctx.createBufferSource(), filter = this.ctx.createBiquadFilter(), gain = this.ctx.createGain();
    source.buffer = buffer; filter.type = 'lowpass'; filter.frequency.value = cutoff; gain.gain.value = level;
    source.connect(filter); filter.connect(gain); gain.connect(this.master); source.start();
  }
  toggleRadio() { this.radioOn = !this.radioOn; if (this.radioOn) this.start(); return this.radioOn; }
  horn() {
    this.start();
    this.tone(392, .16, .22, 'square');
    window.setTimeout(() => this.tone(311, .26, .18, 'square'), 150);
  }
  private ensureEngine() {
    if (this.engine || !this.ctx || !this.master) return;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain(), f = this.ctx.createBiquadFilter();
    o.type = 'sawtooth'; o.frequency.value = 46; f.type = 'lowpass'; f.frequency.value = 200; g.gain.value = 0;
    o.connect(f); f.connect(g); g.connect(this.master); o.start();
    this.engine = o; this.engineGain = g; this.engineFilter = f;
  }
  tick(dt: number, zone: string, moving: boolean, sprinting: boolean, phase: number, speedKmh = 0, driving = false, handbrake = false, scraping = false) {
    this.timer += dt; this.stepTimer += dt;
    if (driving && this.ctx) {
      this.ensureEngine();
      const t = this.ctx.currentTime;
      this.engine!.frequency.setTargetAtTime(Math.min(210, 40 + speedKmh * .9), t, .06);
      this.engineFilter!.frequency.setTargetAtTime(170 + speedKmh * 7, t, .08);
      this.engineGain!.gain.setTargetAtTime((0.028 + Math.min(.06, speedKmh / 1100)) * this.volume, t, .05);
      if (handbrake && speedKmh > 14 && this.stepTimer > .22) { this.stepTimer = 0; this.noise(.16, .11, 1600); }
      else if (scraping && this.stepTimer > .14) { this.stepTimer = 0; this.noise(.1, .09, 980); }
    } else if (this.engineGain && this.ctx) this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, .08);
    if (!driving && moving && this.stepTimer > (sprinting ? .3 : .48)) { this.stepTimer = 0; this.noise(.1, .16, zone === 'caves' ? 1600 : 650); }
    if (driving && this.radioOn) {
      this.radioTimer += dt;
      if (this.radioTimer > .55) {
        this.radioTimer = 0;
        const scale = [196, 247, 294, 330, 392];
        this.tone(scale[Math.floor(Math.random() * scale.length)], .42, .02, 'triangle');
      }
    }
    if (driving) return;
    if (this.timer < (zone === 'mandu' ? .45 : 2.4)) return;
    this.timer = 0;
    if (zone === 'mandu') {
      const notes = [110, 130.81, 164.81, 146.83]; this.tone(notes[Math.floor(Math.random() * 4)], .25, .14, 'triangle');
      this.noise(.35, .13, 900); this.tone(250 + Math.random() * 160, .18, .035, 'sawtooth');
      if (Math.random() > .7) this.tone(1700, .2, .04);
    } else if (zone === 'caves') {
      this.tone(1200, .3, .025, 'sine', 650);
      if (phase >= 3) { this.noise(.08, .25, 350); setTimeout(() => this.noise(.08, .18, 550), 180); this.tone(49, 1.8, .035); }
    } else {
      this.noise(1.8, .025, 250);
      if (Math.random() > .35) { this.tone(1900 + Math.random() * 500, .15, .035, 'sine', 2900); setTimeout(() => this.tone(2400, .15, .025, 'sine', 1700), 180); }
    }
  }
}
