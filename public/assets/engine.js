// PaperKit engine — every operation runs inside this browser tab. Nothing is uploaded.
const V = '/vendor';
const loaded = {};
export function loadScript(src) {
  return loaded[src] ||= new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.async = true;
    s.onload = res;
    s.onerror = () => { delete loaded[src]; rej(new Error('Could not load a helper. Check your connection once, then it works offline.')); };
    document.head.appendChild(s);
  });
}

/* ---------- libraries ---------- */
export async function PDFLib() { await loadScript(`${V}/pdf-lib.min.js`); return window.PDFLib; }
let _pdfjs;
export async function pdfjs() {
  if (!_pdfjs) {
    _pdfjs = await import(`${V}/pdfjs/pdf.min.mjs`);
    _pdfjs.GlobalWorkerOptions.workerSrc = `${V}/pdfjs/pdf.worker.min.mjs`;
  }
  return _pdfjs;
}
export class LockedError extends Error { constructor(m) { super(m || 'This PDF is password-locked. Open it with Unlock first.'); this.locked = true; } }

export async function openPdf(bytes, password) {
  const lib = await pdfjs();
  try {
    return await lib.getDocument({
      data: new Uint8Array(bytes).slice(), password,
      cMapUrl: `${V}/pdfjs/cmaps/`, cMapPacked: true,
      standardFontDataUrl: `${V}/pdfjs/standard_fonts/`,
      wasmUrl: `${V}/pdfjs/wasm/`, iccUrl: `${V}/pdfjs/iccs/`,
      isEvalSupported: false,
    }).promise;
  } catch (e) {
    if (e?.name === 'PasswordException') throw new LockedError();
    throw new Error("Hmm, this file doesn't look like a healthy PDF.");
  }
}

/* load with pdf-lib; quietly removes "owner-only" locks, asks for Unlock on real passwords */
export async function loadDoc(bytes) {
  const { PDFDocument } = await PDFLib();
  try { return await PDFDocument.load(bytes, { updateMetadata: false }); }
  catch (e) {
    if (/encrypt/i.test(e?.message || '')) {
      let clean;
      try { clean = await runQpdf(bytes, ['--decrypt']); } catch { throw new LockedError(); }
      return PDFDocument.load(clean, { updateMetadata: false });
    }
    throw new Error("Hmm, this file doesn't look like a healthy PDF.");
  }
}
export async function newDoc() { const { PDFDocument } = await PDFLib(); return PDFDocument.create(); }
export function closePdf(pdf) { try { (pdf.destroy ? pdf.destroy() : pdf.loadingTask?.destroy())?.catch?.(() => { }); } catch { } }
export async function pageCount(bytes) { const d = await openPdf(bytes); const n = d.numPages; closePdf(d); return n; }

/* ---------- qpdf (encryption, lossless squeeze, decrypt) ---------- */
export async function runQpdf(input, args) {
  await loadScript(`${V}/qpdf/qpdf.js`);
  const create = window.Module;
  const errs = [];
  const m = await create({ locateFile: () => `${V}/qpdf/qpdf.wasm`, noInitialRun: true, print: () => {}, printErr: t => errs.push(t) });
  m.FS.writeFile('/in.pdf', new Uint8Array(input));
  let code = 0;
  try { code = m.callMain([...args, '/in.pdf', '/out.pdf']); }
  catch (e) { code = typeof e?.status === 'number' ? e.status : 2; }
  if (code !== 0 && code !== 3) {
    const msg = errs.join(' ');
    if (/password/i.test(msg)) throw new LockedError('That password did not open it. Try again?');
    throw new Error('Could not process this PDF.');
  }
  return m.FS.readFile('/out.pdf');
}

