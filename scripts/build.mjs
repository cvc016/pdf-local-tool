// Generates the static HTML pages, sitemap.xml and robots.txt.
// Usage: node scripts/build.mjs
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BRAND, pages as toolPages, home, GROUPS } from './content.mjs';
// 依用途分組：排序 toolPages（首頁、導覽、頁尾、相關工具、sitemap 都照這個順序）
const GI = Object.fromEntries(GROUPS.flatMap((g, i) => g.slugs.map((s, j) => [s, i * 100 + j])));
for (const t of toolPages) if (!(t.slug in GI)) throw new Error('tool not in GROUPS: ' + t.slug);
toolPages.sort((a, b) => GI[a.slug] - GI[b.slug]);
const bySlugT = Object.fromEntries(toolPages.map((t) => [t.slug, t]));
const groupsT = GROUPS.map((g) => ({ ...g, tools: g.slugs.map((s) => bySlugT[s]).filter(Boolean) }));
const groupOf = (slug) => groupsT.find((g) => g.slugs.includes(slug));
import { posts, BLOG_DATE, CATS, RETIRED } from './blog.mjs';
import { extra as TX } from './toolextra.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://waitingstudio.com/';
const LASTMOD = new Date().toISOString().slice(0, 10);
const REPO = 'https://github.com/cvc016/pdf-local-tool';
const CHROME_EXT = 'https://chromewebstore.google.com/detail/agdlaedacpgaljedandnfmlomahkfjjd';
const CONTACT = 'abbottabbott399@gmail.com';
// ---- Google AdSense (OFF while empty: output has no ads and no third-party requests) ----
// Set to your publisher id, e.g. 'ca-pub-1234567890123456' (or env ADSENSE_CLIENT=...).
const ADSENSE_CLIENT = (process.env.ADSENSE_CLIENT ?? 'ca-pub-8133376999866232').trim();
const ADSENSE_SLOT = (process.env.ADSENSE_SLOT ?? '2128660140').trim(); // display ad unit id (digits); empty disables slot HTML
if (ADSENSE_CLIENT && !/^ca-pub-\d{10,20}$/.test(ADSENSE_CLIENT)) throw new Error('ADSENSE_CLIENT must look like ca-pub-1234567890123456');
const ADS = !!ADSENSE_CLIENT;
const G = 'https://pagead2.googlesyndication.com https://*.googlesyndication.com https://*.doubleclick.net https://*.google.com https://*.gstatic.com https://*.adtrafficquality.google https://fundingchoicesmessages.google.com';
const CSP = ADS
  ? `default-src 'self'; script-src 'self' ${G}; worker-src 'self' blob:; img-src 'self' blob: data: https:; style-src 'self' 'unsafe-inline'; connect-src 'self' blob: data: ${G}; frame-src ${G}; font-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'none'`
  : `default-src 'self'; script-src 'self'; worker-src 'self' blob:; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; connect-src 'self' blob: data:; font-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'none'`;
const ADS_HEAD = ADS ? `<meta name="google-adsense-account" content="${ADSENSE_CLIENT}">
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}" crossorigin="anonymous"></script>
` : '';

const ICON = `<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="5" y="2" width="22" height="28" rx="4" fill="#2563eb"/><path d="M11 12h10M11 17h10M11 22h6" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/></svg>`;
const UP = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 16V4m0 0-5 5m5-5 5 5"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg>`;
const NAV = { merge: '合併', split: '分割', delete: '刪除頁面', rotate: '旋轉', reorder: '排序', img: 'JPG 轉 PDF', heic: 'HEIC 轉 PDF', compress: '壓縮 PDF', pdf2img: 'PDF 轉 JPG', imgc: '圖片壓縮', imgconv: '圖片轉檔', imgresize: '改尺寸', imgwm: '浮水印', pagenum: '加頁碼', words: '字數統計', pass: '密碼產生器', qr: 'QR Code' };
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const strip = (s) => s.replace(/<[^>]+>/g, '');

const drop = (accept, multiple, big, small, id = 'drop', inputId = 'file', compact = false) => `
<div id="${id}" class="drop${compact ? ' compact' : ''}" role="button" tabindex="0" aria-label="${big}">
  ${UP}<div class="big">${big}</div>${small ? `<div class="small">${small}</div>` : ''}
  <input id="${inputId}" type="file" accept="${accept}" ${multiple ? 'multiple' : ''} hidden>
</div>`;
const statusBox = `<div id="status" class="status" role="status" aria-live="polite"></div>`;

const PDF = 'application/pdf,.pdf';
const organize = (tb, hint) => `<div class="card tool">${drop(PDF, false, '選擇或拖放一個 PDF 檔案', '檔案只在您的瀏覽器中處理')}
<div id="work" class="hidden">
  <div class="toolbar"><strong id="fname" class="grow"></strong><button id="reset" class="btn sm">換一個檔案</button></div>
  <div class="toolbar">${tb}<span id="summary" class="hint"></span></div>
  <p class="hint">${hint}</p>
  <div id="grid" class="grid"></div>
  <div class="actions"><button id="go" class="btn primary lg">套用並下載 PDF</button></div>
  ${statusBox}
</div></div>`;
const reset = `<button id="resetAll" class="btn sm">復原全部</button>`;
const img = (heic) => `<div class="card tool">
${heic ? `<p id="heicNote" class="notice hidden">⚠️ 您目前的瀏覽器可能無法讀取 HEIC。建議在 iPhone、iPad 或 Mac 上用 Safari 開啟本頁；JPG、PNG 不受影響。</p>` : ''}
${drop(heic ? 'image/heic,image/heif,.heic,.heif,image/*' : 'image/*,.heic,.heif', true, heic ? '選擇或拖放 HEIC 照片' : '選擇或拖放圖片', heic ? '也可以混合 JPG、PNG' : '支援 JPG、PNG、WebP；可一次選擇多張')}
<div id="work" class="hidden">
  <div class="toolbar"><strong id="summary" class="grow"></strong><button id="clear" class="btn sm">全部清除</button></div>
  <ul id="list" class="flist"></ul>
  <div style="margin-top:10px">${drop('image/*,.heic,.heif', true, '加入更多圖片', '', 'more', 'file2', true)}</div>
  <div class="opts" style="margin-top:14px">
    <fieldset><legend>版面設定</legend>
      <label>紙張 <select id="size"><option value="a4">A4</option><option value="letter">Letter</option><option value="fit">與圖片相同大小</option></select></label>
      <label>方向 <select id="orient"><option value="auto">自動</option><option value="portrait">直向</option><option value="landscape">橫向</option></select></label>
      <label>邊界 <select id="margin"><option value="0">無</option><option value="20" selected>小</option><option value="40">大</option></select></label>
    </fieldset>
  </div>
  <div class="actions"><button id="go" class="btn primary lg" disabled>轉換成 PDF 並下載</button></div>
  ${statusBox}
</div></div>`;

const IMGACC = 'image/*,.webp,.avif,.bmp';
const imgBatch = (big, small, fields, btn) => `<div class="card tool">
<p id="webpNote" class="notice hidden">⚠️ 您目前的瀏覽器無法輸出 WebP，選擇 WebP 時會改存成 JPG。建議改用新版 Chrome、Edge、Firefox 或 Safari 17 以上。</p>
${drop(IMGACC, true, big, small)}
<div id="work" class="hidden">
  <div class="toolbar"><strong id="summary" class="grow"></strong><button id="clear" class="btn sm">全部清除</button></div>
  <ul id="list" class="flist"></ul>
  <div style="margin-top:10px">${drop(IMGACC, true, '加入更多圖片', '', 'more', 'file2', true)}</div>
  <div id="opts" class="opts" style="margin-top:14px">
    ${fields}
  </div>
  <div class="actions"><button id="go" class="btn primary lg" disabled>${btn}</button></div>
  ${statusBox}
</div></div>`;

