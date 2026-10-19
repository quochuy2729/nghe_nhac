import { useEffect, useState } from 'react';

const cache = new Map<string, string>();
const FALLBACK = '#3a3a3a';

/** Lấy màu chủ đạo (trung bình có trọng số độ bão hòa) của ảnh qua canvas. */
export async function dominantColor(url: string): Promise<string> {
  const hit = cache.get(url);
  if (hit) return hit;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.decoding = 'async';
  img.src = url;
  await img.decode();
  const size = 24;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return FALLBACK;
  ctx.drawImage(img, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size); // ném lỗi nếu ảnh không cho CORS
  let r = 0, g = 0, b = 0, w = 0;
  for (let i = 0; i < data.length; i += 4) {
    const max = Math.max(data[i], data[i + 1], data[i + 2]);
    const min = Math.min(data[i], data[i + 1], data[i + 2]);
    const weight = 1 + (max - min) / 32;
    r += data[i] * weight;
    g += data[i + 1] * weight;
    b += data[i + 2] * weight;
    w += weight;
  }
  // làm tối để chữ trắng luôn đọc được
  const k = 0.62 / w;
  const color = `rgb(${Math.round(r * k)}, ${Math.round(g * k)}, ${Math.round(b * k)})`;
  cache.set(url, color);
  return color;
}

export function useArtworkColor(url: string | undefined): string {
  const [color, setColor] = useState(() => (url && cache.get(url)) || FALLBACK);
  useEffect(() => {
    let alive = true;
    if (!url) {
      setColor(FALLBACK);
      return;
    }
    dominantColor(url)
      .then((c) => alive && setColor(c))
      .catch(() => alive && setColor(FALLBACK));
    return () => {
      alive = false;
    };
  }, [url]);
  return color;
}
