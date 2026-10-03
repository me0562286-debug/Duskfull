// Procedurally synthesized demo tracks (rendered offline to WAV blobs),
// so the player is alive before the user adds their own files.

import type { Track } from './engine';

function wavFromBuffer(buf: AudioBuffer): Blob {
  const ch = buf.numberOfChannels;
  const len = buf.length * ch * 2 + 44;
  const out = new DataView(new ArrayBuffer(len));
  const writeStr = (o: number, s: string) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
  writeStr(0, 'RIFF'); out.setUint32(4, len - 8, true); writeStr(8, 'WAVEfmt ');
  out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, ch, true);
  out.setUint32(24, buf.sampleRate, true); out.setUint32(28, buf.sampleRate * ch * 2, true);
  out.setUint16(32, ch * 2, true); out.setUint16(34, 16, true);
  writeStr(36, 'data'); out.setUint32(40, len - 44, true);
  let o = 44;
  for (let i = 0; i < buf.length; i++) {
    for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, buf.getChannelData(c)[i]));
      out.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
  }
  return new Blob([out.buffer], { type: 'audio/wav' });
}

const SCALES: Record<string, number[]> = {
  dusk: [0, 3, 5, 7, 10], // minor pentatonic
  ember: [0, 2, 4, 7, 9], // major pentatonic
  nebula: [0, 2, 3, 7, 8], // hirajoshi
};
const midi = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

interface DemoSpec {
  title: string; artist: string; album: string;
  root: number; bpm: number; bars: number; scale: keyof typeof SCALES;
  hue: number; seed: number; pad: number[]; // pad chord offsets
}

const SPECS: DemoSpec[] = [
  { title: 'Amber Horizon', artist: 'Duskfall Ensemble', album: 'Twilight Studies', root: 57, bpm: 72, bars: 16, scale: 'dusk', hue: 36, seed: 7, pad: [0, 3, 7, 14] },
  { title: 'First Stars', artist: 'Duskfall Ensemble', album: 'Twilight Studies', root: 55, bpm: 80, bars: 16, scale: 'nebula', hue: 262, seed: 21, pad: [0, 7, 10, 15] },
  { title: 'Violet Hour', artist: 'Nadir', album: 'Afterglow', root: 60, bpm: 66, bars: 16, scale: 'dusk', hue: 288, seed: 4, pad: [0, 5, 10, 12] },
  { title: 'Ember Drift', artist: 'Nadir', album: 'Afterglow', root: 62, bpm: 92, bars: 16, scale: 'ember', hue: 16, seed: 13, pad: [0, 4, 7, 11] },
];

function mulberry(seed: number) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function render(spec: DemoSpec): Promise<{ blob: Blob; duration: number }> {
  const sr = 22050;
  const beat = 60 / spec.bpm;
  const barLen = beat * 4;
  const total = spec.bars * barLen + 2.5;
  const ctx = new OfflineAudioContext(2, Math.ceil(sr * total), sr);
  const rand = mulberry(spec.seed * 1000 + 17);
  const scale = SCALES[spec.scale];

  const master = ctx.createGain();
  master.gain.value = 0.55;
  const verb = ctx.createDelay(0.6);
  verb.delayTime.value = beat * 0.75;
  const fb = ctx.createGain(); fb.gain.value = 0.32;
  const wet = ctx.createGain(); wet.gain.value = 0.3;
  verb.connect(fb); fb.connect(verb); verb.connect(wet); wet.connect(master);
  master.connect(ctx.destination);

  // pad: detuned triangle chord, one per 2 bars
  for (let b = 0; b < spec.bars; b += 2) {
    const t0 = b * barLen;
    for (const off of spec.pad) {
      for (const det of [-4, 3]) {
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = midi(spec.root - 12 + off);
        o.detune.value = det;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t0);
        g.gain.linearRampToValueAtTime(0.05, t0 + barLen * 0.6);
        g.gain.linearRampToValueAtTime(0.0, t0 + barLen * 2.1);
        o.connect(g); g.connect(master); g.connect(verb);
        o.start(t0); o.stop(t0 + barLen * 2.2);
      }
    }
  }

  // melody: wandering pentatonic plucks (sine with fast decay)
  let deg = 2;
  for (let s = 0; s < spec.bars * 4; s++) {
    const t0 = s * beat;
    if (rand() < 0.28) continue; // rests
    deg += Math.floor(rand() * 5) - 2;
    deg = Math.max(0, Math.min(9, deg));
    const oct = Math.floor(deg / scale.length);
    const note = spec.root + 12 + scale[deg % scale.length] + oct * 12;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = midi(note);
    const o2 = ctx.createOscillator();
    o2.type = 'triangle';
    o2.frequency.value = midi(note) * 2.001;
    const g = ctx.createGain();
    const v = 0.16 + rand() * 0.1;
    g.gain.setValueAtTime(v, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + beat * (1.2 + rand() * 1.6));
    o.connect(g); const g2 = ctx.createGain(); g2.gain.value = 0.18; o2.connect(g2); g2.connect(g);
    g.connect(master); g.connect(verb);
    o.start(t0); o.stop(t0 + beat * 3); o2.start(t0); o2.stop(t0 + beat * 3);
  }

  // soft sub pulse on beat 1
  for (let b = 0; b < spec.bars; b++) {
    const t0 = b * barLen;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(midi(spec.root - 24), t0);
    o.frequency.exponentialRampToValueAtTime(midi(spec.root - 24) * 0.99, t0 + beat);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.22, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + beat * 1.4);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + beat * 1.6);
  }

  const buf = await ctx.startRendering();
  return { blob: wavFromBuffer(buf), duration: buf.duration };
}

/** Renders demo tracks (once) and returns Track objects, dated oldest → newest. */
export async function makeDemoTracks(): Promise<Track[]> {
  const now = Date.now();
  const day = 86400_000;
  const ages = [210, 96, 41, 9]; // days old, ascending dates
  const out: Track[] = [];
  for (let i = 0; i < SPECS.length; i++) {
    const spec = SPECS[i];
    try {
      const { blob, duration } = await render(spec);
      out.push({
        id: `demo-${i}`,
        title: spec.title,
        artist: spec.artist,
        album: spec.album,
        url: URL.createObjectURL(blob),
        addedAt: now - ages[i] * day,
        duration,
        hue: spec.hue,
        liked: i === 0,
        isDemo: true,
      });
    } catch {
      // offline rendering unsupported — skip
    }
  }
  return out;
}