const TOOLS = {
  merge: { js: 'merge.js', html: () => `<div class="card tool">${drop(PDF, true, '選擇或拖放 PDF 檔案', '可一次選擇多個檔案')}
<div id="work" class="hidden">
  <div class="toolbar"><strong id="summary" class="grow"></strong><button id="clear" class="btn sm">全部清除</button></div>
  <p class="hint">拖曳 ⠿ 或使用 ▲▼ 調整順序，由上到下合併。</p>
  <ul id="list" class="flist"></ul>
  <div style="margin-top:10px">${drop(PDF, true, '加入更多 PDF', '', 'more', 'file2', true)}</div>
  <div class="actions"><button id="go" class="btn primary lg" disabled>合併 PDF 並下載</button></div>
  ${statusBox}
</div></div>` },
  split: { js: 'split.js', html: () => `<div class="card tool">${drop(PDF, false, '選擇或拖放一個 PDF 檔案', '檔案只在您的瀏覽器中處理')}
<div id="work" class="hidden">
  <div class="toolbar"><strong id="fname" class="grow"></strong><button id="reset" class="btn sm">換一個檔案</button></div>
  <div class="opts">
    <fieldset><legend>分割方式</legend>
      <label><input type="radio" name="mode" value="ranges" checked> 依頁碼範圍</label>
      <label><input type="radio" name="mode" value="each"> 每一頁存成一個檔案</label>
      <div id="rangeOpts">
        <label for="ranges" style="display:block;margin:6px 0 4px">頁碼範圍（以逗號分隔，每組產生一個檔案）：</label>
        <input id="ranges" type="text" autocomplete="off">
        <div><label><input id="single" type="checkbox"> 將所選頁面合併成單一檔案（擷取頁面）</label></div>
        <p class="hint" style="margin:4px 0 0">也可以直接點選下方縮圖來選取頁面。</p>
      </div>
    </fieldset>
  </div>
  <div class="actions"><button id="go" class="btn primary lg">分割 PDF 並下載</button></div>
  ${statusBox}
  <ul id="results" class="results"></ul>
  <h2 style="font-size:16px;margin:18px 0 8px">頁面預覽</h2>
  <div id="grid" class="grid"></div>
</div></div>` },
  delete: { js: 'organize.js', suffix: '已刪除頁面', html: () => organize(`<button id="blank" class="btn sm">✨ 自動標記空白頁</button>${reset}`, '在要刪除的頁面按 🗑（再按 ↩ 可還原）；也可以順便旋轉 ↺↻ 或拖曳排序。') },
  rotate: { js: 'organize.js', suffix: '已旋轉', html: () => organize(`<button id="rotAllL" class="btn sm">↺ 全部向左轉</button><button id="rotAllR" class="btn sm">↻ 全部向右轉</button>${reset}`, '在每一頁按 ↺ 向左轉、↻ 向右轉；也可以刪除 🗑 或拖曳排序。') },
  reorder: { js: 'organize.js', suffix: '已排序', html: () => organize(`<button id="reverse" class="btn sm">⇅ 反轉順序</button>${reset}`, '拖曳縮圖調整順序（手機請按住 ⠿ 拖曳）；也可以旋轉 ↺↻ 或刪除 🗑。') },
  img: { js: 'img2pdf.js', html: () => img(false) },
  heic: { js: 'img2pdf.js', html: () => img(true) },
  compress: { js: 'compress.js', html: () => `<div class="card tool">${drop(PDF, false, '選擇或拖放一個 PDF 檔案', '檔案只在您的瀏覽器中壓縮，不會上傳')}
<div id="work" class="hidden">
  <div class="toolbar"><strong id="fname" class="grow"></strong><button id="reset" class="btn sm">換一個檔案</button></div>
  <div class="opts">
    <fieldset><legend>壓縮程度</legend>
      <label><input type="radio" name="level" value="high"> 輕度（200 DPI，畫質優先）</label>
      <label><input type="radio" name="level" value="std" checked> 標準（144 DPI，建議）</label>
      <label><input type="radio" name="level" value="max"> 強力（96 DPI，檔案最小）</label>
      <div><label><input id="gray" type="checkbox"> 轉成灰階（黑白文件可再縮小）</label></div>
    </fieldset>
  </div>
  <p class="hint">壓縮會把每一頁轉成圖片，壓縮後的文字無法再選取或搜尋；需要保留文字時請保留原檔。</p>
  <div class="actions"><button id="go" class="btn primary lg">壓縮 PDF 並下載</button></div>
  ${statusBox}
  <ul id="results" class="results"></ul>
</div></div>` },
  pdf2img: { js: 'pdf2img.js', html: () => `<div class="card tool">${drop(PDF, false, '選擇或拖放一個 PDF 檔案', '檔案只在您的瀏覽器中轉換')}
<div id="work" class="hidden">
  <div class="toolbar"><strong id="fname" class="grow"></strong><button id="reset" class="btn sm">換一個檔案</button></div>
  <div class="opts">
    <fieldset><legend>輸出設定</legend>
      <label>格式 <select id="fmt"><option value="jpg">JPG</option><option value="png">PNG</option></select></label>
      <label>解析度 <select id="dpi"><option value="96">96 DPI（螢幕瀏覽）</option><option value="150" selected>150 DPI（建議）</option><option value="300">300 DPI（列印）</option></select></label>
      <label for="ranges" style="display:block;margin:6px 0 4px">頁碼（選填）：</label>
      <input id="ranges" type="text" autocomplete="off">
    </fieldset>
  </div>
  <div class="actions"><button id="go" class="btn primary lg">轉成圖片並下載</button></div>
  ${statusBox}
</div></div>` },
  imgc: { js: 'imgcompress.js', html: () => imgBatch('選擇或拖放圖片', '支援 JPG、PNG、WebP、GIF、BMP，可一次選多張', `<fieldset><legend>壓縮程度</legend>
      <label><input type="radio" name="level" value="light"> 輕度（品質 90，畫質優先）</label>
      <label><input type="radio" name="level" value="medium" checked> 中度（品質 75，建議）</label>
      <label><input type="radio" name="level" value="strong"> 強烈（品質 55，檔案最小）</label>
      <label><input type="radio" name="level" value="custom"> 自訂</label>
      <div><label>品質 <input id="quality" type="range" min="10" max="100" value="75"> <span id="qv">75</span></label></div>
    </fieldset>
    <fieldset><legend>輸出</legend>
      <label>格式 <select id="fmt"><option value="auto" selected>自動（建議：原格式＋最佳壓縮）</option><option value="keep">保持原格式</option><option value="webp">轉 WebP（更小）</option><option value="jpg">轉 JPG（相容性最好）</option></select></label>
      <label>最長邊 <select id="maxw"><option value="0">原尺寸</option><option value="2560">2560 px</option><option value="1920" selected>1920 px</option><option value="1280">1280 px</option><option value="800">800 px</option></select></label>
      <p class="hint" style="margin:4px 0 0">使用 MozJPEG、WebP、PNG 調色盤量化＋OxiPNG 等專業壓縮引擎，全部在您的瀏覽器內執行；PNG 會保留透明並減少顏色數（品質 100 為無損）。壓縮後若反而變大，會保留原檔並移除 EXIF／GPS。輸出不保留 EXIF（拍攝時間、GPS）。</p>
    </fieldset>`, '壓縮圖片並下載') },
  imgconv: { js: 'imgconvert.js', html: () => imgBatch('選擇或拖放圖片', '支援 PNG、JPG、WebP，以及瀏覽器能讀取的 GIF、BMP、AVIF', `<fieldset><legend>轉換設定</legend>
      <label>輸出格式 <select id="fmt"><option value="webp">WebP</option><option value="jpg">JPG</option><option value="png">PNG（無損）</option></select></label>
      <label id="qWrap">品質 <input id="quality" type="range" min="10" max="100" value="85"> <span id="qv">85</span></label>
      <label id="bgWrap">透明背景填色 <input id="bg" type="color" value="#ffffff"></label>
      <p class="hint" style="margin:4px 0 0">JPG 不支援透明，透明部分會填入背景色（預設白色）；PNG 與 WebP 會保留透明。</p>
    </fieldset>`, '轉換並下載') },
  imgresize: { js: 'imgresize.js', html: () => imgBatch('選擇或拖放圖片', '支援 JPG、PNG、WebP、GIF、BMP，可一次選多張', `<fieldset><legend>尺寸</legend>
      <label>方式 <select id="mode"><option value="max">限制最長邊</option><option value="pct">依百分比</option><option value="exact">指定寬高（px）</option></select></label>
      <label id="m_max">最長邊 <select id="maxSide"><option value="3840">3840 px</option><option value="2560">2560 px</option><option value="1920" selected>1920 px</option><option value="1280">1280 px</option><option value="1080">1080 px</option><option value="800">800 px</option><option value="512">512 px</option></select></label>
      <label id="m_pct">比例 <select id="pct"><option value="75">75%</option><option value="50" selected>50%</option><option value="33">33%</option><option value="25">25%</option><option value="200">200%（放大）</option></select></label>
      <span id="m_exact"><label>寬 <input id="w" type="number" min="1" max="20000" inputmode="numeric" placeholder="自動" style="width:7em"></label> <label>高 <input id="h" type="number" min="1" max="20000" inputmode="numeric" placeholder="自動" style="width:7em"></label> <label><input id="keepRatio" type="checkbox" checked> 保持比例（放進寬×高之內）</label></span>
    </fieldset>
    <fieldset><legend>旋轉與輸出</legend>
      <label>旋轉 <select id="rot"><option value="0">不旋轉</option><option value="90">順時針 90°</option><option value="180">180°</option><option value="270">逆時針 90°</option></select></label>
      <label><input id="flip" type="checkbox"> 水平翻轉（鏡像）</label>
      <label>格式 <select id="fmt"><option value="keep">保持原格式</option><option value="jpg">JPG</option><option value="png">PNG</option><option value="webp">WebP</option></select></label>
      <p class="hint" style="margin:4px 0 0">只填寬或高其中一個時，另一邊依原比例自動計算。輸出不保留 EXIF。</p>
    </fieldset>`, '調整並下載') },
  imgwm: { js: 'imgwatermark.js', html: () => imgBatch('選擇或拖放圖片', '證件照、截圖、作品照片皆可，可一次選多張', `<fieldset><legend>浮水印文字</legend>
      <label style="display:block">文字（可換行） <textarea id="wmText" rows="2" style="width:100%">僅供 OOO 申請使用</textarea></label>
      <label>位置 <select id="wmPos"><option value="tile" selected>斜向平鋪（證件建議）</option><option value="center">中央斜放</option><option value="br">右下角</option><option value="bl">左下角</option></select></label>
      <label>顏色 <input id="wmColor" type="color" value="#808080"></label>
    </fieldset>
    <fieldset><legend>樣式與輸出</legend>
      <label>大小 <input id="wmSize" type="range" min="2" max="15" value="6"> <span id="sv">6</span>%</label>
      <label>不透明度 <input id="wmOpacity" type="range" min="10" max="90" value="35"> <span id="ov">35</span>%</label>
      <label>格式 <select id="fmt"><option value="keep">保持原格式</option><option value="jpg">JPG</option><option value="png">PNG</option><option value="webp">WebP</option></select></label>
      <p class="hint" style="margin:4px 0 0">浮水印直接畫進圖片像素，無法被一鍵移除；請保留原檔。</p>
    </fieldset>`, '加上浮水印並下載') },
  pagenum: { js: 'pagenum.js', html: () => `<div class="card tool">${drop(PDF, false, '選擇或拖放一個 PDF 檔案', '檔案只在您的瀏覽器中處理，不會上傳')}
<div id="work" class="hidden">
  <div class="toolbar"><strong id="fname" class="grow"></strong><button id="reset" class="btn sm">換一個檔案</button></div>
  <div class="opts">
    <fieldset><legend>頁碼樣式</legend>
      <label>格式 <select id="style"><option value="n">1</option><option value="nN">1 / 10</option><option value="dash">- 1 -</option><option value="zh">第 1 頁</option><option value="zhN">第 1 頁，共 10 頁</option><option value="page">Page 1</option></select></label>
      <label>位置 <select id="pos"><option value="bc" selected>下方置中</option><option value="br">右下</option><option value="bl">左下</option><option value="tc">上方置中</option><option value="tr">右上</option><option value="tl">左上</option></select></label>
      <label>起始數字 <input id="start" type="number" value="1" min="0" max="99999" inputmode="numeric" style="width:6em"></label>
    </fieldset>
    <fieldset><legend>外觀</legend>
      <label>字級 <select id="size"><option value="9">9 pt</option><option value="10">10 pt</option><option value="11" selected>11 pt</option><option value="12">12 pt</option><option value="14">14 pt</option></select></label>
      <label>顏色 <input id="color" type="color" value="#333333"></label>
      <label><input id="skipFirst" type="checkbox"> 封面（第 1 頁）不加頁碼</label>
    </fieldset>
  </div>
  <div class="actions"><button id="go" class="btn primary lg" disabled>加入頁碼並下載</button></div>
  ${statusBox}
</div></div>` },
  words: { js: 'wordcount.js', html: () => `<div class="card tool">
  <label for="text" class="hint">貼上或輸入文字，統計會即時更新（文字不會上傳）</label>
  <textarea id="text" rows="10" style="width:100%;font-size:16px" placeholder="在這裡貼上文章、作業、報告或貼文…"></textarea>
  <div id="stats" class="stats" aria-live="polite"></div>
  <div class="actions"><button id="copyStats" type="button" class="btn">複製統計結果</button><button id="clearText" type="button" class="btn">清除文字</button></div>
</div>` },
  pass: { js: 'password.js', html: () => `<div class="card tool"><form id="pwForm" class="opts" autocomplete="off">
  <fieldset><legend>密碼設定</legend>
    <label>長度 <input id="len" type="range" min="6" max="64" value="16"> <span id="lv">16</span></label>
    <label>數量 <select id="count"><option value="1">1 組</option><option value="5" selected>5 組</option><option value="10">10 組</option></select></label>
    <div><label><input id="upper" type="checkbox" checked> 大寫 A-Z</label> <label><input id="lower" type="checkbox" checked> 小寫 a-z</label> <label><input id="digits" type="checkbox" checked> 數字 0-9</label> <label><input id="symbols" type="checkbox" checked> 符號 !@#$…</label></div>
    <label><input id="noAmbig" type="checkbox"> 排除容易混淆的字元（I l 1 O 0 o）</label>
  </fieldset>
  <ul id="pwList" class="pwlist"></ul>
  <div id="strength" class="status" role="status"></div>
  <div class="actions"><button id="regen" type="button" class="btn primary lg">重新產生</button></div>
</form></div>` },
  qr: { js: 'qr.js', html: () => `<div class="card tool"><form id="qrForm" class="qrwrap" autocomplete="off">
<div class="qrleft opts">
  <fieldset><legend>內容類型</legend><div class="qtypes">
    <label><input type="radio" name="qtype" value="url" checked> 網址</label>
    <label><input type="radio" name="qtype" value="text"> 文字</label>
    <label><input type="radio" name="qtype" value="wifi"> Wi-Fi</label>
    <label><input type="radio" name="qtype" value="vcard"> 名片 vCard</label>
    <label><input type="radio" name="qtype" value="line"> LINE</label>
    <label><input type="radio" name="qtype" value="bank"> 轉帳資訊</label></div>
  </fieldset>
  <fieldset data-qtype="url"><legend>網址</legend><input id="qUrl" type="url" placeholder="https://example.com" inputmode="url"></fieldset>
  <fieldset data-qtype="text" class="hidden"><legend>文字</legend><textarea id="qText" rows="4" placeholder="輸入任何文字"></textarea></fieldset>
  <fieldset data-qtype="wifi" class="hidden"><legend>Wi-Fi</legend>
    <label>網路名稱（SSID） <input id="wSsid" type="text"></label>
    <label>密碼 <input id="wPass" type="text"></label>
    <label>加密 <select id="wSec"><option value="WPA">WPA／WPA2／WPA3</option><option value="WEP">WEP</option><option value="nopass">無密碼</option></select></label>
    <label><input id="wHidden" type="checkbox"> 隱藏的網路</label></fieldset>
  <fieldset data-qtype="vcard" class="hidden"><legend>電子名片</legend>
    <label>姓名 <input id="vName" type="text"></label><label>公司 <input id="vOrg" type="text"></label><label>職稱 <input id="vTitle" type="text"></label>
    <label>手機 <input id="vTel" type="tel"></label><label>Email <input id="vEmail" type="email"></label><label>網站 <input id="vUrl" type="url"></label><label>地址 <input id="vAdr" type="text"></label></fieldset>
  <fieldset data-qtype="line" class="hidden"><legend>LINE 加好友</legend>
    <label>LINE ID、官方帳號 @ID 或邀請網址 <input id="lId" type="text" placeholder="例如 abc123 或 @shop"></label></fieldset>
  <fieldset data-qtype="bank" class="hidden"><legend>轉帳資訊（純文字）</legend>
    <label>銀行代碼 <input id="bCode" type="text" inputmode="numeric" placeholder="例如 822"></label><label>帳號 <input id="bAcct" type="text" inputmode="numeric"></label>
    <label>戶名（選填） <input id="bName" type="text"></label><label>金額（選填） <input id="bAmt" type="text" inputmode="numeric"></label><label>備註（選填） <input id="bNote" type="text"></label>
    <p class="hint" style="margin:4px 0 0">產生的是文字 QR Code，掃描後顯示帳號資訊供對方複製，不是銀行 App 的付款碼。</p></fieldset>
  <fieldset><legend>外觀</legend>
    <label>前景色 <input id="fg" type="color" value="#000000"></label> <label>背景色 <input id="bg" type="color" value="#ffffff"></label>
    <label>容錯 <select id="ecl"><option value="L">L（7%）</option><option value="M" selected>M（15%）</option><option value="Q">Q（25%）</option><option value="H">H（30%）</option></select></label>
    <label>Logo（選填） <input id="logo" type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp"></label> <button id="logoClear" type="button" class="btn sm hidden">移除 Logo</button>
    <p class="hint" style="margin:4px 0 0">放 Logo 時會自動使用最高容錯 H。</p></fieldset>
</div>
<div class="qrright">
  <div id="qrPreview" class="qrprev" aria-label="QR Code 預覽"></div>
  <label>PNG 尺寸 <select id="px"><option value="512">512 px</option><option value="1024" selected>1024 px</option><option value="2048">2048 px（印刷）</option></select></label>
  <div class="actions"><button id="dlPng" type="button" class="btn primary qdl">下載 PNG</button><button id="dlSvg" type="button" class="btn qdl">下載 SVG（向量）</button></div>
  ${statusBox}
  <details><summary class="hint">QR Code 內容</summary><pre id="qrText" class="qrtext"></pre></details>
</div></form></div>` },
};