/* ---------- files ---------- */
export const isPdf = f => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
export const isHeic = f => /image\/hei[cf]/.test(f.type) || /\.hei[cf]$/i.test(f.name);
export const isImage = f => f.type.startsWith('image/') || isHeic(f) || /\.(jpe?g|png|webp|gif|bmp)$/i.test(f.name);
export const bytesOf = async f => f._buf ||= new Uint8Array(await f.arrayBuffer());
export const fmt = b => b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
// file names we create: no path separators, control or reserved characters, sane length
export const safeName = n => String(n).replace(/[\\/:*?"<>|\u0000-\u001f\u007f]+/g, '_').replace(/^[.\s]+/, '').slice(-120) || 'paperkit';
export const base = n => safeName(n).replace(/\.[^.]+$/, '');
const toBlob = (c, type, q) => new Promise(r => c.toBlob(r, type, q));
export const canvasBytes = async (c, type = 'image/jpeg', q = .9) => new Uint8Array(await (await toBlob(c, type, q)).arrayBuffer());

export async function bitmapOf(file) {
  let blob = file;
  if (isHeic(file)) {
    await loadScript(`${V}/heic2any.min.js`);
    blob = await window.heic2any({ blob: file, toType: 'image/jpeg', quality: .92 });
    if (Array.isArray(blob)) blob = blob[0];
  }
  // 1) fast path  2) same without options (older Android)  3) the classic <img> decoder, which phones handle best
  try { return await createImageBitmap(blob, { imageOrientation: 'from-image' }); } catch { }
  try { return await createImageBitmap(blob); } catch { }
  try { return await decodeWithImg(blob); }
  catch { throw new Error(`Couldn't read ${file.name} as an image. Try a JPG or PNG photo?`); }
}
async function decodeWithImg(blob, maxSide = 4096) {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image(); img.decoding = 'async'; img.src = url;
    await (img.decode ? img.decode() : new Promise((res, rej) => { img.onload = res; img.onerror = rej; }));
    const w = img.naturalWidth, h = img.naturalHeight; if (!w || !h) throw new Error('empty');
    const k = Math.min(1, maxSide / Math.max(w, h));
    const c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c; // a canvas works everywhere an ImageBitmap does here (width, height, drawImage)
  } finally { URL.revokeObjectURL(url); }
}
export function drawToCanvas(bmp, maxSide = 3200, bg = '#fff') {
  const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  const x = c.getContext('2d'); x.fillStyle = bg; x.fillRect(0, 0, c.width, c.height);
  x.drawImage(bmp, 0, 0, c.width, c.height);
  return c;
}

/* ---------- rendering ---------- */
export async function renderPage(pdf, n, scale = 1, maxSide = 0) {
  const page = await pdf.getPage(n);
  let vp = page.getViewport({ scale });
  if (maxSide && Math.max(vp.width, vp.height) > maxSide) vp = page.getViewport({ scale: scale * maxSide / Math.max(vp.width, vp.height) });
  const c = document.createElement('canvas');
  c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
  const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: ctx, canvas: c, viewport: vp }).promise;
  page.cleanup();
  return c;
}

/* ---------- page helpers ---------- */
const SIZES = { a4: [595.28, 841.89], letter: [612, 792] };
export async function addImagePage(doc, jpg, w, h, { size = 'a4', margin = 0 } = {}) {
  const img = await doc.embedJpg(jpg);
  let pw, ph;
  if (size === 'fit') { const k = 72 / 150; pw = w * k + margin * 2; ph = h * k + margin * 2; }
  else { [pw, ph] = SIZES[size]; if (w > h) [pw, ph] = [ph, pw]; }
  const page = doc.addPage([pw, ph]);
  const bw = pw - margin * 2, bh = ph - margin * 2, k = Math.min(bw / w, bh / h);
  const dw = w * k, dh = h * k;
  page.drawImage(img, { x: (pw - dw) / 2, y: (ph - dh) / 2, width: dw, height: dh });
}
async function copyInto(out, src, idx) { (await out.copyPages(src, idx)).forEach(p => out.addPage(p)); }
const save = doc => doc.save({ useObjectStreams: true });

/* ---------- operations ---------- */
export async function merge(files, progress) {
  const out = await newDoc();
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    progress?.(i / files.length, `adding ${f.name}`);
    if (isPdf(f)) { const src = await loadDoc(await bytesOf(f)); await copyInto(out, src, src.getPageIndices()); }
    else { const c = drawToCanvas(await bitmapOf(f)); await addImagePage(out, await canvasBytes(c), c.width, c.height, { size: 'fit' }); }
  }
  return save(out);
}

export function parseRanges(text, max) {
  const out = [];
  for (const part of String(text).split(/[,;\s]+/).filter(Boolean)) {
    const m = part.match(/^(\d+)(?:-(\d+|end))?$/i);
    if (!m) throw new Error(`"${part}" isn't a page range. Try like 1-3, 5, 8-end`);
    let a = +m[1], b = m[2] ? (m[2].toLowerCase() === 'end' ? max : +m[2]) : a;
    if (a < 1 || b > max || a > b) throw new Error(`Pages ${part} don't exist. This PDF has ${max} pages.`);
    out.push(Array.from({ length: b - a + 1 }, (_, i) => a - 1 + i));
  }
  if (!out.length) throw new Error('Type the pages you want, like 1-3, 5');
  return out;
}
export async function subset(bytes, idx) { const src = await loadDoc(bytes); const out = await newDoc(); await copyInto(out, src, idx); return save(out); }

