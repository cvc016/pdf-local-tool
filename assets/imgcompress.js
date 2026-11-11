// 圖片壓縮：預設檔位／自訂品質、輸出格式、最長邊。全部本機處理。
// 使用與桌面工具同級的編碼器（MozJPEG、libwebp、PNG 調色盤量化＋OxiPNG，於 Web Worker 執行、需要時才載入），
// 失敗時退回瀏覽器內建 canvas 編碼。重新編碼不寫入 EXIF；保留原檔時也會無損移除 EXIF／GPS。
import { $ } from './common.js';
import { initBatch, canvasFor, MIME, canWebp, srcFmt, fit } from './imgbatch.js';
import { encode, codecOk, stripMeta } from './imgcodec.js';
const q = $('#quality'), qv = $('#qv');
const PRESET = { light: 90, medium: 75, strong: 55 };
if (!canWebp && !codecOk()) { $('#fmt option[value=webp]').textContent += '（此瀏覽器不支援，將改用 JPG）'; $('#webpNote').classList.remove('hidden'); }
document.querySelectorAll('input[name=level]').forEach((r) => r.addEventListener('change', () => { if (PRESET[r.value]) { q.value = PRESET[r.value]; qv.textContent = q.value; } }));
q.addEventListener('input', () => { qv.textContent = q.value; $('input[name=level][value=custom]').checked = true; });
// PNG palette size by quality (pngquant-style lossy); 100 = lossless (OxiPNG only).
const pngColors = (qq) => qq >= 100 ? 0 : qq >= 70 ? 256 : qq >= 50 ? 128 : qq >= 30 ? 64 : 32;
let wasmOk = true;
async function render(rec, o) {
  const src = srcFmt(rec.file);
  let f = o.fmt === 'keep' || o.fmt === 'auto' ? src : o.fmt;
  if (f === 'other') f = hasAlpha(rec) ? 'png' : 'jpg';   // GIF/BMP/AVIF…
  const useWasm = wasmOk && codecOk();
  if (f === 'webp' && !canWebp && !useWasm) f = 'jpg';
  const type = MIME[f], s = fit(rec.img, o.max);
  const { cv, ctx } = canvasFor(rec.img.naturalWidth * s, rec.img.naturalHeight * s, type);
  ctx.drawImage(rec.img, 0, 0, cv.width, cv.height);
  if (!useWasm) return { cv, type, quality: o.q / 100 };
  try {
    const w = cv.width, h = cv.height, img = ctx.getImageData(0, 0, w, h);
    cv.width = cv.height = 0;
    const out = await encode({ jpg: 'jpeg', webp: 'webp', png: 'png' }[f], img, f === 'png' ? { colors: pngColors(o.q) } : { quality: o.q });
    return { blob: new Blob([out], { type }), w, h };
  } catch (e) { console.warn('WASM codec failed, using canvas encoder', e); wasmOk = false; return render(rec, o); }
}
initBatch({ suffix: '_壓縮', zipName: '壓縮圖片.zip', verb: '壓縮',
  opts: () => { const o = { fmt: $('#fmt').value, q: +q.value, max: +$('#maxw').value }; o.key = JSON.stringify(o); return o; },
  noGrow: true, keepOriginal: stripMeta, render });
// Does the image have any non-opaque pixel? (cached per file)
function hasAlpha(rec) {
  if (rec.alpha !== undefined) return rec.alpha;
  const w = rec.img.naturalWidth, h = rec.img.naturalHeight, c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(rec.img, 0, 0);
  let a = false; try { const d = x.getImageData(0, 0, w, h).data; for (let i = 3; i < d.length; i += 4) if (d[i] < 255) { a = true; break; } } catch { a = true; }
  c.width = c.height = 0; return (rec.alpha = a);
}