function layout({ slug, title, desc, h1, lead, main, ld = [], js, suffix, noindex, badge = true, ogType = 'website' }) {
  const root = slug ? '../'.repeat(slug.split('/').length) : './';
  const url = BASE + (slug ? slug + '/' : '');
  return `<!doctype html>
<html lang="zh-Hant-TW">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<meta name="referrer" content="strict-origin-when-cross-origin">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
${noindex ? '<meta name="robots" content="noindex,follow">\n' : ''}<link rel="canonical" href="${url}">
<meta property="og:type" content="${ogType}">
<meta property="og:locale" content="zh_TW">
<meta property="og:site_name" content="${BRAND}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">
<meta name="theme-color" content="#2563eb">
<link rel="icon" href="${root}favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="${root}assets/style.css">
${ADS_HEAD}${ld.length ? `<script type="application/ld+json">${JSON.stringify(ld)}</script>\n` : ''}</head>
<body${suffix ? ` data-suffix="${suffix}"` : ''}>
<a class="skip" href="#main">跳到主要內容</a>
<header class="site"><div class="wrap">
  <a class="logo" href="${root}">${ICON}<span>${BRAND}</span></a>
  <nav class="tools" aria-label="工具">${groupsT.map((g) => `<span class="ngrp"><span class="nlab">${g.short}</span>${g.tools.map((t) => `<a href="${root}${t.slug}/"${t.slug === slug ? ' aria-current="page"' : ''}>${NAV[t.tool]}</a>`).join('')}</span>`).join('')}</nav>
</div></header>
<main id="main" class="wrap">
  <section class="hero">
    <h1>${h1}</h1>
    ${lead ? `<p class="lead">${lead}</p>` : ''}
    ${badge ? '<div class="badge">🔒 檔案不會上傳，全程在您的瀏覽器中處理</div>' : ''}
  </section>
  ${main}
</main>
<footer class="site"><div class="wrap cols">
  <div style="max-width:520px">
    <strong>${BRAND}</strong>
    <p><strong>檔案不會上傳：</strong>本站所有 PDF 與圖片處理都在您的瀏覽器中完成，不會傳送到任何伺服器；${ADS ? '本站以 Google AdSense 顯示固定橫幅廣告（無彈出視窗），廣告商可能使用 Cookie，詳見隱私權政策。' : '不使用 Cookie、不做追蹤分析、不載入第三方腳本。'}</p>
    <p><a href="${root}blog/">教學文章</a> · <a href="${root}privacy/">隱私權政策</a> · <a href="${root}about/">關於我們</a> · <a href="${root}contact/">聯絡我們</a> · <a href="${root}terms/">使用條款</a> · <a href="${root}THIRD_PARTY_LICENSES.txt">第三方授權</a> · <a href="${CHROME_EXT}" rel="noopener" target="_blank">Chrome 擴充功能</a> · <a href="${REPO}" rel="noopener">原始碼</a></p>
  </div>
  ${groupsT.map((g) => `<div><strong>${g.name}</strong><ul>${g.tools.map((t) => `<li><a href="${root}${t.slug}/">${t.nav}</a></li>`).join('')}</ul></div>`).join('')}
</div></footer>
<script type="module" src="${root}assets/${js || 'common.js'}"></script>
</body>
</html>
`;
}

