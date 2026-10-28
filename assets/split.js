import { $, $$, setupDrop, isPdf, readBytes, openPdfjs, lazyThumbs, fmtSize, loadPdfLib, openPdfLib, busy, downloadBlob, setStatus, toast, baseName, parseRanges, loadFflate } from './common.js';
import * as C from './common.js';
C.preload(C.loadPdfLib, C.loadPdfjs, C.loadFflate);

const zone = $('#drop'), input = $('#file'), work = $('#work'), grid = $('#grid'), status = $('#status'), go = $('#go'), ranges = $('#ranges'), results = $('#results');
let src = null; // {file, bytes, pages}
let pdf = null;

setupDrop(zone, input, (fs) => load(fs[0]), isPdf);

async function load(file) {
  try {
    const bytes = await readBytes(file);
    if (pdf) pdf.destroy();
    pdf = await openPdfjs(bytes);
    src = { file, bytes, pages: pdf.numPages };
  } catch {
    toast(`無法讀取「${file.name}」，可能已加密或損毀。`, true); return;
  }
  $('#fname').textContent = `${file.name}（${src.pages} 頁，${fmtSize(file.size)}）`;
  grid.innerHTML = ''; results.innerHTML = ''; setStatus(status, '');
  const items = [];
  for (let i = 1; i <= src.pages; i++) {
    const d = document.createElement('div');
    d.className = 'pg'; d.dataset.page = i; d.tabIndex = 0; d.setAttribute('role', 'checkbox'); d.setAttribute('aria-checked', 'false');
    d.innerHTML = `<div class="box"><span class="tick">✓</span></div><div class="num">第 ${i} 頁</div>`;
    grid.appendChild(d); items.push(d);
  }
  lazyThumbs(pdf, items, (el) => +el.dataset.page);
  zone.classList.add('hidden'); work.classList.remove('hidden');
  ranges.placeholder = `例如：1-3, 5, ${Math.min(6, src.pages)}-${src.pages}`;
}

// Click thumbnails to select pages -> fills the range box.
grid.addEventListener('click', (e) => { const p = e.target.closest('.pg'); if (p) toggle(p); });
grid.addEventListener('keydown', (e) => { if ((e.key === ' ' || e.key === 'Enter') && e.target.classList.contains('pg')) { e.preventDefault(); toggle(e.target); } });
function toggle(p) {
  p.classList.toggle('sel'); p.setAttribute('aria-checked', p.classList.contains('sel'));
  const sel = $$('.pg.sel', grid).map((x) => +x.dataset.page).sort((a, b) => a - b);
  const parts = []; // compress to ranges
  for (let i = 0; i < sel.length; i++) {
    let j = i; while (j + 1 < sel.length && sel[j + 1] === sel[j] + 1) j++;
    parts.push(i === j ? `${sel[i]}` : `${sel[i]}-${sel[j]}`); i = j;
  }
  ranges.value = parts.join(', ');
  $('input[name=mode][value=ranges]').checked = true; syncMode();
}
function syncMode() {
  const m = $('input[name=mode]:checked').value;
  $('#rangeOpts').classList.toggle('hidden', m !== 'ranges');
}
$$('input[name=mode]').forEach((r) => r.addEventListener('change', syncMode));
$('#reset').addEventListener('click', () => { if (pdf) pdf.destroy(); pdf = null; src = null; grid.innerHTML = ''; work.classList.add('hidden'); zone.classList.remove('hidden'); });

go.addEventListener('click', () => busy(go, '分割中…', async () => {
  results.innerHTML = '';
  try {
    const mode = $('input[name=mode]:checked').value;
    let groups;
    if (mode === 'each') groups = Array.from({ length: src.pages }, (_, i) => [i]);
    else {
      groups = parseRanges(ranges.value, src.pages);
      if ($('#single').checked) groups = [groups.flat()];
    }
    const { PDFDocument } = await loadPdfLib();
    const doc = await openPdfLib(src.bytes, src.file.name);
    const base = baseName(src.file.name);
    const outs = [];
    for (const g of groups) {
      const out = await PDFDocument.create();
      (await out.copyPages(doc, g)).forEach((p) => out.addPage(p));
      const label = g.length === 1 ? `${g[0] + 1}` : `${g[0] + 1}-${g[g.length - 1] + 1}`;
      outs.push({ name: `${base}_第${label}頁.pdf`, bytes: await out.save(), n: g.length });
    }
    // de-duplicate file names
    const seen = {};
    for (const o of outs) { if (seen[o.name]) o.name = o.name.replace(/\.pdf$/, `_${++seen[o.name]}.pdf`); else seen[o.name] = 1; }
    for (const o of outs) {
      const li = document.createElement('li');
      li.innerHTML = `<span></span><button class="btn sm">下載</button>`;
      li.firstChild.textContent = `${o.name}（${o.n} 頁，${fmtSize(o.bytes.length)}）`;
      li.lastChild.addEventListener('click', () => downloadBlob(o.bytes, o.name));
      results.appendChild(li);
    }
    if (outs.length === 1) {
      downloadBlob(outs[0].bytes, outs[0].name);
      setStatus(status, '✓ 完成！已開始下載。', 'ok');
    } else {
      const { zipSync } = await loadFflate();
      const z = {}; outs.forEach((o) => (z[o.name] = [o.bytes, { level: 0 }]));
      const zip = zipSync(z);
      downloadBlob(new Blob([zip], { type: 'application/zip' }), `${base}_分割.zip`);
      setStatus(status, `✓ 完成！共 ${outs.length} 個檔案，已打包成 ZIP 下載；也可在下方個別下載。`, 'ok');
    }
  } catch (e) {
    setStatus(status, e.message || '分割失敗', 'err'); toast(e.message || '分割失敗', true);
  }
}));
