import { mulberry32 } from '../sim/rng';

/**
 * All the game's sound, made in the browser (no files): the sea, rain and birds; short effects
 * for building, pulling down, quests and warnings; and quiet plucked music in D Dorian.
 * Browsers only let audio start after a click or key, so it wakes on the first one.
 */
export function createSound() {
  let ctx: AudioContext | null = null;
  let master: GainNode;
  let sfx: GainNode;
  let music: GainNode;
  let noise: AudioBuffer;
  let sea: GainNode;
  let rain: GainNode;
  let fxOn = true;
  let musicOn = true;

  const wake = () => {
    if (ctx) return void ctx.resume();
    ctx = new AudioContext();
    master = new GainNode(ctx, { gain: 0.8 });
    master.connect(ctx.destination);
    sfx = new GainNode(ctx, { gain: fxOn ? 1 : 0 });
    music = new GainNode(ctx, { gain: musicOn ? 0.32 : 0 });
    sfx.connect(master);
    music.connect(master);
    // Two seconds of white noise, looped and filtered into sea and rain.
    noise = new AudioBuffer({ length: ctx.sampleRate * 2, sampleRate: ctx.sampleRate });
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const loop = (type: BiquadFilterType, frequency: number, gain: number) => {
      const src = new AudioBufferSourceNode(ctx!, { buffer: noise, loop: true });
      const g = new GainNode(ctx!, { gain });
      src.connect(new BiquadFilterNode(ctx!, { type, frequency })).connect(g).connect(sfx);
      src.start();
      return g;
    };
    // The sea: low rumble swelling slowly, like waves on the shore.
    sea = loop('lowpass', 420, 0.05);
    const swell = new OscillatorNode(ctx, { frequency: 0.13 });
    swell.connect(new GainNode(ctx, { gain: 0.03 })).connect(sea.gain);
    swell.start();
    rain = loop('highpass', 2500, 0);
    nextBar = ctx.currentTime + 0.5;
  };
  addEventListener('pointerdown', wake);
  addEventListener('keydown', wake);

  /** A tone: `type` wave at `f` Hz (gliding to `to`), quick attack, decaying over `len` s. */
  const tone = (f: number, len: number, vol: number, type: OscillatorType = 'sine', at = 0, to = f, out = sfx) => {
    if (!ctx) return;
    const t = ctx.currentTime + at;
    const o = new OscillatorNode(ctx, { type, frequency: f });
    o.frequency.exponentialRampToValueAtTime(to, t + len);
    const g = new GainNode(ctx, { gain: 0 });
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + len + 0.05);
  };
  /** A burst of filtered noise: thuds, scrapes and crumbling. */
  const hiss = (len: number, vol: number, from: number, to: number, at = 0) => {
    if (!ctx) return;
    const t = ctx.currentTime + at;
    const src = new AudioBufferSourceNode(ctx, { buffer: noise });
    const f = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: from });
    f.frequency.exponentialRampToValueAtTime(to, t + len);
    const g = new GainNode(ctx, { gain: vol });
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(f).connect(g).connect(sfx);
    src.start(t, Math.random());
    src.stop(t + len);
  };
  /** A plucked string: a bright triangle note fading fast, softened by a lowpass. */
  const pluck = (f: number, at: number, vol: number, len = 1.2, out = sfx) => {
    if (!ctx) return;
    const t = at;
    const o = new OscillatorNode(ctx, { type: 'triangle', frequency: f });
    const lp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: f * 4 });
    lp.frequency.exponentialRampToValueAtTime(f * 1.2, t + len);
    const g = new GainNode(ctx, { gain: 0 });
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(lp).connect(g).connect(out);
    o.start(t);
    o.stop(t + len + 0.05);
  };

  // Music: D Dorian, a bar every 3 s at 80 bpm, a chord under a melody walking the scale.
  const SCALE = [0, 2, 3, 5, 7, 9, 10];
  const hz = (semis: number) => 293.66 * 2 ** (semis / 12);
  /** Chords as scale degrees: Dm, C, G, Dm (i, VII, IV, i). */
  const CHORDS = [0, 6, 3, 0];
  const BAR = 3;
  let nextBar = 0;
  let bar = 0;
  const degree = (d: number) => SCALE[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7);
  /** Melody of one bar: four beats, phrases repeating as A A B A over sixteen bars. */
  const phrase = (n: number) => {
    const r = mulberry32([1, 1, 2, 1][Math.floor(n / 4) % 4] * 100 + (n % 4));
    let d = CHORDS[n % 4] + 7;
    return [0, 1, 2, 3].map(() => {
      d += Math.floor(r() * 5) - 2;
      return r() < 0.2 ? null : d;
    });
  };
  const schedule = () => {
    if (!ctx || !musicOn) return;
    while (nextBar < ctx.currentTime + 1) {
      const chord = CHORDS[bar % 4];
      // A low drone of root and fifth, then the chord spread lightly over the bar.
      pluck(hz(degree(chord) - 24), nextBar, 0.25, BAR, music);
      pluck(hz(degree(chord + 4) - 24), nextBar + 0.02, 0.15, BAR, music);
      [0, 2, 4].forEach((k, i) => pluck(hz(degree(chord + k) - 12), nextBar + i * 0.06, 0.1, 1.6, music));
      phrase(bar).forEach((d, beat) => d !== null && pluck(hz(degree(d)), nextBar + (beat * BAR) / 4, 0.16, 1, music));
      nextBar += BAR;
      bar++;
    }
  };

  let birdIn = 3;
  return {
    setEnabled(effects: boolean, tunes: boolean) {
      [fxOn, musicOn] = [effects, tunes];
      if (!ctx) return;
      sfx.gain.setTargetAtTime(fxOn ? 1 : 0, ctx.currentTime, 0.1);
      music.gain.setTargetAtTime(musicOn ? 0.32 : 0, ctx.currentTime, 0.1);
      if (musicOn) nextBar = Math.max(nextBar, ctx.currentTime + 0.2);
    },
    /** Each frame: rain's hiss, birds by day, the music kept scheduled a second ahead. */
    update(dt: number, rainAmount: number, day: boolean) {
      if (!ctx) return;
      rain.gain.setTargetAtTime(rainAmount * 0.12, ctx.currentTime, 0.5);
      sea.gain.setTargetAtTime(0.05, ctx.currentTime, 0.5);
      birdIn -= dt;
      if (birdIn <= 0) {
        birdIn = 4 + Math.random() * 8;
        if (day && rainAmount < 0.3)
          for (let k = 0; k < 2 + Math.floor(Math.random() * 3); k++) {
            const f = 2400 + Math.random() * 1600;
            tone(f, 0.09, 0.025, 'sine', k * 0.13, f * 1.4);
          }
      }
      schedule();
    },
    click: () => tone(1200, 0.05, 0.05, 'triangle', 0, 900),
    build() {
      tone(140, 0.35, 0.25, 'sine', 0, 60);
      hiss(0.25, 0.25, 900, 200);
      tone(220, 0.15, 0.08, 'square', 0.12, 180);
    },
    road: () => hiss(0.18, 0.12, 1800, 500),
    demolish() {
      hiss(0.9, 0.35, 1400, 120);
      tone(90, 0.6, 0.2, 'sine', 0, 40);
    },
    /** Quest done: a rising arpeggio on the lute. */
    fanfare() {
      if (!ctx) return;
      [0, 4, 7, 12].forEach((s, i) => pluck(hz(s + 5), ctx!.currentTime + i * 0.11, 0.22, 1.4));
    },
    warn() {
      tone(520, 0.22, 0.09, 'triangle');
      tone(390, 0.3, 0.09, 'triangle', 0.18);
    },
  };
}
