// Generates the static HTML pages, sitemap.xml and robots.txt.
// Usage: node scripts/build.mjs
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BRAND, pages as toolPages, home, why as WHY, how as HOW } from './content.mjs';
import { posts, BLOG_DATE } from './blog.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://waitingstudio.com/';
const LASTMOD = new Date().toISOString().slice(0, 10);
const REPO = 'https://github.com/cvc016/pdf-local-tool';
const CONTACT = 'abbottabbott399@gmail.com';
// ---- Google AdSense (OFF while empty: output has no ads and no third-party requests) ----
// Set to your publisher id, e.g. 'ca-pub-1234567890123456' (or env ADSENSE_CLIENT=...).
const ADSENSE_CLIENT = (process.env.ADSENSE_CLIENT ?? '').trim();
const ADSENSE_SLOT = (process.env.ADSENSE_SLOT ?? '').trim(); // optional display ad unit id (digits)
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
const NAV = { merge: '合併', split: '分割', delete: '刪除頁面', rotate: '旋轉', reorder: '排序', img: 'JPG 轉 PDF', heic: 'HEIC 轉 PDF' };
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
  <nav class="tools" aria-label="工具">${toolPages.map((t) => `<a href="${root}${t.slug}/"${t.slug === slug ? ' aria-current="page"' : ''}>${NAV[t.tool]}</a>`).join('')}</nav>
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
    <p><a href="${root}blog/">教學文章</a> · <a href="${root}privacy/">隱私權政策</a> · <a href="${root}about/">關於我們</a> · <a href="${root}contact/">聯絡我們</a> · <a href="${root}terms/">使用條款</a> · <a href="${root}remove-ads/">移除廣告</a> · <a href="${root}THIRD_PARTY_LICENSES.txt">第三方授權</a> · <a href="${REPO}" rel="noopener">原始碼</a></p>
  </div>
  <div><strong>PDF 工具</strong><ul>${toolPages.map((t) => `<li><a href="${root}${t.slug}/">${t.nav}</a></li>`).join('')}</ul></div>
