// 字數統計：中文字、英文單字、數字、標點、字元、行數、段落即時計算。文字只在瀏覽器中處理。
import { $, toast } from './common.js';
const ta = $('#text'), out = $('#stats');
const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af\u{20000}-\u{2ffff}]/u;
export function count(s) {
  const chars = [...s], noWs = chars.filter((c) => !/\s/u.test(c));
  const cjk = chars.filter((c) => CJK.test(c)).length;
  const en = (s.replace(new RegExp(CJK.source, 'gu'), ' ').match(/[A-Za-z\u00c0-\u024f]+(?:['’-][A-Za-z\u00c0-\u024f]+)*/g) || []).length;
  const num = (s.match(/\d+(?:[.,]\d+)*/g) || []).length;
  const punct = chars.filter((c) => /[\p{P}\p{S}]/u.test(c)).length;
  const lines = s ? s.split(/\r\n|\r|\n/).length : 0;
  const paras = s.split(/(?:\r?\n\s*){2,}|\r?\n/).filter((p) => p.trim()).length;
  const words = cjk + en + num; // 常見「字數」：中文字 + 英文單字 + 數字
  return { words, cjk, en, num, punct, all: chars.length, noWs: noWs.length, lines, paras, bytes: new TextEncoder().encode(s).length, min: Math.ceil(cjk / 400 + (en + num) / 200) };
}
const LBL = [['words', '字數（中文字＋英文單字＋數字）'], ['cjk', '中文字'], ['en', '英文單字'], ['num', '數字'], ['punct', '標點符號'], ['noWs', '字元數（不含空白）'], ['all', '字元數（含空白）'], ['lines', '行數'], ['paras', '段落數'], ['bytes', 'UTF-8 位元組'], ['min', '預估閱讀（分鐘）']];
function render() { const c = count(ta.value); out.innerHTML = LBL.map(([k, l]) => `<div class="stat${k === 'words' ? ' main' : ''}"><b data-k="${k}">${c[k].toLocaleString('zh-TW')}</b><span>${l}</span></div>`).join(''); }
ta.addEventListener('input', render); render();
$('#clearText').addEventListener('click', () => { ta.value = ''; render(); ta.focus(); });
$('#copyStats').addEventListener('click', async () => {
  const c = count(ta.value);
  try { await navigator.clipboard.writeText(LBL.map(([k, l]) => `${l}：${c[k]}`).join('\n')); toast('已複製統計結果'); } catch { toast('無法存取剪貼簿', true); }
});