// Ad slot: fixed banner inside the article, far from tool/download buttons; never on empty/utility pages.
// No ad unit yet (ADSENSE_SLOT empty) => render nothing, so no empty/placeholder box.
const AD = !ADSENSE_SLOT ? '' : ADS
  ? `<aside class="ad-slot ad-live" data-ad-slot="article-banner" aria-label="廣告"><ins class="adsbygoogle" style="display:inline-block;width:728px;height:90px" data-ad-client="${ADSENSE_CLIENT}" data-ad-slot="${ADSENSE_SLOT}"></ins></aside>`
  : `<aside class="ad-slot" data-ad-slot="article-banner" aria-label="廣告">廣告</aside>`;
const faqHtml = (faq) => `<h2>常見問題</h2>\n${faq.map(([q, a]) => `<h3>${q}</h3><p>${a}</p>`).join('\n')}`;
const faqLd = (faq) => ({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: strip(a) } })) });
const crumbs = (name, slug) => ({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
  { '@type': 'ListItem', position: 1, name: BRAND, item: BASE }, { '@type': 'ListItem', position: 2, name, item: `${BASE}${slug}/` }] });

const out = []; // [path, html]

for (const p of toolPages) {
  const t = TOOLS[p.tool], x = TX[p.slug];
  if (!x) throw new Error('no toolextra for ' + p.slug);
  const faq = [...p.faq, ...x.faq];
  if (faq.length < 2) throw new Error('too few FAQs: ' + p.slug);
  const guides = posts.filter((b) => b.tool === p.slug || (b.alsoTools || []).includes(p.slug));
  const main = `${t.html()}
  <article class="card prose">
    ${p.intro}
    <h2>${p.kw}怎麼做？${p.steps.length} 個步驟完成</h2>
    <ol class="steps">${p.steps.map((s) => `<li>${s}</li>`).join('')}</ol>
    ${p.extra}
  </article>
  ${AD}
  <article class="card prose">
    ${p.mobile}
    <h2>遇到問題怎麼辦？</h2>
    <dl class="trouble">${x.trouble.map(([q, a]) => `<dt>${q}</dt><dd>${a}</dd>`).join('')}</dl>
    <h2>檔案怎麼在本機處理？</h2>
    <p>${x.local}</p>
    ${faqHtml(faq)}
    ${guides.length ? `<h2>相關教學</h2>
    <ul class="links">${guides.map((b) => `<li><a href="../blog/${b.slug}/">${b.title}</a></li>`).join('')}</ul>` : ''}
    <h2>同類工具：${groupOf(p.slug).name}</h2>
    <ul class="links">${groupOf(p.slug).tools.filter((y) => y !== p).map((y) => `<li><a href="../${y.slug}/">${y.nav}</a>：${y.short}</li>`).join('')}</ul>
  </article>`;
  const url = `${BASE}${p.slug}/`;
  const ld = [
    { '@context': 'https://schema.org', '@type': 'WebApplication', name: `${p.nav}｜${BRAND}`, url, description: p.desc,
      applicationCategory: 'UtilitiesApplication', operatingSystem: 'Any（網頁瀏覽器）', browserRequirements: 'Requires JavaScript',
      inLanguage: 'zh-TW', isAccessibleForFree: true, offers: { '@type': 'Offer', price: '0', priceCurrency: 'TWD' } },
    { '@context': 'https://schema.org', '@type': 'HowTo', name: `${p.kw}怎麼做`, inLanguage: 'zh-TW', step: p.steps.map((s, i) => ({ '@type': 'HowToStep', position: i + 1, text: strip(s) })) },
    faqLd(faq), crumbs(p.nav, p.slug),
  ];
  out.push([`${p.slug}/index.html`, layout({ slug: p.slug, title: `${p.kw}｜免費、不上傳、本機處理｜${BRAND}`, desc: p.desc, h1: p.h1, lead: p.lead, main, ld, js: t.js, suffix: t.suffix })]);
}

