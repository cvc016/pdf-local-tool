// PDF 加頁碼：頁碼文字先用畫布繪成 PNG（可用中文「第 1 頁」），再用 pdf-lib 疊到每一頁。全部本機處理。
import { $, setupDrop, isPdf, readBytes, openPdfLib, fmtSize, loadPdfLib, busy, downloadBlob, setStatus, toast, baseName } from './common.js';
import * as C from './common.js';
C.preload(C.loadPdfLib);
const zone = $('#drop'), input = $('#file'), work = $('#work'), status = $('#status'), go = $('#go');
let src = null;
setupDrop(zone, input, (fs) => load(fs[0]), isPdf);
async function load(file) {
  try { const bytes = await readBytes(file); const doc = await openPdfLib(bytes, file.name); src = { file, bytes, n: doc.getPageCount() }; }
  catch (e) { toast(e?.message || `無法讀取「${file.name}」，可能已加密或損毀。`, true); return; }
  $('#fname').textContent = `${file.name}（${src.n} 頁，${fmtSize(file.size)}）`;
  setStatus(status, ''); go.disabled = false;
  zone.classList.add('hidden'); work.classList.remove('hidden');
}
$('#reset').addEventListener('click', () => { src = null; go.disabled = true; work.classList.add('hidden'); zone.classList.remove('hidden'); });
const FMT = { n: (n) => `${n}`, nN: (n, N) => `${n} / ${N}`, dash: (n) => `- ${n} -`, zh: (n) => `第 ${n} 頁`, zhN: (n, N) => `第 ${n} 頁，共 ${N} 頁`, page: (n) => `Page ${n}` };
function label(text, pt, color) { // 4× 解析度的透明 PNG
  const S = 4, cv = document.createElement('canvas'), ctx = cv.getContext('2d');
  const font = `${pt * S}px system-ui, "PingFang TC", "Microsoft JhengHei", "Noto Sans TC", sans-serif`;
  ctx.font = font; const w = Math.ceil(ctx.measureText(text).width) + 2 * S;
  cv.width = w; cv.height = Math.ceil(pt * 1.4 * S);
  ctx.font = font; ctx.fillStyle = color; ctx.textBaseline = 'middle'; ctx.fillText(text, S, cv.height / 2);
  return new Promise((r) => cv.toBlob((b) => b.arrayBuffer().then((a) => r({ png: new Uint8Array(a), w: cv.width / S, h: cv.height / S })), 'image/png'));
}
go.addEventListener('click', () => busy(go, '加入頁碼中…', async () => {
  try {
    const { degrees } = await loadPdfLib();
    const doc = await openPdfLib(src.bytes, src.file.name);
    const pages = doc.getPages(), N = pages.length;
    const pos = $('#pos').value, fmt = FMT[$('#style').value], start = parseInt($('#start').value, 10) || 1;
    const pt = +$('#size').value, color = $('#color').value, skip = $('#skipFirst').checked, M = 24;
    const total = N - (skip ? 1 : 0) + start - 1;
    for (let i = 0; i < N; i++) {
      if (skip && i === 0) continue;
      setStatus(status, `處理第 ${i + 1} / ${N} 頁…`);
      const n = start + i - (skip ? 1 : 0), L = await label(fmt(n, total), pt, color), img = await doc.embedPng(L.png);
      const p = pages[i], box = p.getCropBox(), rot = ((p.getRotation().angle % 360) + 360) % 360;
      const W = box.width, H = box.height, vw = rot % 180 ? H : W, vh = rot % 180 ? W : H; // visual size
      const u = pos.endsWith('c') ? (vw - L.w) / 2 : pos.endsWith('r') ? vw - M - L.w : M;
      const v = pos[0] === 't' ? vh - M - L.h : M;
      const [x, y] = rot === 90 ? [W - v, u] : rot === 180 ? [W - u, H - v] : rot === 270 ? [v, H - u] : [u, v];
      p.drawImage(img, { x: box.x + x, y: box.y + y, width: L.w, height: L.h, rotate: degrees(rot) });
    }
    const out = await doc.save();
    downloadBlob(out, `${baseName(src.file.name)}_頁碼.pdf`);
    setStatus(status, `完成：已在 ${skip ? N - 1 : N} 頁加入頁碼（${fmtSize(out.length)}）。`, 'ok');
  } catch (e) { console.warn(e); setStatus(status, '處理失敗：' + (e?.message || e), 'err'); }
}));
