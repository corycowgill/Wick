// WebAudio synthesis: sfx, a flame loop, and a generative pentatonic music loop.
// No audio files. The context is created inside the first user gesture (iOS).
let ctx = null;
let master, sfxBus, musicBus, noiseBuf;
let flame = null;
let muted = false;
let musicState = 'off';
let tempoFrac = 1;
let schedTimer = null;
let nextNote = 0, step = 0, bar = 0;
let lastSteam = 0;

const A3 = 220;
const PENTA = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22];   // A minor pentatonic, two octaves
const ROOTS = [0, -4, 3, -2];                          // Am  F  C  G (semitones)
const hz = (semi) => A3 * Math.pow(2, semi / 12);

try { muted = localStorage.getItem('wick.muted') === '1'; } catch { /* storage blocked */ }

function now() { return ctx.currentTime; }

function env(g, t, a, peak, d) {
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}

function tone(type, f0, f1, dur, peak, bus = sfxBus, t = now(), attack = 0.005) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  env(g, t, attack, peak, dur);
  o.connect(g).connect(bus);
  o.start(t);
  o.stop(t + attack + dur + 0.05);
}

function noise(dur, peak, filterType, f0, f1, q = 1, t = now(), bus = sfxBus) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = filterType;
  f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain();
  env(g, t, 0.01, peak, dur);
  src.connect(f).connect(g).connect(bus);
  src.start(t, Math.random());
  src.stop(t + dur + 0.1);
}

function buildFlame() {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.6;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 2400;
  const g = ctx.createGain();
  g.gain.value = 0;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 2.7;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.012;
  lfo.connect(lfoGain).connect(g.gain);
  src.connect(bp).connect(lp).connect(g).connect(sfxBus);
  src.start();
  lfo.start();
  flame = { src, bp, lp, g, lfo, level: 0 };
}

function schedule() {
  if (!ctx || musicState === 'off') return;
  const bpm = musicState === 'title' ? 66 : musicState === 'end' ? 92 : 62 + 44 * tempoFrac;
  const stepDur = 60 / bpm / 2;                          // eighth notes
  while (nextNote < now() + 0.15) {
    const t = Math.max(nextNote, now());
    const root = ROOTS[bar % 4];
    const soft = musicState === 'title' ? 0.7 : 1;
    // bass on beats 1 and 3
    if (step % 4 === 0) tone('triangle', hz(root - 12), hz(root - 12), stepDur * 3, 0.07 * soft, musicBus, t, 0.01);
    // arpeggio: a gentle random walk across the pentatonic scale
    const skip = musicState === 'play' && tempoFrac < 0.3 && step % 2 === 1;
    if (!skip && (step % 8 !== 7 || Math.random() < 0.5)) {
      const deg = Math.floor((Math.sin(bar * 1.7 + step * 0.9) * 0.5 + 0.5) * 6 + (step % 3));
      const semi = PENTA[Math.min(PENTA.length - 1, deg)] + (root % 12 === 0 ? 0 : 0);
      const f = hz(semi + (root > 0 ? 0 : 12) + (musicState === 'end' ? 12 : 0));
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const lp = ctx.createBiquadFilter();
      o.type = 'square';
      o.frequency.setValueAtTime(f, t);
      lp.type = 'lowpass';
      lp.frequency.value = 900 + 900 * tempoFrac;
      env(g, t, 0.012, 0.03 * soft, stepDur * 1.6);
      o.connect(lp).connect(g).connect(musicBus);
      o.start(t);
      o.stop(t + stepDur * 2);
    }
    nextNote = t + stepDur;
    step++;
    if (step % 8 === 0) bar++;
  }
}

