// Every PaperKit job: what it's called, how Kit explains it, its options, and what it runs.
import * as E from './engine.js';

/* ---------- tiny DOM helpers ---------- */
export const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e[k] = v; else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids) if (k != null) e.append(k);
  return e;
}
export function seg(options, value, onChange) {
  const d = h('div', { class: 'seg', role: 'radiogroup' });
  for (const o of options) {
    const b = h('button', { type: 'button', role: 'radio', 'aria-checked': String(o.v === value) });
    b.innerHTML = esc(o.t) + (o.s ? `<small>${esc(o.s)}</small>` : '');
    if (o.v === value) b.classList.add('on');
    b.onclick = () => { d.querySelectorAll('button').forEach(x => { x.classList.remove('on'); x.setAttribute('aria-checked', 'false'); }); b.classList.add('on'); b.setAttribute('aria-checked', 'true'); onChange(o.v); };
    d.append(b);
  }
  return d;
}
export function opt(label, control, hint) {
  const d = h('div', { class: 'opt' }, h('div', { class: 'lbl', text: label }), control);
  if (hint) d.append(h('div', { class: 'hint', text: hint }));
  return d;
}
const field = (attrs) => h('input', { class: 'field', ...attrs });
const store = {
  get(k, d) { try { const v = localStorage.getItem('pk.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('pk.' + k, JSON.stringify(v)); } catch { } },
  del(k) { try { localStorage.removeItem('pk.' + k); } catch { } },
};

/* ---------- page grid (split / organize / rotate) ---------- */
async function pageGrid(ctx, mode) {
  const el = ctx.el.extra; el.innerHTML = ''; ctx.pages = null;
  const f = ctx.files[0]; if (!f) return ctx.refresh();
  let pdf;
  try { pdf = await E.openPdf(await E.bytesOf(f)); } catch (e) { ctx.fail(e); ctx.files.length = 0; ctx.refresh(); return; }
  ctx.numPages = pdf.numPages;
  ctx.pages = Array.from({ length: pdf.numPages }, (_, i) => ({ i, rot: 0, sel: false, gone: false }));
  const bar = h('div', { class: 'pgbar' }), grid = h('div', { class: 'pages' });
  el.append(bar, grid);
  const thumbs = {}; let dragK = null;
  const tip = mode === 'organize' ? 'Drag pages to reorder (or use ‹ ›). ⟳ turns a page, ✕ removes it.' : mode === 'rotate' ? 'Tap pages to rotate only those, or leave none picked to rotate all.' : 'Tap pages to pick them.';
  function drawBar() {
    bar.innerHTML = '';
    const picked = ctx.pages.filter(p => p.sel).length;
    bar.append(h('span', { text: `${tip} ${mode !== 'organize' ? `· ${picked} picked` : ''}` }));
    if (mode !== 'organize') {
      const b = (t, fn) => h('button', { class: 'btn ghost sm', type: 'button', text: t, onclick: () => { ctx.pages.forEach((p, k) => p.sel = fn(k)); draw(); } });
      bar.append(b('All', () => true), b('None', () => false), b('Odd', k => k % 2 === 0), b('Even', k => k % 2 === 1));
    } else bar.append(h('button', { class: 'btn ghost sm', type: 'button', text: '↺ Reset', onclick: () => { ctx.pages.sort((a, b) => a.i - b.i).forEach(p => { p.rot = 0; p.gone = false; }); draw(); } }));
  }
  function move(k, d) { const j = k + d; if (j < 0 || j >= ctx.pages.length) return; [ctx.pages[k], ctx.pages[j]] = [ctx.pages[j], ctx.pages[k]]; draw(); }
  function draw() {
    grid.innerHTML = '';
    ctx.pages.forEach((p, k) => {
      const pc = h('div', { class: 'pc' });
      const c = thumbs[p.i];
      if (c) { pc.append(c); c.style.transform = `rotate(${p.rot}deg) scale(${p.rot % 180 ? .74 : 1})`; } else pc.append(h('span', { class: 'log', text: '…' }));
      const tile = h('div', { class: 'pg' + (p.sel ? ' sel' : '') + (p.gone ? ' gone' : ''), tabindex: '0', role: mode === 'organize' ? 'listitem' : 'checkbox', 'aria-checked': mode === 'organize' ? null : String(p.sel), 'aria-label': `Page ${p.i + 1}` }, pc);
      const pn = h('div', { class: 'pn' }, h('span', { text: `p${p.i + 1}` }));
      if (mode === 'organize') {
        const m = h('div', { class: 'tools-mini' });
        const mb = (t, label, fn) => h('button', { type: 'button', text: t, title: label, 'aria-label': label, onclick: e => { e.stopPropagation(); fn(); } });
        m.append(mb('‹', 'Move left', () => move(k, -1)), mb('⟳', 'Rotate', () => { p.rot = (p.rot + 90) % 360; draw(); }), mb(p.gone ? '↺' : '✕', p.gone ? 'Bring back' : 'Remove', () => { p.gone = !p.gone; draw(); }), mb('›', 'Move right', () => move(k, 1)));
        pn.append(m);
        tile.draggable = true;
        tile.ondragstart = () => { dragK = k; tile.classList.add('dragging'); };
        tile.ondragend = () => { tile.classList.remove('dragging'); dragK = null; };
        tile.ondragover = e => { e.preventDefault(); tile.classList.add('drop-before'); };
        tile.ondragleave = () => tile.classList.remove('drop-before');
        tile.ondrop = e => { e.preventDefault(); e.stopPropagation(); if (dragK == null || dragK === k) return draw(); const [x] = ctx.pages.splice(dragK, 1); ctx.pages.splice(dragK < k ? k - 1 : k, 0, x); draw(); };
      } else {
        const toggle = () => { p.sel = !p.sel; draw(); };
        tile.onclick = toggle; tile.onkeydown = e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); } };
      }
      tile.append(pn); grid.append(tile);
    });
    drawBar(); ctx.refresh();
  }
  draw();
  for (let n = 1; n <= pdf.numPages; n++) {
    if (!ctx.alive()) break;
    try { thumbs[n - 1] = await E.renderPage(pdf, n, 1, 220); } catch { thumbs[n - 1] = null; }
    if (n % 4 === 0 || n === pdf.numPages) draw();
  }
  E.closePdf(pdf);
}

