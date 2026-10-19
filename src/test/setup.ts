import 'fake-indexeddb/auto';
import { Blob as NodeBlob, File as NodeFile } from 'node:buffer';

// Blob/File của jsdom không structuredClone được vào fake-indexeddb và thiếu
// text()/arrayBuffer() → dùng bản của Node (giống trình duyệt thật hơn).
globalThis.Blob = NodeBlob as unknown as typeof Blob;
globalThis.File = NodeFile as unknown as typeof File;

// jsdom chưa có object URL.
let n = 0;
if (!URL.createObjectURL) URL.createObjectURL = () => `blob:test/${++n}`;
if (!URL.revokeObjectURL) URL.revokeObjectURL = () => undefined;
