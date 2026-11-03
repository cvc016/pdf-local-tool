// 圖片加浮水印：文字（支援中文）平鋪、置中或角落，可調大小、透明度、顏色、角度。全部本機處理。
import { $ } from './common.js';
import { initBatch, canvasFor, MIME, canWebp, srcFmt } from './imgbatch.js';
for (const [id, out] of [['wmSize', 'sv'], ['wmOpacity', 'ov']]) { const e = $('#' + id); e.addEventListener('input', () => ($('#' + out).textContent = e.value)); }
if (!canWebp) $('#fmt option[value=webp]')?.remove();
initBatch({ suffix: '_浮水印', zipName: '浮水印圖片.zip', verb: '加浮水印',
  opts: () => { const o = { t: $('#wmText').value.trim() || '僅供申請使用', pos: $('#wmPos').value, size: +$('#wmSize').value, op: +$('#wmOpacity').value, color: $('#wmColor').value, fmt: $('#fmt').value }; o.key = JSON.stringify(o); return o; },
  render: (rec, o) => {
    const w = rec.img.naturalWidth, h = rec.img.naturalHeight;
    let f = o.fmt === 'keep' ? srcFmt(rec.file) : o.fmt;
    if (f === 'other') f = 'png';
    const type = MIME[f];
    const { cv, ctx } = canvasFor(w, h, type);
    ctx.drawImage(rec.img, 0, 0);
    const fs = Math.max(10, Math.round(Math.min(w, h) * o.size / 100));
    ctx.font = `bold ${fs}px system-ui, "PingFang TC", "Microsoft JhengHei", "Noto Sans TC", sans-serif`;
    ctx.fillStyle = o.color; ctx.globalAlpha = o.op / 100; ctx.textBaseline = 'middle';
    const lines = o.t.split(/\n/), tw = Math.max(...lines.map((l) => ctx.measureText(l).width)), lh = fs * 1.25;
    const block = (x, y) => lines.forEach((l, i) => ctx.fillText(l, x, y + (i - (lines.length - 1) / 2) * lh));
    if (o.pos === 'tile') {
      ctx.textAlign = 'center';
      ctx.translate(w / 2, h / 2); ctx.rotate(-Math.PI / 6);
      const sx = tw + fs * 3, sy = lines.length * lh + fs * 2.5, R = Math.hypot(w, h) / 2;
      for (let y = -R, r = 0; y <= R; y += sy, r++) for (let x = -R + (r % 2) * sx / 2; x <= R; x += sx) block(x, y);
    } else if (o.pos === 'center') {
      ctx.textAlign = 'center'; ctx.translate(w / 2, h / 2); ctx.rotate(-Math.PI / 6); block(0, 0);
    } else {
      const m = fs * 0.8, hh = lines.length * lh;
      ctx.textAlign = o.pos === 'br' ? 'right' : 'left';
      block(o.pos === 'br' ? w - m : m, h - m - hh / 2);
    }
    return { cv, type, quality: 0.92 };
  } });
