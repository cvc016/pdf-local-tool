// Generates the static HTML pages, sitemap.xml and robots.txt.
// Usage: node scripts/build.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://cvc016.github.io/pdf-local-tool/';
const SITE = 'PDF 本機工具';
const LASTMOD = new Date().toISOString().slice(0, 10);

const ICON = `<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="5" y="2" width="22" height="28" rx="4" fill="#2563eb"/><path d="M11 12h10M11 17h10M11 22h6" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/></svg>`;
const UP = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 16V4m0 0-5 5m5-5 5 5"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg>`;

const tools = [
  { slug: 'pdf-merge/', nav: 'PDF 合併', ic: '🧩', short: '把多個 PDF 合併成一個檔案，可拖曳調整順序。' },
  { slug: 'pdf-split/', nav: 'PDF 分割', ic: '✂️', short: '依頁碼範圍分割，或每一頁存成獨立 PDF。' },
  { slug: 'pdf-organize/', nav: 'PDF 轉向／排序', ic: '🔄', short: '旋轉頁面、拖曳排序、刪除不要的頁面。' },
  { slug: 'image-to-pdf/', nav: '圖片轉 PDF', ic: '🖼️', short: 'JPG、PNG（支援時含 HEIC）轉成 PDF。' },
];

const drop = (accept, multiple, big, small, id = 'drop', inputId = 'file', compact = false) => `
<div id="${id}" class="drop${compact ? ' compact' : ''}" role="button" tabindex="0" aria-label="${big}">
  ${UP}<div class="big">${big}</div>${small ? `<div class="small">${small}</div>` : ''}
  <input id="${inputId}" type="file" accept="${accept}" ${multiple ? 'multiple' : ''} hidden>
</div>`;

const PRIV = '🔒 檔案不會上傳，全程在您的瀏覽器中處理';

