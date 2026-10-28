// Shared helpers. Everything runs locally in the browser; no network requests
// are made with user files.
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const VENDOR = new URL('../vendor/', import.meta.url).href;

// ---- ad-free flag (set by assets/unlock.js after a license key is verified) ----
export const AD_FREE_KEY = 'adFreeLicense';
export function isAdFree() {
  try { const v = JSON.parse(localStorage.getItem(AD_FREE_KEY) || 'null'); return !!(v && v.ok); } catch { return false; }
}
if (isAdFree()) document.documentElement.classList.add('ad-free');

// ---- library loaders (lazy, local files only) ----
let pdfLibP, pdfjsP, fflateP;
export function loadPdfLib() { return (pdfLibP ||= import(VENDOR + 'pdf-lib/pdf-lib.esm.min.js')); }
export function loadFflate() { return (fflateP ||= import(VENDOR + 'fflate/fflate.esm.js')); }
export function loadPdfjs() {
  return (pdfjsP ||= import(VENDOR + 'pdfjs/pdf.min.js').then((m) => {
    m.GlobalWorkerOptions.workerSrc = VENDOR + 'pdfjs/pdf.worker.min.js';
    return m;
  }));
}
// Warm up libraries after page load so tools keep working if the network drops.
export function preload(...fns) { const go = () => fns.forEach((f) => f().catch(() => {})); ('requestIdleCallback' in window) ? requestIdleCallback(go, { timeout: 3000 }) : setTimeout(go, 1500); }
export async function openPdfjs(bytes) {
  const pdfjs = await loadPdfjs();
  return pdfjs.getDocument({
    data: bytes.slice(0), // pdf.js transfers the buffer; keep our copy intact
    cMapUrl: VENDOR + 'pdfjs/cmaps/', cMapPacked: true,
    standardFontDataUrl: VENDOR + 'pdfjs/standard_fonts/',
    isEvalSupported: false, enableXfa: false,
  }).promise;
}

// Load with pdf-lib, with friendly errors.
export async function openPdfLib(bytes, name = '') {
  const { PDFDocument } = await loadPdfLib();
  try {
    return await PDFDocument.load(bytes, { updateMetadata: false });
  } catch (e) {
    if (/encrypt/i.test(String(e && e.message))) throw new Error(`「${name}」有密碼保護或已加密，目前不支援。`);
    throw new Error(`無法讀取「${name}」，檔案可能已損毀或不是 PDF。`);
  }
}

// Render a page thumbnail into a canvas (max side `size` CSS px).
export async function renderThumb(pdf, pageNo, size = 160) {
  const page = await pdf.getPage(pageNo);
  const v1 = page.getViewport({ scale: 1 });
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const scale = (size * dpr) / Math.max(v1.width, v1.height);
  const vp = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
  canvas.style.width = Math.round(vp.width / dpr) + 'px';
  canvas.style.height = Math.round(vp.height / dpr) + 'px';
  await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
  page.cleanup();
  return canvas;
}

// Lazily render thumbnails as they scroll into view.
export function lazyThumbs(pdf, items, getPageNo, size = 150) {
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      io.unobserve(en.target);
      const el = en.target;
      renderThumb(pdf, getPageNo(el), size).then((c) => {
        const box = el.querySelector('.box'); box.prepend(c);
        el.dispatchEvent(new CustomEvent('thumb', { detail: c }));
      }).catch(() => {});
    }
  }, { rootMargin: '400px' });
  items.forEach((el) => io.observe(el));
  return io;
}

export async function readBytes(file) { return new Uint8Array(await file.arrayBuffer()); }
export const baseName = (n) => n.replace(/\.[^.]+$/, '');
export function fmtSize(b) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(0) + ' KB';
  return (b / 1048576).toFixed(1) + ' MB';
}
export const tick = () => new Promise((r) => setTimeout(r, 30));

