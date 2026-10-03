import { Capacitor, registerPlugin } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import type { Track } from './engine';

interface Raw { id: string; title: string; artist: string; album: string; added: number; duration: number; uri: string }
const Lib = registerPlugin<{
  scan(): Promise<{ tracks: Raw[] }>;
  cover(o: { uri: string }): Promise<{ data: string }>;
  update(o: { title: string; artist: string; playing: boolean; position: number; duration: number; cover: string }): Promise<void>;
  addListener(name: 'mediaAction', cb: (e: { action: string; position: number }) => void): Promise<PluginListenerHandle>;
}>('MusicLibrary');

export const isNative = Capacitor.isNativePlatform();

const hue = (s: string) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };

export async function scanNative(): Promise<Track[]> {
  const { tracks } = await Lib.scan();
  return tracks.map((r) => ({
    id: `n-${r.id}`,
    title: r.title,
    artist: r.artist || 'Unknown Artist',
    album: r.album || 'Device Files',
    url: Capacitor.convertFileSrc(r.uri),
    uri: r.uri,
    addedAt: r.added,
    duration: r.duration,
    hue: hue(r.title),
    liked: false,
  }));
}

// covers are fetched one at a time so the list never stutters
let queue: Promise<unknown> = Promise.resolve();
const covers = new Map<string, string>();
export function getCover(uri: string): Promise<string> {
  const hit = covers.get(uri);
  if (hit !== undefined) return Promise.resolve(hit);
  const job = queue.then(() => Lib.cover({ uri }).then((r) => r.data).catch(() => '')).then((d) => { covers.set(uri, d); return d; });
  queue = job;
  return job;
}

/** Tell the Android notification / lock screen what is playing. */
export async function pushMedia(t: Track, playing: boolean, position: number, duration: number) {
  const send = (cover: string) => Lib.update({ title: t.title, artist: t.artist, playing, position, duration, cover }).catch(() => undefined);
  const known = t.uri ? covers.get(t.uri) ?? '' : '';
  await send(known);
  if (t.uri && !covers.has(t.uri)) { const c = await getCover(t.uri); if (c) await send(c); }
}

/** Notification / lock-screen / headset button presses. Returns an unsubscribe function. */
export function onMediaAction(cb: (e: { action: string; position: number }) => void) {
  const h = Lib.addListener('mediaAction', cb);
  return () => { void h.then((x) => x.remove()); };
}
