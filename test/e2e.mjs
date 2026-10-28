// End-to-end test in headless Chrome: drives the real UI and validates output PDFs.
// Usage: npm test                (serves the repo locally)
//        BASE_URL=https://.../  npm test   (tests a deployed site)
import { createServer } from 'node:http';
import { readFile, mkdir, rm, readdir, writeFile } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { PDFDocument } from 'pdf-lib';
import { unzipSync } from 'fflate';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'test', 'out');
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
let BASE = process.env.BASE_URL;
let server;

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8', '.json': 'application/json' };
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
page.on('request', (r) => { const u = new URL(r.url()); if (!['blob:', 'data:'].includes(u.protocol) && u.host !== host) external.push(r.url()); });
page.on('pageerror', (e) => errors.push(String(e)));
page.on('response', (r) => { if (r.status() >= 400 && !/favicon\.ico$/.test(r.url())) errors.push(`HTTP ${r.status()} ${r.url()}`); });
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
const cdp = await page.createCDPSession();

let dl = 0;
async function download(trigger) {
  const dir = join(OUT, 'dl' + ++dl); await mkdir(dir, { recursive: true });
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dir });
  await trigger();
  for (let i = 0; i < 100; i++) {
    const fs = (await readdir(dir)).filter((f) => !f.endsWith('.crdownload'));
    if (fs.length) { await new Promise((r) => setTimeout(r, 200)); return { name: fs[0], bytes: await readFile(join(dir, fs[0])) }; }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('download timed out');
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
  for (const s of ['merge-pdf/', 'split-pdf/', 'delete-pdf-pages/', 'rotate-pdf/', 'reorder-pdf-pages/', 'jpg-to-pdf/', 'heic-to-pdf/', 'privacy/', 'about/', 'remove-ads/', 'sitemap.xml', 'robots.txt', 'THIRD_PARTY_LICENSES.txt']) {
    const r = await page.goto(BASE + s); ok(r.status() === 200, `GET ${s} → ${r.status()}`);
  }

  // ---- MERGE: add a, b; move b to top with ▲ ... then download
  await open('merge-pdf/');
  ok(await page.$eval('.tool', (t) => !t.querySelector('.ad-slot')) && (await page.$$('.ad-slot')).length === 1, 'ads: exactly one banner slot, not inside the tool card');
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
