import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, Repeat1, Heart,
  ChevronDown, LibraryBig, Search, Plus, ArrowDownUp, Music2, ListMusic, X, ListPlus, Trash2, Check,
} from 'lucide-react';
import Backdrop from '@/components/Backdrop';
import CoverOrb, { coverStyle } from '@/components/CoverOrb';
import WaveSeek from '@/components/WaveSeek';
import { engine, type Track } from '@/lib/engine';
import { makeDemoTracks } from '@/lib/demoTracks';
import CoverArt from '@/components/CoverArt';
import { isNative, scanNative, pushMedia, onMediaAction } from '@/lib/native';

type SortDir = 'oldest' | 'newest';
type Tab = 'songs' | 'albums' | 'artists' | 'liked' | 'lists';
interface Playlist { id: string; name: string; ids: string[] }
const load = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : d; } catch { return d; } };
type RepeatMode = 'off' | 'all' | 'one';

const fmt = (s: number) => {
  if (!Number.isFinite(s) || s <= 0) return '0:00';
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
};
const fmtDate = (t: number) =>
  new Date(t).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

function useEngine() {
  return useSyncExternalStore(
    (cb) => engine.subscribe(cb),
    () => engine.snapshot,
  );
}

export default function App() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'library' | 'player'>('library');
  const [tab, setTab] = useState<Tab>('songs');
  const [sortDir, setSortDir] = useState<SortDir>('oldest');
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>('off');
  const [queueOpen, setQueueOpen] = useState(false);
  const snap = useEngine();
  const fileRef = useRef<HTMLInputElement>(null);
  const [liked, setLiked] = useState<Set<string>>(() => new Set(load<string[]>('df-liked', [])));
  const [playlists, setPlaylists] = useState<Playlist[]>(() => load<Playlist[]>('df-lists', []));
  const [queueIds, setQueueIds] = useState<string[] | null>(null);
  const [addFor, setAddFor] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  useEffect(() => { try { localStorage.setItem('df-liked', JSON.stringify([...liked])); } catch { /* ignore */ } }, [liked]);
  useEffect(() => { try { localStorage.setItem('df-lists', JSON.stringify(playlists)); } catch { /* ignore */ } }, [playlists]);

  // boot: synthesize demo constellation
  useEffect(() => {
    if (isNative) {
      const scan = () => scanNative()
        .then((t) => setTracks((prev) => [...t, ...prev.filter((p) => p.url.startsWith('blob:'))]))
        .catch(() => undefined)
        .finally(() => setLoading(false));
      void scan();
      const onVis = () => { if (!document.hidden) void scan(); };
      document.addEventListener('visibilitychange', onVis);
      const iv = window.setInterval(() => { if (!document.hidden) void scan(); }, 15000);
      return () => { document.removeEventListener('visibilitychange', onVis); clearInterval(iv); };
    }
    makeDemoTracks().then(setTracks).catch(() => undefined).finally(() => setLoading(false));
  }, []);

  // chronological ordering — oldest → newest by default
  const ordered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = tracks.filter(
      (t) => !q || t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q) || t.album.toLowerCase().includes(q),
    );
    list = [...list].sort((a, b) => (sortDir === 'oldest' ? a.addedAt - b.addedAt : b.addedAt - a.addedAt));
    return list;
  }, [tracks, sortDir, query]);

  const current = tracks.find((t) => t.id === snap.id) ?? null;

  const shown = tab === 'liked' ? ordered.filter((t) => liked.has(t.id)) : ordered;
  const queue = useMemo(
    () => (queueIds ? (queueIds.map((id) => tracks.find((t) => t.id === id)).filter(Boolean) as Track[]) : ordered),
    [queueIds, tracks, ordered],
  );

  const playAt = (track: Track, list?: Track[]) => {
    setQueueIds(list ? list.map((t) => t.id) : null);
    engine.load(track, true);
    setView('player');
  };

  const stepTrack = (dir: 1 | -1) => {
    if (!queue.length) return;
    if (shuffle && queue.length > 1) {
      let next = current;
      while (next === current) next = queue[Math.floor(Math.random() * queue.length)];
      if (next) engine.load(next, true);
      return;
    }
    const idx = queue.findIndex((t) => t.id === engine.currentId);
    const next = queue[(idx + dir + queue.length) % queue.length] ?? queue[0];
    engine.load(next, true);
  };

  // auto-advance on track end
  useEffect(() => {
    const unsub = engine.subscribe(() => {
      const ended = !engine.playing && engine.duration > 0 && Math.abs(engine.time - engine.duration) < 0.3;
      if (!ended) return;
      if (repeat === 'one') {
        engine.seek(0);
        engine.resume();
        return;
      }
      const idx = queue.findIndex((t) => t.id === engine.currentId);
      if (repeat === 'off' && !shuffle && idx === queue.length - 1) return;
      stepTrack(1);
    });
    return () => { unsub(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue, repeat, shuffle]);

  // Android notification / lock screen / headset buttons
  const stepRef = useRef(stepTrack);
  stepRef.current = stepTrack;
  useEffect(() => {
    if (!isNative) return;
    return onMediaAction(({ action, position }) => {
      if (action === 'prev') stepRef.current(-1);
      else if (action === 'next') stepRef.current(1);
      else if (action === 'toggle') engine.toggle();
      else if (action === 'play') engine.resume();
      else if (action === 'pause') { if (engine.playing) engine.toggle(); }
      else if (action === 'seek') engine.seek(position);
    });
  }, []);
  useEffect(() => {
    if (isNative && current) void pushMedia(current, snap.playing, engine.time, engine.duration || current.duration);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap.id, snap.playing, snap.dur > 0]);

  const addFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const added: Track[] = Array.from(files)
      .filter((f) => f.type.startsWith('audio') || /\.(mp3|wav|ogg|m4a|flac|aac|opus)$/i.test(f.name))
      .map((f, i) => ({
        id: `file-${f.lastModified}-${i}-${f.name}`,
        title: f.name.replace(/\.[^.]+$/, ''),
        artist: 'Unknown Artist',
        album: 'Device Files',
        url: URL.createObjectURL(f),
        addedAt: f.lastModified || Date.now(),
        duration: 0,
        hue: Math.floor(Math.random() * 360),
        liked: false,
      }));
    if (added.length) setTracks((prev) => [...prev, ...added]);
  };

  const toggleLike = (id: string) => {
    setLiked((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const createList = (name: string, firstId?: string) => {
    const n = name.trim();
    if (!n) return;
    setPlaylists((p) => [...p, { id: `pl-${Date.now()}`, name: n, ids: firstId ? [firstId] : [] }]);
  };
  const toggleInList = (listId: string, trackId: string) =>
    setPlaylists((p) => p.map((l) => (l.id !== listId ? l : { ...l, ids: l.ids.includes(trackId) ? l.ids.filter((i) => i !== trackId) : [...l.ids, trackId] })));
  const deleteList = (id: string) => setPlaylists((p) => p.filter((l) => l.id !== id));

  const grouped = useMemo(() => {
    if (tab === 'songs' || tab === 'liked' || tab === 'lists') return null;
    const key = tab === 'albums' ? 'album' : 'artist';
    const map = new Map<string, Track[]>();
    for (const t of ordered) {
      const k = t[key];
      map.set(k, [...(map.get(k) ?? []), t]);
    }
    return [...map.entries()].sort((a, b) =>
      sortDir === 'oldest'
        ? Math.min(...a[1].map((t) => t.addedAt)) - Math.min(...b[1].map((t) => t.addedAt))
        : Math.max(...b[1].map((t) => t.addedAt)) - Math.max(...a[1].map((t) => t.addedAt)),
    );
  }, [tab, ordered, sortDir]);

  return (
    <div className="relative min-h-dvh overflow-hidden font-sans text-[#e9e7ff]">
      <Backdrop />

      {/* app shell: centered phone-column */}
      <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pb-28 pt-6 sm:px-0">

        {/* header */}
        <header className="mb-5 flex items-end justify-between px-1">
          <div>
            <p className="text-[11px] uppercase tracking-[0.4em] text-[#c4c3ff]/70">dusk → night</p>
            <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight bg-clip-text text-transparent bg-[linear-gradient(120deg,#eddccf,#f6c944_45%,#c4c3ff)]">
              Duskfall
            </h1>
          </div>
          <div className="flex gap-2">
            <GlassButton onClick={() => setSearchOpen((v) => !v)} label="Search">
              {searchOpen ? <X size={18} /> : <Search size={18} />}
            </GlassButton>
            <GlassButton onClick={() => fileRef.current?.click()} label="Add files">
              <Plus size={18} />
            </GlassButton>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="audio/*,.mp3,.wav,.ogg,.m4a,.flac,.aac,.opus"
            multiple
            className="hidden"
            onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
          />
        </header>

        {searchOpen && (
          <div className="glass mb-4 flex items-center gap-2 rounded-2xl px-4 py-2.5">
            <Search size={16} className="text-[#c4c3ff]/60" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search the night…"
              className="w-full bg-transparent text-sm outline-none placeholder:text-[#c4c3ff]/40"
            />
          </div>
        )}

        {view === 'library' ? (
          <>
            {/* tabs + sort */}
            <div className="mb-4 flex items-center justify-between gap-2">
              <div className="glass flex min-w-0 overflow-x-auto rounded-full p-1">
                {(['songs', 'albums', 'artists', 'liked', 'lists'] as Tab[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.12em] transition-all duration-300 ${
                      tab === t
                        ? 'bg-[#f6c944]/90 text-[#231b33] shadow-[0_0_20px_rgba(246,201,68,0.35)]'
                        : 'text-[#c4c3ff]/70 hover:text-[#e9e7ff]'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <GlassButton
                label="Toggle chronological order"
                onClick={() => setSortDir((d) => (d === 'oldest' ? 'newest' : 'oldest'))}
              >
                <ArrowDownUp size={16} />
              </GlassButton>
            </div>

            <p className="mb-3 px-1 text-[11px] uppercase tracking-[0.3em] text-[#c4c3ff]/50">
              {sortDir === 'oldest' ? 'oldest → newest' : 'newest → oldest'} · {ordered.length} tracks
            </p>

            {/* shuffle banner */}
            <button
              onClick={() => {
                if (!ordered.length) return;
                setShuffle(true);
                playAt(ordered[Math.floor(Math.random() * ordered.length)]);
              }}
              className="glass-strong mb-5 flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-medium tracking-wide text-[#231b33] transition-transform active:scale-[0.98]"
            >
              <Shuffle size={16} /> Shuffle the sky
            </button>

            {loading ? (
              <p className="mt-16 text-center text-sm text-[#c4c3ff]/60">Composing the twilight…</p>
            ) : tab === 'lists' ? (
              <PlaylistsView
                playlists={playlists} tracks={tracks} liked={liked} snap={snap}
                onPlay={playAt} onCreate={(n) => createList(n)} onDelete={deleteList}
                onRemove={toggleInList} onLike={toggleLike}
              />
            ) : tab === 'songs' || tab === 'liked' ? (
              <ul className="flex flex-col gap-2">
                {shown.map((t, i) => (
                  <SongRow
                    key={t.id}
                    track={t}
                    index={i}
                    active={t.id === snap.id}
                    playing={t.id === snap.id && snap.playing}
                    liked={liked.has(t.id)}
                    onPlay={() => playAt(t, tab === 'liked' ? shown : undefined)}
                    onLike={() => toggleLike(t.id)}
                    onAction={() => setAddFor(t.id)}
                    actionIcon={<ListPlus size={16} />}
                    actionLabel="Add to playlist"
                  />
                ))}
                {!shown.length && (tab === 'liked' ? (
                  <p className="mt-12 text-center text-sm text-[#c4c3ff]/60">Tap the heart on a song and it will appear here.</p>
                ) : (
                  <EmptyState onAdd={() => fileRef.current?.click()} />
                ))}
              </ul>
            ) : (
              <div className="flex flex-col gap-3">
                {grouped!.map(([name, ts]) => (
                  <button
                    key={name}
                    onClick={() => playAt(ts[0])}
                    className="glass flex items-center gap-4 rounded-3xl p-4 text-left transition-transform active:scale-[0.98]"
                  >
                    <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-2xl ring-1 ring-white/20" style={coverStyle(ts[0].hue)}><CoverArt track={ts[0]} className="absolute inset-0 h-full w-full" /></div>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{name}</p>
                      <p className="text-xs text-[#c4c3ff]/60">
                        {ts.length} track{ts.length > 1 ? 's' : ''} · since {fmtDate(Math.min(...ts.map((t) => t.addedAt)))}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          current && (
            <NowPlaying
              track={current}
              snap={snap}
              shuffle={shuffle}
              repeat={repeat}
              liked={liked.has(current.id)}
              onBack={() => setView('library')}
              onToggle={() => engine.toggle()}
              onPrev={() => stepTrack(-1)}
              onNext={() => stepTrack(1)}
              onShuffle={() => setShuffle((v) => !v)}
              onRepeat={() => setRepeat((m) => (m === 'off' ? 'all' : m === 'all' ? 'one' : 'off'))}
              onLike={() => toggleLike(current.id)}
              onQueue={() => setQueueOpen(true)}
              onSeek={(p) => engine.seek(p * (engine.duration || current.duration))}
            />
          )
        )}
      </div>

      {/* mini player */}
      {current && view === 'library' && (
        <button
          onClick={() => setView('player')}
          className="glass fixed inset-x-0 bottom-4 z-20 mx-auto flex w-[calc(100%-2rem)] max-w-md items-center gap-3 rounded-3xl p-3 text-left shadow-[0_20px_60px_-10px_rgba(0,0,0,0.7)]"
        >
          <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-2xl ring-1 ring-white/20" style={coverStyle(current.hue)}><CoverArt track={current} className="absolute inset-0 h-full w-full" /></div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{current.title}</p>
            <p className="truncate text-xs text-[#c4c3ff]/60">{current.artist}</p>
          </div>
          <span
            onClick={(e) => { e.stopPropagation(); engine.toggle(); }}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f6c944] text-[#231b33] shadow-[0_0_18px_rgba(246,201,68,0.45)]"
          >
            {snap.playing ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
          </span>
          <span
            onClick={(e) => { e.stopPropagation(); stepTrack(1); }}
            className="flex h-10 w-10 items-center justify-center rounded-full text-[#c4c3ff]/80"
          >
            <SkipForward size={16} />
          </span>
        </button>
      )}

      {/* queue drawer */}
      {addFor && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/60" onClick={() => setAddFor(null)}>
          <div className="mx-auto w-full max-w-md rounded-t-3xl border border-white/10 bg-[#120d2b]/95 p-5 backdrop-blur-xl" onClick={(e) => e.stopPropagation()}>
            <p className="mb-3 text-xs uppercase tracking-[0.25em] text-[#c4c3ff]/60">Add to playlist</p>
            <div className="mb-3 flex max-h-60 flex-col gap-1 overflow-y-auto">
              {playlists.map((l) => (
                <button key={l.id} onClick={() => toggleInList(l.id, addFor)} className="flex items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm active:bg-white/10">
                  <span className="truncate">{l.name}</span>
                  {l.ids.includes(addFor) && <Check size={16} className="text-[#f6c944]" />}
                </button>
              ))}
              {!playlists.length && <p className="px-3 py-2 text-sm text-[#c4c3ff]/50">No playlists yet — create one below.</p>}
            </div>
            <div className="flex gap-2">
              <input value={newName} onChange={(e) => setNewName(e.target.value)} dir="auto" placeholder="New playlist name"
                className="min-w-0 flex-1 rounded-xl bg-white/10 px-3 py-2.5 text-sm outline-none placeholder:text-[#c4c3ff]/40" />
              <button onClick={() => { createList(newName, addFor); setNewName(''); setAddFor(null); }}
                className="rounded-xl bg-[#f6c944] px-4 text-sm font-medium text-[#231b33]">Create</button>
            </div>
          </div>
        </div>
      )}

      {queueOpen && (
        <div className="fixed inset-0 z-30 flex justify-center bg-black/40 backdrop-blur-sm" onClick={() => setQueueOpen(false)}>
          <div
            className="glass mt-auto w-full max-w-md rounded-t-[2rem] p-5 pb-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20" />
            <h2 className="mb-3 flex items-center gap-2 text-sm font-medium uppercase tracking-[0.25em] text-[#c4c3ff]/80">
              <ListMusic size={16} /> Up next
            </h2>
            <ul className="flex max-h-[50vh] flex-col gap-1 overflow-y-auto">
              {queue.map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() => { playAt(t); setQueueOpen(false); }}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm ${
                      t.id === snap.id ? 'bg-white/10 text-[#f6c944]' : 'hover:bg-white/5'
                    }`}
                  >
                    <Music2 size={14} className="shrink-0 opacity-60" />
                    <span className="truncate">{t.title}</span>
                    <span className="ml-auto shrink-0 text-xs opacity-50">{fmtDate(t.addedAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- pieces ---------- */

function GlassButton({ children, onClick, label }: { children: React.ReactNode; onClick: () => void; label: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      className="glass flex h-10 w-10 items-center justify-center rounded-full text-[#c4c3ff] transition-all hover:text-white active:scale-95"
    >
      {children}
    </button>
  );
}

function SongRow({ track, index, active, playing, liked, onPlay, onLike, onAction, actionIcon, actionLabel }: {
  track: Track; index: number; active: boolean; playing: boolean; liked: boolean;
  onPlay: () => void; onLike: () => void;
  onAction?: () => void; actionIcon?: React.ReactNode; actionLabel?: string;
}) {
  return (
    <li
      className={`glass group flex items-center gap-3 rounded-2xl p-2.5 pl-3 transition-all duration-300 ${
        active ? 'ring-1 ring-[#f6c944]/40 bg-white/[0.09]' : ''
      }`}
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <button onClick={onPlay} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl ring-1 ring-white/15" style={coverStyle(track.hue)}>
          <CoverArt track={track} className="absolute inset-0 h-full w-full" />
          {playing && (
            <span className="absolute inset-0 flex items-center justify-center gap-[2px] bg-black/35">
              {[0, 1, 2].map((i) => (
                <span key={i} className="eq-bar w-[3px] rounded-full bg-[#f6c944]" style={{ animationDelay: `${i * 0.18}s` }} />
              ))}
            </span>
          )}
        </div>
        <div className="min-w-0">
          <p className={`truncate text-sm font-medium ${active ? 'text-[#f6c944]' : ''}`}>{track.title}</p>
          <p className="truncate text-xs text-[#c4c3ff]/60">
            {track.artist} · {fmtDate(track.addedAt)}
          </p>
        </div>
      </button>
      {onAction && (
        <button onClick={onAction} aria-label={actionLabel} className="text-[#c4c3ff]/40 transition-all active:scale-90 hover:text-[#c4c3ff]">
          {actionIcon}
        </button>
      )}
      <button
        onClick={onLike}
        aria-label="Like"
        className={`mr-1 transition-all active:scale-90 ${liked ? 'text-[#ff8f5c]' : 'text-[#c4c3ff]/40 hover:text-[#c4c3ff]'}`}
      >
        <Heart size={16} fill={liked ? 'currentColor' : 'none'} />
      </button>
    </li>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="glass mt-8 rounded-3xl p-8 text-center">
      <LibraryBig className="mx-auto mb-3 text-[#c4c3ff]/50" size={28} />
      <p className="text-sm text-[#c4c3ff]/80">The sky is empty.</p>
      <button onClick={onAdd} className="glass-strong mt-4 rounded-full px-5 py-2 text-sm font-medium text-[#231b33]">
        Add music from this device
      </button>
    </div>
  );
}

function NowPlaying({ track, snap, shuffle, repeat, liked, onBack, onToggle, onPrev, onNext, onShuffle, onRepeat, onLike, onQueue, onSeek }: {
  track: Track;
  snap: { playing: boolean; time: number; dur: number };
  shuffle: boolean; repeat: RepeatMode; liked: boolean;
  onBack: () => void; onToggle: () => void; onPrev: () => void; onNext: () => void;
  onShuffle: () => void; onRepeat: () => void; onLike: () => void; onQueue: () => void;
  onSeek: (p: number) => void;
}) {
  const dur = snap.dur || track.duration;
  const progress = dur > 0 ? Math.min(1, snap.time / dur) : 0;
  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-2 flex items-center justify-between">
        <GlassButton onClick={onBack} label="Back to library">
          <ChevronDown size={20} />
        </GlassButton>
        <p className="text-[11px] uppercase tracking-[0.4em] text-[#c4c3ff]/70">now playing</p>
        <GlassButton onClick={onQueue} label="Queue">
          <ListMusic size={18} />
        </GlassButton>
      </div>

      <div className="glass relative mt-4 flex flex-1 flex-col items-center rounded-[2.5rem] px-6 pb-8 pt-10">
        {/* inner starlight */}
        <div className="pointer-events-none absolute inset-0 rounded-[2.5rem] bg-[radial-gradient(80%_50%_at_50%_0%,rgba(196,195,255,0.10),transparent)]" />

        <CoverOrb track={track} size={270} />

        <div className="mt-8 w-full text-center">
          <h2 className="truncate font-display text-2xl font-semibold tracking-tight">{track.title}</h2>
          <p className="mt-1 text-sm text-[#c4c3ff]/70">{track.artist} — {track.album}</p>
        </div>

        <div className="mt-6 w-full">
          <WaveSeek progress={progress} onSeek={onSeek} />
          <div className="flex justify-between text-xs tabular-nums text-[#c4c3ff]/60">
            <span>{fmt(snap.time)}</span>
            <span>{fmt(dur)}</span>
          </div>
        </div>

        {/* transport */}
        <div className="mt-5 flex w-full items-center justify-center gap-6">
          <button onClick={onPrev} aria-label="Previous" className="text-[#c4c3ff] transition-all hover:text-white active:scale-90">
            <SkipBack size={26} fill="currentColor" />
          </button>
          <button
            onClick={onToggle}
            aria-label={snap.playing ? 'Pause' : 'Play'}
            className="flex h-[76px] w-[76px] items-center justify-center rounded-[1.75rem] bg-gradient-to-br from-[#f6c944] to-[#ff8f5c] text-[#231b33] shadow-[0_10px_40px_-5px_rgba(246,201,68,0.55),inset_0_2px_2px_rgba(255,255,255,0.5)] transition-transform active:scale-95"
          >
            {snap.playing ? <Pause size={30} fill="currentColor" /> : <Play size={30} fill="currentColor" className="ml-1" />}
          </button>
          <button onClick={onNext} aria-label="Next" className="text-[#c4c3ff] transition-all hover:text-white active:scale-90">
            <SkipForward size={26} fill="currentColor" />
          </button>
        </div>

        {/* modes */}
        <div className="glass mt-7 flex w-full items-center justify-between rounded-2xl p-2 px-4">
          <button onClick={onShuffle} aria-label="Shuffle" className={`p-2 transition-all active:scale-90 ${shuffle ? 'text-[#f6c944]' : 'text-[#c4c3ff]/50'}`}>
            <Shuffle size={18} />
          </button>
          <button onClick={onRepeat} aria-label="Repeat" className={`p-2 transition-all active:scale-90 ${repeat !== 'off' ? 'text-[#f6c944]' : 'text-[#c4c3ff]/50'}`}>
            {repeat === 'one' ? <Repeat1 size={18} /> : <Repeat size={18} />}
          </button>
          <button onClick={onLike} aria-label="Like" className={`p-2 transition-all active:scale-90 ${liked ? 'text-[#ff8f5c]' : 'text-[#c4c3ff]/50'}`}>
            <Heart size={18} fill={liked ? 'currentColor' : 'none'} />
          </button>
        </div>
      </div>
    </div>
  );
}

function PlaylistsView({ playlists, tracks, liked, snap, onPlay, onCreate, onDelete, onRemove, onLike }: {
  playlists: Playlist[]; tracks: Track[]; liked: Set<string>; snap: { id: string | null; playing: boolean };
  onPlay: (t: Track, list: Track[]) => void; onCreate: (name: string) => void; onDelete: (id: string) => void;
  onRemove: (listId: string, trackId: string) => void; onLike: (id: string) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [name, setName] = useState('');
  const pl = playlists.find((p) => p.id === open);
  if (pl) {
    const list = pl.ids.map((id) => tracks.find((t) => t.id === id)).filter((t): t is Track => !!t);
    return (
      <div>
        <div className="mb-3 flex items-center justify-between">
          <button onClick={() => setOpen(null)} className="text-xs uppercase tracking-[0.2em] text-[#c4c3ff]/70">← Lists</button>
          <button onClick={() => { onDelete(pl.id); setOpen(null); }} aria-label="Delete playlist" className="text-[#c4c3ff]/50 active:scale-90"><Trash2 size={16} /></button>
        </div>
        <h2 dir="auto" className="mb-3 text-lg font-medium">{pl.name}</h2>
        <ul className="flex flex-col gap-2">
          {list.map((t, i) => (
            <SongRow key={t.id} track={t} index={i} active={t.id === snap.id} playing={t.id === snap.id && snap.playing}
              liked={liked.has(t.id)} onPlay={() => onPlay(t, list)} onLike={() => onLike(t.id)}
              onAction={() => onRemove(pl.id, t.id)} actionIcon={<X size={16} />} actionLabel="Remove from playlist" />
          ))}
        </ul>
        {!list.length && <p className="mt-12 text-center text-sm text-[#c4c3ff]/60">Empty. Use the + button on any song to add it here.</p>}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} dir="auto" placeholder="New playlist name"
          className="glass min-w-0 flex-1 rounded-2xl px-4 py-3 text-sm outline-none placeholder:text-[#c4c3ff]/40" />
        <button onClick={() => { onCreate(name); setName(''); }} className="rounded-2xl bg-[#f6c944] px-4 text-sm font-medium text-[#231b33]">Create</button>
      </div>
      {playlists.map((l) => (
        <button key={l.id} onClick={() => setOpen(l.id)} className="glass flex items-center gap-4 rounded-3xl p-4 text-left active:scale-[0.98]">
          <ListMusic size={22} className="text-[#f6c944]" />
          <div className="min-w-0">
            <p dir="auto" className="truncate font-medium">{l.name}</p>
            <p className="text-xs text-[#c4c3ff]/60">{l.ids.length} track{l.ids.length === 1 ? '' : 's'}</p>
          </div>
        </button>
      ))}
    </div>
  );
}