</div></footer>
<script type="module" src="${root}assets/${js || 'common.js'}"></script>
</body>
</html>
`;
}

// Ad slot: fixed banner inside the article, far from tool/download buttons; never on empty/utility pages.
const AD = ADS
  ? `<aside class="ad-slot ad-live" data-ad-slot="article-banner" aria-label="廣告"><ins class="adsbygoogle" style="display:block;width:100%;height:90px" data-ad-client="${ADSENSE_CLIENT}"${ADSENSE_SLOT ? ` data-ad-slot="${ADSENSE_SLOT}"` : ''} data-full-width-responsive="false"></ins></aside>`
  : `<aside class="ad-slot" data-ad-slot="article-banner" aria-label="廣告">廣告</aside>`;
const faqHtml = (faq) => `<h2>常見問題</h2>\n${faq.map(([q, a]) => `<h3>${q}</h3><p>${a}</p>`).join('\n')}`;
const faqLd = (faq) => ({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: strip(a) } })) });
const crumbs = (name, slug) => ({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
  { '@type': 'ListItem', position: 1, name: BRAND, item: BASE }, { '@type': 'ListItem', position: 2, name, item: `${BASE}${slug}/` }] });

const out = []; // [path, html]

for (const p of toolPages) {
  const t = TOOLS[p.tool];
  const main = `${t.html()}
  <article class="card prose">
    ${p.intro}
    <h2>${p.kw}怎麼做？${p.steps.length} 個步驟完成</h2>
    <ol class="steps">${p.steps.map((s) => `<li>${s}</li>`).join('')}</ol>
    ${WHY}
  </article>
  ${AD}
  <article class="card prose">
    ${p.mobile}
    ${p.extra}
    ${HOW(p.howWhat)}
    ${faqHtml(p.faq)}
    <h2>其他 PDF 工具</h2>
    <ul class="links">${toolPages.filter((x) => x !== p).map((x) => `<li><a href="../${x.slug}/">${x.nav}</a>：${x.short}</li>`).join('')}</ul>
  </article>`;
  const url = `${BASE}${p.slug}/`;
  const ld = [
    { '@context': 'https://schema.org', '@type': 'WebApplication', name: `${p.nav}｜${BRAND}`, url, description: p.desc,
      applicationCategory: 'UtilitiesApplication', operatingSystem: 'Any（網頁瀏覽器）', browserRequirements: 'Requires JavaScript',
      inLanguage: 'zh-TW', isAccessibleForFree: true, offers: { '@type': 'Offer', price: '0', priceCurrency: 'TWD' } },
    { '@context': 'https://schema.org', '@type': 'HowTo', name: `${p.kw}怎麼做`, inLanguage: 'zh-TW', step: p.steps.map((s, i) => ({ '@type': 'HowToStep', position: i + 1, text: strip(s) })) },
    faqLd(p.faq), crumbs(p.nav, p.slug),
  ];
  out.push([`${p.slug}/index.html`, layout({ slug: p.slug, title: `${p.kw}｜免費、不上傳、本機處理｜${BRAND}`, desc: p.desc, h1: p.h1, lead: p.lead, main, ld, js: t.js, suffix: t.suffix })]);
}

// Home
const homeFaq = [
  ['真的不會上傳我的檔案嗎？', '是的。本站是純前端的靜態網頁，PDF 的讀取與產生都在您的瀏覽器中完成，沒有任何接收檔案的伺服器。您可以用瀏覽器的開發者工具檢查，處理檔案時不會產生任何上傳請求。'],
  ['需要註冊或付費嗎？', '不需要。所有功能免費、免註冊、無次數限制，也沒有彈出式廣告。'],
  ['手機可以用嗎？', 'iPhone、iPad、Android 手機與平板都可以用，建議使用 Safari 或 Chrome。'],
  ['支援有密碼的 PDF 嗎？', '目前不支援加密或設有開啟密碼的 PDF，請先用原本的軟體移除密碼後再使用。'],
];
out.push(['index.html', layout({ slug: '', title: home.title, desc: home.desc, h1: home.h1, lead: home.lead,
  main: `<section class="tiles" aria-label="工具列表">${toolPages.map((t) => `<a class="tile" href="${t.slug}/"><div class="ic">${t.ic}</div><h2>${t.nav}</h2><p>${t.short}</p></a>`).join('')}</section>
  <article class="card prose">${WHY.replace(/\.\.\//g, './')}</article>
  ${AD}
  <article class="card prose">${HOW('合併、分割、旋轉等處理').replace(/\.\.\//g, './')}${faqHtml(homeFaq)}</article>`,
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
<p>若您購買並啟用「移除廣告」，授權碼與啟用狀態會儲存在您瀏覽器的 localStorage 中，只存在您的裝置上。您可以在 <a href="../remove-ads/">移除廣告</a> 頁面清除，或清除瀏覽器的網站資料。</p>
<h2>4. 廣告與第三方 Cookie（Google AdSense）</h2>
<p>${ADS ? '為了維持免費營運，本站使用 Google AdSense 在頁面中顯示一個固定的橫幅廣告版位' : '本站目前沒有任何廣告。我們計畫使用 Google AdSense 在頁面中顯示一個固定的橫幅廣告版位'}，不使用彈出式視窗、插頁式或覆蓋畫面的廣告，也不會放在工具與下載按鈕旁邊。${ADS ? '' : '啟用後適用以下說明：'}</p>
<ul>
<li>第三方廠商（包括 Google）會使用 Cookie，根據使用者先前造訪本站或其他網站的紀錄放送廣告。</li>
<li>Google 使用廣告 Cookie，讓 Google 及其合作夥伴能根據使用者造訪本站和網路上其他網站的情形，放送合適的廣告。Google 如何使用這些資料，請見 <a href="https://policies.google.com/technologies/partner-sites?hl=zh-TW" rel="noopener">Google 如何使用合作夥伴網站或應用程式的資訊</a>。</li>
<li>您可以前往 <a href="https://adssettings.google.com/" rel="noopener">Google 廣告設定</a> 停用個人化廣告，或前往 <a href="https://www.aboutads.info/choices/" rel="noopener">www.aboutads.info</a> 停用第三方廠商用於個人化廣告的 Cookie。</li>
<li>來自歐洲經濟區、英國與瑞士的訪客，會看到 Google 認證同意管理平台（CMP）提供的 Cookie 同意訊息，可選擇是否同意，並隨時從該訊息重新設定。</li>
<li>您也可以在瀏覽器設定中封鎖或刪除 Cookie，或 <a href="../remove-ads/">購買移除廣告</a>，啟用後本站不會在您的瀏覽器顯示廣告版位。</li>
</ul>
<p>無論是否顯示廣告，您的 PDF 與圖片檔案都不會傳送給廣告商或任何第三方。</p>
<h2>5. 付款</h2>
<p>「移除廣告」的付款將由第三方平台（預計為 Gumroad）處理，本站不會接觸您的信用卡資料。驗證授權碼時，只會把授權碼送到該平台確認是否有效。</p>
<h2>6. 兒童隱私</h2>
<p>本站不會刻意收集任何人的個人資料，包括兒童。</p>
<h2>7. 政策變更與聯絡方式</h2>
<p>本政策如有修改，會在本頁更新並註明日期。若有任何問題，請來信 <a href="mailto:${CONTACT}">${CONTACT}</a> 或參考 <a href="../contact/">聯絡我們</a>。</p>
</article>` })]);

// About / contact
out.push(['about/index.html', layout({ slug: 'about', title: `關於我們｜${BRAND}`, desc: `關於 ${BRAND}：一個免費、免註冊、無次數限制、檔案不上傳的 PDF 工具網站。聯絡方式與回報問題管道。`, h1: `關於 ${BRAND}`, lead: '', badge: false,
  ld: [crumbs('關於我們', 'about')],
  main: `<article class="card prose">
<h2>我們在做什麼</h2>
<p>${BRAND} 是一組在瀏覽器中執行的 PDF 工具：PDF 合併、分割、刪除頁面、旋轉、頁面排序，以及 JPG／HEIC 轉 PDF。我們相信處理合約、證件、報表這類文件時，不應該被迫把檔案上傳到陌生的伺服器，所以所有功能都在您的裝置上完成。</p>
<h2>我們的原則</h2>
<ul>
<li><strong>檔案不上傳：</strong>網站是純靜態網頁，沒有接收檔案的伺服器。</li>
<li><strong>免費、無次數限制、免註冊：</strong>打開就能用，不需要帳號。</li>
<li><strong>無彈出視窗：</strong>未來若加入廣告，只會是一個固定的版位，不會跳出視窗，也不會出現在下載按鈕旁邊；不想看廣告可以 <a href="../remove-ads/">付費移除</a>。</li>
<li><strong>開放原始碼與授權透明：</strong>只使用 MIT、Apache-2.0 等寬鬆授權的開源函式庫，清單見 <a href="../THIRD_PARTY_LICENSES.txt">第三方授權</a>。</li>
</ul>
<h2>聯絡我們</h2>
<p>發現錯誤、有功能建議，或任何問題，歡迎來信 <a href="mailto:${CONTACT}">${CONTACT}</a>，或到 <a href="${REPO}/issues" rel="noopener">GitHub Issues</a> 留言。更多資訊請見 <a href="../contact/">聯絡我們</a>。</p>
<h2>關於 Waiting Studio</h2>
<p>Waiting Studio（waitingstudio.com）是一個位於台灣的個人工作室，專注製作簡單、尊重隱私的實用網頁工具。本站的工具與教學文章皆為自行撰寫，內容會隨著使用者回饋持續更新。</p>
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
<h2>其他管道</h2>
<p>熟悉 GitHub 的使用者也可以到 <a href="${REPO}/issues" rel="noopener">GitHub Issues</a> 公開回報（請勿在公開留言中放個人資料）。</p>
</article>` })]);

// Terms of use
out.push(['terms/index.html', layout({ slug: 'terms', title: `使用條款｜${BRAND}`, desc: `${BRAND} 使用條款：免費提供的瀏覽器端 PDF 工具，使用方式、免責聲明、廣告與付費移除廣告說明。`, h1: '使用條款', lead: `最後更新：${LASTMOD}`, badge: false,
  ld: [crumbs('使用條款', 'terms')],
  main: `<article class="card prose">
<h2>1. 服務內容</h2>
<p>${BRAND}（${BASE}，以下稱「本站」）由 Waiting Studio 提供，是免費的線上 PDF 工具，包括合併、分割、刪除頁面、旋轉、排序與圖片轉 PDF。所有檔案處理都在您的瀏覽器中完成，不會上傳到本站。使用本站即表示您同意本條款。</p>
<h2>2. 您的責任</h2>
<ul>
<li>請只處理您有權使用的檔案，並遵守著作權及相關法令。</li>
<li>請勿利用本站從事違法行為，或試圖干擾本站正常運作。</li>
<li>處理重要文件前請保留原始檔備份，並在使用前確認輸出結果正確。</li>
</ul>
<h2>3. 免責聲明</h2>
<p>本站依「現況」提供，不保證完全沒有錯誤或永遠可用。對於因使用或無法使用本站所造成的資料遺失或其他損害，在法律允許的範圍內，本站不負賠償責任。</p>
<h2>4. 廣告與移除廣告</h2>
<p>本站可能透過 Google AdSense 顯示固定橫幅廣告，不使用彈出式廣告。您可以一次性購買「移除廣告」授權，授權只儲存在您的瀏覽器中；清除網站資料或更換瀏覽器後需重新輸入授權碼。付款由第三方平台處理，退款依該平台規定。廣告與 Cookie 的說明請見 <a href="../privacy/">隱私權政策</a>。</p>
<h2>5. 智慧財產權</h2>
<p>本站網頁內容與教學文章著作權屬 Waiting Studio 所有；程式碼依 MIT 授權公開於 <a href="${REPO}" rel="noopener">GitHub</a>，使用的第三方函式庫依其各自授權（見 <a href="../THIRD_PARTY_LICENSES.txt">第三方授權</a>）。</p>
<h2>6. 條款變更與準據法</h2>
<p>本條款如有修改，會在本頁更新日期。本條款以中華民國（台灣）法律為準據法。問題請來信 <a href="mailto:${CONTACT}">${CONTACT}</a>。</p>
</article>` })]);

// Remove ads (license key unlock)
out.push(['remove-ads/index.html', layout({ slug: 'remove-ads', title: `移除廣告｜${BRAND}`, desc: `購買 ${BRAND} 移除廣告授權後，貼上授權碼即可在此裝置隱藏廣告版位。`, h1: '移除廣告', lead: '一次購買，貼上授權碼即可在此瀏覽器隱藏廣告版位。', badge: false, noindex: true, js: 'unlock.js',
  main: `<div class="card">
<p><strong>付費方案即將推出。</strong>目前本站沒有任何廣告。開放後，您可以在 Gumroad 購買，並把收到的授權碼貼在下方。</p>
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
out.push(['blog/index.html', layout({ slug: 'blog', title: `PDF 教學文章｜${BRAND}`, desc: `${BRAND} 教學文章：手機合併 PDF、iPhone 照片轉 PDF、刪除 PDF 頁面、PDF 旋轉後儲存等操作說明，全部在瀏覽器本機處理、檔案不上傳。`, h1: 'PDF 教學文章', lead: '一步一步說明常見的 PDF 操作，手機與電腦都適用。', badge: false,
  ld: [{ '@context': 'https://schema.org', '@type': 'Blog', name: `${BRAND} 教學文章`, url: `${BASE}blog/`, inLanguage: 'zh-TW', publisher: org,
    blogPost: posts.map((p) => ({ '@type': 'BlogPosting', headline: p.title, url: `${BASE}blog/${p.slug}/`, datePublished: p.date || BLOG_DATE })) }, blogCrumbs([])],
  main: `<section class="tiles" aria-label="文章列表">${posts.map((p) => `<a class="tile" href="${p.slug}/"><h2>${p.title}</h2><p>${p.desc}</p></a>`).join('')}</section>` })]);

// Old URLs from the first release -> redirect stubs (not in sitemap).
const REDIRECTS = { 'pdf-merge': 'merge-pdf', 'pdf-split': 'split-pdf', 'pdf-organize': 'reorder-pdf-pages', 'image-to-pdf': 'jpg-to-pdf' };
for (const [from, to] of Object.entries(REDIRECTS)) {
  out.push([`${from}/index.html`, `<!doctype html><html lang="zh-Hant-TW"><head><meta charset="utf-8"><meta name="robots" content="noindex"><link rel="canonical" href="${BASE}${to}/"><meta http-equiv="refresh" content="0; url=../${to}/"><title>已搬移</title></head><body><p>此頁已搬移至 <a href="../${to}/">${BASE}${to}/</a></p></body></html>\n`]);
}

for (const [f, html] of out) { const p = join(ROOT, f); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, html); }

const indexed = ['', ...toolPages.map((p) => p.slug + '/'), 'blog/', ...posts.map((p) => `blog/${p.slug}/`), 'privacy/', 'about/', 'contact/', 'terms/'];
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
