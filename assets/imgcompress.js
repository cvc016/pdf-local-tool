// 圖片壓縮：用瀏覽器內建 Canvas 重新編碼（JPG／WebP）並可縮小尺寸，全部本機處理。
import { $, setupDrop, fmtSize, busy, downloadBlob, setStatus, toast, baseName, loadFflate } from './common.js';
import * as C from './common.js';
C.preload(C.loadFflate);

const zone = $('#drop'), input = $('#file'), list = $('#list'), work = $('#work'), status = $('#status'), go = $('#go'), q = $('#quality');
let imgs = [], seq = 0;
const isImg = (f) => /^image\/(jpeg|png|webp|gif|bmp)$/.test(f.type) || /\.(jpe?g|png|webp|gif|bmp)$/i.test(f.name);
setupDrop(zone, input, add, isImg);
setupDrop($('#more'), $('#file2'), add, isImg);
q.addEventListener('input', () => ($('#qv').textContent = q.value));

const loadImg = (url) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });

async function add(fs) {
  for (const file of fs) {
    const rec = { id: ++seq, file, url: URL.createObjectURL(file) };
    const li = document.createElement('li'); li.dataset.id = rec.id;
    li.innerHTML = `<div class="thumb"></div><div class="meta"><div class="name"></div><div class="sub">${fmtSize(file.size)}</div></div>
      <div class="ord"><button class="btn sm hidden" data-act="dl">下載</button><button class="btn sm danger" data-act="rm" aria-label="移除">✕</button></div>`;
    li.querySelector('.name').textContent = file.name;
    list.appendChild(li); rec.li = li; imgs.push(rec);
    try {
      rec.img = await loadImg(rec.url);
      li.querySelector('.thumb').appendChild(rec.img);
      li.querySelector('.sub').textContent = `${fmtSize(file.size)} · ${rec.img.naturalWidth}×${rec.img.naturalHeight}`;
    } catch { rec.bad = true; li.querySelector('.sub').textContent = '無法讀取此圖片'; li.querySelector('.sub').style.color = 'var(--danger)'; }
  }
  sync();
}
list.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  const li = b.closest('li'), rec = imgs.find((r) => r.id === +li.dataset.id);
  if (b.dataset.act === 'rm') { URL.revokeObjectURL(rec.url); imgs = imgs.filter((r) => r !== rec); li.remove(); sync(); }
  else if (b.dataset.act === 'dl' && rec.out) downloadBlob(rec.out.bytes, rec.out.name, rec.out.type);
});
$('#clear').addEventListener('click', () => { imgs.forEach((r) => URL.revokeObjectURL(r.url)); imgs = []; list.innerHTML = ''; sync(); });
function sync() {
  const okN = imgs.filter((r) => !r.bad).length;
  $('#summary').textContent = `共 ${imgs.length} 張圖片`;
  go.disabled = !okN;
  work.classList.toggle('hidden', !imgs.length); zone.classList.toggle('hidden', !!imgs.length);
  if (!imgs.length) setStatus(status, '');
}

const encode = (cv, type, quality) => new Promise((res) => cv.toBlob((b) => res(b), type, quality));

async function compress(rec, fmt, quality, maxW) {
  const im = rec.img;
  const s = maxW && Math.max(im.naturalWidth, im.naturalHeight) > maxW ? maxW / Math.max(im.naturalWidth, im.naturalHeight) : 1;
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(im.naturalWidth * s)); cv.height = Math.max(1, Math.round(im.naturalHeight * s));
  const ctx = cv.getContext('2d');
  let type = fmt === 'webp' ? 'image/webp' : fmt === 'png' ? 'image/png' : 'image/jpeg';
  if (type === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height); }
  ctx.drawImage(im, 0, 0, cv.width, cv.height);
  let blob = await encode(cv, type, quality);
  if (!blob || (type === 'image/webp' && blob.type !== 'image/webp')) { type = 'image/jpeg'; ctx.globalCompositeOperation = 'destination-over'; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height); blob = await encode(cv, type, quality); }
  cv.width = cv.height = 0;
  const ext = type === 'image/webp' ? 'webp' : type === 'image/png' ? 'png' : 'jpg';
  return { name: `${baseName(rec.file.name)}_壓縮.${ext}`, type, bytes: new Uint8Array(await blob.arrayBuffer()), w: Math.round(im.naturalWidth * s), h: Math.round(im.naturalHeight * s) };
}

go.addEventListener('click', () => busy(go, '壓縮中…', async () => {
  try {
    const fmt = $('#fmt').value, quality = +q.value / 100, maxW = +$('#maxw').value;
    const todo = imgs.filter((r) => !r.bad);
    let before = 0, after = 0;
    for (const [k, rec] of todo.entries()) {
      setStatus(status, `壓縮第 ${k + 1} / ${todo.length} 張…`);
      rec.out = await compress(rec, fmt, quality, maxW);
      before += rec.file.size; after += rec.out.bytes.length;
      const sub = rec.li.querySelector('.sub');
      const pct = Math.round((1 - rec.out.bytes.length / rec.file.size) * 100);
      sub.textContent = `${fmtSize(rec.file.size)} → ${fmtSize(rec.out.bytes.length)}（${pct >= 0 ? '減少 ' + pct : '增加 ' + -pct}%）· ${rec.out.w}×${rec.out.h}`;
      rec.li.querySelector('[data-act=dl]').classList.remove('hidden');
    }
    if (todo.length === 1) downloadBlob(todo[0].out.bytes, todo[0].out.name, todo[0].out.type);
    else {
      const { zipSync } = await loadFflate();
      const z = {}; todo.forEach((r) => (z[r.out.name] = [r.out.bytes, { level: 0 }]));
      downloadBlob(new Blob([zipSync(z)], { type: 'application/zip' }), '壓縮圖片.zip');
    }
    setStatus(status, `✓ 完成！合計 ${fmtSize(before)} → ${fmtSize(after)}${after > before ? '（比原檔大，建議降低品質或縮小尺寸）' : ''}，已開始下載${todo.length > 1 ? ' ZIP' : ''}。`, after > before ? 'err' : 'ok');
  } catch (e) {
    setStatus(status, e.message || '壓縮失敗', 'err'); toast(e.message || '壓縮失敗', true);
  }
}));
