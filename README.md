# 本機PDF（pdf-local-tool）

> 品牌名「本機PDF」為暫定名稱，修改 `scripts/content.mjs` 的 `BRAND` 後執行 `npm run build` 即可全站替換。

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