// Home
const homeFaq = [
  ['真的不會上傳我的檔案嗎？', '是的。本站是 GitHub Pages 上的靜態網頁，沒有接收檔案的伺服器；PDF 與圖片的讀取、處理和產生都在您的瀏覽器中完成。您可以打開瀏覽器開發者工具的「網路」分頁，確認處理檔案時沒有任何上傳請求。'],
  ['需要註冊或付費嗎？', '不需要。所有工具免費、免註冊，也沒有每日次數限制。網站以一個固定的橫幅廣告維持營運，不使用彈出式或插頁式廣告。'],
  ['手機可以用嗎？', 'iPhone、iPad、Android 手機與平板都可以用，建議使用 Safari 或 Chrome。頁數很多或很大的檔案在手機上會比較慢，必要時請分批處理或改用電腦。'],
  ['有哪些檔案處理不了？', '設有開啟密碼或加密的 PDF 目前不支援；HEIC 照片只有能解碼 HEIC 的瀏覽器（例如 Safari）才能讀取；GIF 動畫只會處理第一格。'],
  ['發現錯誤要找誰？', '請來信 ' + CONTACT + '，或到 GitHub Issues 回報。回報時請描述使用的工具、裝置與瀏覽器，不要附上含個資的檔案。'],
];
const homeMain = `<article class="card prose">
<h2>常見情境：該用哪個工具？</h2>
<ul>
<li><strong>報名或求職網站說附件太大：</strong>用 <a href="compress-pdf/">壓縮 PDF</a>。掃描檔與照片型 PDF 效果最好（我們實測 5 頁掃描檔從 5.0 MB 壓到 854 KB）；Word 匯出的文字型 PDF 通常本來就小，詳見 <a href="blog/compress-pdf-under-size-limit/">PDF 太大無法上傳怎麼辦</a>。</li>
<li><strong>手機拍了幾張收據或作業，要交一個 PDF：</strong>先用 <a href="compress-image/">圖片壓縮</a> 把最長邊縮到 1920 px，再用 <a href="jpg-to-pdf/">JPG 轉 PDF</a> 合成，檔案會比直接用原圖小很多。</li>
<li><strong>只需要長篇 PDF 的其中幾頁：</strong>用 <a href="split-pdf/">PDF 分割</a> 輸入「1-3, 5」這樣的頁碼範圍。</li>
<li><strong>掃描檔順序亂掉、有的頁面倒過來：</strong>用 <a href="reorder-pdf-pages/">PDF 頁面排序</a>，可以同時旋轉與刪頁；整理流程可參考 <a href="blog/organize-scanned-pdf/">掃描檔整理教學</a>。</li>
<li><strong>要把身分證影本傳給店家或房東：</strong>用 <a href="watermark-image/">圖片加浮水印</a>，寫清楚用途與日期，見 <a href="blog/id-card-copy-watermark/">證件影本浮水印怎麼寫</a>。</li>
<li><strong>店裡想讓客人掃碼連 Wi-Fi：</strong>用 <a href="qr-code-generator/">QR Code 產生器</a> 的 Wi-Fi 類型，產生的是不會過期的靜態 QR Code。</li>
</ul>
<h2>這個網站怎麼運作？</h2>
<p>${BRAND} 是放在 GitHub Pages 上的靜態網站，沒有後端伺服器。打開工具時，處理檔案的程式會下載到您的瀏覽器執行：PDF 用 pdf-lib 與 PDF.js，圖片壓縮用 WebAssembly 版的 MozJPEG、libwebp 與 OxiPNG，QR Code 用 qrcode-generator，這些開源程式都放在本站，不從其他 CDN 載入（清單見 <a href="THIRD_PARTY_LICENSES.txt">第三方授權</a>）。您選擇的檔案只會讀進裝置的記憶體，處理結果直接下載，本站的程式不會把檔案交給任何第三方。</p>
<p>網站以 Google AdSense 顯示一個固定的橫幅廣告來負擔營運，廣告由 Google 提供並可能使用 Cookie，說明見 <a href="privacy/">隱私權政策</a>。完整原始碼公開在 <a href="${REPO}" rel="noopener">GitHub</a>，任何人都可以檢查。</p>
<h2>使用前要知道的限制</h2>
<ul>
<li>設有開啟密碼或加密的 PDF 目前無法處理。</li>
<li><a href="compress-pdf/">壓縮 PDF</a> 採「頁面轉圖片」的方式，壓縮後文字無法選取，適合掃描檔，不適合需要複製文字的文件。</li>
<li>HEIC 照片需要瀏覽器本身支援才能讀取，Windows 上的 Chrome、Edge 多半不行。</li>
<li>能處理多大的檔案取決於裝置記憶體，手機遇到上百頁的掃描檔可能會變慢或失敗。</li>
</ul>
<p>想看更完整的操作說明，請到 <a href="blog/">教學文章</a>；網站由誰維護、怎麼聯絡，請見 <a href="about/">關於我們</a>。</p>
</article>`;
out.push(['index.html', layout({ slug: '', title: home.title, desc: home.desc, h1: home.h1, lead: home.lead,
  main: `${groupsT.map((g, i) => `<section class="tgroup" aria-labelledby="g${i}"><h2 id="g${i}" class="ghead">${g.ic} ${g.name}<small>${g.desc}</small></h2>
  <div class="tiles">${g.tools.map((t) => `<a class="tile" href="${t.slug}/"><div class="ic">${t.ic}</div><h3>${t.nav}</h3><p>${t.short}</p></a>`).join('')}</div></section>`).join('\n  ')}
  <aside class="card" style="margin:1.25rem 0">
  <p><strong>Chrome 擴充功能：</strong>也可安裝 <a href="${CHROME_EXT}" rel="noopener" target="_blank">Waiting PDF 本機工具</a>（合併、拆分、旋轉、圖片轉 PDF），一樣本機處理、檔案不上傳。</p>
</aside>
  ${homeMain}
  ${AD}
  <article class="card prose">${faqHtml(homeFaq)}</article>`,
  ld: [{ '@context': 'https://schema.org', '@type': 'WebSite', name: BRAND, alternateName: 'Waiting Studio', url: BASE, inLanguage: 'zh-TW', publisher: { '@type': 'Organization', name: 'Waiting Studio', url: BASE, email: CONTACT } }, faqLd(homeFaq)] })]);

