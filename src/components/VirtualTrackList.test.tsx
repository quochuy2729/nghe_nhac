import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import type { Track } from '@/providers/types';
import { fakeTracks } from '@/test/fixtures';
import { VirtualTrackList } from './VirtualTrackList';

describe('VirtualTrackList (thư viện 5000 bài)', () => {
  const tracks: Track[] = fakeTracks(5000);

  it('chỉ dựng vài chục dòng, không dựng cả 5000', () => {
    const html = renderToString(
      <MemoryRouter>
        <VirtualTrackList tracks={tracks} context="Thư viện" />
      </MemoryRouter>,
    );
    const rows = (html.match(/role="listitem"/g) ?? []).length;
    expect(rows).toBeGreaterThan(5);
    expect(rows).toBeLessThan(60);
    expect(html).toContain('Bài thử 1<');
    expect(html).not.toContain('Bài thử 4000<');
    // Chiều cao tổng vẫn đủ 5000 dòng để thanh cuộn đúng.
    expect(html).toMatch(/padding-bottom:\d{6}px/);
  });

  it('chế độ chọn nhiều có ô tick cho từng dòng đang dựng', () => {
    const html = renderToString(
      <MemoryRouter>
        <VirtualTrackList tracks={tracks.slice(0, 20)} context="x" selection={{ selected: new Set(['folder:1']), toggle: () => undefined }} />
      </MemoryRouter>,
    );
    expect((html.match(/type="checkbox"/g) ?? []).length).toBeGreaterThan(5);
    expect(html).toContain('checked');
  });
});
