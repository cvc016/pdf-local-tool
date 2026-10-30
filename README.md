# Waiting Studio 本機 PDF（pdf-local-tool）

> 品牌名定義在 `scripts/content.mjs` 的 `BRAND`（Waiting Studio 本機 PDF，網域 waitingstudio.com）。

免費、無次數限制、**檔案不上傳**的 PDF 工具（繁體中文／台灣）。所有處理都在瀏覽器內完成，純靜態網站，可部署於 GitHub Pages。

線上版：https://cvc016.github.io/pdf-local-tool/

## 功能（v1）
- PDF 合併（拖曳排序）`/merge-pdf/`
- PDF 分割（頁碼範圍／每頁一檔／擷取頁面，ZIP 下載）`/split-pdf/`
- 刪除頁面（含自動標記空白頁）`/delete-pdf-pages/`
- PDF 旋轉 `/rotate-pdf/`、頁面排序 `/reorder-pdf-pages/`
- JPG／圖片／照片轉 PDF `/jpg-to-pdf/`；HEIC 轉 PDF `/heic-to-pdf/`（HEIC 僅在瀏覽器原生支援時，如 Safari）
- 教學文章 `/blog/`（內容在 `scripts/blog.mjs`；Article／HowTo／FAQPage／BreadcrumbList 結構化資料，無廣告版位）
- 隱私權政策 `/privacy/`、關於與聯絡 `/about/`、移除廣告授權 `/remove-ads/`（noindex）
- 舊網址 `/pdf-merge/` 等為轉址頁（noindex）

不含壓縮功能（MuPDF.js、Ghostscript 為 AGPL，刻意不使用）。

## 開發
```sh
npm install          # 只用於測試（puppeteer-core、pdf-lib、fflate）
npm run build        # 由 scripts/build.mjs 產生各頁 HTML、sitemap.xml、robots.txt
npm test             # 以 headless Chrome 實際操作 UI，驗證輸出 PDF 頁數與順序
npm run test:live    # 對已部署網站執行同一測試
```
第三方函式庫皆放在 `vendor/`（不使用 CDN），授權見 `THIRD_PARTY_LICENSES.txt`。

## 變現預留
- 廣告：每個內容頁只有一個 `<aside class="ad-slot" data-ad-slot="article-banner">` 固定橫幅，位於說明文章中段，遠離工具與下載按鈕；工具卡片內、完成畫面、隱私／關於／移除廣告頁都沒有廣告（無彈窗；目前不載入任何廣告網路）。
- 移除廣告：`/remove-ads/` 貼上 Gumroad 授權碼 → `assets/unlock.js` 檢查格式並呼叫 `verifyWithGumroad()`（目前是 stub，見 TODO）→ 成功後寫入 localStorage（`adFreeLicense`），`html.ad-free` 隱藏廣告。
- 若日後加入廣告網路，需同步調整 CSP 與隱私聲明。

## Google AdSense（預設關閉）

`scripts/build.mjs` 頂端的 `ADSENSE_CLIENT`（或環境變數 `ADSENSE_CLIENT`）為空字串時，輸出不含任何廣告程式與第三方請求，也不產生 `ads.txt`。
設定為 `ca-pub-XXXXXXXXXXXXXXXX`（並可設定 `ADSENSE_SLOT` 為橫幅廣告單元 ID）後 `npm run build`，會：

- 在 `<head>` 加入 `google-adsense-account` meta 與 adsbygoogle.js（async，不阻塞），
- 把固定橫幅版位（`.ad-slot`，保留 90px 高度避免版面位移）換成 `<ins class="adsbygoogle">`，
- 放寬 CSP 允許 Google 廣告網域，產生 `ads.txt`，並更新頁尾／隱私權政策文字。
- 已購買「移除廣告」的使用者：`common.js` 偵測到授權後隱藏版位且不呼叫 `adsbygoogle.push`。

只使用固定橫幅，不使用彈出、插頁、錨定或覆蓋式廣告（在 AdSense「自動廣告」中請保持關閉）。

EEA/英國/瑞士同意聲明：不自行撰寫，請在 AdSense →「隱私權與訊息」建立 Google 認證 CMP 的 GDPR 訊息（免費），Google 會自動透過同一支 adsbygoogle.js 顯示。CSP 已允許 `fundingchoicesmessages.google.com`。