/* ---------- signature maker ---------- */
function trimToInk(canvas, transparentWhite = true) {
  const x = canvas.getContext('2d'); const { width: w, height: hh } = canvas; const d = x.getImageData(0, 0, w, hh); const a = d.data;
  let minX = w, minY = hh, maxX = -1, maxY = -1;
  for (let y = 0; y < hh; y++) for (let i = 0; i < w; i++) {
    const o = (y * w + i) * 4; const lum = a[o] * .3 + a[o + 1] * .59 + a[o + 2] * .11;
    const ink = a[o + 3] > 40 && lum < 200;
    if (transparentWhite && !ink) a[o + 3] = 0;
    if (ink) { if (i < minX) minX = i; if (i > maxX) maxX = i; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  }
  if (maxX < 0) return null;
  x.putImageData(d, 0, 0);
  const pad = 8, c = document.createElement('canvas');
  c.width = maxX - minX + pad * 2; c.height = maxY - minY + pad * 2;
  c.getContext('2d').drawImage(canvas, minX - pad, minY - pad, c.width, c.height, 0, 0, c.width, c.height);
  return c;
}
function signatureMaker(onDone) {
  const wrap = h('div', { class: 'opt' });
  let color = '#1B2A6B';
  const pad = h('canvas', { class: 'sigpad', 'aria-label': 'Draw your signature here' });
  const x = pad.getContext('2d'); let drawing = false, last = null, inked = false;
  const fit = () => { const r = pad.getBoundingClientRect(); if (!r.width) return; pad.width = r.width * 2; pad.height = r.height * 2; x.lineCap = x.lineJoin = 'round'; x.lineWidth = 5; inked = false; };
  requestAnimationFrame(fit);
  const pos = e => { const r = pad.getBoundingClientRect(); return [(e.clientX - r.left) * 2, (e.clientY - r.top) * 2]; };
  pad.onpointerdown = e => { if (!pad.width || pad.width < 10) fit(); drawing = true; last = pos(e); pad.setPointerCapture(e.pointerId); };
  pad.onpointermove = e => { if (!drawing) return; const p = pos(e); x.strokeStyle = color; x.beginPath(); x.moveTo(...last); x.lineTo(...p); x.stroke(); last = p; inked = true; };
  pad.onpointerup = pad.onpointercancel = () => drawing = false;
  const up = h('input', { type: 'file', accept: 'image/*', class: 'hide' });
  up.onchange = async () => {
    const f = up.files[0]; if (!f) return;
    const c = E.inkClean(E.drawToCanvas(await E.bitmapOf(f), 1400));
    const t = trimToInk(c); if (t) onDone(t.toDataURL('image/png'));
  };
  wrap.append(
    h('div', { class: 'lbl', text: 'Draw your signature' }),
    seg([{ v: '#1B2A6B', t: '🖊 Blue' }, { v: '#111111', t: '✒️ Black' }], color, v => color = v),
    pad,
    h('div', { class: 'racts' },
      h('button', { class: 'btn ghost sm', type: 'button', text: 'Clear', onclick: () => { x.clearRect(0, 0, pad.width, pad.height); inked = false; } }),
      h('button', { class: 'btn ghost sm', type: 'button', text: '📷 Use a photo of it', onclick: () => up.click() }),
      h('button', { class: 'btn sm', type: 'button', text: 'Use this signature ✓', onclick: () => { if (!inked) return; const t = trimToInk(pad); if (t) onDone(t.toDataURL('image/png')); } })),
    h('div', { class: 'hint', text: "Kit saves it on this device only, so next time it's ready. Never online." }), up);
  return wrap;
}

/* ---------- sign: place on page ---------- */
async function signPlacer(ctx) {
  const el = ctx.el.extra; el.innerHTML = '';
  const f = ctx.files[0]; if (!f) return;
  let pdf; try { pdf = await E.openPdf(await E.bytesOf(f)); } catch (e) { ctx.fail(e); ctx.files.length = 0; ctx.refresh(); return; }
  ctx.numPages = pdf.numPages; ctx.spots = []; let page = 0;
  const box = h('div'); const nav = h('div', { class: 'pgbar' }); const placer = h('div', { class: 'placer' });
  el.append(h('div', { class: 'opts' }, opt('Tap where your signature should go', box, 'Drag it to adjust. Add it on as many pages as you like.')));
  box.append(nav, placer);
  async function show() {
    nav.innerHTML = '';
    nav.append(h('button', { class: 'btn ghost sm', type: 'button', text: '‹ Prev', onclick: () => { if (page > 0) { page--; show(); } } }), h('b', { text: `Page ${page + 1} of ${pdf.numPages}` }), h('button', { class: 'btn ghost sm', type: 'button', text: 'Next ›', onclick: () => { if (page < pdf.numPages - 1) { page++; show(); } } }), h('button', { class: 'btn ghost sm', type: 'button', text: 'Last page', onclick: () => { page = pdf.numPages - 1; show(); } }));
    const c = await E.renderPage(pdf, page + 1, 1.4, 900);
    placer.innerHTML = ''; placer.append(c);
    c.onclick = e => {
      if (!ctx.sig) return ctx.toast('Make your signature first ✍️');
      const r = c.getBoundingClientRect(); ctx.spots.push({ page, x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }); spots(); ctx.refresh();
    };
    spots();
  }
  function spots() {
    placer.querySelectorAll('.spot').forEach(s => s.remove());
    ctx.spots.forEach((s, k) => {
      if (s.page !== page) return;
      const d = h('div', { class: 'spot' }, h('img', { src: ctx.sig, alt: 'signature' }), h('button', { type: 'button', text: '×', 'aria-label': 'Remove', onclick: e => { e.stopPropagation(); ctx.spots.splice(k, 1); spots(); ctx.refresh(); } }));
      d.style.left = s.x * 100 + '%'; d.style.top = s.y * 100 + '%'; d.style.width = ctx.opts.sigW * 100 + '%';
      d.onpointerdown = e => {
        if (e.target.tagName === 'BUTTON') return; e.preventDefault(); d.setPointerCapture(e.pointerId);
        const r = placer.getBoundingClientRect();
        d.onpointermove = m => { s.x = Math.min(1, Math.max(0, (m.clientX - r.left) / r.width)); s.y = Math.min(1, Math.max(0, (m.clientY - r.top) / r.height)); d.style.left = s.x * 100 + '%'; d.style.top = s.y * 100 + '%'; };
        d.onpointerup = () => d.onpointermove = null;
      };
      placer.append(d);
    });
  }
  ctx.redrawSpots = spots;
  show();
}

/* ---------- registry ---------- */
const pdfName = (ctx, suffix) => `${E.base(ctx.files[0]?.name || 'paperkit')}-${suffix}.pdf`;
const one = (data, name) => ({ blob: new Blob([data], { type: 'application/pdf' }), name });

export const CATS = [
  ['exam', 'New · only in PaperKit'],
  ['organize', 'Arrange pages'],
  ['convert', 'Shrink & convert'],
  ['edit', 'Sign & mark'],
  ['secure', 'Lock & unlock'],
];

export const TOOLS = [
  {
    id: 'exam', cat: 'exam', ic: '🎓', name: 'Exam mode', star: true, acc: 'cap',
    short: 'Photo, signature and documents at the exact size & KB your exam form asks for.',
    line: "Exam form? Tell me the rules, I'll hit the exact KB.", custom: true,
    how: [['Pick what you need', 'Photo, signature, thumb or documents.'], ['Type the rules', 'Size and KB, straight from your notification.'], ['Upload with confidence', 'Kit checks every rule before you save.']],
    setup: examSetup,
  },
  {
    id: 'merge', cat: 'organize', ic: '🧷', name: 'Merge', acc: '',
    short: 'Join many PDFs (and photos) into one file.',
    line: "Give me a few PDFs. I'll staple them neatly.", accept: 'both', multi: true, list: 'files', cta: 'Merge into one PDF',
    how: [['Add your files', 'PDFs and photos, as many as you like.'], ['Set the order', 'Drag them, or use the arrows.'], ['Merge', 'One tidy PDF comes out.']],
    ready: c => c.files.length >= 2 || 'Add at least 2 files to merge.',
    run: async (c, p) => one(await E.merge(c.files, p), 'merged.pdf'),
  },
  {
    id: 'split', cat: 'organize', ic: '✂️', name: 'Split & extract', acc: 'scissors',
    short: 'Take out the pages you need, remove the ones you don\'t, or cut into parts.',
    line: "Tell me where to cut. I'm good with scissors.", accept: 'pdf', list: 'pages', cta: 'Cut it',
    how: [['Add one PDF', 'Kit shows every page.'], ['Choose how to cut', 'Pick pages, remove pages, or split all.'], ['Save', 'One PDF, or a ZIP of pieces.']],
    defaults: { mode: 'pick', ranges: '' },
    setup(c) {
      const rf = field({ placeholder: 'e.g. 1-3, 5, 8-end', value: c.opts.ranges, oninput: e => { c.opts.ranges = e.target.value; c.refresh(); } });
      const rw = opt('Your ranges', rf, 'Each range becomes its own PDF.'); rw.classList.toggle('hide', c.opts.mode !== 'ranges');
      c.el.opts.append(opt('How should Kit cut?', seg([
        { v: 'pick', t: 'Keep picked pages', s: 'picked → one new PDF' },
        { v: 'remove', t: 'Remove picked pages', s: 'everything else stays' },
        { v: 'each', t: 'Every page apart', s: 'one PDF per page' },
        { v: 'ranges', t: 'By ranges', s: 'like 1-3, 4-10' },
      ], c.opts.mode, v => { c.opts.mode = v; rw.classList.toggle('hide', v !== 'ranges'); c.refresh(); })), rw);
    },
    onFiles: c => pageGrid(c, 'select'),
    ready(c) {
      if (!c.pages) return 'Add a PDF first.';
      const n = c.pages.filter(p => p.sel).length, m = c.opts.mode;
      if ((m === 'pick' || m === 'remove') && !n) return 'Tap the pages you want first.';
      if (m === 'remove' && n === c.pages.length) return "You picked every page. Nothing would be left!";
      if (m === 'ranges' && !c.opts.ranges.trim()) return 'Type your ranges, like 1-3, 5';
      return true;
    },
    async run(c, p) {
      const b = await E.bytesOf(c.files[0]), m = c.opts.mode, picked = c.pages.filter(x => x.sel).map(x => x.i).sort((a, z) => a - z);
      if (m === 'pick') return one(await E.subset(b, picked), pdfName(c, 'pages'));
      if (m === 'remove') return one(await E.subset(b, c.pages.filter(x => !x.sel).map(x => x.i)), pdfName(c, 'trimmed'));
      const groups = m === 'each' ? c.pages.map(x => [x.i]) : E.parseRanges(c.opts.ranges, c.numPages);
      if (groups.length === 1) return one(await E.subset(b, groups[0]), pdfName(c, 'part'));
      const files = [];
      for (let k = 0; k < groups.length; k++) {
        p(k / groups.length, `piece ${k + 1} of ${groups.length}`);
        const g = groups[k]; files.push({ name: `${E.base(c.files[0].name)}-${g.length > 1 ? `p${g[0] + 1}-${g.at(-1) + 1}` : `p${g[0] + 1}`}.pdf`, data: await E.subset(b, g) });
      }
      return { blob: E.zip(files), name: `${E.base(c.files[0].name)}-split.zip`, note: `${files.length} PDFs inside one ZIP` };
    },
  },
  {
    id: 'organize', cat: 'organize', ic: '🧩', name: 'Organize pages', acc: '',
    short: 'Reorder, rotate or delete single pages, all in one view.',
    line: "Shuffle pages like cards. I'll remember the order.", accept: 'pdf', list: 'pages', cta: 'Save new order',
    how: [['Add one PDF', 'Every page appears as a card.'], ['Rearrange', 'Drag, ⟳ rotate, ✕ remove.'], ['Save', 'Your pages, your order.']],
    onFiles: c => pageGrid(c, 'organize'),
    ready: c => !c.pages ? 'Add a PDF first.' : c.pages.every(p => p.gone) ? "You removed every page. Bring one back!" : true,
    run: async c => one(await E.organize(await E.bytesOf(c.files[0]), c.pages.filter(p => !p.gone).map(p => ({ i: p.i, rot: p.rot }))), pdfName(c, 'organized')),
  },
  {
    id: 'rotate', cat: 'organize', ic: '🔄', name: 'Rotate', acc: '',
    short: 'Fix sideways or upside-down pages.',
    line: 'Sideways scan? Let me fix that neck strain.', accept: 'pdf', list: 'pages', cta: 'Rotate pages',
    how: [['Add one PDF', 'See every page.'], ['Choose the turn', 'All pages, or only the ones you tap.'], ['Save', 'Straight pages, same quality.']],
    defaults: { deg: 90 },
    setup(c) { c.el.opts.append(opt('Turn by', seg([{ v: 90, t: '↻ 90° right' }, { v: 180, t: '↕ 180° flip' }, { v: 270, t: '↺ 90° left' }], c.opts.deg, v => c.opts.deg = v), 'No pages picked = Kit turns every page.')); },
    onFiles: c => pageGrid(c, 'rotate'),
    ready: c => c.pages ? true : 'Add a PDF first.',
    run: async c => { const any = c.pages.some(p => p.sel); return one(await E.organize(await E.bytesOf(c.files[0]), c.pages.map(p => ({ i: p.i, rot: !any || p.sel ? c.opts.deg : 0 }))), pdfName(c, 'rotated')); },
  },
  {
    id: 'compress', cat: 'convert', ic: '🗜️', name: 'Compress', acc: '',
    short: 'Make a PDF smaller so it uploads and sends easily.',
    line: "I'll squeeze it. You choose how hard.", accept: 'pdf', list: 'single', cta: 'Squeeze it',
    how: [['Add one PDF', 'Any size.'], ['Choose how hard', 'Light keeps everything. Strong goes smallest.'], ['Save', 'Kit shows how much you saved.']],
    defaults: { level: 'balanced' },
    setup(c) {
      c.el.opts.append(opt('How hard should Kit squeeze?', seg([
        { v: 'light', t: 'Light', s: 'perfect quality, text stays selectable' },
        { v: 'balanced', t: 'Balanced', s: 'much smaller, still clear' },
        { v: 'strong', t: 'Strong', s: 'smallest, for strict upload limits' },
      ], c.opts.level, v => c.opts.level = v), 'Balanced and Strong turn pages into light images, so text can no longer be selected. Light never changes how anything looks.'));
    },
    ready: c => c.files.length ? true : 'Add a PDF first.',
    async run(c, p) {
      const b = await E.bytesOf(c.files[0]); let out = await E.compress(b, c.opts.level, p);
      if (c.opts.level !== 'light' && out.length >= b.length * .9) { // mostly text? the lossless squeeze may win and keeps text selectable
        const lossless = await E.squeezeLossless(b).catch(() => null);
        if (lossless && lossless.length < out.length) out = lossless;
      }
      if (out.length >= b.length) return { ...one(b, c.files[0].name), say: "It was already as light as it gets. I kept the original. 🪶", same: true };
      return one(out, pdfName(c, 'small'));
    },
  },
  {
    id: 'images-to-pdf', cat: 'convert', ic: '🖼️', name: 'Images → PDF', acc: '',
    short: 'Turn photos (JPG, PNG, iPhone HEIC) into one PDF.',
    line: 'Photos in, one tidy PDF out.', accept: 'images', multi: true, list: 'files', cta: 'Make my PDF',
    how: [['Add photos', 'From gallery, files or camera.'], ['Order & page size', 'A4 is what most forms want.'], ['Make PDF', 'Every photo becomes a page.']],
    defaults: { size: 'a4', margin: 0 },
    setup: c => pageSizeOpts(c),
    ready: c => c.files.length ? true : 'Add at least one photo.',
    run: async (c, p) => one(await E.imagesToPdf(c.files, { size: c.opts.size, margin: c.opts.margin }, p), `${E.base(c.files[0].name)}${c.files.length > 1 ? '-and-more' : ''}.pdf`),
  },
  {
    id: 'scan', cat: 'convert', ic: '📷', name: 'Scan to PDF', acc: 'camera',
    short: 'Use your phone camera to scan papers into a clean PDF.',
    line: 'Point your camera at the paper. I\'ll make it look scanned.', accept: 'images', multi: true, list: 'files', camera: true, cta: 'Make scanned PDF',
    how: [['Snap each page', 'Hold the phone straight above the paper.'], ['Clean look on', 'Kit whitens the paper, darkens the text.'], ['Save PDF', 'Looks like it came from a scanner.']],
    defaults: { size: 'a4', margin: 0, clean: true },
    setup(c) {
      const cb = h('input', { type: 'checkbox', checked: c.opts.clean, onchange: e => c.opts.clean = e.target.checked });
      c.el.opts.append(opt('Scanner look', h('label', { class: 'check' }, cb, h('span', { text: 'Whiten paper & sharpen text' }))));
      pageSizeOpts(c);
    },
    ready: c => c.files.length ? true : 'Snap or add at least one page.',
    async run(c, p) {
      let files = c.files;
      if (c.opts.clean) {
        files = [];
        for (const f of c.files) {
          const src = E.drawToCanvas(await E.bitmapOf(f), 2600); const out = document.createElement('canvas'); out.width = src.width; out.height = src.height;
          const x = out.getContext('2d'); x.filter = 'grayscale(1) contrast(1.55) brightness(1.12)'; x.drawImage(src, 0, 0);
          files.push(new File([await E.canvasBytes(out, 'image/jpeg', .85)], f.name, { type: 'image/jpeg' }));
        }
      }
      return one(await E.imagesToPdf(files, { size: c.opts.size, margin: c.opts.margin }, p), 'scan.pdf');
    },
  },
  {
    id: 'pdf-to-images', cat: 'convert', ic: '🖼', name: 'PDF → Images', acc: '',
    short: 'Save every page as a JPG or PNG photo.',
    line: 'Every page becomes a photo. Gallery-ready.', accept: 'pdf', list: 'single', cta: 'Make images',
    how: [['Add one PDF', 'Any number of pages.'], ['Pick format & sharpness', 'JPG is smaller, PNG is crisper.'], ['Save', 'One image, or a ZIP of all pages.']],
    defaults: { type: 'image/jpeg', scale: 2 },
    setup(c) {
      c.el.opts.append(opt('Format', seg([{ v: 'image/jpeg', t: 'JPG', s: 'smaller files' }, { v: 'image/png', t: 'PNG', s: 'crisp text' }], c.opts.type, v => c.opts.type = v)),
        opt('Sharpness', seg([{ v: 1.5, t: 'Good', s: 'for WhatsApp' }, { v: 2, t: 'Sharp', s: 'for screens' }, { v: 3, t: 'Print', s: 'big & detailed' }], c.opts.scale, v => c.opts.scale = v)));
    },
    ready: c => c.files.length ? true : 'Add a PDF first.',
    async run(c, p) {
      const imgs = await E.pdfToImages(await E.bytesOf(c.files[0]), { type: c.opts.type, scale: c.opts.scale }, p);
      const ext = c.opts.type === 'image/png' ? 'png' : 'jpg', b = E.base(c.files[0].name);
      if (imgs.length === 1) return { blob: new Blob([imgs[0].data], { type: c.opts.type }), name: `${b}.${ext}` };
      return { blob: E.zip(imgs.map(i => ({ name: `${b}-page-${String(i.n).padStart(3, '0')}.${ext}`, data: i.data }))), name: `${b}-images.zip`, note: `${imgs.length} images inside one ZIP` };
    },
  },
  {
    id: 'ocr', cat: 'convert', ic: '🔎', name: 'OCR · make text searchable', acc: 'glasses',
    short: 'Scanned pages or photos → PDF you can search & copy text from. Tamil too.',
    line: 'Scanned page? Let me put my reading glasses on.', accept: 'both', multi: true, list: 'files', cta: 'Read it',
    how: [['Add scans or photos', 'PDF or images.'], ['Pick the language', 'English, Tamil, Hindi, or a mix.'], ['Get text', 'Searchable PDF + text you can copy.']],
    defaults: { lang: 'eng+tam' },
    setup(c) {
      c.el.opts.append(opt('Language on the page', seg([{ v: 'eng', t: 'English' }, { v: 'tam', t: 'தமிழ் Tamil' }, { v: 'eng+tam', t: 'English + Tamil' }, { v: 'hin+eng', t: 'हिन्दी + English' }], c.opts.lang, v => c.opts.lang = v),
        'The first time, Kit downloads its "reading glasses" for that language (a few MB). Your file itself never leaves this device.'));
    },
    ready: c => c.files.length ? true : 'Add a scan or photo first.',
    async run(c, p) { const r = await E.ocr(c.files, c.opts.lang, p); return { ...one(r.data, `${E.base(c.files[0].name)}-searchable.pdf`), text: r.text }; },
  },
  {
    id: 'sign', cat: 'edit', ic: '✍️', name: 'Sign', acc: 'pen',
    short: 'Draw your signature once, then drop it anywhere on any page.',
    line: 'Draw your sign once. I keep it here, not online.', accept: 'pdf', list: 'single', cta: 'Sign the PDF', optsFirst: true,
    how: [['Add the PDF', 'The one that needs your sign.'], ['Draw or snap your signature', 'Saved on this device only.'], ['Tap to place', 'Drag to adjust, then save.']],
    defaults: { sigW: .26 },
    setup(c) {
      c.sig = store.get('sig', null);
      const area = h('div');
      const render = () => {
        area.innerHTML = '';
        if (c.sig) {
          const sizer = h('input', { type: 'range', min: '0.1', max: '0.6', step: '0.01', value: c.opts.sigW, oninput: e => { c.opts.sigW = +e.target.value; c.redrawSpots?.(); } });
          area.append(opt('Your signature', h('div', { class: 'sigprev' }, h('img', { src: c.sig, alt: 'your signature' }))),
            h('div', { class: 'racts' },
              h('button', { class: 'btn ghost sm', type: 'button', text: '✏️ Redo', onclick: () => { c.sig = null; render(); } }),
              h('button', { class: 'btn ghost sm', type: 'button', text: '🗑 Forget it on this device', onclick: () => { store.del('sig'); c.sig = null; render(); c.toast('Gone. Kit forgot it.'); } })),
            opt('Signature size', sizer));
        } else area.append(signatureMaker(url => { c.sig = url; store.set('sig', url); render(); c.say('Nice signature! Now tap where it goes. 👇'); c.redrawSpots?.(); c.refresh(); }));
      };
      render(); c.el.opts.append(area);
    },
    onFiles: c => signPlacer(c),
    ready: c => !c.files.length ? 'Add a PDF first.' : !c.sig ? 'Make your signature first.' : !(c.spots || []).length ? 'Tap on the page where it should go.' : true,
    async run(c) { const png = Uint8Array.from(atob(c.sig.split(',')[1]), ch => ch.charCodeAt(0)); return one(await E.sign(await E.bytesOf(c.files[0]), png, c.spots.map(s => ({ ...s, w: c.opts.sigW }))), pdfName(c, 'signed')); },
  },
  {
    id: 'watermark', cat: 'edit', ic: '💧', name: 'Watermark', acc: '',
    short: 'Stamp your name or logo across every page.',
    line: 'Your name on every page. Copycats, beware.', accept: 'pdf', list: 'single', cta: 'Stamp it',
    how: [['Add the PDF', 'Any PDF.'], ['Type text or add a logo', 'Any language works, even emoji.'], ['Save', 'Every page gets stamped.']],
    defaults: { text: 'CONFIDENTIAL', opacity: .22, size: .6, tile: false, angle: 35, color: '#E5484D' },
    setup(c) {
      const logoIn = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', class: 'hide', onchange: e => { c.opts.logo = e.target.files[0] || null; lname.textContent = c.opts.logo ? `Logo: ${c.opts.logo.name}` : ''; } });
      const lname = h('span', { class: 'hint' });
      c.el.opts.append(
        opt('Text', field({ value: c.opts.text, maxlength: 60, oninput: e => { c.opts.text = e.target.value; c.refresh(); } })),
        h('div', { class: 'racts' }, h('button', { class: 'btn ghost sm', type: 'button', text: '🖼 Use a logo instead', onclick: () => logoIn.click() }), lname, logoIn),
        opt('Colour', seg([{ v: '#E5484D', t: '🔴 Red' }, { v: '#6B7280', t: '⚪ Grey' }, { v: '#2563EB', t: '🔵 Blue' }, { v: '#111111', t: '⚫ Black' }], c.opts.color, v => c.opts.color = v)),
        opt('Layout', seg([{ v: false, t: 'Once, in the middle' }, { v: true, t: 'Tiled all over' }], c.opts.tile, v => c.opts.tile = v)),
        opt('Angle', seg([{ v: 35, t: '⟋ Diagonal' }, { v: 0, t: '— Straight' }], c.opts.angle, v => c.opts.angle = v)),
        h('div', { class: 'row2' },
          opt('See-through', h('input', { type: 'range', min: '0.08', max: '0.8', step: '0.02', value: c.opts.opacity, oninput: e => c.opts.opacity = +e.target.value })),
          opt('Size', h('input', { type: 'range', min: '0.2', max: '1', step: '0.05', value: c.opts.size, oninput: e => c.opts.size = +e.target.value }))));
    },
    ready: c => !c.files.length ? 'Add a PDF first.' : (!c.opts.text.trim() && !c.opts.logo) ? 'Type some text or add a logo.' : true,
    run: async c => one(await E.watermark(await E.bytesOf(c.files[0]), c.opts), pdfName(c, 'watermarked')),
  },
  {
    id: 'page-numbers', cat: 'edit', ic: '🔢', name: 'Page numbers', acc: '',
    short: 'Add 1, 2, 3… to every page, where you want.',
    line: "1, 2, 3… I never skip. I never lose count.", accept: 'pdf', list: 'single', cta: 'Add numbers',
    how: [['Add the PDF', 'Any PDF.'], ['Pick spot & style', '"3", "3 / 10" or "Page 3 of 10".'], ['Save', 'Numbered neatly.']],
    defaults: { pos: 'bc', style: 'n', start: 1, size: 11 },
    setup(c) {
      c.el.opts.append(
        opt('Where', seg([{ v: 'bl', t: '↙ Bottom left' }, { v: 'bc', t: '↓ Bottom middle' }, { v: 'br', t: '↘ Bottom right' }, { v: 'tl', t: '↖ Top left' }, { v: 'tc', t: '↑ Top middle' }, { v: 'tr', t: '↗ Top right' }], c.opts.pos, v => c.opts.pos = v)),
        opt('Style', seg([{ v: 'n', t: '3' }, { v: 'nN', t: '3 / 10' }, { v: 'full', t: 'Page 3 of 10' }], c.opts.style, v => c.opts.style = v)),
        h('div', { class: 'row2' },
          opt('Start counting at', field({ type: 'number', min: '0', value: c.opts.start, inputmode: 'numeric', oninput: e => c.opts.start = Math.max(0, parseInt(e.target.value) || 1) })),
          opt('Text size', seg([{ v: 9, t: 'S' }, { v: 11, t: 'M' }, { v: 14, t: 'L' }], c.opts.size, v => c.opts.size = v))));
    },
    ready: c => c.files.length ? true : 'Add a PDF first.',
    run: async c => one(await E.pageNumbers(await E.bytesOf(c.files[0]), c.opts), pdfName(c, 'numbered')),
  },
  {
    id: 'flatten', cat: 'edit', ic: '🧊', name: 'Flatten form', acc: '',
    short: 'Lock filled-in form fields so nobody can change them.',
    line: 'Filled the form? I\'ll freeze the answers in place.', accept: 'pdf', list: 'single', cta: 'Freeze answers',
    how: [['Add a filled form', 'A PDF with typed-in fields.'], ['Tap Freeze', 'Fields become normal text.'], ['Save', 'Answers can\'t be edited anymore.']],
    ready: c => c.files.length ? true : 'Add a PDF first.',
    async run(c) { const r = await E.flatten(await E.bytesOf(c.files[0])); return { ...one(r.data, pdfName(c, 'flat')), say: r.fields ? `Froze ${r.fields} field${r.fields > 1 ? 's' : ''}. No more edits. 🧊` : 'No form fields here, but it\'s saved and clean. 👍' }; },
  },
  {
    id: 'protect', cat: 'secure', ic: '🔐', name: 'Protect with password', acc: 'lock',
    short: 'Lock a PDF so only people with the password can open it.',
    line: 'Lock it with a password only you know. Not even me.', accept: 'pdf', list: 'single', cta: 'Lock it',
    how: [['Add the PDF', 'Bank statements, IDs, anything private.'], ['Set a password', 'Strong AES-256 lock.'], ['Save', 'It asks for the password every time.']],
    defaults: { pw: '', pw2: '' },
    setup(c) {
      const meter = h('div', { class: 'hint' });
      const upd = () => { const s = c.opts.pw; meter.textContent = !s ? 'Use 8+ characters. Mix words and numbers.' : s.length < 6 ? '😬 Too short, easy to guess.' : s.length < 10 ? '🙂 Okay. Longer is safer.' : '💪 Strong.'; c.refresh(); };
      c.el.opts.append(
        opt('Password', field({ type: 'password', autocomplete: 'new-password', oninput: e => { c.opts.pw = e.target.value; upd(); } })),
        opt('Type it again', field({ type: 'password', autocomplete: 'new-password', oninput: e => { c.opts.pw2 = e.target.value; c.refresh(); } })), meter,
        h('div', { class: 'hint', text: "⚠️ If you forget it, nobody can open the file. Not you, not Kit. Write it down somewhere safe." }));
      upd();
    },
    ready: c => !c.files.length ? 'Add a PDF first.' : c.opts.pw.length < 4 ? 'Password needs at least 4 characters.' : c.opts.pw !== c.opts.pw2 ? "The two passwords don't match yet." : true,
    run: async c => one(await E.protect(await E.bytesOf(c.files[0]), c.opts.pw), pdfName(c, 'locked')),
  },
  {
    id: 'unlock', cat: 'secure', ic: '🔓', name: 'Unlock', acc: 'key',
    short: 'Remove the password from a PDF you can already open.',
    line: 'Know the password? I\'ll take the lock off for good.', accept: 'pdf', list: 'single', cta: 'Unlock it',
    how: [['Add the locked PDF', 'Like e-statements from your bank.'], ['Type its password', 'The one you already use to open it.'], ['Save', 'No more password prompts.']],
    defaults: { pw: '' },
    setup(c) { c.el.opts.append(opt('Its password', field({ type: 'password', autocomplete: 'off', oninput: e => { c.opts.pw = e.target.value; c.refresh(); } }), "Kit can only unlock files you're allowed to open. No guessing, no cracking.")); },
    ready: c => c.files.length ? true : 'Add a locked PDF first.',
    run: async c => one(await E.unlock(await E.bytesOf(c.files[0]), c.opts.pw), pdfName(c, 'unlocked')),
  },
];

function pageSizeOpts(c) {
  c.el.opts.append(
    opt('Page size', seg([{ v: 'a4', t: 'A4', s: 'most forms' }, { v: 'letter', t: 'Letter', s: 'US size' }, { v: 'fit', t: 'Same as photo', s: 'no white borders' }], c.opts.size, v => c.opts.size = v)),
    opt('Margin', seg([{ v: 0, t: 'None' }, { v: 18, t: 'Small' }, { v: 40, t: 'Big' }], c.opts.margin, v => c.opts.margin = v)));
}

/* ================= EXAM MODE ================= */
const KINDS = {
  photo: { t: '🧑 Photo', w: 3.5, h: 4.5, unit: 'cm', min: '', max: '', clean: false, strip: false },
  sign: { t: '✍️ Signature', w: 3.5, h: 1.5, unit: 'cm', min: '', max: '', clean: true },
  thumb: { t: '👍 Thumb impression', w: 3, h: 3, unit: 'cm', min: '', max: '', clean: true },
  decl: { t: '📝 Declaration', w: 10, h: 5, unit: 'cm', min: '', max: '', clean: true },
};
const DPI = 200;
function examSetup(c) {
  const host = c.el.extra; host.innerHTML = '';
  let tab = 'image';
  const cards = h('div', { class: 'ecards' });
  const panel = h('div');
  const card = (id, ic, t, s) => { const b = h('button', { type: 'button', class: 'ecard' + (tab === id ? ' on' : '') }, h('span', { class: 'ic', text: ic }), h('b', { text: t }), h('small', { text: s })); b.onclick = () => { tab = id; cards.querySelectorAll('.ecard').forEach(x => x.classList.remove('on')); b.classList.add('on'); draw(); }; return b; };
  cards.append(card('image', '🧑', 'Photo / signature', 'Exact size and exact KB for the form.'), card('docs', '📚', 'Documents → one PDF', 'Certificates merged and squeezed under the limit.'), card('help', '🧭', 'Where are the rules?', 'How to find sizes in your notification.'));
  host.append(cards, panel);
  const draw = () => { panel.innerHTML = ''; (tab === 'image' ? examImage : tab === 'docs' ? examDocs : examHelp)(c, panel); };
  draw();
}

function examHelp(c, el) {
  el.append(h('div', { class: 'opts' },
    h('div', { class: 'lbl', text: '🧭 Find the rules in 1 minute' }),
    ...[
      ['1. Open the official notification PDF', 'Download it only from the exam board\'s own website.'],
      ['2. Search inside it', 'Press Ctrl + F (or "Find in page") and type "KB" or "photograph".'],
      ['3. Note 4 things', 'Width, height (cm or pixels), minimum KB, maximum KB.'],
      ['4. Type them into Kit', 'Kit makes the image fit every rule and shows ✓ checks.'],
    ].map(([b, s]) => h('div', { class: 'how one' },h('div', {}, h('b', { text: b }), document.createTextNode(s)))),
    h('div', { class: 'hint', text: 'Why no ready-made presets? Exam rules change every year. Kit would rather follow your official notification than guess.' })));
}

function examImage(c, el) {
  let kind = store.get('exam.kind', 'photo');
  let cfg = { ...KINDS[kind], ...store.get('exam.' + kind, {}) };
  let bmp = null, crop = null;
  const box = h('div', { class: 'opts' });
  const out = h('div');
  el.append(box, out);
  const save = () => store.set('exam.' + kind, { w: cfg.w, h: cfg.h, unit: cfg.unit, min: cfg.min, max: cfg.max, clean: cfg.clean, strip: cfg.strip, name: cfg.name });
  function px() { const k = cfg.unit === 'px' ? 1 : cfg.unit === 'cm' ? DPI / 2.54 : DPI / 25.4; return [Math.max(10, Math.round(cfg.w * k)), Math.max(10, Math.round(cfg.h * k))]; }
  function draw() {
    box.innerHTML = ''; out.innerHTML = '';
    box.append(opt('What are you making?', seg(Object.entries(KINDS).map(([v, k]) => ({ v, t: k.t })), kind, v => { kind = v; store.set('exam.kind', v); cfg = { ...KINDS[v], ...store.get('exam.' + v, {}) }; crop = null; draw(); })));
    const num = (k, ph) => field({ type: 'number', step: 'any', min: '0', inputmode: 'decimal', placeholder: ph, value: cfg[k], oninput: e => { cfg[k] = e.target.value === '' ? '' : +e.target.value; save(); dims.textContent = info(); if (k === 'w' || k === 'h') crop?.setAspect(aspect()); } });
    const info = () => { const [w, hh] = px(); return `Kit will make it ${w} × ${hh} px${cfg.unit !== 'px' ? ` (${cfg.w} × ${cfg.h} ${cfg.unit} at ${DPI} DPI)` : ''}.`; };
    const dims = h('div', { class: 'hint', text: info() });
    box.append(
      h('div', { class: 'lbl', text: 'Rules from your notification' }),
      h('div', { class: 'row4' },
        h('label', {}, 'Width', num('w', 'e.g. 3.5')), h('label', {}, 'Height', num('h', 'e.g. 4.5')),
        h('label', {}, 'Min KB', num('min', 'e.g. 20')), h('label', {}, 'Max KB', num('max', 'e.g. 50'))),
      seg([{ v: 'cm', t: 'cm' }, { v: 'mm', t: 'mm' }, { v: 'px', t: 'pixels' }], cfg.unit, v => { cfg.unit = v; save(); dims.textContent = info(); crop?.setAspect(aspect()); }),
      dims);
    if (kind === 'photo') {
      const nm = field({ placeholder: 'Your name (as in the form)', value: cfg.name || '', oninput: e => { cfg.name = e.target.value; save(); } });
      const cb = h('input', { type: 'checkbox', checked: !!cfg.strip, onchange: e => { cfg.strip = e.target.checked; nm.classList.toggle('hide', !cfg.strip); save(); crop?.setAspect(aspect()); } });
      nm.classList.toggle('hide', !cfg.strip);
      box.append(opt('Name & date on photo', h('label', { class: 'check' }, cb, h('span', { text: 'Add a white strip with name and today\'s date' })), 'Only if your notification asks for it.'), nm);
    } else {
      const cb = h('input', { type: 'checkbox', checked: !!cfg.clean, onchange: e => { cfg.clean = e.target.checked; save(); } });
      box.append(opt('Clean paper', h('label', { class: 'check' }, cb, h('span', { text: 'White background, dark ink (best for phone photos)' }))));
    }
    const pick = h('input', { type: 'file', accept: 'image/*', class: 'hide' });
    pick.onchange = async () => { const f = pick.files[0]; if (!f) return; try { bmp = await E.bitmapOf(f); c.ate(f.name); crop = null; drawCrop(); } catch (e) { c.fail(e); } };
    const camera = h('input', { type: 'file', accept: 'image/*', capture: kind === 'photo' ? 'user' : 'environment', class: 'hide' });
    camera.addEventListener('change', async () => { const f = camera.files[0]; if (f) { bmp = await E.bitmapOf(f); c.ate(f.name); crop = null; drawCrop(); } });
    box.append(h('div', { class: 'racts' }, h('button', { class: 'btn', type: 'button', text: bmp ? '🔁 Choose another' : '📁 Choose image', onclick: () => pick.click() }), h('button', { class: 'btn ghost', type: 'button', text: '📸 Take photo', onclick: () => camera.click() })), pick, camera);
    if (bmp) drawCrop();
  }
  function aspect() { const [w, hh] = px(); return cfg.strip && kind === 'photo' ? w / (hh * .82) : w / hh; }
  function drawCrop() {
    out.innerHTML = '';
    const wrapper = h('div', { class: 'opts' });
    wrapper.append(h('div', { class: 'lbl', text: 'Drag to position · slide to zoom' }));
    crop = cropper(wrapper, bmp, aspect());
    const btn = h('button', { class: 'btn', type: 'button', text: '✨ Make it fit the rules' });
    btn.onclick = () => c.job(async (p) => {
      if (!cfg.max) throw new Error('Type the Max KB from your notification first.');
      if (cfg.min && +cfg.min >= +cfg.max) throw new Error('Min KB should be smaller than Max KB.');
      const [w, hh] = px(); p(.2, 'cropping to size');
      const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = hh;
      const x = canvas.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, hh);
      const ph = cfg.strip && kind === 'photo' ? Math.round(hh * .82) : hh;
      crop.renderTo(x, w, ph);
      if (kind !== 'photo' && cfg.clean) E.inkClean(canvas);
      if (cfg.strip && kind === 'photo') {
        x.fillStyle = '#fff'; x.fillRect(0, ph, w, hh - ph); x.fillStyle = '#111'; x.textAlign = 'center'; x.textBaseline = 'middle';
        const fs = Math.max(8, Math.round((hh - ph) * .36)); x.font = `700 ${fs}px "Bricolage Grotesque", system-ui, sans-serif`;
        const d = new Date(), date = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
        x.fillText((cfg.name || '').toUpperCase().slice(0, 40), w / 2, ph + (hh - ph) * .33, w - 6);
        x.font = `600 ${Math.round(fs * .85)}px "Bricolage Grotesque", system-ui, sans-serif`; x.fillText(date, w / 2, ph + (hh - ph) * .72, w - 6);
      }
      p(.6, 'finding the perfect KB');
      const r = await E.jpegInRange(canvas, +cfg.min || 0, +cfg.max);
      const kb = r.bytes.length / 1024;
      return {
        blob: new Blob([r.bytes], { type: 'image/jpeg' }), name: `${kind}_${w}x${hh}.jpg`,
        say: `${Math.round(kb)} KB, ${w} × ${hh} px. Inside your limits. 🎓`,
        checks: [
          ['File size', `${kb.toFixed(1)} KB`, kb <= +cfg.max && kb >= (+cfg.min || 0)],
          ['Allowed', `${cfg.min || 0}–${cfg.max} KB`, true],
          ['Dimensions', `${w} × ${hh} px`, true],
          ['Format', 'JPG', true],
          ...(r.padded ? [['Note', 'Tiny image, padded to reach minimum KB', true]] : []),
        ],
        meter: { min: +cfg.min || 0, max: +cfg.max, val: kb },
      };
    });
    wrapper.append(btn); out.append(wrapper);
  }
  draw();
}

