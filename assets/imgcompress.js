// 圖片壓縮：依品質（預設檔位／自訂）或指定檔案大小（自動找出不超過目標的最高品質）、輸出格式、最長邊。全部本機處理。
// 使用與桌面工具同級的編碼器（MozJPEG、libwebp、PNG 調色盤量化＋OxiPNG，於 Web Worker 執行、需要時才載入），
// 失敗時退回瀏覽器內建 canvas 編碼。重新編碼不寫入 EXIF；保留原檔時也會無損移除 EXIF／GPS。
import { $, fmtSize } from './common.js';
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
// ---- 指定檔案大小模式 ----
const modeSize = () => $('input[name=mode]:checked')?.value === 'size';
const syncMode = () => { $('#qualityBox').classList.toggle('hidden', modeSize()); $('#sizeBox').classList.toggle('hidden', !modeSize()); };
document.querySelectorAll('input[name=mode]').forEach((r) => r.addEventListener('change', syncMode)); syncMode();
$('#tcustom').addEventListener('input', () => { $('input[name=target][value=custom]').checked = true; });
$('#tunit').addEventListener('change', () => { $('input[name=target][value=custom]').checked = true; });
// Target in bytes. 1 KB = 1000 B (conservative: also under the limit for systems that count 1 KB = 1024 B).
function targetBytes() {
  const v = $('input[name=target]:checked')?.value;
  if (v !== 'custom') return +v;
  const n = parseFloat($('#tcustom').value); if (!(n > 0)) return 0;
  return Math.round(n * ($('#tunit').value === 'MB' ? 1e6 : 1e3));
}
const fmtT = (b) => b >= 1e6 ? `${+(b / 1e6).toFixed(2)} MB` : `${+(b / 1e3).toFixed(1)} KB`;
const Q_MIN = 10, Q_MAX = 95, COLORS = [0, 256, 128, 64, 32, 16, 8, 4, 2]; // PNG: 0 = lossless, then fewer and fewer colours
const STALE = '設定已變更';
function outFmt(rec, o) {
  let f = o.fmt === 'keep' || o.fmt === 'auto' ? srcFmt(rec.file) : o.fmt;
  if (f === 'other') f = hasAlpha(rec) ? 'png' : 'jpg';   // GIF/BMP/AVIF…
  if (f === 'webp' && !canWebp && !(wasmOk && codecOk())) f = 'jpg';
  return f;
}
// Draw the image at the user's chosen size (never changed by the size search).
function draw(rec, o, type) {
  const s = fit(rec.img, o.max);
  const { cv, ctx } = canvasFor(rec.img.naturalWidth * s, rec.img.naturalHeight * s, type);
  ctx.drawImage(rec.img, 0, 0, cv.width, cv.height);
  return { cv, ctx };
}
async function render(rec, o, cx) {
  if (o.mode === 'size') return renderSize(rec, o, cx);
  const f = outFmt(rec, o), useWasm = wasmOk && codecOk(), type = MIME[f];
  const { cv, ctx } = draw(rec, o, type);
  if (!useWasm) return { cv, type, quality: o.q / 100 };
  try {
    const w = cv.width, h = cv.height, img = ctx.getImageData(0, 0, w, h);
    cv.width = cv.height = 0;
    const out = await encode({ jpg: 'jpeg', webp: 'webp', png: 'png' }[f], img, f === 'png' ? { colors: pngColors(o.q) } : { quality: o.q });
    return { blob: new Blob([out], { type }), w, h };
  } catch (e) { console.warn('WASM codec failed, using canvas encoder', e); wasmOk = false; return render(rec, o, cx); }
}
// Find the best quality (JPG/WebP) or the most colours (PNG) whose output is ≤ target, at the size and format the user chose.
async function renderSize(rec, o, cx) {
  const T = o.target;
  if (!T) throw new Error('請輸入目標檔案大小');
  const f = outFmt(rec, o), type = MIME[f], s = fit(rec.img, o.max);
  // Already small enough and nothing to change → keep the original (metadata is still stripped).
  if (rec.file.size <= T && s === 1 && f === srcFmt(rec.file)) return { keep: true, note: `原檔已低於目標 ${fmtT(T)}，不需重新壓縮` };
  const { cv, ctx } = draw(rec, o, type), w = cv.width, h = cv.height;
  const img = ctx.getImageData(0, 0, w, h);
  let useWasm = wasmOk && codecOk(), tries = 0;
  const enc = async (p) => {
    if (!cx.alive()) throw new Error(STALE);
    cx.progress(`第 ${++tries} 次嘗試（${f === 'png' ? (p ? `${p} 色` : '無損') : `品質 ${p}`}）`);
    if (useWasm) {
      try {
        const out = await encode({ jpg: 'jpeg', webp: 'webp', png: 'png' }[f], new ImageData(new Uint8ClampedArray(img.data), w, h), f === 'png' ? { colors: p } : { quality: p });
        return new Blob([out], { type });
      } catch (e) { console.warn('WASM codec failed, using canvas encoder', e); wasmOk = useWasm = false; }
    }
    return new Promise((res) => cv.toBlob(res, type, p / 100));
  };
  // Binary search over an ordered list of settings, best quality first (size shrinks along the list).
  const steps = f === 'png' ? COLORS : Array.from({ length: Q_MAX - Q_MIN + 1 }, (_, i) => Q_MAX - i);
  let lo = 0, hi = steps.length - 1, best = null, smallest = null;
  if (f === 'png' && !useWasm) hi = 0; // canvas can only write lossless PNG
  const t0 = performance.now();
  while (lo <= hi) {
    const mid = (lo + hi) >> 1, b = await enc(steps[mid]);
    if (!b) throw new Error('編碼失敗');
    if (!smallest || b.size < smallest.b.size) smallest = { b, p: steps[mid] };
    if (b.size <= T) { best = { b, p: steps[mid] }; hi = mid - 1; } else lo = mid + 1;
  }
  cv.width = cv.height = 0;
  const label = (p) => f === 'png' ? (p ? `${p} 色` : '無損') : `品質 ${p}`;
  const secs = ((performance.now() - t0) / 1000).toFixed(1);
  if (best) return { blob: best.b, w, h, note: `目標 ${fmtT(T)}，自動選用：${label(best.p)}（試了 ${tries} 次，${secs} 秒）`,
    keptNote: `目標 ${fmtT(T)}：重新壓縮不會比原檔小，原檔已低於目標`, setting: best.p };
  const tip = f === 'png' ? '可以試著把「最長邊」調小，或把輸出格式改成 WebP／JPG' : `可以試著把「最長邊」調小${f === 'jpg' ? '或改用 WebP' : ''}`;
  const lowest = f === 'png' && !useWasm ? '此瀏覽器只能輸出無損 PNG，' : `已用最低${f === 'png' ? '顏色數' : '品質'}（${label(smallest.p)}）`;
  return { blob: smallest.b, w, h, over: true, setting: smallest.p,
    note: `${lowest}壓到 ${fmtSize(smallest.b.size)}，仍高於目標 ${fmtT(T)}，${tip}`,
    keptNote: `${lowest}仍無法比原檔小（原檔 ${fmtSize(rec.file.size)}，高於目標 ${fmtT(T)}），已保留原檔；${tip}` };
}
initBatch({ suffix: '_壓縮', zipName: '壓縮圖片.zip', verb: '壓縮',
  opts: () => { const o = { fmt: $('#fmt').value, max: +$('#maxw').value, mode: modeSize() ? 'size' : 'q' }; if (o.mode === 'size') o.target = targetBytes(); else o.q = +q.value; o.key = JSON.stringify(o); return o; },
  noGrow: true, keepOriginal: stripMeta, render });
// Does the image have any non-opaque pixel? (cached per file)
function hasAlpha(rec) {
  if (rec.alpha !== undefined) return rec.alpha;
  const w = rec.img.naturalWidth, h = rec.img.naturalHeight, c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(rec.img, 0, 0);
  let a = false; try { const d = x.getImageData(0, 0, w, h).data; for (let i = 3; i < d.length; i += 4) if (d[i] < 255) { a = true; break; } } catch { a = true; }
  c.width = c.height = 0; return (rec.alpha = a);
}
