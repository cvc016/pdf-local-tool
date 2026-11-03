// 隨機密碼產生器：使用 crypto.getRandomValues（密碼學安全亂數），以拒絕取樣避免偏差。密碼不會離開瀏覽器。
import { $, $$, toast } from './common.js';
const SETS = { upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', lower: 'abcdefghijklmnopqrstuvwxyz', digits: '0123456789', symbols: '!@#$%^&*()-_=+[]{};:,.?/~' };
const AMBIG = /[Il1O0o]/g;
function rnd(n) { // 0..n-1, unbiased
  const lim = Math.floor(0x100000000 / n) * n, a = new Uint32Array(1);
  do crypto.getRandomValues(a); while (a[0] >= lim);
  return a[0] % n;
}
function gen(len, sets) {
  const all = sets.join(''), pw = sets.map((s) => s[rnd(s.length)]); // 每種至少一個
  while (pw.length < len) pw.push(all[rnd(all.length)]);
  for (let i = pw.length - 1; i > 0; i--) { const j = rnd(i + 1); [pw[i], pw[j]] = [pw[j], pw[i]]; }
  return pw.join('');
}
const len = $('#len'), list = $('#pwList');
function run() {
  $('#lv').textContent = len.value;
  const sets = Object.keys(SETS).filter((k) => $('#' + k).checked).map((k) => ($('#noAmbig').checked ? SETS[k].replace(AMBIG, '') : SETS[k]));
  if (!sets.length) { list.innerHTML = '<li class="hint">請至少勾選一種字元。</li>'; $('#strength').textContent = ''; return; }
  const L = Math.max(+len.value, sets.length), pool = sets.join('').length, bits = Math.round(L * Math.log2(pool));
  list.innerHTML = '';
  for (let i = 0; i < +$('#count').value; i++) {
    const li = document.createElement('li'); li.innerHTML = '<code class="pw"></code><button type="button" class="btn sm">複製</button>';
    li.firstChild.textContent = gen(L, sets); list.appendChild(li);
  }
  const lvl = bits >= 100 ? ['非常強', 'ok'] : bits >= 72 ? ['強', 'ok'] : bits >= 50 ? ['普通', ''] : ['弱', 'err'];
  const s = $('#strength'); s.textContent = `強度：${lvl[0]}（約 ${bits} 位元熵，字元池 ${pool} 個）`; s.className = 'status ' + lvl[1];
}
list.addEventListener('click', async (e) => {
  const b = e.target.closest('button'); if (!b) return;
  try { await navigator.clipboard.writeText(b.previousSibling.textContent); toast('已複製密碼'); } catch { toast('無法存取剪貼簿，請手動選取複製', true); }
});
$$('#pwForm input, #pwForm select').forEach((el) => el.addEventListener('input', run));
$('#regen').addEventListener('click', run);
run();
