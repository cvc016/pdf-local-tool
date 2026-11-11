// Source of vendor/squoosh/imgcodec.worker.js (bundle with `npm run build:codecs`).
// Runs desktop-grade image encoders in a Web Worker, entirely in the browser:
//   JPEG  → MozJPEG (@jsquash/jpeg)      WebP → libwebp (@jsquash/webp)
//   PNG   → UPNG.js palette quantization (pngquant-style lossy) + OxiPNG lossless optimisation (@jsquash/oxipng)
// Encoders only see raw pixels, so no EXIF/GPS metadata is ever written.
import encJpeg from '@jsquash/jpeg/encode.js';
import encWebp from '@jsquash/webp/encode.js';
import initOxi, { optimise } from '@jsquash/oxipng/codec/pkg/squoosh_oxipng.js';
import UPNG from 'upng-js';

let oxiReady;
const oxi = () => (oxiReady ||= initOxi());

async function png(rgba, w, h, colors, level) {
  // colors: 0 = lossless (truecolor), else max palette size (≤256)
  const raw = new Uint8Array(UPNG.encode([rgba.buffer], w, h, colors));
  await oxi();
  return optimise(raw, level, false, true).buffer;
}

self.onmessage = async ({ data: { id, op, rgba, w, h, opt } }) => {
  try {
    let out;
    if (op === 'ping') out = new ArrayBuffer(0);
    else if (op === 'jpeg') out = await encJpeg(new ImageData(new Uint8ClampedArray(rgba), w, h), { quality: opt.quality });
    else if (op === 'webp') out = await encWebp(new ImageData(new Uint8ClampedArray(rgba), w, h), { quality: opt.quality, method: 4 });
    else if (op === 'png') out = await png(new Uint8Array(rgba), w, h, opt.colors, opt.level ?? 2);
    else throw new Error('unknown op ' + op);
    self.postMessage({ id, out }, [out]);
  } catch (e) { self.postMessage({ id, err: String(e && e.message || e) }); }
};