function cropper(host, bmp, aspect) {
  const box = h('div', { class: 'crop' }); const cv = h('canvas'); box.append(cv, h('div', { class: 'frame' })); host.append(box);
  const zoom = h('input', { type: 'range', min: '1', max: '4', step: '0.01', value: '1', 'aria-label': 'Zoom' }); host.append(zoom);
  let W, H, s0, s, tx, ty;
  const dpr = Math.min(2, devicePixelRatio || 1);
  function layout(a) {
    W = Math.min(host.clientWidth || 320, a >= 1 ? 420 : 300); H = W / a;
    if (H > 380) { H = 380; W = H * a; }
    box.style.width = W + 'px'; box.style.height = H + 'px'; cv.width = W * dpr; cv.height = H * dpr;
    s0 = Math.max(W / bmp.width, H / bmp.height); s = s0 * +zoom.value; tx = (W - bmp.width * s) / 2; ty = (H - bmp.height * s) / 2; clamp(); paint();
  }
  function clamp() { tx = Math.min(0, Math.max(W - bmp.width * s, tx)); ty = Math.min(0, Math.max(H - bmp.height * s, ty)); }
  function paint() { const x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.fillStyle = '#fff'; x.fillRect(0, 0, W, H); x.drawImage(bmp, tx, ty, bmp.width * s, bmp.height * s); }
  zoom.oninput = () => { const cx = (W / 2 - tx) / s, cy = (H / 2 - ty) / s; s = s0 * +zoom.value; tx = W / 2 - cx * s; ty = H / 2 - cy * s; clamp(); paint(); };
  box.onpointerdown = e => { box.setPointerCapture(e.pointerId); let lx = e.clientX, ly = e.clientY; box.onpointermove = m => { tx += m.clientX - lx; ty += m.clientY - ly; lx = m.clientX; ly = m.clientY; clamp(); paint(); }; box.onpointerup = () => box.onpointermove = null; };
  box.onwheel = e => { e.preventDefault(); zoom.value = Math.min(4, Math.max(1, +zoom.value - e.deltaY * .002)); zoom.oninput(); };
  requestAnimationFrame(() => layout(aspect));
  return {
    setAspect: a => layout(a),
    renderTo(x, w, hh) { const k = w / W; x.imageSmoothingQuality = 'high'; x.drawImage(bmp, tx * k, ty * k, bmp.width * s * k, bmp.height * s * k); void hh; },
  };
}