export async function organize(bytes, plan) { // plan: [{i, rot}]
  const { degrees } = await PDFLib();
  const src = await loadDoc(bytes); const out = await newDoc();
  const pages = await out.copyPages(src, plan.map(p => p.i));
  pages.forEach((p, k) => { const r = plan[k].rot || 0; if (r) p.setRotation(degrees((p.getRotation().angle + r + 360) % 360)); out.addPage(p); });
  return save(out);
}

export async function rasterize(bytes, { scale = 1.5, quality = .7, gray = false } = {}, progress) {
  const pdf = await openPdf(bytes); const out = await newDoc();
  for (let n = 1; n <= pdf.numPages; n++) {
    progress?.((n - 1) / pdf.numPages, `page ${n} of ${pdf.numPages}`);
    const page = await pdf.getPage(n); const vp1 = page.getViewport({ scale: 1 });
    const c = await renderPage(pdf, n, scale, 4000);
    if (gray) { const x = c.getContext('2d'); x.filter = 'grayscale(1)'; x.drawImage(c, 0, 0); }
    const img = await out.embedJpg(await canvasBytes(c, 'image/jpeg', quality));
    out.addPage([vp1.width, vp1.height]).drawImage(img, { x: 0, y: 0, width: vp1.width, height: vp1.height });
  }
  closePdf(pdf);
  return save(out);
}

export async function squeezeLossless(bytes) {
  return runQpdf(bytes, ['--object-streams=generate', '--compress-streams=y', '--recompress-flate', '--compression-level=9']);
}

export async function compress(bytes, level, progress) {
  if (level === 'light') { progress?.(.3, 'tidying the insides'); return squeezeLossless(bytes); }
  const o = level === 'strong' ? { scale: 1.1, quality: .5 } : { scale: 1.5, quality: .68 };
  return rasterize(bytes, o, progress);
}

/* squeeze until it fits under maxBytes (Exam mode documents) */
export async function fitUnder(bytes, maxBytes, progress) {
  if (bytes.length <= maxBytes) return bytes;
  let best = await squeezeLossless(bytes).catch(() => bytes);
  if (best.length <= maxBytes) return best;
  const tries = [[1.6, .75], [1.4, .62], [1.2, .5], [1.0, .42], [.85, .35], [.7, .3], [.6, .25]];
  for (let i = 0; i < tries.length; i++) {
    progress?.(i / tries.length, `trying a lighter version (${i + 1}/${tries.length})`);
    const r = await rasterize(bytes, { scale: tries[i][0], quality: tries[i][1] });
    if (r.length < best.length) best = r;
    if (r.length <= maxBytes) return r;
  }
  const e = new Error(`Smallest I could get was ${fmt(best.length)}. Try fewer pages.`); e.best = best; throw e;
}

export async function pdfToImages(bytes, { type = 'image/jpeg', scale = 2 } = {}, progress) {
  const pdf = await openPdf(bytes); const out = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    progress?.((n - 1) / pdf.numPages, `page ${n} of ${pdf.numPages}`);
    const c = await renderPage(pdf, n, scale, 5000);
    out.push({ n, data: await canvasBytes(c, type, .92) });
  }
  closePdf(pdf);
  return out;
}

export async function imagesToPdf(files, { size = 'a4', margin = 0 } = {}, progress) {
  const out = await newDoc();
  for (let i = 0; i < files.length; i++) {
    progress?.(i / files.length, `photo ${i + 1} of ${files.length}`);
    const c = drawToCanvas(await bitmapOf(files[i]));
    await addImagePage(out, await canvasBytes(c), c.width, c.height, { size, margin });
  }
  return save(out);
}

/* text → transparent PNG, so any language (Tamil too) and emoji work */
export function textImage(text, { color = '#E5484D', px = 160, weight = 800 } = {}) {
  const c = document.createElement('canvas'), x = c.getContext('2d');
  const font = `${weight} ${px}px "Bricolage Grotesque", "Nirmala UI", "Noto Sans Tamil", system-ui, sans-serif`;
  x.font = font; const w = Math.ceil(x.measureText(text).width) + px * .4;
  c.width = w; c.height = Math.ceil(px * 1.4);
  x.font = font; x.fillStyle = color; x.textBaseline = 'middle'; x.fillText(text, px * .2, c.height / 2);
  return c;
}

