# PDF 本機工具（pdf-local-tool）

免費、無次數限制、**檔案不上傳**的 PDF 工具（繁體中文／台灣）。所有處理都在瀏覽器內完成，純靜態網站，可部署於 GitHub Pages。

線上版：https://cvc016.github.io/pdf-local-tool/

## 功能（v1）
- PDF 合併（拖曳排序）`/pdf-merge/`
- PDF 分割（頁碼範圍／每頁一檔／擷取頁面，ZIP 下載）`/pdf-split/`
- PDF 轉向／排序／刪除頁面（縮圖）`/pdf-organize/`
- 圖片轉 PDF（JPG/PNG/WebP；HEIC 僅在瀏覽器原生支援時，如 Safari）`/image-to-pdf/`

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
- 廣告：`<aside class="ad-slot" data-ad-slot="main-banner">` 固定版位（無彈窗；目前不載入任何廣告網路）。
- 移除廣告：`isAdFree()`（`assets/common.js`）與 `html.ad-free` CSS，付費流程尚未實作。
- 若日後加入廣告網路，需同步調整 CSP 與隱私聲明。