function examDocs(c, el) {
  const files = [];
  let maxKB = store.get('exam.docsMax', '');
  const list = h('div', { class: 'files' });
  const input = h('input', { type: 'file', accept: '.pdf,application/pdf,image/*', multiple: true, class: 'hide' });
  input.onchange = () => { for (const f of input.files) files.push(f); c.ate(input.files[0]?.name || 'files'); input.value = ''; drawList(); };
  const drawList = () => {
    list.innerHTML = '';
    files.forEach((f, k) => list.append(h('div', { class: 'frow' }, h('div', { class: 'th', text: E.isPdf(f) ? 'PDF' : 'IMG' }), h('div', { class: 'fi' }, h('b', { text: f.name }), h('small', { text: E.fmt(f.size) })),
      h('div', { class: 'acts' }, h('button', { class: 'icon-btn', type: 'button', text: '↑', 'aria-label': 'Move up', onclick: () => { if (k) { [files[k - 1], files[k]] = [files[k], files[k - 1]]; drawList(); } } }), h('button', { class: 'icon-btn', type: 'button', text: '✕', 'aria-label': 'Remove', onclick: () => { files.splice(k, 1); drawList(); } })))));
  };
  el.append(h('div', { class: 'opts' },
    opt('Max size for the final PDF (KB)', field({ type: 'number', min: '10', inputmode: 'numeric', placeholder: 'e.g. 300', value: maxKB, oninput: e => { maxKB = e.target.value; store.set('exam.docsMax', maxKB); } }), 'From your notification. Kit squeezes until it fits.'),
    h('div', { class: 'zone mini', onclick: () => input.click() }, h('span', { class: 'zi', text: '📚' }), h('b', { text: 'Add certificates (PDF or photos)' })), input, list,
    h('button', { class: 'btn', type: 'button', text: '📦 Merge & fit under the limit', onclick: () => c.job(async p => {
      if (!files.length) throw new Error('Add your certificates first.');
      if (!(+maxKB > 0)) throw new Error('Type the max KB from your notification.');
      p(.1, 'stapling pages together');
      const merged = await E.merge(files);
      const fit = await E.fitUnder(merged, maxKB * 1024, p);
      return { blob: new Blob([fit], { type: 'application/pdf' }), name: 'documents.pdf', say: `${E.fmt(fit.length)}, under your ${maxKB} KB limit. 🎓`, checks: [['File size', E.fmt(fit.length), fit.length <= maxKB * 1024], ['Limit', `${maxKB} KB`, true], ['Files inside', String(files.length), true]] };
    }) })));
}