export function downloadBlob(data, filename, type = 'application/pdf') {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

let toastTimer;
export function toast(msg, err = false) {
  let t = $('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = msg; t.classList.toggle('err', err); t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), err ? 6000 : 3500);
}

export function setStatus(el, msg, kind = '') {
  el.textContent = msg; el.className = 'status ' + kind;
}

export async function busy(btn, label, fn) {
  const old = btn.innerHTML; btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span>${label}`;
  try { await tick(); return await fn(); }
  finally { btn.disabled = false; btn.innerHTML = old; }
}

// Drop zone: click / keyboard / drag-and-drop.
export function setupDrop(zone, input, onFiles, filter) {
  const handle = (list) => {
    const files = Array.from(list || []);
    const ok = filter ? files.filter(filter) : files;
    if (files.length && !ok.length) toast('不支援的檔案格式。', true);
    else if (ok.length < files.length) toast(`已略過 ${files.length - ok.length} 個不支援的檔案。`);
    if (ok.length) onFiles(ok);
  };
  zone.addEventListener('click', (e) => { if (e.target !== input) input.click(); });
  zone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
  input.addEventListener('change', () => { handle(input.files); input.value = ''; });
  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('over'));
  zone.addEventListener('drop', (e) => { e.preventDefault(); zone.classList.remove('over'); handle(e.dataTransfer.files); });
}
// Avoid the browser opening a file dropped outside the zone.
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());

export const isPdf = (f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);

// Pointer-based sortable (works with mouse and touch).
// Mouse: drag anywhere on the item. Touch: drag the handle (so the page can still scroll).
export function makeSortable(container, { item, handle, axis = 'y', onChange }) {
  container.addEventListener('pointerdown', (e) => {
    const it = e.target.closest(item);
    if (!it || !container.contains(it) || e.button > 0) return;
    if (e.target.closest('button,input,select,a,label')) return;
    if (e.pointerType !== 'mouse' && !(handle && e.target.closest(handle))) return;
    e.preventDefault();
    const startX = e.clientX, startY = e.clientY;
    let started = false, moved = false;
    const move = (ev) => {
      if (!started) {
        if (Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) < 6) return;
        started = true; it.classList.add('dragging');
      }
      const edge = 70;
      if (ev.clientY < edge) window.scrollBy(0, -12); else if (ev.clientY > innerHeight - edge) window.scrollBy(0, 12);
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const over = el && el.closest(item);
      if (!over || over === it || !container.contains(over)) return;
      const r = over.getBoundingClientRect();
      const after = axis === 'y' ? ev.clientY > r.top + r.height / 2 : ev.clientX > r.left + r.width / 2;
      const ref = after ? over.nextSibling : over;
      if (ref !== it) { container.insertBefore(it, ref); moved = true; }
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      it.classList.remove('dragging');
      if (moved && onChange) onChange();
      if (started) { const stop = (c) => { c.stopPropagation(); c.preventDefault(); }; it.addEventListener('click', stop, { capture: true, once: true }); setTimeout(() => it.removeEventListener('click', stop, { capture: true }), 50); }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  });
}

// Parse "1-3, 5, 8-" into groups of 0-based page indices.
export function parseRanges(text, max) {
  const groups = [];
  for (const part of text.replace(/[，、；;\s]+/g, ',').split(',')) {
    if (!part) continue;
    const m = part.replace(/[－–—~～]/g, '-').match(/^(\d*)-(\d*)$|^(\d+)$/);
    if (!m) throw new Error(`無法解讀「${part}」，請使用如 1-3, 5, 8-10 的格式。`);
    let a, b;
    if (m[3]) a = b = +m[3];
    else { a = m[1] ? +m[1] : 1; b = m[2] ? +m[2] : max; }
    if (a < 1 || b < 1 || a > max || b > max) throw new Error(`頁碼「${part}」超出範圍（共 ${max} 頁）。`);
    const g = [];
    if (a <= b) for (let i = a; i <= b; i++) g.push(i - 1); else for (let i = a; i >= b; i--) g.push(i - 1);
    groups.push(g);
  }
  if (!groups.length) throw new Error('請輸入頁碼範圍。');
  return groups;
}
