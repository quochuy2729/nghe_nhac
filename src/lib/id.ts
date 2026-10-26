export function uuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** cyrb53: hash 53-bit thuần JS, cho cùng kết quả ở mọi trình duyệt (không phụ thuộc crypto.subtle/https). */
export function hash53(str: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

/**
 * Id bài = `folder:<hash53(NFC(tên file) | dung lượng)>`. Giống nhau trên mọi thiết bị. KHÔNG đổi công thức.
 * NFC vì iOS hay trả tên file dạng NFD.
 */
export function trackIdFor(file: { name: string; size: number }): string {
  return `folder:${hash53(`${file.name.normalize('NFC')}|${file.size}`)}`;
}

/** uuid xác định từ một chuỗi (dùng khi migrate dữ liệu cũ để chạy lại không sinh bản ghi trùng). */
export function uuidFrom(seed: string): string {
  const h = hash53(seed) + hash53(`${seed}#2`);
  const hex = (h + '0'.repeat(32)).slice(0, 32).split('');
  hex[12] = '4';
  hex[16] = '89ab'[parseInt(hex[16], 16) % 4];
  const s = hex.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}
