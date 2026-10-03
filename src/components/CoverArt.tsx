import { useEffect, useState } from 'react';
import type { Track } from '@/lib/engine';
import { getCover } from '@/lib/native';

const cache = new Map<string, string>();

/** Real cover image on top of the gradient; renders nothing until/unless one exists. */
export default function CoverArt({ track, className = '' }: { track: Track; className?: string }) {
  const uri = track.uri;
  const [src, setSrc] = useState<string>(uri ? cache.get(uri) ?? '' : '');
  useEffect(() => {
    if (!uri) { setSrc(''); return; }
    const hit = cache.get(uri);
    if (hit !== undefined) { setSrc(hit); return; }
    let live = true;
    void getCover(uri).then((d) => { cache.set(uri, d); if (live) setSrc(d); });
    return () => { live = false; };
  }, [uri]);
  if (!src) return null;
  return <img src={src} alt="" decoding="async" className={`object-cover ${className}`} />;
}
