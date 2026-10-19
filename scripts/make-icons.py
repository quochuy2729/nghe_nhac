"""Sinh icon PWA (PNG) từ hình vẽ đơn giản: các thanh equalizer trên nền tối.
Chạy: npm run icons  (cần Pillow)."""
from PIL import Image, ImageDraw

BG = (18, 18, 18, 255)
ACCENT = (45, 212, 191, 255)
ACCENT2 = (20, 184, 166, 255)
HEIGHTS = [0.38, 0.72, 0.52, 0.86, 0.44]


def draw(size: int, maskable: bool) -> Image.Image:
    img = Image.new('RGBA', (size, size), BG if maskable else (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if not maskable:
        d.rounded_rectangle([0, 0, size - 1, size - 1], radius=size * 0.22, fill=BG)
    # vùng an toàn cho maskable ~ 80% ở giữa
    inner = size * (0.56 if maskable else 0.64)
    n = len(HEIGHTS)
    gap = inner * 0.08
    bar_w = (inner - gap * (n - 1)) / n
    x0 = (size - inner) / 2
    cy = size / 2
    for i, h in enumerate(HEIGHTS):
        bh = inner * h
        x = x0 + i * (bar_w + gap)
        color = ACCENT if i % 2 == 0 else ACCENT2
        d.rounded_rectangle([x, cy - bh / 2, x + bar_w, cy + bh / 2], radius=bar_w / 2, fill=color)
    return img


def main() -> None:
    out = 'public/icons/'
    draw(192, False).save(out + 'icon-192.png')
    draw(512, False).save(out + 'icon-512.png')
    draw(512, True).save(out + 'icon-maskable-512.png')
    # iOS không hỗ trợ nền trong suốt cho apple-touch-icon
    draw(180, True).save(out + 'apple-touch-icon.png')


if __name__ == '__main__':
    main()
