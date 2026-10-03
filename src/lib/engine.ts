// Audio engine: HTMLAudioElement routed through Web Audio analyser.

export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  url: string;
  addedAt: number; // epoch ms — used for chronological sort
  duration: number; // seconds, 0 until known
  hue: number; // cover-art seed
  liked: boolean;
  isDemo?: boolean;
  uri?: string; // native content uri (for cover lookup)
}

type Listener = () => void;

class Engine {
  private audio: HTMLAudioElement;
  private ctx: AudioContext | null = null;
  private analyserNode: AnalyserNode | null = null;
  private freqData: Uint8Array | null = null;
  private listeners = new Set<Listener>();
  currentId: string | null = null;
  playing = false;
  private snapCache = { id: null as string | null, playing: false, time: 0, dur: 0 };

  constructor() {
    this.audio = new Audio();
    this.audio.crossOrigin = 'anonymous';
    this.audio.addEventListener('ended', () => this.emit());
    this.audio.addEventListener('play', () => { this.playing = true; this.emit(); });
    this.audio.addEventListener('pause', () => { this.playing = false; this.emit(); });
    this.audio.addEventListener('timeupdate', () => this.emit());
    this.audio.addEventListener('loadedmetadata', () => this.emit());
  }

  private ensureGraph() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx();
    const src = this.ctx.createMediaElementSource(this.audio);
    this.analyserNode = this.ctx.createAnalyser();
    this.analyserNode.fftSize = 512;
    this.analyserNode.smoothingTimeConstant = 0.82;
    src.connect(this.analyserNode);
    this.analyserNode.connect(this.ctx.destination);
    this.freqData = new Uint8Array(this.analyserNode.frequencyBinCount);
  }

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    this.snapCache = {
      id: this.currentId,
      playing: this.playing,
      time: this.audio.currentTime || 0,
      dur: Number.isFinite(this.audio.duration) ? this.audio.duration : 0,
    };
    this.listeners.forEach((fn) => fn());
  }

  get snapshot() {
    return this.snapCache;
  }

  resume() {
    this.ensureGraph();
    void this.audio.play().catch(() => undefined);
  }

  load(track: Track, autoplay = true) {
    this.ensureGraph();
    this.currentId = track.id;
    this.audio.src = track.url;
    this.audio.load();
    if (autoplay) void this.audio.play().catch(() => undefined);
    this.emit();
  }

  toggle() {
    if (!this.audio.src) return;
    this.ensureGraph();
    if (this.audio.paused) void this.audio.play().catch(() => undefined);
    else this.audio.pause();
  }

  seek(seconds: number) {
    if (Number.isFinite(seconds)) this.audio.currentTime = seconds;
  }

  get time() { return this.audio.currentTime || 0; }
  get duration() { return Number.isFinite(this.audio.duration) ? this.audio.duration : 0; }

  /** Returns 0..1 frequency magnitudes, length n (log-ish spread across bins). */
  getSpectrum(n: number): number[] {
    const out = new Array<number>(n).fill(0);
    if (!this.analyserNode || !this.freqData || this.audio.paused) return out;
    this.analyserNode.getByteFrequencyData(this.freqData as Uint8Array<ArrayBuffer>);
    const bins = this.freqData.length;
    for (let i = 0; i < n; i++) {
      // logarithmic bin mapping feels more musical
      const t = i / n;
      const idx = Math.floor(Math.pow(t, 1.6) * (bins * 0.72)) + 2;
      out[i] = (this.freqData[Math.min(idx, bins - 1)] || 0) / 255;
    }
    return out;
  }
}

export const engine = new Engine();
