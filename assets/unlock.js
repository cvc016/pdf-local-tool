// 「移除廣告」授權碼解鎖（純前端）。
// 設計：使用者在 Gumroad 購買後取得授權碼 → 貼到本頁 → 驗證成功後存在 localStorage → 隱藏廣告版位。
// 注意：純前端解鎖可被繞過，對低價「去廣告」方案可接受。
import { $, AD_FREE_KEY, isAdFree, toast } from './common.js';

// TODO(gumroad): 建立 Gumroad 產品後填入 product_id，並把 https://api.gumroad.com 加入各頁 CSP 的 connect-src。
const GUMROAD_PRODUCT_ID = '';

// Gumroad license keys look like XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX (hex).
export const looksLikeKey = (k) => /^[0-9A-F]{8}(-[0-9A-F]{8}){3}$/i.test(k.trim());

// Stub. Real call (no OAuth needed, per Gumroad API docs; CORS not yet verified):
//   POST https://api.gumroad.com/v2/licenses/verify
//   body: product_id=<GUMROAD_PRODUCT_ID>&license_key=<key>&increment_uses_count=false
//   success: { success: true, purchase: { refunded, chargebacked, ... } }
async function verifyWithGumroad(key) {
  if (!GUMROAD_PRODUCT_ID) return { ok: false, reason: 'not_configured' };
  // TODO(gumroad): implement fetch() to the endpoint above; reject refunded/chargebacked purchases.
  return { ok: false, reason: 'not_implemented' };
}

const form = $('#unlockForm'), keyIn = $('#licenseKey'), msg = $('#unlockMsg'), state = $('#unlockState');
function show() {
  const on = isAdFree();
  state.textContent = on ? '✓ 已啟用：本裝置的瀏覽器不會顯示廣告版位。' : '目前狀態：未啟用。';
  $('#unlockClear').classList.toggle('hidden', !on);
}
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const key = keyIn.value.trim();
  if (!looksLikeKey(key)) { msg.textContent = '授權碼格式不正確，應為 4 組各 8 碼、以「-」分隔的英數字。'; msg.className = 'status err'; return; }
  const r = await verifyWithGumroad(key);
  if (r.ok) {
    localStorage.setItem(AD_FREE_KEY, JSON.stringify({ ok: true, key, at: Date.now() }));
    document.documentElement.classList.add('ad-free');
    msg.textContent = '✓ 驗證成功，已移除廣告。'; msg.className = 'status ok';
  } else {
    msg.textContent = r.reason === 'not_configured' || r.reason === 'not_implemented'
      ? '付費方案尚未開放，目前無法驗證授權碼。（本站現在也沒有任何廣告）'
      : '授權碼驗證失敗，請確認是否輸入正確。';
    msg.className = 'status err';
  }
  show();
});
$('#unlockClear').addEventListener('click', () => { localStorage.removeItem(AD_FREE_KEY); document.documentElement.classList.remove('ad-free'); toast('已移除本裝置的授權。'); show(); });
show();
