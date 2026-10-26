/** Đặc trưng âm thanh đã phân tích, giữ trong bộ nhớ để engine gợi ý dùng (IndexedDB là nguồn thật). */
import { create } from 'zustand';
import { getAllFeatures, putFeatures, type AudioFeatures } from '@/lib/db';
import { enqueue } from '@/features/sync/outbox';
import { featuresToRow } from '@/features/sync/rows';

interface FeaturesState {
  map: ReadonlyMap<string, AudioFeatures>;
  loaded: boolean;
}

export const useFeatures = create<FeaturesState>()(() => ({ map: new Map(), loaded: false }));

export async function loadFeatures(): Promise<void> {
  try {
    const rows = await getAllFeatures();
    useFeatures.setState({ map: new Map(rows.map((r) => [r.trackId, r.features])), loaded: true });
  } catch {
    useFeatures.setState({ loaded: true });
  }
}

/** Lưu đặc trưng của một bài và xếp hàng đẩy lên server (máy kia khỏi phải tính lại). */
export async function saveFeatures(trackId: string, features: AudioFeatures, now = Date.now()): Promise<void> {
  const rec = { trackId, features, updatedAt: now };
  await putFeatures(rec);
  await enqueue('track_features', 'upsert', featuresToRow(rec));
  const map = new Map(useFeatures.getState().map);
  map.set(trackId, features);
  useFeatures.setState({ map });
}
