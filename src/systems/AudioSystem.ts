/** Original synthesized ambience. No recordings, remote assets, or sample licenses. */
export class AudioSystem {
  private ctx?: AudioContext; private master?: GainNode;
  private timer = 0; private stepTimer = 0; volume = .35;
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
  tick(dt: number, zone: string, moving: boolean, sprinting: boolean, phase: number, speedKmh = 0) {
    this.timer += dt; this.stepTimer += dt;
    if (speedKmh > 2) {
      if (this.stepTimer > .12) {
        this.stepTimer = 0;
        const f = 55 + speedKmh * 1.8;
        this.tone(f, .14, .04 + Math.min(.08, speedKmh / 400), 'sawtooth', f * 1.05);
        this.noise(.1, .04 + speedKmh / 800, 280 + speedKmh * 4);
      }
      return;
    }
    if (moving && this.stepTimer > (sprinting ? .3 : .48)) { this.stepTimer = 0; this.noise(.1, .16, zone === 'caves' ? 1600 : 650); }
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
