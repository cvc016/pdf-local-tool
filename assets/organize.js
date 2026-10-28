import { $, $$, setupDrop, isPdf, readBytes, openPdfjs, lazyThumbs, renderThumb, fmtSize, makeSortable, loadPdfLib, openPdfLib, busy, downloadBlob, setStatus, toast, baseName } from './common.js';
import * as C from './common.js';
C.preload(C.loadPdfLib, C.loadPdfjs);

const zone = $('#drop'), input = $('#file'), work = $('#work'), grid = $('#grid'), status = $('#status'), go = $('#go');
let src = null, pdf = null;
// per original page index: { rot: extra degrees, del: bool }
let state = [];

setupDrop(zone, input, (fs) => load(fs[0]), isPdf);

async function load(file) {
  try {
    const bytes = await readBytes(file);
    if (pdf) pdf.destroy();
    pdf = await openPdfjs(bytes);
    src = { file, bytes, pages: pdf.numPages };
  } catch { toast(`無法讀取「${file.name}」，可能已加密或損毀。`, true); return; }
  state = Array.from({ length: src.pages }, () => ({ rot: 0, del: false }));
  $('#fname').textContent = `${file.name}（${src.pages} 頁，${fmtSize(file.size)}）`;
  grid.innerHTML = ''; setStatus(status, '');
  const items = [];
  for (let i = 0; i < src.pages; i++) {
    const d = document.createElement('div');
    d.className = 'pg'; d.dataset.idx = i;
    d.innerHTML = `<div class="box"></div><div class="num">第 ${i + 1} 頁</div>
      <div class="ctl"><button data-act="l" title="向左轉" aria-label="第 ${i + 1} 頁向左轉">↺</button><button data-act="r" title="向右轉" aria-label="第 ${i + 1} 頁向右轉">↻</button>
      <button data-act="del" title="刪除" aria-label="刪除第 ${i + 1} 頁">🗑</button>
      <span class="handle" title="拖曳排序" aria-hidden="true">⠿</span></div>`;
    d.addEventListener('thumb', () => paint(d));
    grid.appendChild(d); items.push(d);
  }
  lazyThumbs(pdf, items, (el) => +el.dataset.idx + 1);
  zone.classList.add('hidden'); work.classList.remove('hidden');
  summary();
}

function paint(d) {
  const s = state[+d.dataset.idx];
  const c = d.querySelector('canvas'); if (c) c.style.transform = `rotate(${s.rot}deg)`;
  d.classList.toggle('del', s.del);
  const b = d.querySelector('[data-act=del]');
  b.textContent = s.del ? '↩' : '🗑'; b.title = s.del ? '還原' : '刪除';
}
function summary() {
  const keep = state.filter((s) => !s.del).length;
  $('#summary').textContent = `保留 ${keep} / ${state.length} 頁`;
  go.disabled = keep === 0;
}

grid.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-act]'); if (!b) return;
  const d = b.closest('.pg'); const s = state[+d.dataset.idx];
  if (b.dataset.act === 'l') s.rot -= 90;
  if (b.dataset.act === 'r') s.rot += 90;
  if (b.dataset.act === 'del') s.del = !s.del;
  paint(d); summary();
});
makeSortable(grid, { item: '.pg', handle: '.handle', axis: 'x', onChange: () => setStatus(status, '') });

const on = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
on('rotAllL', () => { state.forEach((s) => (s.rot -= 90)); $$('.pg', grid).forEach(paint); });
on('rotAllR', () => { state.forEach((s) => (s.rot += 90)); $$('.pg', grid).forEach(paint); });
on('reverse', () => { $$('.pg', grid).reverse().forEach((d) => grid.appendChild(d)); });
on('resetAll', () => {
  state.forEach((s) => { s.rot = 0; s.del = false; });
  $$('.pg', grid).sort((a, b) => a.dataset.idx - b.dataset.idx).forEach((d) => { grid.appendChild(d); paint(d); });
  summary();
});
// Mark (nearly) blank pages for deletion: render small and count non-white pixels.
on('blank', async () => {
  const btn = document.getElementById('blank');
  await busy(btn, '偵測中…', async () => {
    let n = 0;
    for (let i = 0; i < state.length; i++) {
      const c = await renderThumb(pdf, i + 1, 80);
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let ink = 0;
      for (let k = 0; k < d.length; k += 4) if (d[k] < 235 || d[k + 1] < 235 || d[k + 2] < 235) ink++;
      if (ink / (d.length / 4) < 0.003) { state[i].del = true; n++; }
    }
    $$('.pg', grid).forEach(paint); summary();
    toast(n ? `已標記 ${n} 個空白頁為刪除，可再按 ↩ 還原。` : '沒有找到空白頁。');
  });
});
$('#reset').addEventListener('click', () => { if (pdf) pdf.destroy(); pdf = null; grid.innerHTML = ''; work.classList.add('hidden'); zone.classList.remove('hidden'); });

go.addEventListener('click', () => busy(go, '處理中…', async () => {
  try {
    const { PDFDocument, degrees } = await loadPdfLib();
    const doc = await openPdfLib(src.bytes, src.file.name);
    const order = $$('.pg', grid).map((d) => +d.dataset.idx).filter((i) => !state[i].del);
    const out = await PDFDocument.create();
    const pages = await out.copyPages(doc, order);
    pages.forEach((p, k) => {
      const extra = state[order[k]].rot;
      if (extra % 360) p.setRotation(degrees((((p.getRotation().angle + extra) % 360) + 360) % 360));
      out.addPage(p);
    });
    const bytes = await out.save();
    downloadBlob(bytes, `${baseName(src.file.name)}_${document.body.dataset.suffix || '已整理'}.pdf`);
    setStatus(status, `✓ 完成！共 ${order.length} 頁（${fmtSize(bytes.length)}），已開始下載。`, 'ok');
  } catch (e) { setStatus(status, e.message || '處理失敗', 'err'); toast(e.message || '處理失敗', true); }
}));