// Privacy policy
out.push(['privacy/index.html', layout({ slug: 'privacy', title: `隱私權政策｜${BRAND}`, desc: `${BRAND} 隱私權政策：檔案不會上傳，所有處理都在您的瀏覽器中完成；本站不做追蹤分析。說明 Google AdSense 廣告與第三方 Cookie 的使用及退出方式。`, h1: '隱私權政策', lead: `最後更新：${LASTMOD}`, badge: false,
  ld: [crumbs('隱私權政策', 'privacy')],
  main: `<article class="card prose">
<h2>1. 您的檔案不會上傳</h2>
<p>${BRAND}（以下稱「本站」）的所有 PDF 與圖片處理，都在您的瀏覽器中以 JavaScript 執行。您選擇的檔案只會被讀入您裝置的記憶體，處理結果直接下載到您的裝置。本站沒有接收、儲存或檢視您檔案的伺服器，我們無法取得您的檔案內容。</p>
<h2>2. 本站目前收集的資料</h2>
<p>本站是放在 GitHub Pages 的靜態網站，${ADS ? '<strong>不使用任何分析或追蹤工具</strong>，但會載入 Google AdSense 廣告程式（見第 4 節）。' : '目前<strong>不使用 Cookie、不使用任何分析或追蹤工具，也不載入第三方腳本</strong>。'}與一般網站相同，主機服務商 GitHub 可能為了安全與維運記錄連線資訊（例如 IP 位址、瀏覽器類型），相關處理請參考 <a href="https://docs.github.com/zh/site-policy/privacy-policies/github-general-privacy-statement" rel="noopener">GitHub 隱私聲明</a>。</p>
<h2>3. 本機儲存（localStorage）</h2>
<p>本站的工具不會把您的檔案或文字存進瀏覽器。唯一會寫入 localStorage 的是預留的「移除廣告」授權功能（目前尚未開放購買）：日後若您啟用，授權碼與啟用狀態只會儲存在您的裝置上，清除瀏覽器的網站資料即可刪除。圖片壓縮工具第一次使用時，會從本站下載壓縮引擎（WebAssembly 檔案），瀏覽器可能把它快取起來，這些檔案不含任何個人資料。</p>
<h2>4. 廣告與第三方 Cookie（Google AdSense）</h2>
<p>${ADS ? '為了維持免費營運，本站使用 Google AdSense 在頁面中顯示一個固定的橫幅廣告版位' : '本站目前沒有任何廣告。我們計畫使用 Google AdSense 在頁面中顯示一個固定的橫幅廣告版位'}，不使用彈出式視窗、插頁式或覆蓋畫面的廣告，也不會放在工具與下載按鈕旁邊。${ADS ? '' : '啟用後適用以下說明：'}</p>
<ul>
<li>第三方廠商（包括 Google）會使用 Cookie，根據使用者先前造訪本站或其他網站的紀錄放送廣告。</li>
<li>Google 使用廣告 Cookie，讓 Google 及其合作夥伴能根據使用者造訪本站和網路上其他網站的情形，放送合適的廣告。Google 如何使用這些資料，請見 <a href="https://policies.google.com/technologies/partner-sites?hl=zh-TW" rel="noopener">Google 如何使用合作夥伴網站或應用程式的資訊</a>。</li>
<li>您可以前往 <a href="https://adssettings.google.com/" rel="noopener">Google 廣告設定</a> 停用個人化廣告，或前往 <a href="https://www.aboutads.info/choices/" rel="noopener">www.aboutads.info</a> 停用第三方廠商用於個人化廣告的 Cookie。</li>
<li>來自歐洲經濟區、英國與瑞士的訪客，會看到 Google 認證同意管理平台（CMP）提供的 Cookie 同意訊息，可選擇是否同意，並隨時從該訊息重新設定。</li>
<li>您也可以在瀏覽器設定中封鎖或刪除 Cookie，或使用瀏覽器的追蹤保護功能。</li>
</ul>
<p>無論是否顯示廣告，您的 PDF 與圖片檔案都不會傳送給廣告商或任何第三方。</p>
<h2>5. 付款</h2>
<p>本站目前沒有任何付費功能。若日後開放「移除廣告」，付款將由第三方平台（預計為 Gumroad）處理，本站不會接觸您的信用卡資料，屆時會先更新本政策。</p>
<h2>6. 兒童隱私</h2>
<p>本站不會刻意收集任何人的個人資料，包括兒童。</p>
<h2>7. 政策變更與聯絡方式</h2>
<p>本政策如有修改，會在本頁更新並註明日期。若有任何問題，請來信 <a href="mailto:${CONTACT}">${CONTACT}</a> 或參考 <a href="../contact/">聯絡我們</a>。</p>
</article>` })]);

// About / contact
// Chrome extension privacy policy
out.push(['extension-privacy/index.html', layout({ slug: 'extension-privacy', title: `Waiting PDF 擴充功能隱私權政策 Extension Privacy Policy｜${BRAND}`, desc: 'Waiting PDF 本機工具 Chrome 擴充功能隱私權政策：檔案全程本機處理，唯一對外連線是向 api.gumroad.com 驗證授權碼。Privacy policy for the Waiting PDF Local Tools Chrome extension.', h1: 'Waiting PDF 本機工具（Chrome 擴充功能）隱私權政策', lead: '生效日期 Effective：2026-11-03', badge: false,
  ld: [crumbs('擴充功能隱私權政策', 'extension-privacy')],
  main: `<article class="card prose">
<p>本政策適用於 Chrome 擴充功能「Waiting PDF 本機工具：合併、拆分、圖片轉 PDF」。網站本身的政策請見 <a href="../privacy/">隱私權政策</a>。</p>
<h2>繁體中文</h2>
<ul>
<li>本擴充功能的所有 PDF 與圖片處理都在您的瀏覽器內本機完成，檔案不會上傳到任何伺服器。</li>
<li>不收集、不傳送、不販售任何個人資料或使用資料；不使用分析、追蹤或廣告。</li>
<li>僅在您的瀏覽器本機（localStorage）儲存：授權碼、最近一次驗證時間、每日免費使用次數計數。移除擴充功能即一併刪除。</li>
<li><strong>唯一的對外連線是 api.gumroad.com</strong>：當您輸入 Gumroad 授權碼時（以及之後約每 7 天一次），擴充功能會將「授權碼」與本產品的 product_id 傳送至 Gumroad（https://api.gumroad.com/v2/licenses/verify）以確認購買有效。不傳送任何檔案、檔名、瀏覽紀錄或其他資料。Gumroad 對該請求的處理適用 <a href="https://gumroad.com/privacy" rel="noopener">Gumroad 隱私權政策</a>。驗證成功後可離線使用，30 天內至少需連線驗證一次。</li>
<li>舊式 WPDF1 授權碼以內建公鑰離線驗證，不會連網。</li>
<li>唯一要求的網站存取權限為 https://api.gumroad.com/*，僅用於上述授權驗證；不要求其他 Chrome 權限。</li>
<li>聯絡：<a href="mailto:abbottabbott399@gmail.com">abbottabbott399@gmail.com</a></li>
</ul>
<h2 lang="en">English</h2>
<ul lang="en">
<li>All PDF and image processing happens locally in your browser. Your files are never uploaded to any server.</li>
<li>We do not collect, transmit, or sell any personal or usage data. No analytics, tracking, or ads.</li>
<li>Only stored locally in your browser (localStorage): your license key, the time of its last successful check, and a daily free-usage counter. Removing the extension deletes them.</li>
<li><strong>The only network connection is to api.gumroad.com</strong>: when you enter a Gumroad license key (and roughly every 7 days afterwards), the extension sends the license key and this product's product_id to Gumroad (https://api.gumroad.com/v2/licenses/verify) to confirm the purchase. No files, file names, browsing data or anything else is sent. Gumroad's handling of that request is governed by <a href="https://gumroad.com/privacy" rel="noopener">Gumroad's privacy policy</a>. After activation it works offline; it must reach Gumroad at least once every 30 days.</li>
<li>Legacy WPDF1 codes are verified offline with a bundled public key; no network access.</li>
<li>The only host permission requested is https://api.gumroad.com/*, used solely for license verification. No other Chrome permissions.</li>
<li>Contact: <a href="mailto:abbottabbott399@gmail.com">abbottabbott399@gmail.com</a></li>
</ul>
</article>` })]);

