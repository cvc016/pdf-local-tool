// QR Code 產生器：qrcode-generator（MIT）在瀏覽器本機產生靜態 QR Code，無追蹤轉址、永久有效。
import { $, $$, downloadBlob, setStatus } from './common.js';
import qrcode from '../vendor/qrcode-generator/qrcode.esm.js';
qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];

const status = $('#status'), preview = $('#qrPreview'), out = $('#qrText');
let logo = null; // data URL
const v = (id) => ($('#' + id)?.value || '').trim();
const esc = (s) => s.replace(/([\\;,:"])/g, '\\$1');
const vesc = (s) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([;,])/g, '\\$1');

export function payload(type) {
  switch (type) {
    case 'url': { let u = v('qUrl'); if (u && !/^[a-z][a-z0-9+.-]*:/i.test(u)) u = 'https://' + u; return u; }
    case 'text': return $('#qText').value;
    case 'wifi': {
      const ssid = v('wSsid'); if (!ssid) return '';
      const sec = v('wSec');
      return `WIFI:T:${sec};S:${esc(ssid)};${sec === 'nopass' ? '' : `P:${esc($('#wPass').value)};`}${$('#wHidden').checked ? 'H:true;' : ''};`;
    }
    case 'vcard': {
      const n = v('vName'); if (!n) return '';
      const L = ['BEGIN:VCARD', 'VERSION:3.0', `N:${vesc(n)};;;;`, `FN:${vesc(n)}`];
      if (v('vOrg')) L.push(`ORG:${vesc(v('vOrg'))}`);
      if (v('vTitle')) L.push(`TITLE:${vesc(v('vTitle'))}`);
      if (v('vTel')) L.push(`TEL;TYPE=CELL:${v('vTel')}`);
      if (v('vEmail')) L.push(`EMAIL:${v('vEmail')}`);
      if (v('vUrl')) L.push(`URL:${v('vUrl')}`);
      if (v('vAdr')) L.push(`ADR:;;${vesc(v('vAdr'))};;;;`);
      L.push('END:VCARD'); return L.join('\r\n');
    }
    case 'line': {
      const id = v('lId'); if (!id) return '';
      if (/^https?:\/\//i.test(id)) return id;
      return id.startsWith('@') ? `https://line.me/R/ti/p/${encodeURIComponent(id)}` : `https://line.me/ti/p/~${encodeURIComponent(id)}`;
    }
    case 'bank': {
      const acct = v('bAcct'); if (!acct) return '';
      return [`銀行代碼：${v('bCode')}`, `帳號：${acct}`, v('bName') && `戶名：${v('bName')}`, v('bAmt') && `金額：${v('bAmt')} 元`, v('bNote') && `備註：${v('bNote')}`].filter(Boolean).join('\n');
    }
  }
  return '';
}

function build() {
  const type = $('input[name=qtype]:checked').value;
  const data = payload(type);
  const ecl = logo ? 'H' : v('ecl') || 'M';
  if (!data) return null;
  const qr = qrcode(0, ecl); qr.addData(data); qr.make();
  return { qr, data, n: qr.getModuleCount() };
}

export function toSvg(r, fg, bg, margin = 4) {
  const size = r.n + margin * 2; let d = '';
  for (let y = 0; y < r.n; y++) for (let x = 0; x < r.n; x++) if (r.qr.isDark(y, x)) d += `M${x + margin} ${y + margin}h1v1h-1z`;
  let img = '';
  if (logo) { const s = r.n * 0.22, o = (size - s) / 2, p = s * 0.08;
    img = `<rect x="${o - p}" y="${o - p}" width="${s + 2 * p}" height="${s + 2 * p}" rx="${p}" fill="${bg}"/><image href="${logo}" x="${o}" y="${o}" width="${s}" height="${s}" preserveAspectRatio="xMidYMid meet"/>`; }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="${bg}"/><path fill="${fg}" d="${d}"/>${img}</svg>`;
}

function render() {
  let r;
  try { r = build(); } catch { setStatus(status, '內容太長，超過 QR Code 容量，請縮短內容或取消 Logo。', 'err'); preview.innerHTML = ''; return null; }
  if (!r) { preview.innerHTML = '<p class="hint">輸入內容後，這裡會即時顯示 QR Code。</p>'; out.textContent = ''; setStatus(status, ''); $$('.qdl').forEach((b) => (b.disabled = true)); return null; }
  const fg = $('#fg').value, bg = $('#bg').value;
  preview.innerHTML = toSvg(r, fg, bg);
  out.textContent = r.data;
  $$('.qdl').forEach((b) => (b.disabled = false));
  setStatus(status, lum(fg) > lum(bg) - 0.3 ? '⚠️ 前景色太淺或與背景太接近，部分手機可能掃不到，建議用深色前景、淺色背景。' : `已產生（${r.n}×${r.n} 模組）。靜態 QR Code 永久有效，不經過任何轉址。`, lum(fg) > lum(bg) - 0.3 ? 'err' : 'ok');
  return r;
}
const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };

function showType() {
  const t = $('input[name=qtype]:checked').value;
  $$('[data-qtype]').forEach((el) => el.classList.toggle('hidden', el.dataset.qtype !== t));
  render();
}
$$('input[name=qtype]').forEach((r) => r.addEventListener('change', showType));
$('#qrForm').addEventListener('input', render);
$('#qrForm').addEventListener('submit', (e) => e.preventDefault());
$('#logo').addEventListener('change', () => {
  const f = $('#logo').files[0]; if (!f) return;
  const fr = new FileReader(); fr.onload = () => { logo = fr.result; $('#logoClear').classList.remove('hidden'); render(); }; fr.readAsDataURL(f);
});
$('#logoClear').addEventListener('click', () => { logo = null; $('#logo').value = ''; $('#logoClear').classList.add('hidden'); render(); });

const fname = () => 'QRCode_' + ($('input[name=qtype]:checked').value);
$('#dlSvg').addEventListener('click', () => { const r = render(); if (r) downloadBlob(new TextEncoder().encode(toSvg(r, $('#fg').value, $('#bg').value)), fname() + '.svg', 'image/svg+xml'); });
$('#dlPng').addEventListener('click', async () => {
  const r = render(); if (!r) return;
  const px = +$('#px').value;
  const url = URL.createObjectURL(new Blob([toSvg(r, $('#fg').value, $('#bg').value)], { type: 'image/svg+xml' }));
  try {
    const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const cv = document.createElement('canvas'); cv.width = cv.height = px;
    const ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false; ctx.drawImage(im, 0, 0, px, px);
    const blob = await new Promise((res) => cv.toBlob(res, 'image/png'));
    downloadBlob(new Uint8Array(await blob.arrayBuffer()), fname() + '.png', 'image/png');
  } catch { setStatus(status, '無法輸出 PNG，請改下載 SVG。', 'err'); } finally { URL.revokeObjectURL(url); }
});
showType();