export const Audio = {
  get ready() { return !!ctx; },
  get muted() { return muted; },

  // Call from inside a user gesture handler.
  init() {
    if (ctx) { this.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 4;
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.8;
    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.9;
    musicBus = ctx.createGain(); musicBus.gain.value = 0.7;
    sfxBus.connect(comp); musicBus.connect(comp);
    comp.connect(master).connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // unlock iOS with a silent blip
    const b = ctx.createBufferSource();
    b.buffer = ctx.createBuffer(1, 1, 22050);
    b.connect(ctx.destination);
    b.start(0);
    buildFlame();
    nextNote = now();
    schedTimer = setInterval(schedule, 40);
  },

  resume() { if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {}); },
  suspend() { if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {}); },

  setMuted(m) {
    muted = m;
    try { localStorage.setItem('wick.muted', m ? '1' : '0'); } catch { /* ignore */ }
    if (master) master.gain.setTargetAtTime(m ? 0 : 0.8, now(), 0.05);
  },
  toggleMute() { this.setMuted(!muted); return muted; },

  // Continuous flame loop: pitch and level drop as wax drops.
  setFlame(frac, active = true) {
    if (!flame) return;
    const t = now();
    const level = active ? 0.03 + 0.05 * frac : 0;
    flame.g.gain.setTargetAtTime(level, t, 0.15);
    flame.bp.frequency.setTargetAtTime(380 + 900 * frac, t, 0.2);
    flame.lfo.frequency.setTargetAtTime(1.5 + 3 * frac, t, 0.3);
  },

  setTempo(frac) { tempoFrac = Math.max(0, Math.min(1, frac)); },

  music(state) {
    if (state === musicState) return;
    musicState = state;
    if (ctx) nextNote = now() + 0.05;
    step = 0;
  },

  sfx(name, opts = {}) {
    if (!ctx || muted) return;
    const t = now();
    const frac = opts.frac ?? 0.7;
    switch (name) {
      case 'jump':
        tone('triangle', 260 + 320 * frac, (260 + 320 * frac) * 1.6, 0.13, 0.16);
        break;
      case 'land':
        tone('sine', 140, 55, 0.12, 0.12 + 0.2 * (opts.hard ?? 0.3));
        noise(0.08, 0.05 + 0.06 * (opts.hard ?? 0.3), 'lowpass', 900, 200);
        break;
      case 'drip':
        tone('sine', 520, 170, 0.14, 0.22);
        tone('sine', 300, 120, 0.1, 0.1, sfxBus, t + 0.07);
        break;
      case 'dripFail':
        tone('square', 150, 110, 0.07, 0.05);
        break;
      case 'reabsorb':
        tone('sine', 180, 620, 0.22, 0.14);
        break;
      case 'relight':
        noise(0.55, 0.2, 'bandpass', 250, 3200, 1.2);
        [261.6, 329.6, 392, 523.3].forEach((f, i) => tone('triangle', f, f, 1.4, 0.07, sfxBus, t + 0.12 + i * 0.07, 0.02));
        break;
      case 'pickup':
        tone('sine', 660, 660, 0.18, 0.12);
        tone('sine', 990, 990, 0.3, 0.1, sfxBus, t + 0.08);
        break;
      case 'extinguish':
        noise(0.5, 0.3, 'highpass', 400, 7000, 0.8);
        tone('sine', 400, 90, 0.4, 0.08);
        break;
      case 'burnout':
        tone('sine', 330, 70, 0.9, 0.16);
        noise(0.6, 0.06, 'lowpass', 1200, 150);
        break;
      case 'ignite':
        noise(0.18, 0.1, 'bandpass', 1800, 2600, 2);
        break;
      case 'melt':
        tone('sine', 220, 120, 0.25, 0.05);
        break;
      case 'steam':
        if (t - lastSteam < 0.12) return;
        lastSteam = t;
        noise(0.12, 0.05, 'highpass', 3500, 5000);
        break;
      case 'complete':
        [0, 3, 7, 12, 15, 19].forEach((s, i) => tone('triangle', hz(s + 12), hz(s + 12), 0.9, 0.08, sfxBus, t + i * 0.09, 0.01));
        noise(0.9, 0.12, 'bandpass', 200, 2400, 0.8);
        break;
      case 'menu':
        tone('triangle', 520, 520, 0.06, 0.07);
        break;
      case 'select':
        tone('triangle', 520, 780, 0.12, 0.1);
        break;
    }
  },
};
