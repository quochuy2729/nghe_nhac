import 'fake-indexeddb/auto';

// jsdom chưa có object URL.
let n = 0;
if (!URL.createObjectURL) URL.createObjectURL = () => `blob:test/${++n}`;
if (!URL.revokeObjectURL) URL.revokeObjectURL = () => undefined;

// jsdom: Blob chưa có text()/arrayBuffer().
function readAs<T>(blob: Blob, kind: 'text' | 'buffer'): Promise<T> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as T);
    r.onerror = () => reject(r.error);
    if (kind === 'text') r.readAsText(blob);
    else r.readAsArrayBuffer(blob);
  });
}
if (!Blob.prototype.text) Blob.prototype.text = function () { return readAs<string>(this, 'text'); };
if (!Blob.prototype.arrayBuffer) Blob.prototype.arrayBuffer = function () { return readAs<ArrayBuffer>(this, 'buffer'); };
