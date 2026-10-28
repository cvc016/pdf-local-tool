import { $, setupDrop, isPdf, readBytes, openPdfjs, renderThumb, fmtSize, makeSortable, loadPdfLib, openPdfLib, busy, downloadBlob, setStatus, toast, baseName } from './common.js';
import * as C from './common.js';
C.preload(C.loadPdfLib, C.loadPdfjs);

const zone = $('#drop'), input = $('#file'), list = $('#list'), work = $('#work'), status = $('#status'), go = $('#go');
let files = []; // {id, file, bytes, pages}
let seq = 0;

setupDrop(zone, input, add, isPdf);
setupDrop($('#more'), $('#file2'), add, isPdf);

async function add(newFiles) {
  for (const file of newFiles) {
    const rec = { id: ++seq, file, bytes: await readBytes(file), pages: null };
    files.push(rec);
    const li = document.createElement('li');
    li.dataset.id = rec.id;
    li.innerHTML = `<span class="handle" title="拖曳排序" aria-hidden="true">⠿</span><div class="thumb"></div>
      <div class="meta"><div class="name"></div><div class="sub">${fmtSize(file.size)} · 讀取中…</div></div>
      <div class="ord"><button class="btn sm" data-act="up" aria-label="上移">▲</button><button class="btn sm" data-act="down" aria-label="下移">▼</button><button class="btn sm danger" data-act="rm" aria-label="移除">✕</button></div>`;
    li.querySelector('.name').textContent = file.name;
    list.appendChild(li);
    try {
      const pdf = await openPdfjs(rec.bytes);
      rec.pages = pdf.numPages;
      li.querySelector('.sub').textContent = `${fmtSize(file.size)} · ${pdf.numPages} 頁`;
      li.querySelector('.thumb').appendChild(await renderThumb(pdf, 1, 64));
      pdf.destroy();
    } catch (e) {
      li.querySelector('.sub').textContent = '無法讀取（可能已加密或損毀）';
      rec.bad = true;
    }
  }
  refresh();
}

list.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-act]'); if (!b) return;
  const li = b.closest('li');
  if (b.dataset.act === 'up' && li.previousElementSibling) list.insertBefore(li, li.previousElementSibling);
  if (b.dataset.act === 'down' && li.nextElementSibling) list.insertBefore(li.nextElementSibling, li);
  if (b.dataset.act === 'rm') { files = files.filter((f) => f.id !== +li.dataset.id); li.remove(); }
  syncOrder(); refresh();
});
makeSortable(list, { item: 'li', handle: '.handle', axis: 'y', onChange: syncOrder });

function syncOrder() {
  const ids = Array.from(list.children).map((li) => +li.dataset.id);
  files.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
}
function refresh() {
  work.classList.toggle('hidden', files.length === 0);
  zone.classList.toggle('hidden', files.length > 0);
  const total = files.reduce((s, f) => s + (f.pages || 0), 0);
  $('#summary').textContent = `${files.length} 個檔案，共 ${total} 頁`;
  go.disabled = files.length < 2;
  setStatus(status, files.length === 1 ? '請再加入至少 1 個 PDF 才能合併。' : '');
}
$('#clear').addEventListener('click', () => { files = []; list.innerHTML = ''; refresh(); });

go.addEventListener('click', () => busy(go, '合併中…', async () => {
  try {
    syncOrder();
    const { PDFDocument } = await loadPdfLib();
    const out = await PDFDocument.create();
    for (const f of files) {
      const src = await openPdfLib(f.bytes, f.file.name);
      const pages = await out.copyPages(src, src.getPageIndices());
      pages.forEach((p) => out.addPage(p));
    }
    out.setProducer('PDF 本機工具'); out.setCreator('PDF 本機工具');
    const bytes = await out.save();
    downloadBlob(bytes, `${baseName(files[0].file.name)}_合併.pdf`);
    setStatus(status, `✓ 完成！已合併 ${files.length} 個檔案（${out.getPageCount()} 頁，${fmtSize(bytes.length)}），已開始下載。`, 'ok');
  } catch (e) {
    setStatus(status, e.message || '合併失敗', 'err'); toast(e.message || '合併失敗', true);
  }
}));
