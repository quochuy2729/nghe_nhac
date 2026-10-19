import { useState } from 'react';
import { Sheet } from '@/components/Sheet';
import { PlusIcon } from '@/components/Icons';
import { toast } from '@/components/toast';
import type { Track } from '@/providers/types';
import { library, useLibrary } from './store';
import { usePlaylistPicker } from './trackMenu';

export function PlaylistPicker() {
  const tracks = usePlaylistPicker((s) => s.tracks);
  const close = usePlaylistPicker((s) => s.close);
  const playlists = useLibrary((s) => s.playlists);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');

  const done = () => {
    setCreating(false);
    setName('');
    close();
  };

  return (
    <Sheet open={!!tracks} onClose={done} label="Thêm vào playlist">
      <h2 className="px-5 pb-2 text-lg font-bold">Thêm vào playlist</h2>
      {creating ? (
        <form
          className="flex gap-2 px-5 pb-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!tracks) return;
            try {
              await library.createPlaylist(name || 'Playlist mới', tracks);
              toast(`Đã thêm vào “${name || 'Playlist mới'}”`);
              done();
            } catch {
              // toast đã hiện trong store
            }
          }}
        >
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            placeholder="Tên playlist"
            aria-label="Tên playlist mới"
            className="h-11 min-w-0 flex-1 rounded-md bg-surface-3 px-3 text-base outline-none focus:ring-2 focus:ring-accent"
          />
          <button type="submit" className="chip chip-active h-11">
            Tạo
          </button>
        </form>
      ) : (
        <button type="button" onClick={() => setCreating(true)} className="flex min-h-[56px] w-full items-center gap-4 px-5 text-left active:bg-white/10">
          <span className="flex h-11 w-11 items-center justify-center rounded bg-surface-3">
            <PlusIcon />
          </span>
          Playlist mới
        </button>
      )}
      <ul>
        {playlists.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              className="flex min-h-[56px] w-full items-center gap-4 px-5 text-left active:bg-white/10"
              onClick={() => {
                if (!tracks) return;
                void library.addToPlaylist(p.id, tracks);
                toast(`Đã thêm vào “${p.name}”`);
                done();
              }}
            >
              <PlaylistCover playlist={p} className="h-11 w-11" />
              <span className="min-w-0">
                <span className="block truncate">{p.name}</span>
                <span className="block text-xs text-muted">{p.tracks.length} bài</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

export function PlaylistCover({ playlist, className = '' }: { playlist: { tracks: Track[]; name: string }; className?: string }) {
  const arts = playlist.tracks.map((t) => t.artworkUrl).filter(Boolean).slice(0, 4) as string[];
  if (arts.length >= 4) {
    return (
      <span className={`grid shrink-0 grid-cols-2 overflow-hidden rounded ${className}`}>
        {arts.map((a, i) => (
          <img key={i} src={a} alt="" className="h-full w-full object-cover" />
        ))}
      </span>
    );
  }
  if (arts.length) return <img src={arts[0]} alt="" className={`shrink-0 rounded object-cover ${className}`} />;
  return (
    <span className={`flex shrink-0 items-center justify-center rounded bg-gradient-to-br from-surface-3 to-surface-2 text-lg font-bold text-white/60 ${className}`}>
      {playlist.name.slice(0, 1).toUpperCase()}
    </span>
  );
}
