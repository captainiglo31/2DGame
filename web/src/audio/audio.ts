// Procedural WebAudio: no audio files needed. Ocean ambience, a slow generative
// pad and short synthesized effects.

type Sfx = 'place' | 'remove' | 'sell' | 'unlock' | 'contract' | 'error' | 'click';

export class Audio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private noise!: AudioBuffer;
  private vacGain: GainNode | null = null;
  private drillGain: GainNode | null = null;
  private waveGain: GainNode | null = null;
  private nextChord = 0;
  private chordIndex = 0;
  private vol = { master: 0.8, sfx: 0.8, music: 0.5 };
  private lastSell = 0;

  /** Must be called from a user gesture (browser autoplay policy). */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.connect(this.master);
    this.applyVolume();

    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      // brown-ish noise
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      d[i] = last * 3.5 + white * 0.15;
    }
    this.vacGain = this.loop(1800, 0.7, this.sfxBus);
    this.drillGain = this.loop(300, 4, this.sfxBus, 'bandpass');
    this.waveGain = this.loop(500, 0.5, this.musicBus);
  }

  private loop(freq: number, q: number, bus: GainNode, type: BiquadFilterType = 'lowpass'): GainNode {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(f).connect(g).connect(bus);
    src.start();
    return g;
  }

  setVolumes(master: number, sfx: number, music: number) {
    this.vol = { master, sfx, music };
    this.applyVolume();
  }

  private applyVolume() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.vol.master, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.vol.sfx, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.vol.music, t, 0.05);
  }

  /** Continuous sounds, called every frame. */
  update(vacuuming: boolean, drilling: boolean, emitting: boolean) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.vacGain?.gain.setTargetAtTime(vacuuming ? 0.22 : emitting ? 0.1 : 0, t, 0.06);
    this.drillGain?.gain.setTargetAtTime(drilling ? 0.35 : 0, t, 0.05);
    // slow ocean swell
    const swell = 0.18 + 0.12 * Math.sin(t * 0.45) + 0.05 * Math.sin(t * 1.3);
    this.waveGain?.gain.setTargetAtTime(swell, t, 0.3);
    if (t > this.nextChord) this.playChord(t);
  }

  private playChord(t: number) {
    const ctx = this.ctx!;
    // A minor pentatonic-ish progression, very soft
    const chords = [
      [220, 261.6, 329.6],
      [196, 246.9, 293.7],
      [174.6, 220, 261.6],
      [196, 261.6, 329.6],
    ];
    const chord = chords[this.chordIndex++ % chords.length];
    for (const f of chord) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f * (Math.random() < 0.3 ? 2 : 1);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.035, t + 2.5);
      g.gain.linearRampToValueAtTime(0, t + 7.5);
      o.connect(g).connect(this.musicBus);
      o.start(t);
      o.stop(t + 8);
    }
    this.nextChord = t + 6.5;
  }

  play(kind: Sfx) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const tone = (freq: number, start: number, dur: number, type: OscillatorType = 'sine', vol = 0.2) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(freq, t + start);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + start);
      g.gain.exponentialRampToValueAtTime(vol, t + start + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + start + dur);
      o.connect(g).connect(this.sfxBus);
      o.start(t + start);
      o.stop(t + start + dur + 0.05);
    };
    switch (kind) {
      case 'click':
        tone(900, 0, 0.05, 'square', 0.05);
        break;
      case 'place':
        tone(420, 0, 0.07, 'square', 0.06);
        break;
      case 'remove':
        tone(200, 0, 0.1, 'sawtooth', 0.06);
        break;
      case 'sell':
        if (t - this.lastSell < 0.25) return;
        this.lastSell = t;
        tone(1318, 0, 0.3, 'sine', 0.08);
        tone(1760, 0.05, 0.3, 'sine', 0.05);
        break;
      case 'error':
        tone(160, 0, 0.18, 'square', 0.08);
        break;
      case 'unlock':
        [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.08, 0.4, 'triangle', 0.12));
        break;
      case 'contract':
        [392, 523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.1, 0.6, 'triangle', 0.14));
        break;
    }
  }
}

export const audio = new Audio();
