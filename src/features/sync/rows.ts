/** Chuyển qua lại giữa bản ghi IndexedDB và hàng Supabase (xem docs/ARCHITECTURE.md §3, §4). */
import type { AudioFeatures, FeaturesRecord, OverrideRecord, PlayEvent, StoredPlayEvent } from '@/lib/db';

export type Row = Record<string, unknown>;

export const iso = (ms: number): string => new Date(ms).toISOString();
export const ms = (s: unknown): number => {
  const t = typeof s === 'string' ? Date.parse(s) : NaN;
  return Number.isFinite(t) ? t : 0;
};

/** `user_id` không gửi: server tự điền `auth.uid()`, nên lượt nghe ghi lúc chưa đăng nhập vẫn đẩy được sau này. */
export function eventToRow(e: PlayEvent): Row {
  return {
    id: e.id,
    track_id: e.trackId,
    ended_at: iso(e.t),
    listened_sec: Math.max(0, Math.round(e.sec)),
    duration_sec: Math.max(0, Math.round(e.dur)),
    kind: e.kind,
    device: e.device,
    ctx: e.ctx ?? null,
  };
}

export function rowToEvent(r: Row): StoredPlayEvent {
  return {
    id: String(r.id),
    trackId: String(r.track_id),
    t: ms(r.ended_at),
    sec: Number(r.listened_sec) || 0,
    dur: Number(r.duration_sec) || 0,
    kind: r.kind as PlayEvent['kind'],
    device: r.device as PlayEvent['device'],
    ...(r.ctx ? { ctx: r.ctx as NonNullable<PlayEvent['ctx']> } : {}),
    synced: 1,
  };
}

export function featuresToRow(f: FeaturesRecord): Row {
  return { track_id: f.trackId, v: f.features.v, data: f.features, updated_at: iso(f.updatedAt) };
}

export function rowToFeatures(r: Row): FeaturesRecord {
  return { trackId: String(r.track_id), features: r.data as AudioFeatures, updatedAt: ms(r.updated_at) };
}

export function overrideToRow(o: OverrideRecord): Row {
  return { track_id: o.trackId, patch: o.patch, updated_at: iso(o.updatedAt) };
}

export function rowToOverride(r: Row): OverrideRecord {
  return { trackId: String(r.track_id), patch: (r.patch ?? {}) as OverrideRecord['patch'], updatedAt: ms(r.updated_at) };
}