const pages = [
  {
    slug: '', title: `免費 PDF 工具：合併、分割、轉向、圖片轉 PDF｜檔案不上傳｜${SITE}`,
    desc: '免費、無次數限制的線上 PDF 工具：PDF 合併、PDF 分割、頁面旋轉與排序、圖片轉 PDF。所有處理都在您的瀏覽器中完成，檔案不會上傳到任何伺服器，安全保護隱私。',
    h1: '免費 PDF 工具，檔案不上傳', lead: '合併、分割、旋轉排序、圖片轉 PDF。全部在您的裝置上處理，不需註冊、沒有次數限制。',
    body: () => `<section class="tiles" aria-label="工具列表">${tools.map((t) => `<a class="tile" href="${t.slug}"><div class="ic">${t.ic}</div><h2>${t.nav}</h2><p>${t.short}</p></a>`).join('')}</section>`,
    prose: `<h2>為什麼選擇 ${SITE}？</h2>
<ul><li><strong>檔案不會上傳：</strong>使用瀏覽器內建技術在本機處理，您的合約、報表、證件掃描檔都不會離開您的電腦或手機。</li>
<li><strong>完全免費、無限次使用：</strong>不需註冊、不限檔案數量，不加浮水印。</li>
<li><strong>手機、電腦都能用：</strong>支援 iPhone、Android、Windows、Mac 的主流瀏覽器。</li>
<li><strong>可離線使用：</strong>頁面載入後，即使斷網也能繼續處理檔案。</li></ul>`,
    faq: [
      ['真的不會上傳我的檔案嗎？', '是的。本站是純前端靜態網頁，PDF 的讀取與產生都在您的瀏覽器中以 JavaScript 完成，沒有任何上傳檔案的伺服器。您可以在載入頁面後關閉網路測試，功能一樣可以使用。'],
      ['需要付費或註冊嗎？', '不需要。所有功能免費、無次數限制。'],
      ['支援有密碼的 PDF 嗎？', '目前不支援加密或有開啟密碼的 PDF，請先移除密碼後再使用。'],
    ],
  },
  {
    slug: 'pdf-merge/', title: `PDF 合併 – 免費線上合併多個 PDF，檔案不上傳｜${SITE}`,
    desc: '免費 PDF 合併工具：把多個 PDF 檔案合併成一個，可拖曳調整順序。全程在瀏覽器本機處理，檔案不會上傳，無次數限制，手機電腦都能用。',
    h1: 'PDF 合併', lead: '把多個 PDF 合併成一個檔案，拖曳即可調整順序。',
    js: 'merge.js',
    body: () => `<div class="card">${drop('application/pdf,.pdf', true, '選擇或拖放 PDF 檔案', '可一次選擇多個檔案')}
<div id="work" class="hidden">
  <div class="toolbar"><strong id="summary" class="grow"></strong><button id="clear" class="btn sm">全部清除</button></div>
  <p class="hint">拖曳 ⠿ 或使用 ▲▼ 調整順序，由上到下合併。</p>
  <ul id="list" class="flist"></ul>
  <div style="margin-top:10px">${drop('application/pdf,.pdf', true, '加入更多 PDF', '', 'more', 'file2', true)}</div>
  <div class="actions"><button id="go" class="btn primary lg" disabled>合併 PDF 並下載</button></div>
  <div id="status" class="status" role="status" aria-live="polite"></div>
</div></div>`,
    steps: ['點選上方區域或直接拖放，加入兩個以上的 PDF 檔案。', '拖曳調整檔案順序。', '按「合併 PDF 並下載」，合併後的檔案會直接存到您的裝置。'],
    faq: [
      ['可以合併幾個 PDF？', '沒有數量限制，實際上限取決於您裝置的記憶體。一般手機可輕鬆處理數十個檔案。'],
      ['合併後品質會變差嗎？', '不會。本工具直接複製原始頁面內容，不會重新壓縮圖片或文字。'],
      ['檔案會上傳嗎？', '不會，所有處理都在您的瀏覽器中完成。'],
    ],
  },
  {
    slug: 'pdf-split/', title: `PDF 分割 – 依頁碼拆分或擷取頁面，檔案不上傳｜${SITE}`,
    desc: '免費 PDF 分割工具：依頁碼範圍拆分 PDF、擷取指定頁面，或將每一頁存成獨立檔案。在瀏覽器本機處理，檔案不會上傳，無次數限制。',
    h1: 'PDF 分割', lead: '依頁碼範圍拆分、擷取指定頁面，或每一頁存成一個檔案。',
    js: 'split.js',
    body: () => `<div class="card">${drop('application/pdf,.pdf', false, '選擇或拖放一個 PDF 檔案', '')}
<div id="work" class="hidden">
  <div class="toolbar"><strong id="fname" class="grow"></strong><button id="reset" class="btn sm">換一個檔案</button></div>
  <div class="opts">
    <fieldset><legend>分割方式</legend>
      <label><input type="radio" name="mode" value="ranges" checked> 依頁碼範圍</label>
      <label><input type="radio" name="mode" value="each"> 每一頁存成一個檔案</label>
      <div id="rangeOpts">
        <label for="ranges" style="display:block;margin:6px 0 4px">頁碼範圍（以逗號分隔，每組產生一個檔案）：</label>
        <input id="ranges" type="text" inputmode="text" autocomplete="off">
        <div><label><input id="single" type="checkbox"> 將所選頁面合併成單一檔案（擷取頁面）</label></div>
        <p class="hint" style="margin:4px 0 0">也可以直接點選下方縮圖來選取頁面。</p>
      </div>
    </fieldset>
  </div>
  <div class="actions"><button id="go" class="btn primary lg">分割 PDF 並下載</button></div>
  <div id="status" class="status" role="status" aria-live="polite"></div>
  <ul id="results" class="results"></ul>
  <h2 style="font-size:16px;margin:18px 0 8px">頁面預覽</h2>
  <div id="grid" class="grid"></div>
</div></div>`,
    steps: ['選擇要分割的 PDF 檔案。', '輸入頁碼範圍（例如 1-3, 5, 8-10），或點選縮圖選取頁面；也可選擇「每一頁存成一個檔案」。', '按「分割 PDF 並下載」。多個檔案會打包成 ZIP，也可個別下載。'],
    faq: [
      ['頁碼範圍怎麼寫？', '用逗號分隔，每一組會產生一個檔案。例如「1-3, 5, 8-」會產生三個檔案：第 1 到 3 頁、第 5 頁、第 8 頁到最後一頁。'],
      ['只想取出其中幾頁怎麼做？', '輸入或點選要的頁面，勾選「將所選頁面合併成單一檔案」即可。'],
      ['檔案會上傳嗎？', '不會，所有處理都在您的瀏覽器中完成。'],
    ],
  },
  {
    slug: 'pdf-organize/', title: `PDF 轉向、排序、刪除頁面 – 線上旋轉 PDF，檔案不上傳｜${SITE}`,
    desc: '免費 PDF 頁面整理工具：旋轉 PDF 頁面方向、拖曳縮圖調整頁面順序、刪除不要的頁面。在瀏覽器本機處理，檔案不會上傳，無次數限制。',
    h1: 'PDF 轉向／排序', lead: '旋轉頁面方向、拖曳縮圖調整順序、刪除不要的頁面。',
    js: 'organize.js',
    body: () => `<div class="card">${drop('application/pdf,.pdf', false, '選擇或拖放一個 PDF 檔案', '')}
<div id="work" class="hidden">
  <div class="toolbar"><strong id="fname" class="grow"></strong><button id="reset" class="btn sm">換一個檔案</button></div>
  <div class="toolbar">
    <button id="rotAllL" class="btn sm">↺ 全部向左轉</button><button id="rotAllR" class="btn sm">↻ 全部向右轉</button>
    <button id="reverse" class="btn sm">⇅ 反轉順序</button><button id="resetAll" class="btn sm">復原全部</button>
    <span id="summary" class="hint"></span>
  </div>
  <p class="hint">拖曳縮圖（手機請按住 ⠿）調整順序；↺↻ 旋轉、🗑 刪除（可再按 ↩ 還原）。</p>
  <div id="grid" class="grid"></div>
  <div class="actions"><button id="go" class="btn primary lg">套用並下載 PDF</button></div>
  <div id="status" class="status" role="status" aria-live="polite"></div>
</div></div>`,
    steps: ['選擇要整理的 PDF 檔案。', '用 ↺↻ 旋轉頁面、拖曳縮圖調整順序、按 🗑 刪除頁面。', '按「套用並下載 PDF」取得整理好的檔案。'],
    faq: [
      ['旋轉會影響畫質嗎？', '不會。旋轉只改變頁面的顯示方向設定，不會重新壓縮內容。'],
      ['掃描檔方向顛倒怎麼辦？', '按「全部向右轉」兩次即可旋轉 180 度，或個別調整每一頁。'],
      ['檔案會上傳嗎？', '不會，所有處理都在您的瀏覽器中完成。'],
    ],
  },
  {
    slug: 'image-to-pdf/', title: `圖片轉 PDF – JPG、PNG、HEIC 轉 PDF，檔案不上傳｜${SITE}`,
    desc: '免費圖片轉 PDF 工具：將 JPG、PNG 照片或掃描圖檔合併轉成 PDF，可調整順序、紙張大小與邊界。iPhone 照片也能轉。在瀏覽器本機處理，檔案不會上傳。',
    h1: '圖片轉 PDF', lead: '把 JPG、PNG 等圖片轉成一個 PDF，可調整順序、紙張大小與邊界。',
    js: 'img2pdf.js',
    body: () => `<div class="card">${drop('image/*,.heic,.heif', true, '選擇或拖放圖片', '支援 JPG、PNG、WebP；HEIC 需瀏覽器支援（如 Safari）')}
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
  <div id="status" class="status" role="status" aria-live="polite"></div>
</div></div>`,
    steps: ['選擇或拖放一張或多張圖片。', '拖曳調整順序，選擇紙張大小、方向與邊界。', '按「轉換成 PDF 並下載」。每張圖片會成為一頁。'],
    faq: [
      ['iPhone 的 HEIC 照片可以轉嗎？', '在 iPhone 上用 Safari 選取照片時，系統通常會自動轉成 JPG，可直接使用。若在電腦上使用 HEIC 檔，需瀏覽器本身支援（例如 Mac 的 Safari）；Chrome 等瀏覽器目前無法讀取 HEIC，請先轉成 JPG。'],
      ['照片方向會跑掉嗎？', '本工具會依照片的 EXIF 方向資訊自動轉正。'],
      ['檔案會上傳嗎？', '不會，所有處理都在您的瀏覽器中完成。'],
    ],
  },
];

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function render(p) {
  const root = p.slug ? '../' : './';
  const url = BASE + p.slug;
  const ld = [
    {
      '@context': 'https://schema.org', '@type': 'WebApplication', name: p.slug ? `${p.h1}｜${SITE}` : SITE,
      url, description: p.desc, applicationCategory: 'UtilitiesApplication', operatingSystem: 'Any（網頁瀏覽器）',
      inLanguage: 'zh-TW', isAccessibleForFree: true, offers: { '@type': 'Offer', price: '0', priceCurrency: 'TWD' },
    },
    { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: p.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
  ];
  if (p.slug) ld.push({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: SITE, item: BASE }, { '@type': 'ListItem', position: 2, name: p.h1, item: url }] });
  if (p.steps) ld.push({ '@context': 'https://schema.org', '@type': 'HowTo', name: `如何使用${p.h1}`, inLanguage: 'zh-TW',
    step: p.steps.map((s, i) => ({ '@type': 'HowToStep', position: i + 1, text: s })) });

  return `<!doctype html>
<html lang="zh-Hant-TW">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; worker-src 'self' blob:; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; connect-src 'self' blob: data:; font-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'none'">
<meta name="referrer" content="no-referrer">
<title>${esc(p.title)}</title>
<meta name="description" content="${esc(p.desc)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website">
<meta property="og:locale" content="zh_TW">
<meta property="og:site_name" content="${SITE}">
<meta property="og:title" content="${esc(p.title)}">
<meta property="og:description" content="${esc(p.desc)}">
<meta property="og:url" content="${url}">
<meta name="theme-color" content="#2563eb">
<link rel="icon" href="${root}favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="${root}assets/style.css">
${p.js ? `<link rel="modulepreload" href="${root}assets/common.js">\n` : ''}<script type="application/ld+json">${JSON.stringify(ld)}</script>
</head>
<body>
<a class="skip" href="#main">跳到主要內容</a>
<header class="site"><div class="wrap">
  <a class="logo" href="${root}">${ICON}<span>${SITE}</span></a>
  <nav class="tools" aria-label="工具">${tools.map((t) => `<a href="${root}${t.slug}"${t.slug === p.slug ? ' aria-current="page"' : ''}>${t.nav}</a>`).join('')}</nav>
</div></header>
<main id="main" class="wrap">
  <section class="hero">
    <h1>${p.h1}</h1>
    <p class="lead">${p.lead}</p>
    <div class="badge">${PRIV}</div>
  </section>
  ${p.body()}
  <aside class="ad-slot" data-ad-slot="main-banner" aria-label="廣告版位">廣告版位（預留）</aside>
  <section class="card prose">
    ${p.steps ? `<h2>使用方式</h2><ol class="steps">${p.steps.map((s) => `<li>${s}</li>`).join('')}</ol>` : ''}
    ${p.prose || ''}
    <h2>常見問題</h2>
    ${p.faq.map(([q, a]) => `<h3>${q}</h3><p>${a}</p>`).join('\n    ')}
  </section>
</main>
<footer class="site"><div class="wrap cols">
  <div style="max-width:520px">
    <strong>${SITE}</strong>
    <p id="privacy"><strong>隱私聲明：</strong>檔案不會上傳。本站所有 PDF 與圖片處理都在您的瀏覽器中完成，檔案不會傳送到任何伺服器；本站不使用 Cookie、不做追蹤分析、不載入第三方腳本。</p>
    <p><a href="#" data-remove-ads>移除廣告（即將推出）</a> · <a href="${root}THIRD_PARTY_LICENSES.txt">第三方授權</a> · <a href="https://github.com/cvc016/pdf-local-tool" rel="noopener">原始碼</a></p>
  </div>
  <div><strong>工具</strong><ul>${tools.map((t) => `<li><a href="${root}${t.slug}">${t.nav}</a></li>`).join('')}</ul></div>
</div></footer>
<script type="module" src="${root}assets/${p.js || 'common.js'}"></script>
</body>
</html>
`;
}

for (const p of pages) {
  const f = join(ROOT, p.slug, 'index.html');
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f, render(p));
}
writeFileSync(join(ROOT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map((p) => `  <url><loc>${BASE}${p.slug}</loc><lastmod>${LASTMOD}</lastmod><changefreq>monthly</changefreq><priority>${p.slug ? '0.9' : '1.0'}</priority></url>`).join('\n')}
</urlset>
`);
writeFileSync(join(ROOT, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${BASE}sitemap.xml\n`);
writeFileSync(join(ROOT, 'favicon.svg'), ICON.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '));
console.log('built', pages.length, 'pages');
