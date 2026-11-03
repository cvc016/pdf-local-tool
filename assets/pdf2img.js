// PDF 轉 JPG／PNG：用 PDF.js 在本機把頁面畫成圖片，多張時用 fflate 打包 ZIP。
import { $, setupDrop, isPdf, readBytes, openPdfjs, fmtSize, busy, downloadBlob, setStatus, toast, baseName, parseRanges, loadFflate } from './common.js';
import * as C from './common.js';
C.preload(C.loadPdfjs, C.loadFflate);

const zone = $('#drop'), input = $('#file'), work = $('#work'), status = $('#status'), go = $('#go'), ranges = $('#ranges');
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
  ranges.value = ''; ranges.placeholder = `留空＝全部 ${pdf.numPages} 頁；例如 1-3, 5`;
  setStatus(status, '');
  zone.classList.add('hidden'); work.classList.remove('hidden');
}
$('#reset').addEventListener('click', () => { if (pdf) pdf.destroy(); pdf = null; src = null; work.classList.add('hidden'); zone.classList.remove('hidden'); });

const encode = (cv, type, q) => new Promise((res, rej) => cv.toBlob((b) => (b ? b.arrayBuffer().then((a) => res(new Uint8Array(a))) : rej(new Error('影像編碼失敗'))), type, q));

go.addEventListener('click', () => busy(go, '轉換中…', async () => {
  try {
    const n = pdf.numPages;
    const pages = ranges.value.trim() ? [...new Set(parseRanges(ranges.value, n).flat())] : Array.from({ length: n }, (_, i) => i);
    const fmt = $('#fmt').value, dpi = +$('#dpi').value;
    const type = fmt === 'png' ? 'image/png' : 'image/jpeg', ext = fmt === 'png' ? 'png' : 'jpg';
    const base = baseName(src.file.name), pad = String(n).length;
    const outs = [];
    for (const [k, i] of pages.entries()) {
      setStatus(status, `轉換第 ${i + 1} 頁（${k + 1} / ${pages.length}）…`);
      const page = await pdf.getPage(i + 1);
      const vp = page.getViewport({ scale: dpi / 72 });
      const cv = document.createElement('canvas');
      cv.width = Math.ceil(vp.width); cv.height = Math.ceil(vp.height);
      const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      outs.push({ name: `${base}_第${String(i + 1).padStart(pad, '0')}頁.${ext}`, bytes: await encode(cv, type, 0.9) });
      page.cleanup(); cv.width = cv.height = 0;
    }
    if (outs.length === 1) {
      downloadBlob(outs[0].bytes, outs[0].name, type);
      setStatus(status, `✓ 完成！已下載 ${outs[0].name}（${fmtSize(outs[0].bytes.length)}）。`, 'ok');
    } else {
      const { zipSync } = await loadFflate();
      const z = {}; outs.forEach((o) => (z[o.name] = [o.bytes, { level: 0 }]));
      downloadBlob(new Blob([zipSync(z)], { type: 'application/zip' }), `${base}_圖片.zip`);
      setStatus(status, `✓ 完成！共 ${outs.length} 張圖片，已打包成 ZIP 下載。`, 'ok');
    }
  } catch (e) {
    setStatus(status, e.message || '轉換失敗', 'err'); toast(e.message || '轉換失敗', true);
  }
}));
