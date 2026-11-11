// 共用的批次圖片處理：讀入（瀏覽器原生解碼）→ canvas 繪製 → toBlob 編碼 → 單檔／ZIP 下載。全部本機處理。
import { $, setupDrop, fmtSize, busy, downloadBlob, setStatus, toast, baseName, loadFflate, preload } from './common.js';
preload(loadFflate);

export const MIME = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
export const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
// Does this browser's canvas encode WebP? (Safari < 17 falls back to PNG)
export const canWebp = (() => { try { const c = document.createElement('canvas'); c.width = c.height = 1; return c.toDataURL('image/webp').startsWith('data:image/webp'); } catch { return false; } })();
export const srcFmt = (f) => { const t = (f.type || '').toLowerCase(), n = f.name.toLowerCase();
  if (/jpe?g/.test(t) || /\.jpe?g$/.test(n)) return 'jpg'; if (/png/.test(t) || /\.png$/.test(n)) return 'png'; if (/webp/.test(t) || /\.webp$/.test(n)) return 'webp'; return 'other'; };
const isImg = (f) => /^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|bmp|avif|heic|heif)$/i.test(f.name);
const loadImg = (url) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
const encode = (cv, type, q) => new Promise((res) => cv.toBlob(res, type, q));

// Draw img onto a canvas of w×h; opaque formats get a background fill (transparent → bg colour).
export function canvasFor(w, h, type, bg = '#ffffff') {
  const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(w)); cv.height = Math.max(1, Math.round(h));
  const ctx = cv.getContext('2d'); ctx.imageSmoothingQuality = 'high';
  if (type === 'image/jpeg') { ctx.fillStyle = bg; ctx.fillRect(0, 0, cv.width, cv.height); }
  return { cv, ctx };
}

/**
 * opts(): current settings. render(rec, o) → { cv, type, quality } (canvas already drawn).
 * Output is recomputed live whenever files or settings change (#opts inputs).
 */
