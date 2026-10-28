import { $, $$, setupDrop, readBytes, fmtSize, makeSortable, loadPdfLib, busy, downloadBlob, setStatus, toast, baseName } from './common.js';

const zone = $('#drop'), input = $('#file'), list = $('#list'), work = $('#work'), status = $('#status'), go = $('#go');
let imgs = []; let seq = 0;
const isImg = (f) => /^image\//.test(f.type) || /\.(jpe?g|png|heic|heif|webp|gif|bmp)$/i.test(f.name);
const isHeic = (f) => /hei[cf]/i.test(f.type) || /\.hei[cf]$/i.test(f.name);

setupDrop(zone, input, add, isImg);
setupDrop($('#more'), $('#file2'), add, isImg);

function loadImg(url) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
}

async function add(fs) {
  for (const file of fs) {
    const rec = { id: ++seq, file, url: URL.createObjectURL(file) };
    imgs.push(rec);
    const li = document.createElement('li'); li.dataset.id = rec.id;
    li.innerHTML = `<span class="handle" title="拖曳排序" aria-hidden="true">⠿</span><div class="thumb"></div>
      <div class="meta"><div class="name"></div><div class="sub">${fmtSize(file.size)}</div></div>
      <div class="ord"><button class="btn sm" data-act="up" aria-label="上移">▲</button><button class="btn sm" data-act="down" aria-label="下移">▼</button><button class="btn sm danger" data-act="rm" aria-label="移除">✕</button></div>`;
    li.querySelector('.name').textContent = file.name;
    list.appendChild(li);
    try {
      const im = await loadImg(rec.url);
      li.querySelector('.thumb').appendChild(im);
      li.querySelector('.sub').textContent = `${fmtSize(file.size)} · ${im.naturalWidth}×${im.naturalHeight}`;
    } catch {
      rec.bad = true;
      li.querySelector('.sub').textContent = isHeic(file)
        ? '此瀏覽器無法讀取 HEIC，請改用 Safari，或先轉成 JPG'
        : '無法讀取此圖片';
      li.querySelector('.sub').style.color = 'var(--danger)';
    }
  }
  refresh();
}
list.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-act]'); if (!b) return;
  const li = b.closest('li');
  if (b.dataset.act === 'up' && li.previousElementSibling) list.insertBefore(li, li.previousElementSibling);
  if (b.dataset.act === 'down' && li.nextElementSibling) list.insertBefore(li.nextElementSibling, li);
  if (b.dataset.act === 'rm') { const r = imgs.find((x) => x.id === +li.dataset.id); URL.revokeObjectURL(r.url); imgs = imgs.filter((x) => x !== r); li.remove(); }
  sync(); refresh();
});
makeSortable(list, { item: 'li', handle: '.handle', axis: 'y', onChange: sync });
function sync() { const ids = Array.from(list.children).map((l) => +l.dataset.id); imgs.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id)); }
function refresh() {
  work.classList.toggle('hidden', !imgs.length); zone.classList.toggle('hidden', !!imgs.length);
  $('#summary').textContent = `${imgs.length} 張圖片`;
  go.disabled = !imgs.some((r) => !r.bad);
}
$('#clear').addEventListener('click', () => { imgs.forEach((r) => URL.revokeObjectURL(r.url)); imgs = []; list.innerHTML = ''; refresh(); });

// JPEG EXIF orientation (1 = normal). Returns 1 if not found.
function jpegOrientation(b) {
  if (b[0] !== 0xff || b[1] !== 0xd8) return 1;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let o = 2;
  while (o + 4 < b.length) {
    if (b[o] !== 0xff) return 1;
    const mk = b[o + 1], len = dv.getUint16(o + 2);
    if (mk === 0xe1 && dv.getUint32(o + 4) === 0x45786966) {
      const t = o + 10, le = dv.getUint16(t) === 0x4949;
      const ifd = t + dv.getUint32(t + 4, le), n = dv.getUint16(ifd, le);
      for (let i = 0; i < n; i++) {
        const e = ifd + 2 + i * 12;
        if (dv.getUint16(e, le) === 0x0112) return dv.getUint16(e + 8, le);
      }
      return 1;
    }
    if (mk === 0xda) return 1;
    o += 2 + len;
  }
  return 1;
}

// Re-encode through a canvas (applies EXIF orientation; decodes WebP/GIF/HEIC where supported).
async function viaCanvas(rec, png) {
  const im = await loadImg(rec.url);
  let w = im.naturalWidth, h = im.naturalHeight;
  const max = 16e6; if (w * h > max) { const s = Math.sqrt(max / (w * h)); w = Math.floor(w * s); h = Math.floor(h * s); }
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  if (!png) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); }
  ctx.drawImage(im, 0, 0, w, h);
  const blob = await new Promise((r) => c.toBlob(r, png ? 'image/png' : 'image/jpeg', 0.92));
  return { bytes: await readBytes(blob), png };
}

async function embed(out, rec) {
  const b = await readBytes(rec.file);
  const isJpg = b[0] === 0xff && b[1] === 0xd8;
  const isPng = b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  try {
    if (isJpg && jpegOrientation(b) === 1) return await out.embedJpg(b);
    if (isPng) return await out.embedPng(b);
  } catch { /* fall through to canvas */ }
  const r = await viaCanvas(rec, !isJpg && !isHeic(rec.file));
  return r.png ? out.embedPng(r.bytes) : out.embedJpg(r.bytes);
}

const SIZES = { a4: [595.28, 841.89], letter: [612, 792] };

go.addEventListener('click', () => busy(go, '轉換中…', async () => {
  try {
    sync();
    const { PDFDocument } = await loadPdfLib();
    const out = await PDFDocument.create();
    const size = $('#size').value, orient = $('#orient').value, margin = +$('#margin').value;
    let n = 0;
    for (const rec of imgs) {
      if (rec.bad) continue;
      const img = await embed(out, rec);
      const iw = img.width * 0.75, ih = img.height * 0.75; // px -> pt at 96 dpi
      let pw, ph;
      if (size === 'fit') {
        const s = Math.min(1, 14000 / Math.max(iw, ih));
        pw = iw * s + margin * 2; ph = ih * s + margin * 2;
      } else {
        [pw, ph] = SIZES[size];
        const land = orient === 'landscape' || (orient === 'auto' && iw > ih);
        if (land) [pw, ph] = [ph, pw];
      }
      const aw = pw - margin * 2, ah = ph - margin * 2;
      const s = Math.min(aw / iw, ah / ih);
      const dw = iw * s, dh = ih * s;
      const page = out.addPage([pw, ph]);
      page.drawImage(img, { x: (pw - dw) / 2, y: (ph - dh) / 2, width: dw, height: dh });
      n++;
    }
    if (!n) throw new Error('沒有可轉換的圖片。');
    const bytes = await out.save();
    const first = imgs.find((r) => !r.bad);
    downloadBlob(bytes, `${n > 1 ? baseName(first.file.name) + '_等' + n + '張' : baseName(first.file.name)}.pdf`);
    const skipped = imgs.length - n;
    setStatus(status, `✓ 完成！共 ${n} 頁（${fmtSize(bytes.length)}），已開始下載。${skipped ? `已略過 ${skipped} 張無法讀取的圖片。` : ''}`, 'ok');
  } catch (e) { setStatus(status, e.message || '轉換失敗', 'err'); toast(e.message || '轉換失敗', true); }
}));