export async function watermark(bytes, { text, logo, opacity = .25, size = 0.5, tile = false, angle = 35, color }) {
  const { degrees } = await PDFLib();
  const doc = await loadDoc(bytes);
  let img;
  if (logo) { const c = drawToCanvas(await bitmapOf(logo), 1600, 'rgba(0,0,0,0)'); img = await doc.embedPng(await canvasBytes(c, 'image/png')); }
  else img = await doc.embedPng(await canvasBytes(textImage(text, { color }), 'image/png'));
  const th = angle * Math.PI / 180;
  for (const p of doc.getPages()) {
    const { width: pw, height: ph } = p.getSize();
    const w = pw * size * (tile ? .45 : 1), h = w * img.height / img.width;
    const put = (cx, cy) => p.drawImage(img, {
      x: cx - (w / 2 * Math.cos(th) - h / 2 * Math.sin(th)),
      y: cy - (w / 2 * Math.sin(th) + h / 2 * Math.cos(th)),
      width: w, height: h, rotate: degrees(angle), opacity,
    });
    if (tile) { for (let gy = ph * .15; gy < ph; gy += ph / 3.2) for (let gx = pw * .25; gx < pw; gx += pw / 2) put(gx, gy); }
    else put(pw / 2, ph / 2);
  }
  return save(doc);
}

export async function pageNumbers(bytes, { pos = 'bc', style = 'n', start = 1, size = 11 }) {
  const { StandardFonts, rgb } = await PDFLib();
  const doc = await loadDoc(bytes); const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages(), N = pages.length + start - 1;
  pages.forEach((p, i) => {
    const n = i + start;
    const t = style === 'n' ? `${n}` : style === 'nN' ? `${n} / ${N}` : `Page ${n} of ${N}`;
    const { width: pw, height: ph } = p.getSize(); const tw = font.widthOfTextAtSize(t, size), m = 28;
    const x = pos[1] === 'l' ? m : pos[1] === 'r' ? pw - m - tw : (pw - tw) / 2;
    const y = pos[0] === 'b' ? m * .8 : ph - m - size;
    p.drawText(t, { x, y, size, font, color: rgb(.15, .15, .17) });
  });
  return save(doc);
}

export async function sign(bytes, sigPng, spots) { // spots: [{page, x, y, w}] fractions, top-left origin
  const doc = await loadDoc(bytes); const img = await doc.embedPng(sigPng); const pages = doc.getPages();
  for (const s of spots) {
    const p = pages[s.page]; if (!p) continue;
    const { width: pw, height: ph } = p.getSize();
    const w = s.w * pw, h = w * img.height / img.width;
    p.drawImage(img, { x: s.x * pw - w / 2, y: ph - s.y * ph - h / 2, width: w, height: h });
  }
  return save(doc);
}

export async function protect(bytes, pw) {
  const owner = Array.from(crypto.getRandomValues(new Uint8Array(12)), b => b.toString(16).padStart(2, '0')).join('');
  // named options, so a password that starts with "-" can never be read as a qpdf flag
  return runQpdf(bytes, ['--encrypt', `--user-password=${pw}`, `--owner-password=${owner}`, '--bits=256', '--']);
}
export async function unlock(bytes, pw) {
  try { return await runQpdf(bytes, [`--password=${pw}`, '--decrypt']); }
  catch { throw new LockedError(pw ? "That password didn't open it. Check caps lock and try again?" : 'This PDF needs its password. Type it above.'); }
}

export async function flatten(bytes) {
  const doc = await loadDoc(bytes); let n = 0;
  try { const form = doc.getForm(); n = form.getFields().length; form.flatten(); } catch { /* no form */ }
  return { data: await save(doc), fields: n };
}

/* ---------- OCR (reading glasses are downloaded once; your file never leaves) ---------- */
export async function ocr(files, langs, progress) {
  await loadScript(`${V}/tesseract/tesseract.min.js`);
  progress?.(0, 'putting on reading glasses (one-time download)');
  const worker = await window.Tesseract.createWorker(langs, 1, {
    workerPath: `${V}/tesseract/worker.min.js`, workerBlobURL: false,
    corePath: `${location.origin}${V}/tesseract/core`, // self-hosted engine: no third-party code runs on your files
    logger: m => { if (m.status === 'loading language traineddata') progress?.(0, `downloading ${langs} reading data ${Math.round((m.progress || 0) * 100)}%`); },
  });
  const canvases = [];
  for (const f of files) {
    if (isPdf(f)) { const pdf = await openPdf(await bytesOf(f)); for (let n = 1; n <= pdf.numPages; n++) canvases.push(await renderPage(pdf, n, 2.2, 3000)); closePdf(pdf); }
    else canvases.push(drawToCanvas(await bitmapOf(f), 3000));
  }
  const out = await newDoc(); let text = '';
  for (let i = 0; i < canvases.length; i++) {
    progress?.(i / canvases.length, `reading page ${i + 1} of ${canvases.length}`);
    const { data } = await worker.recognize(canvases[i], {}, { pdf: true, text: true });
    text += (i ? `\n\n--- page ${i + 1} ---\n\n` : '') + (data.text || '');
    const pageDoc = await loadDoc(new Uint8Array(data.pdf));
    await copyInto(out, pageDoc, pageDoc.getPageIndices());
  }
  await worker.terminate();
  return { data: await save(out), text };
}