export function initBatch({ suffix, zipName, opts, render, verb = '處理', noGrow = false, keepOriginal }) {
  const zone = $('#drop'), list = $('#list'), work = $('#work'), status = $('#status'), go = $('#go');
  let imgs = [], seq = 0, gen = 0, timer;
  setupDrop(zone, $('#file'), add, isImg);
  setupDrop($('#more'), $('#file2'), add, isImg);
  async function add(fs) {
    for (const file of fs) {
      const rec = { id: ++seq, file, url: URL.createObjectURL(file) };
      const li = document.createElement('li'); li.dataset.id = rec.id;
      li.innerHTML = `<div class="thumb"></div><div class="meta"><div class="name"></div><div class="sub">${fmtSize(file.size)}</div><div class="sub res"></div></div>
        <div class="ord"><button class="btn sm hidden" data-act="dl">下載</button><button class="btn sm danger" data-act="rm" aria-label="移除">✕</button></div>`;
      li.querySelector('.name').textContent = file.name;
      list.appendChild(li); rec.li = li; imgs.push(rec);
      try {
        rec.img = await loadImg(rec.url);
        li.querySelector('.thumb').appendChild(rec.img);
        li.querySelector('.sub').textContent = `${fmtSize(file.size)} · ${rec.img.naturalWidth}×${rec.img.naturalHeight}`;
      } catch { rec.bad = true; const s = li.querySelector('.sub'); s.textContent = '此瀏覽器無法讀取這張圖片（例如 HEIC／AVIF 不支援）'; s.style.color = 'var(--danger)'; }
    }
    sync(); schedule(0);
  }
  list.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const li = b.closest('li'), rec = imgs.find((r) => r.id === +li.dataset.id);
    if (b.dataset.act === 'rm') { URL.revokeObjectURL(rec.url); imgs = imgs.filter((r) => r !== rec); li.remove(); sync(); showTotal(); }
    else if (b.dataset.act === 'dl' && rec.out) downloadBlob(rec.out.blob, rec.out.name);
  });
  $('#clear').addEventListener('click', () => { imgs.forEach((r) => URL.revokeObjectURL(r.url)); imgs = []; list.innerHTML = ''; sync(); });
  function sync() {
    $('#summary').textContent = `共 ${imgs.length} 張圖片`;
    go.disabled = !imgs.some((r) => !r.bad);
    work.classList.toggle('hidden', !imgs.length); zone.classList.toggle('hidden', !!imgs.length);
    if (!imgs.length) setStatus(status, '');
  }
  const optsEl = $('#opts');
  optsEl.addEventListener('input', () => schedule(350)); optsEl.addEventListener('change', () => schedule(150));

  async function one(rec, o) {
    // render() returns either a drawn canvas to encode here, or an already-encoded { blob, w, h }.
    const r = await render(rec, o);
    let blob, w, h;
    if (r.blob) ({ blob, w, h } = r);
    else { blob = await encode(r.cv, r.type, r.quality); w = r.cv.width; h = r.cv.height; r.cv.width = r.cv.height = 0; }
    if (!blob) throw new Error('編碼失敗');
    const t = blob.type || r.type;
    // Never hand back something bigger than what the user gave us: keep the original file instead.
    if (noGrow && blob.size >= rec.file.size) {
      const k = keepOriginal ? await keepOriginal(rec.file) : { blob: rec.file };
      return { blob: k.blob, size: k.blob.size, type: rec.file.type, w: rec.img.naturalWidth, h: rec.img.naturalHeight, name: rec.file.name, kept: true, stripped: k.stripped };
    }
    return { blob, size: blob.size, type: t, w, h, name: `${baseName(rec.file.name)}${suffix}.${EXT[t] || 'png'}` };
  }
  function showTotal() {
    const done = imgs.filter((r) => r.out && !r.bad); if (!done.length) return;
    const a = done.reduce((s, r) => s + r.file.size, 0), b = done.reduce((s, r) => s + r.out.size, 0), p = Math.round((1 - b / a) * 100);
    const kept = done.filter((r) => r.out.kept).length;
    const keptMsg = !kept ? '' : kept === done.length ? (kept > 1 ? '這些圖片已經很精簡，再壓會變大，已保留原檔。' : '這張圖已經很精簡，再壓會變大，已保留原檔。') : `其中 ${kept} 張已經很精簡，再壓會變大，已保留原檔。`;
    setStatus(status, kept === done.length ? `${keptMsg}可試試縮小「最長邊」或改用較低品質。` : `合計 ${fmtSize(a)} → ${fmtSize(b)}（${p >= 0 ? '節省 ' + p : '增加 ' + -p}%）。${keptMsg}按下方按鈕下載${done.length > 1 ? ' ZIP' : ''}，或在清單中個別下載。`, b > a ? 'err' : 'ok');
  }
  async function run() {
    const my = ++gen, o = opts();
    const todo = imgs.filter((r) => !r.bad);
    for (const [k, rec] of todo.entries()) {
      if (my !== gen) return false;
      if (rec.outKey === o.key && rec.out) continue;
      setStatus(status, `${verb}第 ${k + 1} / ${todo.length} 張…`);
      try { rec.out = await one(rec, o); rec.outKey = o.key; }
      catch (e) { rec.out = null; rec.li.querySelector('.res').textContent = e.message; continue; }
      if (my !== gen) return false;
      const p = Math.round((1 - rec.out.size / rec.file.size) * 100);
      const res = rec.li.querySelector('.res');
      if (rec.out.kept) { res.textContent = `這張圖已經很精簡，再壓會變大，已保留原檔${rec.out.stripped ? `（已移除 EXIF／GPS 等資訊，${fmtSize(rec.out.size)}）` : ''}`; res.style.color = 'var(--muted, #64748b)'; }
      else {
        res.textContent = `→ ${(EXT[rec.out.type] || 'img').toUpperCase()} ${fmtSize(rec.out.size)}（${p >= 0 ? '節省 ' + p : '增加 ' + -p}%）· ${rec.out.w}×${rec.out.h}`;
        res.style.color = p >= 0 ? 'var(--ok, #15803d)' : 'var(--danger)';
      }
      rec.li.querySelector('[data-act=dl]').classList.remove('hidden');
    }
    showTotal(); return true;
  }
  function schedule(ms) { clearTimeout(timer); if (imgs.length) timer = setTimeout(() => run().catch((e) => setStatus(status, e.message, 'err')), ms); }

  go.addEventListener('click', () => busy(go, `${verb}中…`, async () => {
    try {
      clearTimeout(timer);
      while (!(await run())); // finish current settings
      const todo = imgs.filter((r) => !r.bad && r.out);
      if (!todo.length) throw new Error('沒有可下載的圖片');
      if (todo.length === 1) downloadBlob(todo[0].out.blob, todo[0].out.name);
      else {
        const { zipSync } = await loadFflate(); const z = {}, used = {};
        for (const r of todo) { let n = r.out.name; if (used[n]) n = n.replace(/(\.\w+)$/, `_${++used[n]}$1`); else used[n] = 1; z[n] = [new Uint8Array(await r.out.blob.arrayBuffer()), { level: 0 }]; }
        downloadBlob(new Blob([zipSync(z)], { type: 'application/zip' }), zipName);
      }
      toast('已開始下載');
    } catch (e) { setStatus(status, e.message || '處理失敗', 'err'); toast(e.message || '處理失敗', true); }
  }));
}
// Scale factor so the longest side ≤ max (0 = keep).
export const fit = (img, max) => { const m = Math.max(img.naturalWidth, img.naturalHeight); return max && m > max ? max / m : 1; };
