// PDF 壓縮：用 PDF.js 把每頁畫成 JPEG，再用 pdf-lib 組成新 PDF（全部本機處理）。
import { $, setupDrop, isPdf, readBytes, openPdfjs, fmtSize, loadPdfLib, busy, downloadBlob, setStatus, toast, baseName } from './common.js';
import * as C from './common.js';
C.preload(C.loadPdfLib, C.loadPdfjs);

const zone = $('#drop'), input = $('#file'), work = $('#work'), status = $('#status'), go = $('#go'), results = $('#results');
const PRESETS = { high: { dpi: 200, q: 0.8 }, std: { dpi: 144, q: 0.7 }, max: { dpi: 96, q: 0.5 } };
let src = null, pdf = null;

setupDrop(zone, input, (fs) => load(fs[0]), isPdf);

async function load(file) {
  try {
    const bytes = await readBytes(file);
    if (pdf) pdf.destroy();
    pdf = await openPdfjs(bytes);
    src = { file, bytes };
  } catch { toast(`無法讀取「${file.name}」，可能已加密或損毀。`, true); return; }
  $('#fname').textContent = `${file.name}（${pdf.numPages} 頁，${fmtSize(file.size)}）`;
  results.innerHTML = ''; setStatus(status, '');
  zone.classList.add('hidden'); work.classList.remove('hidden');
}
$('#reset').addEventListener('click', () => { if (pdf) pdf.destroy(); pdf = null; src = null; results.innerHTML = ''; work.classList.add('hidden'); zone.classList.remove('hidden'); });

function toJpeg(canvas, q) {
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? b.arrayBuffer().then((a) => res(new Uint8Array(a))) : rej(new Error('影像編碼失敗'))), 'image/jpeg', q));
}

go.addEventListener('click', () => busy(go, '壓縮中…', async () => {
  results.innerHTML = '';
  try {
    const p = PRESETS[$('input[name=level]:checked').value];
    const gray = $('#gray').checked;
    const { PDFDocument } = await loadPdfLib();
    const out = await PDFDocument.create();
    for (let i = 1; i <= pdf.numPages; i++) {
      setStatus(status, `處理第 ${i} / ${pdf.numPages} 頁…`);
      const page = await pdf.getPage(i);
      const v1 = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: p.dpi / 72 });
      const cv = document.createElement('canvas');
      cv.width = Math.ceil(vp.width); cv.height = Math.ceil(vp.height);
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      if (gray) { ctx.globalCompositeOperation = 'saturation'; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cv.width, cv.height); ctx.globalCompositeOperation = 'source-over'; }
      const jpg = await out.embedJpg(await toJpeg(cv, p.q));
      const pg = out.addPage([v1.width, v1.height]);
      pg.drawImage(jpg, { x: 0, y: 0, width: v1.width, height: v1.height });
      page.cleanup(); cv.width = cv.height = 0;
    }
    const bytes = await out.save();
    const before = src.bytes.length, after = bytes.length;
    const li = document.createElement('li');
    const name = `${baseName(src.file.name)}_已壓縮.pdf`;
    if (after >= before) {
      li.innerHTML = `<span></span><button class="btn sm">仍要下載</button>`;
      li.firstChild.textContent = `壓縮後 ${fmtSize(after)}，沒有比原檔 ${fmtSize(before)} 小`;
      li.lastChild.addEventListener('click', () => downloadBlob(bytes, name));
      results.appendChild(li);
      setStatus(status, '這份 PDF 已經很精簡（多半是文字型 PDF），建議直接使用原檔，或改選「強力壓縮」。', 'err');
      return;
    }
    li.innerHTML = `<span></span><button class="btn sm">再次下載</button>`;
    li.firstChild.textContent = `${name}：${fmtSize(before)} → ${fmtSize(after)}（減少 ${Math.round((1 - after / before) * 100)}%）`;
    li.lastChild.addEventListener('click', () => downloadBlob(bytes, name));
    results.appendChild(li);
    downloadBlob(bytes, name);
    setStatus(status, `✓ 完成！${fmtSize(before)} → ${fmtSize(after)}，已開始下載。`, 'ok');
  } catch (e) {
    setStatus(status, e.message || '壓縮失敗', 'err'); toast(e.message || '壓縮失敗', true);
  }
}));
