// 圖片壓縮：預設檔位／自訂品質、輸出格式、最長邊，重新編碼時不保留 EXIF。全部本機處理。
import { $ } from './common.js';
import { initBatch, canvasFor, MIME, canWebp, srcFmt, fit } from './imgbatch.js';
const q = $('#quality'), qv = $('#qv');
const PRESET = { light: 90, medium: 75, strong: 55 };
if (!canWebp) { $('#fmt option[value=webp]').textContent += '（此瀏覽器不支援，將改用 JPG）'; $('#webpNote').classList.remove('hidden'); }
document.querySelectorAll('input[name=level]').forEach((r) => r.addEventListener('change', () => { if (PRESET[r.value]) { q.value = PRESET[r.value]; qv.textContent = q.value; } }));
q.addEventListener('input', () => { qv.textContent = q.value; $('input[name=level][value=custom]').checked = true; });
initBatch({ suffix: '_壓縮', zipName: '壓縮圖片.zip', verb: '壓縮',
  opts: () => { const o = { fmt: $('#fmt').value, q: +q.value, max: +$('#maxw').value }; o.key = JSON.stringify(o); return o; },
  noGrow: true,
  render: (rec, o) => {
    const src = srcFmt(rec.file);
    let f = o.fmt === 'keep' ? src : o.fmt;
    // 自動：JPG／WebP 用原格式＋品質；PNG 等無損來源改成有損 WebP（保留透明），不支援 WebP 時沒透明就轉 JPG。
    if (o.fmt === 'auto') f = src === 'jpg' || src === 'webp' ? src : canWebp ? 'webp' : hasAlpha(rec) ? 'png' : 'jpg';
    if (f === 'other') f = 'jpg';
    if (f === 'webp' && !canWebp) f = 'jpg';
    const type = MIME[f], s = fit(rec.img, o.max);
    const { cv, ctx } = canvasFor(rec.img.naturalWidth * s, rec.img.naturalHeight * s, type);
    ctx.drawImage(rec.img, 0, 0, cv.width, cv.height);
    return { cv, type, quality: o.q / 100 };
  } });
// Does the image have any non-opaque pixel? (cached per file)
function hasAlpha(rec) {
  if (rec.alpha !== undefined) return rec.alpha;
  const w = rec.img.naturalWidth, h = rec.img.naturalHeight, c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(rec.img, 0, 0);
  let a = false; try { const d = x.getImageData(0, 0, w, h).data; for (let i = 3; i < d.length; i += 4) if (d[i] < 255) { a = true; break; } } catch { a = true; }
  c.width = c.height = 0; return (rec.alpha = a);
}
