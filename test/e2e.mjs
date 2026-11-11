// End-to-end test in headless Chrome: drives the real UI and validates output PDFs.
// Usage: npm test                (serves the repo locally)
//        BASE_URL=https://.../  npm test   (tests a deployed site)
import { createServer } from 'node:http';
import { readFile, mkdir, rm, readdir, writeFile } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { PDFDocument, PDFName, degrees } from 'pdf-lib';
import { unzipSync } from 'fflate';
import { posts } from '../scripts/blog.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'test', 'out');
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
let BASE = process.env.BASE_URL;
let server;

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8', '.json': 'application/json' };
if (!BASE) {
  server = createServer(async (req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (!p.startsWith('/pdf-local-tool/')) { res.writeHead(404).end(); return; }
    p = p.slice('/pdf-local-tool'.length); if (p.endsWith('/')) p += 'index.html';
    try { const b = await readFile(join(ROOT, p)); res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }).end(b); }
    catch { res.writeHead(404).end('not found'); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  BASE = `http://127.0.0.1:${server.address().port}/pdf-local-tool/`;
}
const host = new URL(BASE).host;

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) failures++; };

// ---- fixtures: page widths encode identity (a1=201, a2=202, a3=203, b1=301, b2=302)
await rm(OUT, { recursive: true, force: true }); await mkdir(OUT, { recursive: true });
async function mkPdf(name, widths) {
  const d = await PDFDocument.create();
  widths.forEach((w) => d.addPage([w, 400]));
  const f = join(OUT, name); await writeFile(f, await d.save()); return f;
}
const A = await mkPdf('a.pdf', [201, 202, 203]);
const B = await mkPdf('b.pdf', [301, 302]);
// c.pdf: content, blank, content (widths 401, 402, 403)
const C = await (async () => {
  const d = await PDFDocument.create();
  [401, 402, 403].forEach((w, i) => { const p = d.addPage([w, 400]); if (i !== 1) p.drawRectangle({ x: 40, y: 40, width: 200, height: 300 }); });
  const f = join(OUT, 'c.pdf'); await writeFile(f, await d.save()); return f;
})();

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 900 });
const external = [], errors = [];
const ADS_ON = /google-adsense-account/.test(await (await fetch(new URL('./', BASE))).text());
const GOOGLE_AD = /(^|\.)(googlesyndication\.com|doubleclick\.net|google\.com|googleadservices\.com|gstatic\.com|googletagservices\.com|adtrafficquality\.google|google\.com\.tw)$/;
const isGoogleAd = (u) => ADS_ON && GOOGLE_AD.test(new URL(u).hostname);
page.on('request', (r) => { const u = new URL(r.url()); if (!['blob:', 'data:'].includes(u.protocol) && u.host !== host && !isGoogleAd(r.url())) external.push(r.url()); });
page.on('pageerror', (e) => errors.push(String(e)));
page.on('response', (r) => { if (r.status() >= 400 && !/favicon\.ico$/.test(r.url())) { if (!isGoogleAd(r.url())) errors.push(`HTTP ${r.status()} ${r.url()}`); }; });
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
const cdp = await page.createCDPSession();

let dl = 0; const dlog = [];
cdp.on('Browser.downloadWillBegin', (e) => dlog.push('begin ' + e.suggestedFilename)); cdp.on('Browser.downloadProgress', (e) => { if (e.state !== 'inProgress') dlog.push(e.state); });
page.on('console', (m) => dlog.push('console ' + m.text()));
async function download(trigger) {
  const dir = join(OUT, 'dl' + ++dl); await mkdir(dir, { recursive: true });
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dir, eventsEnabled: true });
  await trigger();
  for (let i = 0; i < 100; i++) {
    const fs = (await readdir(dir)).filter((f) => !f.endsWith('.crdownload'));
    if (fs.length) { await new Promise((r) => setTimeout(r, 200)); return { name: fs[0], bytes: await readFile(join(dir, fs[0])) }; }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('download timed out: ' + dlog.slice(-6).join(' ; ') + ' :: ' + await page.evaluate(() => document.querySelector('#status')?.textContent + ' | ' + document.querySelector('#results')?.textContent));
}
const widths = (d) => d.getPages().map((p) => Math.round(p.getWidth()));
async function open(slug) {
  const r = await page.goto(BASE + slug, { waitUntil: 'networkidle0' });
  ok(r.status() === 200, `GET ${slug || '/'} → ${r.status()}`);
}

