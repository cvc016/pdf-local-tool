// 圖片格式轉換：PNG／JPG／WebP 互轉（也可讀 GIF、BMP、AVIF 等瀏覽器能解碼的格式）。全部本機處理。
import { $ } from './common.js';
import { initBatch, canvasFor, MIME, canWebp } from './imgbatch.js';
const q = $('#quality'), fmt = $('#fmt');
if (!canWebp) { const o = $('#fmt option[value=webp]'); o.disabled = true; o.textContent += '（此瀏覽器不支援輸出）'; if (fmt.value === 'webp') fmt.value = 'jpg'; $('#webpNote').classList.remove('hidden'); }
const ui = () => { $('#qWrap').classList.toggle('hidden', fmt.value === 'png'); $('#bgWrap').classList.toggle('hidden', fmt.value !== 'jpg'); };
fmt.addEventListener('change', ui); ui();
q.addEventListener('input', () => ($('#qv').textContent = q.value));
initBatch({ suffix: '', zipName: '轉換圖片.zip', verb: '轉換',
  opts: () => { const o = { fmt: fmt.value, q: +q.value, bg: $('#bg').value }; o.key = JSON.stringify(o); return o; },
  render: (rec, o) => {
    const type = MIME[o.fmt === 'webp' && !canWebp ? 'jpg' : o.fmt];
    const { cv, ctx } = canvasFor(rec.img.naturalWidth, rec.img.naturalHeight, type, o.bg);
    ctx.drawImage(rec.img, 0, 0);
    return { cv, type, quality: type === 'image/png' ? undefined : o.q / 100 };
  } });
