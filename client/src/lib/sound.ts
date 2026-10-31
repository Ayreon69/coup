// Petits sons synthétisés (Web Audio) : cire, ducats, luth et clavecin, aucun fichier à charger.
import { useStore } from '../store';

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (!useStore.getState().prefs.sound) return null;
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, dur: number, opts: { type?: OscillatorType; gain?: number; delay?: number; slide?: number } = {}): void {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + (opts.delay ?? 0);
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, t0);
  if (opts.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq * opts.slide), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(opts.gain ?? 0.12, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function noise(dur: number, opts: { gain?: number; delay?: number; freq?: number; type?: BiquadFilterType } = {}): void {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + (opts.delay ?? 0);
  const buffer = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 2;
  const src = a.createBufferSource();
  src.buffer = buffer;
  const filter = a.createBiquadFilter();
  filter.type = opts.type ?? 'bandpass';
  filter.frequency.value = opts.freq ?? 2400;
  const g = a.createGain();
  g.gain.value = opts.gain ?? 0.25;
  src.connect(filter).connect(g).connect(a.destination);
  src.start(t0);
}

/** Une corde de luth pincée : une attaque sèche et des harmoniques qui s'éteignent vite. */
function pluck(freq: number, gain = 0.1, delay = 0): void {
  tone(freq, 0.5, { type: 'triangle', gain, delay });
  tone(freq * 2, 0.3, { type: 'sine', gain: gain * 0.45, delay });
  tone(freq * 3, 0.16, { type: 'sine', gain: gain * 0.2, delay });
  noise(0.012, { gain: gain * 0.8, freq: 4200, delay });
}

/** Un ducat d'or qui tinte. */
function clink(delay: number, gain = 0.05): void {
  const f = 2600 + Math.random() * 900;
  tone(f, 0.12, { type: 'triangle', gain, delay });
  tone(f * 1.48, 0.09, { type: 'sine', gain: gain * 0.6, delay: delay + 0.005 });
}

export const sfx = {
  /** Le sceau qu'on presse dans la cire : une prétention. */
  stamp: () => {
    noise(0.16, { gain: 0.8, freq: 220, type: 'lowpass' });
    tone(96, 0.22, { gain: 0.22, slide: 0.6 });
    noise(0.05, { gain: 0.12, freq: 1800, delay: 0.04 });
  },
  coins: (n: number) => {
    for (let i = 0; i < Math.min(Math.max(n, 1), 4); i++) clink(i * 0.075, 0.05);
  },
  /** « Je conteste ! » : une lame qu'on tire. */
  challenge: () => {
    noise(0.4, { gain: 0.32, freq: 5200, type: 'highpass' });
    tone(196, 0.5, { type: 'sawtooth', gain: 0.07, slide: 0.75 });
    tone(294, 0.45, { type: 'sawtooth', gain: 0.05, slide: 0.8, delay: 0.03 });
  },
  /** Un bouclier qu'on lève : un blocage. */
  block: () => {
    tone(520, 0.16, { type: 'square', gain: 0.05 });
    tone(780, 0.12, { type: 'triangle', gain: 0.05, delay: 0.01 });
    noise(0.06, { gain: 0.2, freq: 3000 });
  },
  flip: () => noise(0.07, { gain: 0.3, freq: 3600 }),
  /** Il avait la carte. */
  truth: () => [523, 659, 784].forEach((f, i) => pluck(f, 0.09, i * 0.08)),
  /** Le bluff est démasqué. */
  caught: () => [392, 311, 233].forEach((f, i) => pluck(f, 0.1, i * 0.11)),
  /** Une influence perdue : une cloche grave. */
  toll: () => {
    tone(98, 1.4, { gain: 0.16 });
    tone(98 * 2.76, 0.9, { gain: 0.05 });
    tone(98 * 5.4, 0.5, { gain: 0.02 });
  },
  turn: () => [440, 554, 659].forEach((f, i) => pluck(f, 0.09, i * 0.09)),
  /** Quelqu'un te vise. */
  alarm: () => {
    tone(330, 0.22, { type: 'sawtooth', gain: 0.05 });
    tone(311, 0.3, { type: 'sawtooth', gain: 0.05, delay: 0.16 });
  },
  tick: () => tone(1500, 0.02, { type: 'square', gain: 0.02 }),
  pick: () => tone(620, 0.05, { type: 'triangle', gain: 0.07 }),
  pop: () => tone(700, 0.08, { gain: 0.06, slide: 1.6 }),
  /** Le clavecin du vainqueur. */
  victory: () => [294, 370, 440, 587, 740, 880, 1175].forEach((f, i) => pluck(f, 0.08, i * 0.1)),
  fall: () => [262, 247, 196, 147].forEach((f, i) => pluck(f, 0.09, i * 0.16)),
};
