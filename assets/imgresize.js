// 圖片尺寸調整／旋轉：依最長邊、百分比或指定寬高縮放，可旋轉 90°／180°／270° 與水平翻轉。全部本機處理。
import { $ } from './common.js';
import { initBatch, canvasFor, MIME, canWebp, srcFmt } from './imgbatch.js';
const mode = $('#mode');
if (!canWebp) { $('#fmt option[value=webp]').textContent += '（此瀏覽器不支援，將改用 JPG）'; $('#webpNote').classList.remove('hidden'); }
const ui = () => { for (const m of ['max', 'pct', 'exact']) $('#m_' + m).classList.toggle('hidden', mode.value !== m); };
mode.addEventListener('change', ui); ui();
initBatch({ suffix: '_調整', zipName: '調整尺寸圖片.zip', verb: '調整',
  opts: () => { const o = { mode: mode.value, max: +$('#maxSide').value || 0, pct: +$('#pct').value || 100, w: +$('#w').value || 0, h: +$('#h').value || 0, keep: $('#keepRatio').checked, rot: +$('#rot').value, flip: $('#flip').checked, fmt: $('#fmt').value }; o.key = JSON.stringify(o); return o; },
  render: (rec, o) => {
    const iw = rec.img.naturalWidth, ih = rec.img.naturalHeight;
    let w = iw, h = ih;
    if (o.mode === 'max' && o.max) { const s = Math.min(1, o.max / Math.max(iw, ih)); w = iw * s; h = ih * s; }
    else if (o.mode === 'pct') { w = iw * o.pct / 100; h = ih * o.pct / 100; }
    else if (o.mode === 'exact') {
      if (o.w && o.h && !o.keep) { w = o.w; h = o.h; }
      else if (o.w && o.h) { const s = Math.min(o.w / iw, o.h / ih); w = iw * s; h = ih * s; }
      else if (o.w) { w = o.w; h = ih * o.w / iw; } else if (o.h) { h = o.h; w = iw * o.h / ih; }
    }
    w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
    let f = o.fmt === 'keep' ? srcFmt(rec.file) : o.fmt;
    if (f === 'other') f = 'png';
    if (f === 'webp' && !canWebp) f = 'jpg';
    const type = MIME[f], side = o.rot % 180 !== 0;
    const { cv, ctx } = canvasFor(side ? h : w, side ? w : h, type);
    ctx.imageSmoothingQuality = 'high';
    ctx.translate(cv.width / 2, cv.height / 2);
    ctx.rotate(o.rot * Math.PI / 180);
    if (o.flip) ctx.scale(-1, 1);
    ctx.drawImage(rec.img, -w / 2, -h / 2, w, h);
    return { cv, type, quality: 0.92 };
  } });