out.push(['about/index.html', layout({ slug: 'about', title: `關於我們｜${BRAND}`, desc: `關於 ${BRAND} 與 Waiting Studio：誰在維護這個網站、工具怎麼開發與測試、教學文章怎麼寫，以及聯絡與回報問題的方式。`, h1: `關於 ${BRAND}`, lead: '', badge: false,
  ld: [crumbs('關於我們', 'about'), { '@context': 'https://schema.org', '@type': 'AboutPage', name: `關於我們｜${BRAND}`, url: `${BASE}about/`, inLanguage: 'zh-TW', publisher: { '@type': 'Organization', name: 'Waiting Studio', url: BASE, email: CONTACT } }],
  main: `<article class="card prose">
<h2>誰在維護這個網站</h2>
<p>${BRAND}（waitingstudio.com）由 Waiting Studio 製作與維護。Waiting Studio 是台灣的小型個人工作室，製作簡單、尊重隱私的實用工具；除了這個網站，也發行同樣本機處理的 <a href="${CHROME_EXT}" rel="noopener" target="_blank">Chrome 擴充功能「Waiting PDF 本機工具」</a>。網站在 2026 年 10 月上線，目前提供 ${toolPages.length} 個工具與 ${posts.length} 篇教學文章。</p>
<h2>為什麼做這個網站</h2>
<p>報帳、申請補助、投履歷、租屋時，最常要處理的正是身分證影本、薪資單、合約這類敏感文件；但多數線上 PDF 工具都要先把檔案上傳到對方的伺服器。我們想做一組「打開網頁就能用、檔案不離開裝置」的工具，所以整個網站是靜態網頁，所有處理都在您的瀏覽器中進行，原始碼公開在 <a href="${REPO}" rel="noopener">GitHub</a>，誰都可以檢查。</p>
<h2>工具怎麼開發與測試</h2>
<ul>
<li>只使用 MIT、Apache-2.0、BSD 等寬鬆授權的開源函式庫（清單見 <a href="../THIRD_PARTY_LICENSES.txt">第三方授權</a>），全部放在本站，不從其他 CDN 載入。</li>
<li>每次更新前，我們會用自動化測試在無頭瀏覽器中實際操作每一個工具：上傳範例檔、按下按鈕、檢查下載的 PDF 頁數與方向、圖片格式與大小，並確認處理過程沒有任何對外的上傳請求。</li>
<li>使用者回報的問題會優先修正。例如曾有使用者回報圖片壓縮在「原尺寸」時檔案反而變大，我們因此改用 MozJPEG、PNG 量化等編碼器，並加上「不會比原檔大」的保護。</li>
</ul>
<h2>教學文章怎麼寫</h2>
<p>教學文章由我們依照工具的實際行為撰寫：文中的按鈕名稱、選項與限制都對照程式碼確認；提到的檔案大小與壓縮比例，是我們用範例檔實際測出來的數字，並註明測試條件。各機關、網站的上傳限制可能變動，我們不會替特定網站背書，請以您使用的網站公告為準。發現內容錯誤或過時，歡迎來信指正，我們會更正並更新文章日期。</p>
<h2>營運方式</h2>
<p>工具免費、免註冊、沒有使用次數限制。為了負擔維護成本，網站透過 Google AdSense 顯示一個固定的橫幅廣告，不使用彈出式或插頁式廣告，也不會放在下載按鈕旁邊；廣告與 Cookie 的說明見 <a href="../privacy/">隱私權政策</a>。本站不做任何分析追蹤。</p>
<h2>聯絡我們</h2>
<p>錯誤回報、功能建議或任何問題，請來信 <a href="mailto:${CONTACT}">${CONTACT}</a>，或到 <a href="${REPO}/issues" rel="noopener">GitHub Issues</a> 留言。更多說明請見 <a href="../contact/">聯絡我們</a>。</p>
</article>` })]);

// Contact
out.push(['contact/index.html', layout({ slug: 'contact', title: `聯絡我們｜${BRAND}`, desc: `聯絡 ${BRAND}：問題回報、功能建議、合作與授權問題，請來信 ${CONTACT}。`, h1: '聯絡我們', lead: '', badge: false,
  ld: [crumbs('聯絡我們', 'contact'), { '@context': 'https://schema.org', '@type': 'ContactPage', name: `聯絡我們｜${BRAND}`, url: `${BASE}contact/`,
    mainEntity: { '@type': 'Organization', name: BRAND, url: BASE, email: CONTACT } }],
  main: `<article class="card prose">
<h2>電子郵件</h2>
<p>任何問題、錯誤回報、功能建議、合作邀約，或「移除廣告」授權相關問題，請來信：<a href="mailto:${CONTACT}"><strong>${CONTACT}</strong></a>。我們通常會在 3 個工作天內回覆。</p>
<h2>回報問題時請提供</h2>
<ul>
<li>使用的工具（例如「PDF 合併」）與操作步驟。</li>
<li>裝置與瀏覽器（例如 iPhone 15／Safari、Windows／Chrome）。</li>
<li>畫面上出現的錯誤訊息或截圖。</li>
</ul>
<p><strong>請不要寄送含有個人資料的檔案。</strong>本站的工具全程在您的瀏覽器處理檔案，我們不需要、也不會要求您提供原始檔；如需重現問題，請改用不含敏感資料的範例檔。</p>
<h2>我們會怎麼處理您的來信</h2>
<ul>
<li>錯誤回報：我們會先用不含個資的範例檔重現問題，修正後在回信中說明改了什麼；影響較大的修正也會反映在相關工具頁與教學文章。</li>
<li>內容指正：教學文章中的步驟、數字或外部規定（例如上傳限制）若有錯誤或過時，請告訴我們出處，確認後會更正並更新文章日期。</li>
<li>功能建議：會列入待辦評估，但不保證一定實作；本站只做能在瀏覽器本機完成、不需要上傳檔案的功能。</li>
</ul>
<p>您的 Email 地址只用來回覆您的問題，不會加入任何名單或提供給第三方。</p>
<h2>其他管道</h2>
<p>熟悉 GitHub 的使用者也可以到 <a href="${REPO}/issues" rel="noopener">GitHub Issues</a> 公開回報（請勿在公開留言中放個人資料）。</p>
</article>` })]);

// Terms of use
out.push(['terms/index.html', layout({ slug: 'terms', title: `使用條款｜${BRAND}`, desc: `${BRAND} 使用條款：免費提供的瀏覽器端 PDF 工具，使用方式、免責聲明、廣告與付費移除廣告說明。`, h1: '使用條款', lead: `最後更新：${LASTMOD}`, badge: false,
  ld: [crumbs('使用條款', 'terms')],
  main: `<article class="card prose">
<h2>1. 服務內容</h2>
<p>${BRAND}（${BASE}，以下稱「本站」）由 Waiting Studio 提供，是免費的線上 PDF 工具，包括合併、分割、刪除頁面、旋轉、排序、壓縮、PDF 轉圖片、圖片轉 PDF 與圖片壓縮。所有檔案處理都在您的瀏覽器中完成，不會上傳到本站。使用本站即表示您同意本條款。</p>
<h2>2. 您的責任</h2>
<ul>
<li>請只處理您有權使用的檔案，並遵守著作權及相關法令。</li>
<li>請勿利用本站從事違法行為，或試圖干擾本站正常運作。</li>
<li>處理重要文件前請保留原始檔備份，並在使用前確認輸出結果正確。</li>
</ul>
<h2>3. 免責聲明</h2>
<p>本站依「現況」提供，不保證完全沒有錯誤或永遠可用。對於因使用或無法使用本站所造成的資料遺失或其他損害，在法律允許的範圍內，本站不負賠償責任。</p>
<h2>4. 廣告與移除廣告</h2>
<p>本站透過 Google AdSense 顯示固定橫幅廣告，不使用彈出式或插頁式廣告。廣告內容由 Google 提供，本站不為廣告主的商品或服務背書。付費移除廣告的功能目前尚未開放；開放時會更新本條款。廣告與 Cookie 的說明請見 <a href="../privacy/">隱私權政策</a>。</p>
<h2>5. 智慧財產權</h2>
<p>本站網頁內容與教學文章著作權屬 Waiting Studio 所有；程式碼依 MIT 授權公開於 <a href="${REPO}" rel="noopener">GitHub</a>，使用的第三方函式庫依其各自授權（見 <a href="../THIRD_PARTY_LICENSES.txt">第三方授權</a>）。</p>
<h2>6. 條款變更與準據法</h2>
<p>本條款如有修改，會在本頁更新日期。本條款以中華民國（台灣）法律為準據法。問題請來信 <a href="mailto:${CONTACT}">${CONTACT}</a>。</p>
</article>` })]);

