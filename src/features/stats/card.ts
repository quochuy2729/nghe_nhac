/** Vẽ một thẻ Wrapped thành ảnh PNG 1080×1920 bằng canvas (chạy trong trình duyệt/WebView). */
import { wrapLines, type WrappedCard } from './wrapped';

export const CARD_W = 1080;
export const CARD_H = 1920;

export async function renderCardPng(card: WrappedCard): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Không tạo được ảnh');

  const g = ctx.createLinearGradient(0, 0, CARD_W * 0.4, CARD_H);
  g.addColorStop(0, card.colors[0]);
  g.addColorStop(1, card.colors[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  const font = (px: number, weight = 700) => `${weight} ${px}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  const pad = 96;
  const maxW = CARD_W - pad * 2;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = font(44, 600);
  ctx.fillText(card.kicker.toUpperCase(), pad, 330);

  let y = 520;
  ctx.fillStyle = '#fff';
  ctx.font = font(card.headline.length > 14 ? 96 : 140);
  for (const line of wrapLines(card.headline, maxW, (s) => ctx.measureText(s).width).slice(0, 4)) {
    ctx.fillText(line, pad, y);
    y += card.headline.length > 14 ? 112 : 160;
  }

  if (card.sub) {
    y += 20;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = font(48, 500);
    for (const line of wrapLines(card.sub, maxW, (s) => ctx.measureText(s).width).slice(0, 4)) {
      ctx.fillText(line, pad, y);
      y += 66;
    }
  }

  if (card.items?.length) {
    y += 70;
    ctx.fillStyle = '#fff';
    ctx.font = font(52, 600);
    for (const item of card.items.slice(0, 6)) {
      for (const line of wrapLines(item, maxW, (s) => ctx.measureText(s).width).slice(0, 2)) {
        ctx.fillText(line, pad, y);
        y += 76;
      }
    }
  }

  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = font(40, 600);
  ctx.fillText('Nghe Nhạc', pad, CARD_H - 120);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Không tạo được ảnh'))), 'image/png'));
}