/* ---------- Exam mode ---------- */
// JPEG that lands inside [minKB, maxKB]. If it's still under the minimum at best quality,
// we pad with a harmless JPEG comment so portals that check minimum size accept it.
export async function jpegInRange(canvas, minKB, maxKB) {
  const max = maxKB * 1024, min = (minKB || 0) * 1024;
  let lo = .05, hi = .98, best = null;
  for (let i = 0; i < 9; i++) {
    const q = (lo + hi) / 2; const b = await canvasBytes(canvas, 'image/jpeg', q);
    if (b.length <= max) { best = { b, q }; lo = q; } else hi = q;
  }
  if (!best) { const b = await canvasBytes(canvas, 'image/jpeg', .05); if (b.length > max) throw new Error(`Even at lowest quality it's ${fmt(b.length)}. Use smaller dimensions.`); best = { b, q: .05 }; }
  let bytes = best.b, padded = false;
  if (bytes.length < min) { bytes = padJpeg(bytes, min - bytes.length + 64); padded = true; }
  return { bytes, quality: best.q, padded };
}
function padJpeg(jpg, extra) {
  const segs = [];
  while (extra > 0) { const n = Math.min(extra, 65000); const s = new Uint8Array(n + 4); s[0] = 0xFF; s[1] = 0xFE; s[2] = (n + 2) >> 8; s[3] = (n + 2) & 255; s.fill(32, 4); segs.push(s); extra -= n; }
  const total = jpg.length + segs.reduce((a, s) => a + s.length, 0);
  const out = new Uint8Array(total); out.set(jpg.subarray(0, 2), 0); let o = 2;
  for (const s of segs) { out.set(s, o); o += s.length; }
  out.set(jpg.subarray(2), o); return out;
}
export function inkClean(canvas, strength = .55) { // makes a phone photo of a signature crisp: white paper, dark ink
  const x = canvas.getContext('2d'); const d = x.getImageData(0, 0, canvas.width, canvas.height); const a = d.data;
  let sum = 0; for (let i = 0; i < a.length; i += 4) sum += a[i] * .3 + a[i + 1] * .59 + a[i + 2] * .11;
  const mean = sum / (a.length / 4), cut = mean * (1 - strength * .45);
  for (let i = 0; i < a.length; i += 4) {
    const g = a[i] * .3 + a[i + 1] * .59 + a[i + 2] * .11;
    if (g > cut) { a[i] = a[i + 1] = a[i + 2] = 255; }
    else { const k = Math.max(0, g / cut) * .5; a[i] *= k; a[i + 1] *= k; a[i + 2] *= k; }
  }
  x.putImageData(d, 0, 0); return canvas;
}

/* ---------- tiny ZIP writer (store) ---------- */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = d => { let c = ~0; for (let i = 0; i < d.length; i++) c = CRC[(c ^ d[i]) & 255] ^ (c >>> 8); return ~c >>> 0; };
export function zip(files) {
  const enc = new TextEncoder(), parts = [], central = []; let off = 0;
  for (const f of files) {
    const name = enc.encode(safeName(f.name)), d = f.data, crc = crc32(d);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true);
    h.setUint32(14, crc, true); h.setUint32(18, d.length, true); h.setUint32(22, d.length, true); h.setUint16(26, name.length, true);
    parts.push(new Uint8Array(h.buffer), name, d);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
    c.setUint32(16, crc, true); c.setUint32(20, d.length, true); c.setUint32(24, d.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
    central.push(new Uint8Array(c.buffer), name);
    off += 30 + name.length + d.length;
  }
  const csize = central.reduce((a, p) => a + p.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, csize, true); e.setUint32(16, off, true);
  return new Blob([...parts, ...central, new Uint8Array(e.buffer)], { type: 'application/zip' });
}