// Remove ads (license key unlock)
out.push(['remove-ads/index.html', layout({ slug: 'remove-ads', title: `移除廣告｜${BRAND}`, desc: `購買 ${BRAND} 移除廣告授權後，貼上授權碼即可在此裝置隱藏廣告版位。`, h1: '移除廣告', lead: '一次購買，貼上授權碼即可在此瀏覽器隱藏廣告版位。', badge: false, noindex: true, js: 'unlock.js',
  main: `<div class="card">
<p><strong>付費移除廣告目前尚未開放購買。</strong>開放前本頁無法驗證授權碼；開放時會在 <a href="../about/">關於我們</a> 公告。</p>
<form id="unlockForm" class="opts" autocomplete="off">
  <label for="licenseKey" style="display:block">授權碼</label>
  <input id="licenseKey" type="text" placeholder="XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX" spellcheck="false">
  <div><button class="btn primary" type="submit">驗證並啟用</button> <button id="unlockClear" class="btn hidden" type="button">清除此裝置的授權</button></div>
</form>
<div id="unlockMsg" class="status" role="status" aria-live="polite"></div>
<p id="unlockState" class="hint"></p>
<p class="hint">授權狀態只儲存在您瀏覽器的 localStorage；換瀏覽器或清除網站資料後需重新輸入。</p>
</div>` })]);

// Blog / tutorials (no ad slot). Article + HowTo + FAQPage + BreadcrumbList JSON-LD.
const toolBySlug = Object.fromEntries(toolPages.map((t) => [t.slug, t]));
const org = { '@type': 'Organization', name: BRAND, url: BASE };
const blogCrumbs = (items) => ({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
  { '@type': 'ListItem', position: 1, name: BRAND, item: BASE }, { '@type': 'ListItem', position: 2, name: '教學文章', item: `${BASE}blog/` },
  ...items.map(([name, slug], i) => ({ '@type': 'ListItem', position: 3 + i, name, item: `${BASE}${slug}/` }))] });
const postBySlug = Object.fromEntries(posts.map((p) => [p.slug, p]));
for (const p of posts) {
  const slug = `blog/${p.slug}`, url = `${BASE}${slug}/`;
  if (!toolBySlug[p.tool]) throw new Error(`blog ${p.slug}: unknown tool ${p.tool}`);
  const main = `<article class="card prose">
    <p class="hint">發布：${p.date || BLOG_DATE}${p.updated ? `　更新：${p.updated}` : ''}　作者：Waiting Studio</p>
    ${p.answer}
    <div class="actions"><a class="btn primary lg" href="../../${p.tool}/">開啟「${p.toolName}」工具</a></div>
    <h2>${p.stepsTitle}</h2>
    <ol class="steps">${p.steps.map((s) => `<li>${s}</li>`).join('')}</ol>
    ${p.mobile}
    ${p.body}
    ${faqHtml(p.faq)}
    <h2>延伸閱讀</h2>
    <ul class="links">${p.related.map((r) => `<li><a href="../${r}/">${postBySlug[r].title}</a></li>`).join('')}
    <li><a href="../../${p.tool}/">直接使用「${p.toolName}」工具</a></li>
    <li><a href="../">所有教學文章</a></li></ul>
  </article>`;
  const ld = [
    { '@context': 'https://schema.org', '@type': 'Article', headline: p.title, description: p.desc, inLanguage: 'zh-TW', url,
      mainEntityOfPage: { '@type': 'WebPage', '@id': url }, datePublished: p.date || BLOG_DATE, dateModified: p.updated || p.date || BLOG_DATE,
      author: org, publisher: org, about: { '@type': 'WebApplication', name: `${p.toolName}｜${BRAND}`, url: `${BASE}${p.tool}/` } },
    { '@context': 'https://schema.org', '@type': 'HowTo', name: p.stepsTitle, inLanguage: 'zh-TW',
      tool: [{ '@type': 'HowToTool', name: `${BRAND}「${p.toolName}」（${BASE}${p.tool}/）` }],
      step: p.steps.map((s, i) => ({ '@type': 'HowToStep', position: i + 1, text: strip(s) })) },
    faqLd(p.faq), blogCrumbs([[p.title, slug]]),
  ];
  out.push([`${slug}/index.html`, layout({ slug, title: `${p.title}｜${BRAND}`, desc: p.desc, h1: p.h1, lead: '', main, ld, badge: false, ogType: 'article' })]);
}
out.push(['blog/index.html', layout({ slug: 'blog', title: `教學文章：PDF、圖片與實用工具｜${BRAND}`, desc: `${BRAND} 教學文章：PDF 太大怎麼壓、照片怎麼縮小、PNG／JPG／WebP 怎麼選、掃描檔整理、證件影本浮水印、永久 QR Code 等，附實測數據，全部以瀏覽器本機處理。`, h1: '教學文章', lead: '依照工具實際行為撰寫，附我們實測的數據；發現錯誤歡迎來信指正。', badge: false,
  ld: [{ '@context': 'https://schema.org', '@type': 'Blog', name: `${BRAND} 教學文章`, url: `${BASE}blog/`, inLanguage: 'zh-TW', publisher: org,
    blogPost: posts.map((p) => ({ '@type': 'BlogPosting', headline: p.title, url: `${BASE}blog/${p.slug}/`, datePublished: p.date || BLOG_DATE, dateModified: p.updated || p.date || BLOG_DATE })) }, blogCrumbs([])],
  main: CATS.map(([c, name]) => `<section class="tgroup" aria-label="${name}"><h2 class="ghead">${name}</h2><div class="tiles">${posts.filter((p) => p.cat === c).map((p) => `<a class="tile" href="${p.slug}/"><h3>${p.title}</h3><p>${p.desc}</p></a>`).join('')}</div></section>`).join('\n') })]);

// Retired posts (merged into stronger articles): noindex redirect stubs, not in sitemap.
for (const [from, to] of Object.entries(RETIRED)) {
  out.push([`blog/${from}/index.html`, `<!doctype html><html lang="zh-Hant-TW"><head><meta charset="utf-8"><meta name="robots" content="noindex"><link rel="canonical" href="${BASE}blog/${to}/"><meta http-equiv="refresh" content="0; url=../${to}/"><title>文章已合併</title></head><body><p>這篇文章已合併到 <a href="../${to}/">${postBySlug[to].title}</a>。</p></body></html>\n`]);
}

// Old URLs from the first release -> redirect stubs (not in sitemap).
const REDIRECTS = { 'pdf-merge': 'merge-pdf', 'pdf-split': 'split-pdf', 'pdf-organize': 'reorder-pdf-pages', 'image-to-pdf': 'jpg-to-pdf' };
for (const [from, to] of Object.entries(REDIRECTS)) {
  out.push([`${from}/index.html`, `<!doctype html><html lang="zh-Hant-TW"><head><meta charset="utf-8"><meta name="robots" content="noindex"><link rel="canonical" href="${BASE}${to}/"><meta http-equiv="refresh" content="0; url=../${to}/"><title>已搬移</title></head><body><p>此頁已搬移至 <a href="../${to}/">${BASE}${to}/</a></p></body></html>\n`]);
}

for (const [f, html] of out) { const p = join(ROOT, f); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, html); }

const indexed = ['', ...toolPages.map((p) => p.slug + '/'), 'blog/', ...posts.map((p) => `blog/${p.slug}/`), 'privacy/', 'extension-privacy/', 'about/', 'contact/', 'terms/'];
writeFileSync(join(ROOT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${indexed.map((s) => `  <url><loc>${BASE}${s}</loc><lastmod>${LASTMOD}</lastmod><priority>${s === '' ? '1.0' : /privacy|about|contact|terms/.test(s) ? '0.3' : /^blog\//.test(s) ? '0.7' : '0.9'}</priority></url>`).join('\n')}
</urlset>
`);
writeFileSync(join(ROOT, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${BASE}sitemap.xml\n`);
if (ADS) writeFileSync(join(ROOT, 'ads.txt'), `google.com, ${ADSENSE_CLIENT.replace('ca-', '')}, DIRECT, f08c47fec0942fa0\n`);
else rmSync(join(ROOT, 'ads.txt'), { force: true });
writeFileSync(join(ROOT, 'favicon.svg'), ICON.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '));
console.log('built', out.length, 'files');