try {
  // Landing + SEO basics
  await open('');
  ok((await page.$$('h1')).length === 1 && (await page.title()).includes('PDF'), 'landing: one h1 + title');
  for (const s of ['merge-pdf/', 'split-pdf/', 'delete-pdf-pages/', 'rotate-pdf/', 'reorder-pdf-pages/', 'jpg-to-pdf/', 'heic-to-pdf/', 'compress-pdf/', 'pdf-to-jpg/', 'compress-image/', 'image-converter/', 'resize-image/', 'watermark-image/', 'add-page-numbers-to-pdf/', 'qr-code-generator/', 'word-counter/', 'password-generator/', 'blog/strong-password-guide/', 'blog/qr-code-never-expire/', 'blog/wifi-qr-code-for-shop/', 'privacy/', 'about/', 'contact/', 'terms/', 'remove-ads/', 'sitemap.xml', 'robots.txt', 'THIRD_PARTY_LICENSES.txt']) {
    const r = await page.goto(BASE + s); ok(r.status() === 200, `GET ${s} → ${r.status()}`);
  }

  // ---- BLOG: index + each post (structure, JSON-LD, tool link, no ad slot, length, wording)
  await open('blog/');
  ok((await page.$$('h1')).length === 1 && (await page.$$('.ad-slot')).length === 0, 'blog index: one h1, no ad slot');
  for (const b of posts) {
    await open(`blog/${b.slug}/`);
    const info = await page.evaluate((tool) => {
      const art = document.querySelector('article');
      const text = art ? art.innerText : '';
      const ld = Array.from(document.querySelectorAll('script[type="application/ld+json"]')).flatMap((s) => JSON.parse(s.textContent));
      return { h1: document.querySelectorAll('h1').length, ads: document.querySelectorAll('.ad-slot').length,
        types: ld.map((x) => x['@type']), cjk: (text.match(/[\u4e00-\u9fff]/g) || []).length,
        toolLink: !!document.querySelector(`article a[href="../../${tool}/"]`), html: document.documentElement.outerHTML,
        brokenLinks: Array.from(document.querySelectorAll('a[href^="../"]')).map((a) => a.href) };
    }, b.tool);
    ok(info.h1 === 1 && info.ads === 0, `blog ${b.slug}: one h1, no ad slot`);
    ok(['Article', 'HowTo', 'FAQPage', 'BreadcrumbList'].every((t) => info.types.includes(t)), `blog ${b.slug}: JSON-LD ${info.types}`);
    ok(info.toolLink, `blog ${b.slug}: links to tool ${b.tool}`);
    // 800: substance over padding (AdSense thin-content fix 2026-11)
    ok(info.cjk >= 800, `blog ${b.slug}: ${info.cjk} 字 (>= 800)`);
    ok(!/文檔|在線|最快|已服務/.test(info.html), `blog ${b.slug}: Taiwan wording, no unverified claims`);
    for (const u of [...new Set(info.brokenLinks)].filter((u) => !/\.txt$/.test(u))) {
      const st = await page.evaluate(async (x) => (await fetch(x)).status, u);
      if (st !== 200) ok(false, `blog ${b.slug}: link ${u} → ${st}`);
    }
  }
  const sm = await (await page.goto(BASE + 'sitemap.xml')).text();
  ok(posts.every((b) => sm.includes(`blog/${b.slug}/`)) && sm.includes('/blog/<'), 'sitemap: blog index + posts listed');

  // ---- MERGE: add a, b; move b to top with ▲ ... then download
  await open('merge-pdf/');
  ok(await page.$eval('.tool', (t) => !t.querySelector('.ad-slot')) && (await page.$$('.ad-slot')).length <= 1, 'ads: at most one banner slot (none until an ad unit exists), not inside the tool card');
  await (await page.$('#file')).uploadFile(A, B);
  await page.waitForFunction(() => document.querySelectorAll('#list li .thumb canvas').length === 2);
  ok(await page.$eval('#summary', (e) => e.textContent.includes('共 5 頁')), 'merge: shows 2 files / 5 pages');
  await page.click('#list li:nth-child(2) [data-act=up]');
  let r = await download(() => page.click('#go'));
  let d = await PDFDocument.load(r.bytes);
  ok(d.getPageCount() === 5, `merge: output has 5 pages (${d.getPageCount()})`);
  ok(widths(d).join() === '301,302,201,202,203', `merge: order after ▲ is b,a (${widths(d)})`);
  // mouse drag reorder: drag first item below second
  const h = await page.$$('#list li');
  const b1 = await h[0].boundingBox(), b2 = await h[1].boundingBox();
  await page.mouse.move(b1.x + b1.width / 2, b1.y + b1.height / 2); await page.mouse.down();
  await page.mouse.move(b2.x + b2.width / 2, b2.y + b2.height * 0.8, { steps: 10 }); await page.mouse.up();
  r = await download(() => page.click('#go'));
  d = await PDFDocument.load(r.bytes);
  ok(widths(d).join() === '201,202,203,301,302', `merge: drag reorder works (${widths(d)})`);

  // ---- SPLIT
  await open('split-pdf/');
  await (await page.$('#file')).uploadFile(A);
  await page.waitForSelector('#grid .pg canvas');
  await page.type('#ranges', '1-2, 3');
  r = await download(() => page.click('#go'));
  let z = unzipSync(new Uint8Array(r.bytes));
  let names = Object.keys(z);
  ok(r.name.endsWith('.zip') && names.length === 2, `split ranges: zip with 2 PDFs (${names})`);
  const counts = await Promise.all(names.map(async (n) => widths(await PDFDocument.load(z[n])).join('|')));
  ok(counts.join(' ; ') === '201|202 ; 203', `split ranges: contents ${counts.join(' ; ')}`);
  await page.click('input[name=mode][value=each]');
  r = await download(() => page.click('#go'));
  z = unzipSync(new Uint8Array(r.bytes)); names = Object.keys(z);
  const pcs = await Promise.all(names.map(async (n) => (await PDFDocument.load(z[n])).getPageCount()));
  ok(names.length === 3 && pcs.every((c) => c === 1), `split each page: 3 single-page PDFs (${names.length})`);
  await page.click('input[name=mode][value=ranges]');
  await page.$eval('#ranges', (e) => (e.value = '3, 1'));
  await page.click('#single');
  r = await download(() => page.click('#go'));
  d = await PDFDocument.load(r.bytes);
  ok(r.name.endsWith('.pdf') && widths(d).join() === '203,201', `split extract "3, 1" single file → ${widths(d)}`);

  // ---- ORGANIZE: delete p2, rotate p3 right, drag p3 to front
  await open('reorder-pdf-pages/');
  await (await page.$('#file')).uploadFile(A);
  await page.waitForFunction(() => document.querySelectorAll('#grid .pg canvas').length === 3);
  await page.click('#grid .pg:nth-child(2) [data-act=del]');
  await page.click('#grid .pg:nth-child(3) [data-act=r]');
  const g = await page.$$('#grid .pg');
  const g3 = await (await g[2].$('.box')).boundingBox(), g1 = await (await g[0].$('.box')).boundingBox();
  await page.mouse.move(g3.x + g3.width / 2, g3.y + g3.height / 2); await page.mouse.down();
  await page.mouse.move(g1.x + 5, g1.y + g1.height / 2, { steps: 12 }); await page.mouse.up();
  r = await download(() => page.click('#go'));
  d = await PDFDocument.load(r.bytes);
  ok(d.getPageCount() === 2, `organize: delete → 2 pages (${d.getPageCount()})`);
  ok(widths(d).join() === '203,201', `organize: drag reorder → ${widths(d)}`);
  ok(d.getPage(0).getRotation().angle === 90 && d.getPage(1).getRotation().angle === 0, `organize: rotation [${d.getPages().map((p) => p.getRotation().angle)}]`);

  // ---- DELETE: auto-detect blank page
  await open('delete-pdf-pages/');
  await (await page.$('#file')).uploadFile(C);
  await page.waitForFunction(() => document.querySelectorAll('#grid .pg canvas').length === 3);
  await page.click('#blank');
  await page.waitForFunction(() => document.querySelectorAll('#grid .pg.del').length > 0);
  r = await download(() => page.click('#go'));
  d = await PDFDocument.load(r.bytes);
  ok(widths(d).join() === '401,403', `delete: blank page removed → ${widths(d)}`);

  // ---- ROTATE: rotate all right
  await open('rotate-pdf/');
  await (await page.$('#file')).uploadFile(A);
  await page.waitForSelector('#grid .pg');
  await page.click('#rotAllR');
  r = await download(() => page.click('#go'));
  d = await PDFDocument.load(r.bytes);
  ok(d.getPageCount() === 3 && d.getPages().every((p) => p.getRotation().angle === 90), `rotate all: 3 pages at 90° (${d.getPages().map((p) => p.getRotation().angle)})`);

  // ---- IMAGE → PDF (fixtures rendered by Chrome itself)
  await page.setContent('<div style="width:300px;height:200px;background:linear-gradient(red,blue)"></div>');
  const png = join(OUT, 'img.png'), jpg = join(OUT, 'img.jpg');
  await page.screenshot({ path: png, clip: { x: 0, y: 0, width: 300, height: 200 } });
  await page.screenshot({ path: jpg, type: 'jpeg', clip: { x: 0, y: 0, width: 200, height: 300 } });
  await open('jpg-to-pdf/');
  await (await page.$('#file')).uploadFile(png, jpg);
  await page.waitForFunction(() => document.querySelectorAll('#list li .thumb img').length === 2 && !document.querySelector('#go').disabled);
  r = await download(() => page.click('#go'));
  d = await PDFDocument.load(r.bytes);
  ok(d.getPageCount() === 2, `image→pdf: 2 pages (${d.getPageCount()})`);
  const sz = d.getPages().map((p) => `${Math.round(p.getWidth())}x${Math.round(p.getHeight())}`);
  ok(sz.join() === '842x595,595x842', `image→pdf: A4 auto orientation (${sz})`);

  // ---- PDF COMPRESS: image-heavy PDF gets smaller, page sizes kept
  const E = await (async () => {
    await page.setContent('<canvas id=c width=600 height=400></canvas>');
    await page.evaluate(() => { const x = document.getElementById('c').getContext('2d'), d = x.createImageData(600, 400); for (let i = 0; i < d.data.length; i++) d.data[i] = i % 4 === 3 ? 255 : Math.random() * 255; x.putImageData(d, 0, 0); });
    const noise = join(OUT, 'noise.png'); await page.screenshot({ path: noise, clip: { x: 8, y: 8, width: 600, height: 400 } });
    const dd = await PDFDocument.create(); const im = await dd.embedPng(await readFile(noise));
    for (let i = 0; i < 3; i++) dd.addPage([100 + i, 67]).drawImage(im, { x: 0, y: 0, width: 100 + i, height: 67 });
    const f = join(OUT, 'e.pdf'); await writeFile(f, await dd.save()); return f;
  })();
  await open('compress-pdf/');
  await (await page.$('#file')).uploadFile(E);
  await page.waitForSelector('#work:not(.hidden)');
  await page.click('input[name=level][value=max]');
  r = await download(() => page.click('#go'));
  d = await PDFDocument.load(r.bytes);
  ok(d.getPageCount() === 3 && widths(d).join() === '100,101,102', `compress: 3 pages, sizes kept (${widths(d)})`);
  ok(r.bytes.length < (await readFile(E)).length && /_已壓縮\.pdf$/.test(r.name), `compress: smaller (${r.bytes.length} < ${(await readFile(E)).length}) ${r.name}`);
  // vector-only PDF: no auto download, warns
  await page.click('#reset');
  await (await page.$('#file')).uploadFile(A);
  await page.waitForSelector('#work:not(.hidden)');
  await page.click('#go');
  await page.waitForFunction(() => /原檔/.test(document.querySelector('#status').textContent) || /完成/.test(document.querySelector('#status').textContent));
  ok(await page.$eval('#results', (e) => e.children.length === 1), 'compress: result row shown for text PDF');

  // ---- PDF → JPG: single page → jpg, all pages → zip
  await open('pdf-to-jpg/');
  await (await page.$('#file')).uploadFile(A);
  await page.waitForSelector('#work:not(.hidden)');
  await page.type('#ranges', '2');
  r = await download(() => page.click('#go'));
  ok(/第2頁\.jpg$/.test(r.name) && r.bytes[0] === 0xff && r.bytes[1] === 0xd8, `pdf→jpg: single page JPG (${r.name})`);
  await page.$eval('#ranges', (e) => (e.value = ''));
  r = await download(() => page.click('#go'));
  ok(/\.zip$/.test(r.name) && r.bytes[0] === 0x50 && r.bytes[1] === 0x4b && (r.bytes.toString('latin1').match(/\.jpg/g) || []).length >= 3, `pdf→jpg: ZIP with 3 JPGs (${r.name})`);

  // ---- IMAGE COMPRESS: presets, format, max side, live sizes, zip
  const magic = (b) => b[0] === 0xff && b[1] === 0xd8 ? 'jpg' : b[0] === 0x89 && b[1] === 0x50 ? 'png' : b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP' ? 'webp' : b[0] === 0x50 && b[1] === 0x4b ? 'zip' : '?';
  const big = join(OUT, 'big.png'), alpha = join(OUT, 'alpha.png');
  await page.setViewport({ width: 1600, height: 1200 });
  await page.setContent('<canvas id=c width=1600 height=1200></canvas>');
  await page.evaluate(() => { const x = document.getElementById('c').getContext('2d'); for (let i = 0; i < 4000; i++) { x.fillStyle = `hsl(${i % 360},70%,${30 + i % 40}%)`; x.beginPath(); x.arc(Math.random() * 1600, Math.random() * 1200, 5 + Math.random() * 40, 0, 7); x.fill(); } });
  await page.screenshot({ path: big, clip: { x: 0, y: 0, width: 1600, height: 1200 } });
  await page.setViewport({ width: 1200, height: 900 });
  const b64 = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); x.fillStyle = 'rgba(0,0,0,0)'; x.fillRect(0, 0, 64, 64); x.fillStyle = 'red'; x.fillRect(16, 16, 32, 32); return c.toDataURL('image/png').split(',')[1]; });
  await writeFile(alpha, Buffer.from(b64, 'base64'));
  const bigSize = (await readFile(big)).length;
  await open('compress-image/');
  await (await page.$('#file')).uploadFile(big);
  await page.waitForFunction(() => /節省|增加/.test(document.querySelector('#list .res')?.textContent || ''));
  await page.click('input[name=level][value=strong]');
  ok(await page.$eval('#quality', (e) => e.value) === '55', 'image compress: 強烈 preset → quality 55');
  await page.select('#fmt', 'jpg'); await page.select('#maxw', '800');
  await page.waitForFunction(() => /JPG .*800×600/.test(document.querySelector('#list .res').textContent));
  r = await download(() => page.click('#go'));
  ok(/_壓縮\.jpg$/.test(r.name) && magic(r.bytes) === 'jpg' && r.bytes.length < bigSize / 5, `image compress: JPG magic, ${bigSize} → ${r.bytes.length} B (${r.name})`);
  await page.select('#fmt', 'keep');
  await page.waitForFunction(() => /PNG/.test(document.querySelector('#list .res').textContent) && /合計/.test(document.querySelector('#status').textContent) && !document.querySelector('#go').disabled);
  await new Promise((r) => setTimeout(r, 300));
  r = await download(() => page.click('#go'));
  ok(magic(r.bytes) === 'png' && r.bytes.length < bigSize, `image compress: keep format → PNG, smaller (${r.bytes.length})`);
  await (await page.$('#file2')).uploadFile(jpg, alpha);
  await page.select('#fmt', 'webp');
  await page.waitForFunction(() => [...document.querySelectorAll('#list .res')].filter((e) => /WEBP|保留原檔/.test(e.textContent)).length === 3);
  r = await download(() => page.click('#go'));
  let zz = unzipSync(new Uint8Array(r.bytes)), zn = Object.keys(zz);
  // Tiny 64×64 alpha.png is smaller than any WebP re-encode → original kept (never deliver a bigger file).
  ok(magic(r.bytes) === 'zip' && zn.length === 3 && zn.every((n) => n === 'alpha.png' ? magic(Buffer.from(zz[n])) === 'png' : n.endsWith('.webp') && magic(Buffer.from(zz[n])) === 'webp'), `image compress: ZIP of WebP + kept original (${zn})`);
  // Default 自動 at 原尺寸: PNG stays PNG (palette quantization + OxiPNG via WASM) and really shrinks.
  await page.click('#clear'); await page.select('#fmt', 'auto'); await page.select('#maxw', '0');
  await (await page.$('#file')).uploadFile(big);
  await page.waitForFunction(() => /PNG|保留原檔/.test(document.querySelector('#list .res')?.textContent || ''));
  r = await download(() => page.click('#go'));
  ok(magic(r.bytes) === 'png' && r.bytes.length < bigSize * 0.6, `image compress: auto @ original size → PNG much smaller (${bigSize} → ${r.bytes.length})`);

  // ---- IMAGE CONVERTER: png→jpg (white bg), →webp, →png, zip
  await open('image-converter/');
  await (await page.$('#file')).uploadFile(alpha, jpg);
  await page.select('#fmt', 'jpg');
  ok(await page.$eval('#bgWrap', (e) => !e.classList.contains('hidden')), 'converter: bg colour shown for JPG');
  await page.waitForFunction(() => [...document.querySelectorAll('#list .res')].filter((e) => /JPG/.test(e.textContent)).length === 2);
  r = await download(() => page.click('#go'));
  zz = unzipSync(new Uint8Array(r.bytes)); zn = Object.keys(zz);
  ok(zn.length === 2 && zn.every((n) => n.endsWith('.jpg') && magic(Buffer.from(zz[n])) === 'jpg'), `converter: ZIP of 2 JPG (${zn})`);
  const px = await page.evaluate(async (u8) => { const bm = await createImageBitmap(new Blob([new Uint8Array(u8)])); const c = new OffscreenCanvas(bm.width, bm.height); const x = c.getContext('2d'); x.drawImage(bm, 0, 0); return [...x.getImageData(2, 2, 1, 1).data]; }, [...zz[zn.find((n) => n.startsWith('alpha'))]]);
  ok(px[0] > 245 && px[1] > 245 && px[2] > 245, `converter: transparent → white bg (${px})`);
  await page.click('#list li:nth-child(2) [data-act=rm]');
  for (const f of ['webp', 'png']) {
    await page.select('#fmt', f);
    await page.waitForFunction((f) => document.querySelector('#list .res').textContent.includes(f.toUpperCase()), {}, f);
    r = await download(() => page.click('#go'));
    ok(r.name === `alpha.${f}` && magic(r.bytes) === f, `converter: png → ${f} magic ok (${r.name})`);
  }

  // ---- WORD COUNTER / PASSWORD / GROUPS
  await open('');
  ok((await page.$$eval('.tgroup .ghead', (e) => e.map((x) => x.textContent))).length === 4, 'home: 4 tool groups');
  await open('word-counter/');
  await page.type('#text', 'Hello world 世界你好！ 2026\n\n第二段');
  await page.waitForFunction(() => document.querySelector('#stats [data-k=words]')?.textContent === '10');
  const wc = await page.$$eval('#stats b[data-k]', (e) => Object.fromEntries(e.map((x) => [x.dataset.k, x.textContent])));
  ok(wc.words === '10' && wc.cjk === '7' && wc.en === '2' && wc.num === '1' && wc.paras === '2', `wordcount: ${JSON.stringify(wc)}`);
  await open('password-generator/');
  await page.$eval('#len', (e) => { e.value = 24; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.waitForFunction(() => document.querySelector('#pwList code.pw')?.textContent.length === 24);
  const pws = await page.$$eval('#pwList code.pw', (e) => e.map((x) => x.textContent));
  ok(pws.length === 5 && pws.every((p) => p.length === 24 && /[A-Z]/.test(p) && /[a-z]/.test(p) && /\d/.test(p) && /[^A-Za-z0-9]/.test(p)) && new Set(pws).size === 5, `password: 5×24 all sets (${pws[0]})`);
  await page.click('#symbols');
  await page.waitForFunction(() => [...document.querySelectorAll('#pwList code.pw')].every((x) => /^[A-Za-z0-9]+$/.test(x.textContent)));
  ok(true, 'password: symbols off');

  // ---- RESIZE / ROTATE
  const dims = (u8) => page.evaluate(async (a) => { const bm = await createImageBitmap(new Blob([new Uint8Array(a)])); return [bm.width, bm.height]; }, [...u8]);
  await open('resize-image/');
  await (await page.$('#file')).uploadFile(big);
  await page.select('#maxSide', '800'); await page.select('#rot', '90'); await page.select('#fmt', 'jpg');
  await page.waitForFunction(() => /JPG .*600×800/.test(document.querySelector('#list .res')?.textContent || ''));
  r = await download(() => page.click('#go'));
  let dm = await dims(r.bytes);
  ok(magic(r.bytes) === 'jpg' && dm.join() === '600,800' && /_調整\.jpg$/.test(r.name), `resize: 1600×1200 → max 800 + rot 90 = ${dm} (${r.name})`);
  await page.select('#rot', '0'); await page.select('#mode', 'exact'); await page.type('#w', '300'); await page.select('#fmt', 'keep');
  await page.waitForFunction(() => /PNG .*300×225/.test(document.querySelector('#list .res').textContent));
  r = await download(() => page.click('#go'));
  dm = await dims(r.bytes);
  ok(magic(r.bytes) === 'png' && dm.join() === '300,225', `resize: width 300 keeps ratio → ${dm}`);

  // ---- WATERMARK (Chinese text)
  await open('watermark-image/');
  await (await page.$('#file')).uploadFile(big, jpg);
  await page.$eval('#wmText', (e) => { e.value = '僅供測試申請使用\n2026/11/03'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.$eval('#wmColor', (e) => { e.value = '#ff0000'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.waitForFunction(() => [...document.querySelectorAll('#list .res')].filter((e) => e.textContent).length === 2);
  r = await download(() => page.click('#go'));
  zz = unzipSync(new Uint8Array(r.bytes)); zn = Object.keys(zz);
  ok(zn.length === 2 && zn.every((n) => /_浮水印\.(png|jpg)$/.test(n)), `watermark: ZIP of 2 (${zn})`);
  const diff = await page.evaluate(async (a, b) => {
    const px = async (u) => { const bm = await createImageBitmap(new Blob([new Uint8Array(u)])); const c = new OffscreenCanvas(bm.width, bm.height); const x = c.getContext('2d'); x.drawImage(bm, 0, 0); return x.getImageData(0, 0, bm.width, bm.height).data; };
    const A = await px(a), B = await px(b); let n = 0; for (let i = 0; i < A.length; i += 4) if (Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) > 40) n++; return n / (A.length / 4);
  }, [...await readFile(big)], [...zz[zn.find((n) => n.startsWith('big'))]]);
  ok(diff > 0.01 && diff < 0.6, `watermark: ${(diff * 100).toFixed(1)}% pixels changed (tiled text)`);

  // ---- PDF PAGE NUMBERS
  const RP = await (async () => { const d = await PDFDocument.create(); for (let i = 0; i < 4; i++) d.addPage([300, 400]); d.getPage(2).setRotation(degrees(90)); const f = join(OUT, 'pn.pdf'); await writeFile(f, await d.save()); return f; })();
  await open('add-page-numbers-to-pdf/');
  await (await page.$('#file')).uploadFile(RP);
  await page.waitForFunction(() => !document.querySelector('#go').disabled);
  await page.select('#style', 'zhN'); await page.click('#skipFirst');
  r = await download(() => page.click('#go'));
  d = await PDFDocument.load(r.bytes);
  const xo = d.getPages().map((p) => { const x = p.node.Resources()?.lookup(PDFName.of('XObject')); return x ? x.keys().length : 0; });
  ok(r.name === 'pn_頁碼.pdf' && d.getPageCount() === 4 && xo.join() === '0,1,1,1', `page numbers: 4 pages, cover skipped, images per page ${xo}`);
  await page.waitForFunction(() => /3 頁加入頁碼/.test(document.querySelector('#status').textContent));
  ok(true, 'page numbers: status reports 3 pages numbered');

  // mobile layout of the new/changed image tools
  await page.setViewport({ width: 375, height: 740, isMobile: true, hasTouch: true });
  for (const s of ['', 'image-converter/', 'compress-image/', 'resize-image/', 'watermark-image/', 'word-counter/', 'password-generator/']) {
    await open(s); const fi = await page.$('#file');
    if (fi) { await fi.uploadFile(big, alpha);
    await page.waitForFunction(() => document.querySelectorAll('#list .res').length === 2 && [...document.querySelectorAll('#list .res')].every((e) => e.textContent)); }
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `mobile ${s}: no horizontal overflow`);
    await page.screenshot({ path: join(OUT, (s.replace('/', '') || 'home') + '-mobile.png'), fullPage: false });
  }
  await page.setViewport({ width: 1200, height: 900 });

  // ---- QR CODE: url → PNG + SVG; wifi payload; logo
  await open('qr-code-generator/');
  await page.type('#qUrl', 'waitingstudio.com/測試');
  await page.waitForFunction(() => document.querySelector('#qrPreview svg'));
  ok((await page.$eval('#qrText', (e) => e.textContent)) === 'https://waitingstudio.com/測試', 'qr: url payload with https');
  r = await download(() => page.click('#dlPng'));
  ok(/\.png$/.test(r.name) && r.bytes[0] === 0x89 && r.bytes[1] === 0x50, `qr: PNG download (${r.name})`);
  r = await download(() => page.click('#dlSvg'));
  ok(/\.svg$/.test(r.name) && /^<svg[\s\S]*<path/.test(r.bytes.toString()), `qr: SVG download (${r.name})`);
  await page.click('input[name=qtype][value=wifi]');
  await page.type('#wSsid', 'My;Net'); await page.type('#wPass', 'p@ss');
  await page.waitForFunction(() => document.querySelector('#qrText').textContent.startsWith('WIFI:'));
  ok((await page.$eval('#qrText', (e) => e.textContent)) === 'WIFI:T:WPA;S:My\\;Net;P:p@ss;;', 'qr: wifi payload escaped');
  await (await page.$('#logo')).uploadFile(png);
  await page.waitForFunction(() => document.querySelector('#qrPreview svg image'));
  ok(true, 'qr: logo embedded');

  // mobile viewport renders without horizontal overflow
  await page.setViewport({ width: 375, height: 740, isMobile: true, hasTouch: true });
  await open('rotate-pdf/');
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'mobile: no horizontal overflow');

  ok(external.length === 0, `no external network requests (${external.length}) ${external.slice(0, 3).join(' ')}`);
  ok(errors.length === 0, `no console/page errors ${errors.slice(0, 3).join(' | ')}`);
} catch (e) {
  console.error(e); failures++;
} finally {
  await browser.close(); server?.close();
}
console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
