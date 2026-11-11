// 圖片編碼器（MozJPEG／libwebp／UPNG 量化＋OxiPNG）：只在需要時才載入，於 Web Worker 中本機執行，不上傳任何資料。
// 失敗時呼叫端改用瀏覽器內建 canvas 編碼。另含無損移除 JPEG／PNG 中的 EXIF、GPS 等中繼資料。
let wk, seq = 0, broken = false;
const pend = new Map();
function worker() {
  if (wk) return wk;
  wk = new Worker(new URL('../vendor/squoosh/imgcodec.worker.js', import.meta.url), { type: 'module' });
  wk.onmessage = ({ data: { id, out, err } }) => { const p = pend.get(id); if (!p) return; pend.delete(id); err ? p.rej(new Error(err)) : p.res(out); };
  wk.onerror = (e) => { broken = true; e.preventDefault?.(); for (const p of pend.values()) p.rej(new Error('codec worker failed')); pend.clear(); };
  return wk;
}
export const codecOk = () => !broken && typeof Worker !== 'undefined' && typeof WebAssembly === 'object';
// op: 'jpeg' | 'webp' | 'png'; img: ImageData. Resolves to an ArrayBuffer.
export function encode(op, img, opt) {
  if (!codecOk()) return Promise.reject(new Error('codec unavailable'));
  return new Promise((res, rej) => {
    const id = ++seq;
    // Safety net: if the worker never answers (e.g. WASM failed to load), give up so the caller can fall back to canvas.
    const t = setTimeout(() => { if (pend.delete(id)) { broken = true; rej(new Error('codec timeout')); } }, 45000 + img.width * img.height / 100);
    pend.set(id, { res: (v) => { clearTimeout(t); res(v); }, rej: (e) => { clearTimeout(t); rej(e); } });
    const buf = img.data.buffer;
    worker().postMessage({ id, op, rgba: buf, w: img.width, h: img.height, opt }, [buf]);
  });
}

// ---- lossless metadata stripping (used when the original file is kept) ----
// JPEG: drop APP1 (EXIF/XMP, incl. GPS), APP13 (IPTC), COM. Keep APP0/JFIF, APP2 (ICC colour profile), APP14.
// If EXIF says the photo is rotated, write back a tiny EXIF containing only Orientation so it still displays upright.
function jpegOrientation(seg) { // seg = APP1 payload (after length)
  if (String.fromCharCode(...seg.subarray(0, 4)) !== 'Exif') return 1;
  const t = seg.subarray(6), le = t[0] === 0x49, dv = new DataView(t.buffer, t.byteOffset, t.byteLength);
  const u16 = (o) => dv.getUint16(o, le), u32 = (o) => dv.getUint32(o, le);
  try { const ifd = u32(4), n = u16(ifd); for (let i = 0; i < n; i++) { const e = ifd + 2 + i * 12; if (u16(e) === 0x0112) return u16(e + 8); } } catch {}
  return 1;
}
function orientationApp1(o) {
  const b = [0xff, 0xe1, 0, 34, 0x45, 0x78, 0x69, 0x66, 0, 0, 0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, o, 0, 0, 0, 0, 0, 0];
  return new Uint8Array(b);
}
function stripJpeg(u) {
  if (u[0] !== 0xff || u[1] !== 0xd8) return null;
  const parts = [u.subarray(0, 2)]; let i = 2, orient = 1, drop = false;
  while (i + 4 <= u.length) {
    if (u[i] !== 0xff) return null;
    const m = u[i + 1];
    if (m === 0xff) { i++; continue; }
    if (m === 0xda || m === 0xd9) { parts.push(u.subarray(i)); break; } // start of scan: copy the rest verbatim
    const len = (u[i + 2] << 8) | u[i + 3], seg = u.subarray(i, i + 2 + len);
    if (m === 0xe1 || m === 0xed || m === 0xfe) { if (m === 0xe1) orient = Math.max(orient, jpegOrientation(seg.subarray(4))); drop = true; }
    else parts.push(seg);
    i += 2 + len;
  }
  if (!drop) return null;
  if (orient > 1 && orient <= 8) parts.splice(parts[1] && parts[1][1] === 0xe0 ? 2 : 1, 0, orientationApp1(orient));
  return parts;
}
// PNG: drop text chunks, eXIf and tIME; keep everything else (incl. iCCP/gAMA colour info).
function stripPng(u) {
  const sig = [0x89, 0x50, 0x4e, 0x47]; if (!sig.every((b, k) => u[k] === b)) return null;
  const parts = [u.subarray(0, 8)], dv = new DataView(u.buffer, u.byteOffset, u.byteLength); let i = 8, drop = false;
  while (i + 12 <= u.length) {
    const len = dv.getUint32(i), type = String.fromCharCode(...u.subarray(i + 4, i + 8)), end = i + 12 + len;
    if (['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME'].includes(type)) drop = true; else parts.push(u.subarray(i, end));
    i = end; if (type === 'IEND') break;
  }
  return drop ? parts : null;
}
// Returns { blob, stripped } — the same image data without privacy metadata (or the file itself when there is none).
export async function stripMeta(file) {
  try {
    const u = new Uint8Array(await file.arrayBuffer());
    const parts = stripJpeg(u) || stripPng(u);
    if (parts) return { blob: new Blob(parts, { type: file.type }), stripped: true };
  } catch {}
  return { blob: file, stripped: false };
}
