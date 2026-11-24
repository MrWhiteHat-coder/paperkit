// PaperKit app — routing, Kit's reactions, and the result card.
import * as K from './kit.js';
import * as E from './engine.js';
import { TOOLS, CATS, h, esc } from './tools.js';

const REPO = 'https://github.com/MrWhiteHat-coder/paperkit';
const view = document.getElementById('view');
let pending = [];      // files waiting for a job (drop on home, share target, "use in another tool")
let gen = 0;           // bumps on every page change, so old async work knows to stop
let ctx = null;        // the open tool
let installEvt = null;
const IOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const STANDALONE = matchMedia('(display-mode: standalone)').matches || navigator.standalone;

/* ---------- helpers ---------- */
let toastT;
function toast(t) { const el = document.getElementById('toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), 2600); }
const pickOne = a => a[Math.floor(Math.random() * a.length)];
function download(blob, name) {
  const a = h('a', { href: URL.createObjectURL(blob), download: E.safeName(name) });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}
function accepts(t, f) { return t.accept === 'pdf' ? E.isPdf(f) : t.accept === 'images' ? E.isImage(f) : (E.isPdf(f) || E.isImage(f)); }
async function pdfThumb(f, el, side = 96) {
  try { const pdf = await E.openPdf(await E.bytesOf(f)); const c = await E.renderPage(pdf, 1, 1, side); el.textContent = ''; el.append(c); const n = pdf.numPages; E.closePdf(pdf); return n; }
  catch (e) { el.textContent = e.locked ? '🔒' : 'PDF'; return e.locked ? 'locked' : null; }
}

/* ---------- routing ---------- */
if (location.protocol.startsWith('http') && !/^\/(index\.html)?$/.test(location.pathname)) {
  const id = location.pathname.replace(/^\/+|\/+$/g, '').split('/')[0];
  history.replaceState(null, '', '/' + location.search + '#/' + id);
}
addEventListener('hashchange', route);
function route() {
  gen++; ctx = null;
  if (!K.isBusy()) { K.setMood('idle'); K.setAcc(''); K.belly(0); }
  const id = location.hash.replace(/^#\/?/, '').split(/[/?]/)[0];
  const t = TOOLS.find(x => x.id === id);
  if (id === 'pick' && pending.length) pickView(); else if (t) toolView(t); else home();
  scrollTo({ top: 0, behavior: 'instant' });
  view.focus({ preventScroll: true });
}

/* ---------- home ---------- */
function home() {
  document.title = 'PaperKit · PDF tools that never upload your files';
  K.say(K.TOUCH ? "Hey, I'm Kit. 👋 Tap a job and give me a file. I never peek." : "Hey, I'm Kit. 👋 Pick a job, or drop a file anywhere. I never peek.");
  K.log(K.TOUCH ? 'psst… poke me. I don’t bite. 👀' : 'psst… move your mouse. I’m watching. 👀');
  view.innerHTML = '';
  const w = h('div', { class: 'wrapc' });
  const h1 = h('h1'); h1.innerHTML = 'Your PDFs <em>never leave</em><br>your device.';
  w.append(h('div', { class: 'kicker', text: 'Free · Private · Works offline' }), h1,
    h('p', { class: 'lead', text: 'Merge, compress, sign, lock, OCR and exam-ready photos. Kit does every job right here in your browser. No upload. No sign-up. No watermark.' }),
    h('div', { class: 'steps3' },
      ...[['Pick a job', 'Tap any card below.'], ['Give Kit your file', 'Drop it, choose it, or share it to PaperKit.'], ['Save it', 'Done in seconds. Nothing was uploaded.']]
        .map(([b, s], i) => h('div', {}, h('b', {}, h('span', { text: String(i + 1) }), b), document.createTextNode(s)))));
  for (const [cat, label] of CATS) {
    const grid = h('div', { class: 'tools' });
    for (const t of TOOLS.filter(x => x.cat === cat)) {
      const a = h('a', { class: 'tool' + (t.star ? ' star' : ''), href: `#/${t.id}` }, h('span', { class: 'ic', text: t.ic }), h('b', { text: t.name }), h('small', { text: t.short }));
      if (t.star) a.append(h('span', { class: 'tag', text: 'NEW' }));
      a.onmouseenter = a.onfocus = () => { if (K.isBusy()) return; K.setMood('curious'); K.setAcc(t.acc); K.say(t.line); };
      a.onmouseleave = a.onblur = () => { if (K.isBusy()) return; K.setMood('idle'); K.setAcc(''); };
      grid.append(a);
    }
    w.append(h('section', { class: 'cat' }, h('h3', { text: label }), grid));
  }
  // install
  const ib = h('div', { class: 'band' });
  const it = h('div', {}, h('h2', { text: '📲 Keep Kit on your home screen' }), h('p', { text: 'One tap to open, works with no internet, and you can share any PDF straight to PaperKit from WhatsApp, Files or Gmail.' }));
  const btn = h('button', { class: 'btn', type: 'button', text: 'Install PaperKit' });
  btn.onclick = async () => {
    if (installEvt) { installEvt.prompt(); const r = await installEvt.userChoice; installEvt = null; if (r.outcome === 'accepted') { K.setMood('proud'); K.say('Yay, I live on your home screen now! 🏠'); } }
    else if (IOS) toast('On iPhone: tap Share ⬆ then "Add to Home Screen"');
    else toast('Use your browser menu → "Install app" or "Add to Home screen"');
  };
  if (STANDALONE) { it.querySelector('h2').textContent = '🏠 Kit is installed'; it.querySelector('p').textContent = 'You can share files to PaperKit from any app, and it works offline.'; ib.append(it); }
  else ib.append(it, btn);
  // run locally
  const cmdWin = `irm https://raw.githubusercontent.com/MrWhiteHat-coder/paperkit/main/install.ps1 | iex`;
  const cmdNix = `curl -fsSL https://raw.githubusercontent.com/MrWhiteHat-coder/paperkit/main/install.sh | sh`;
  const code = (label, cmd) => h('div', { class: 'opt' }, h('div', { class: 'hint', text: label }),
    h('div', { class: 'frow' }, h('code', { class: 'fi mono', style: 'font-family:var(--mono);font-size:12px;overflow-x:auto;white-space:nowrap', text: cmd }),
      h('button', { class: 'btn ghost sm', type: 'button', text: 'Copy', onclick: () => navigator.clipboard?.writeText(cmd).then(() => toast('Copied! Paste it in your terminal.')) })));
  const rb = h('div', { class: 'band' }, h('div', {},
    h('h2', { text: '💻 Run PaperKit on your own computer' }),
    h('p', { text: 'Want it 100% local, even without this website? Paste one line in a terminal. It downloads PaperKit and opens it in your browser.' }),
    code('Windows (PowerShell)', cmdWin), code('Mac / Linux', cmdNix)),
    h('a', { class: 'btn ghost', href: REPO, target: '_blank', rel: 'noopener', text: '⭐ Source on GitHub' }));
  w.append(ib, rb, h('p', { class: 'foot' }, 'Made with ♥ by ', h('a', { href: 'https://anisdev.pages.dev', target: '_blank', rel: 'noopener', text: 'AnisDev' }), ' · Free & open source (MIT) · ', h('a', { href: REPO, target: '_blank', rel: 'noopener', text: 'GitHub' }), h('br'), 'Your files are processed on your device and never sent to any server.'));
  view.append(w);
}

/* ---------- smart pick (dropped / shared files) ---------- */
function pickView() {
  document.title = 'What should Kit do? · PaperKit';
  const pdfs = pending.filter(E.isPdf), imgs = pending.filter(E.isImage);
  K.setMood('hungry'); K.say(`Ooh, ${pending.length} file${pending.length > 1 ? 's' : ''}! What should I do with ${pending.length > 1 ? 'them' : 'it'}? 😋`);
  const ids = imgs.length && !pdfs.length ? ['images-to-pdf', 'exam', 'ocr', 'merge'] :
    pdfs.length > 1 ? ['merge', 'compress', 'ocr'] :
      ['compress', 'split', 'organize', 'sign', 'protect', 'unlock', 'pdf-to-images', 'page-numbers', 'watermark', 'rotate', 'ocr', 'flatten', ...(imgs.length ? ['merge'] : [])];
  view.innerHTML = '';
  const w = h('div', { class: 'wrapc' }, h('a', { class: 'back', href: '#/', text: '← All tools', onclick: () => { pending = []; } }), h('h1', { text: 'What should Kit do?' }));
  const chips = h('div', { style: 'margin:18px 0 6px' });
  pending.forEach(f => chips.append(h('span', { class: 'chip' }, h('span', { text: `${E.isPdf(f) ? '📄' : '🖼'} ${f.name}` }), h('small', { class: 'log', text: E.fmt(f.size) }))));
  const grid = h('div', { class: 'tools' });
  ids.map(id => TOOLS.find(t => t.id === id)).filter(Boolean).forEach(t => {
    const a = h('a', { class: 'tool' + (t.star ? ' star' : ''), href: `#/${t.id}` }, h('span', { class: 'ic', text: t.ic }), h('b', { text: t.name }), h('small', { text: t.short }));
    a.onmouseenter = () => { K.setMood('curious'); K.setAcc(t.acc); K.say(t.line); };
    grid.append(a);
  });
  w.append(chips, grid); view.append(w);
}

/* ---------- a tool ---------- */
function toolView(t) {
  const my = gen;
  document.title = `${t.name} · PaperKit`;
  K.setAcc(t.acc); K.say(t.line); K.log(`job · <b>${esc(t.name.toLowerCase())}</b>`);
  view.innerHTML = '';
  const el = {
    files: h('div', { class: 'files' }), extra: h('div'), opts: h('div', { class: 'opts' }),
    err: h('div', { class: 'err', role: 'alert' }), result: h('div'),
  };
  const c = ctx = {
    t, files: [], opts: structuredClone(t.defaults || {}), el,
    alive: () => gen === my, toast, say: K.say,
    refresh, fail, job, ate, addFiles,
  };
  const head = h('div', { class: 'thead' }, h('span', { class: 'big', text: t.ic }), h('div', {}, h('h1', { text: t.name }), h('p', { class: 'lead', text: t.short })));
  const how = h('div', { class: 'how' }, ...t.how.map(([b, s], i) => h('div', {}, h('b', { text: `${i + 1}. ${b}` }), document.createTextNode(s))));
  const w = h('div', { class: 'wrapc' }, h('a', { class: 'back', href: '#/', text: '← All tools' }), head, how);
  view.append(w);

  if (t.custom) { w.append(el.extra, el.err, el.result); t.setup(c); return; }

  const multi = !!t.multi;
  const input = h('input', { type: 'file', class: 'hide', multiple: multi, accept: t.accept === 'pdf' ? '.pdf,application/pdf' : t.accept === 'images' ? 'image/*,.heic,.heif' : '.pdf,application/pdf,image/*,.heic,.heif' });
  const cam = h('input', { type: 'file', class: 'hide', accept: 'image/*', capture: 'environment' });
  input.onchange = () => { addFiles([...input.files], zone); input.value = ''; };
  cam.onchange = () => { addFiles([...cam.files], zone); cam.value = ''; };
  const what = t.accept === 'pdf' ? (multi ? 'PDFs' : 'a PDF') : t.accept === 'images' ? 'photos' : 'PDFs or photos';
  const zone = h('div', { class: 'zone', role: 'button', tabindex: '0', 'aria-label': `Choose ${what}` },
    h('div', { class: 'zi', text: t.camera ? '📷' : '📄' }),
    h('b', { text: t.camera && K.TOUCH ? 'Snap your pages' : `Give Kit ${what}` }),
    h('small', { text: K.TOUCH ? 'Tap to choose from your phone' : 'Drop here, or click to choose' }),
    h('div', { class: 'zbtns' },
      h('button', { class: 'btn sm', type: 'button', text: multi ? '📁 Choose files' : '📁 Choose file', onclick: e => { e.stopPropagation(); input.click(); } }),
      (t.camera || t.accept !== 'pdf') ? h('button', { class: 'btn ghost sm', type: 'button', text: '📸 Camera', onclick: e => { e.stopPropagation(); cam.click(); } }) : null));
  zone.onclick = () => input.click();
  zone.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } };
  zone.ondragover = e => { e.preventDefault(); zone.classList.add('over'); };
  zone.ondragleave = () => zone.classList.remove('over');

  const run = h('button', { class: 'btn', type: 'button', text: `${t.cta} →`, disabled: true });
  const note = h('span', { class: 'note' });
  run.onclick = () => { const r = t.ready ? t.ready(c) : true; if (r !== true) { toast(r); return; } job(p => t.run(c, p)); };
  w.append(zone, input, cam, el.files, ...(t.optsFirst ? [el.opts, el.extra] : [el.extra, el.opts]), el.err, h('div', { class: 'runbar' }, note, run), el.result);
  t.setup?.(c);
  if (!el.opts.children.length) el.opts.classList.add('hide');

  function drawFiles() {
    el.files.innerHTML = '';
    zone.classList.toggle('mini', c.files.length > 0);
    if (c.files.length) { zone.querySelector('b').textContent = multi ? `Add more ${what}` : 'Swap the file'; zone.querySelector('small').classList.add('hide'); zone.querySelector('.zi').classList.add('hide'); zone.querySelector('.zbtns').classList.add('hide'); }
    else { zone.querySelector('b').textContent = t.camera && K.TOUCH ? 'Snap your pages' : `Give Kit ${what}`; zone.querySelector('small').classList.remove('hide'); zone.querySelector('.zi').classList.remove('hide'); zone.querySelector('.zbtns').classList.remove('hide'); }
    let dragK = null;
    c.files.forEach((f, k) => {
      const th = h('div', { class: 'th', text: E.isPdf(f) ? 'PDF' : 'IMG' });
      const small = h('small', { text: E.fmt(f.size) });
      if (E.isPdf(f)) pdfThumb(f, th).then(n => { if (n === 'locked') small.textContent += ' · 🔒 locked'; else if (n) small.textContent += ` · ${n} page${n > 1 ? 's' : ''}`; });
      else if (!E.isHeic(f)) { const u = URL.createObjectURL(f); th.textContent = ''; th.append(h('img', { src: u, alt: '' })); }
      const row = h('div', { class: 'frow' }, multi ? h('span', { class: 'grip', text: '⠿', 'aria-hidden': 'true' }) : null, th, h('div', { class: 'fi' }, h('b', { text: f.name }), small));
      const acts = h('div', { class: 'acts' });
      const ib = (txt, label, fn) => h('button', { class: 'icon-btn', type: 'button', text: txt, title: label, 'aria-label': label, onclick: fn });
      if (multi) acts.append(ib('↑', 'Move up', () => { if (k) { [c.files[k - 1], c.files[k]] = [c.files[k], c.files[k - 1]]; changed(); } }), ib('↓', 'Move down', () => { if (k < c.files.length - 1) { [c.files[k + 1], c.files[k]] = [c.files[k], c.files[k + 1]]; changed(); } }));
      acts.append(ib('✕', 'Remove', () => { c.files.splice(k, 1); changed(true); }));
      row.append(acts);
      if (multi) {
        row.draggable = true;
        row.ondragstart = () => { dragK = k; row.classList.add('dragging'); };
        row.ondragend = () => row.classList.remove('dragging');
        row.ondragover = e => { e.preventDefault(); row.classList.add('drop-before'); };
        row.ondragleave = () => row.classList.remove('drop-before');
        row.ondrop = e => { e.preventDefault(); e.stopPropagation(); if (dragK == null || dragK === k) return drawFiles(); const [x] = c.files.splice(dragK, 1); c.files.splice(dragK < k ? k - 1 : k, 0, x); changed(); };
      }
      el.files.append(row);
    });
  }
  function changed(reload) { drawFiles(); if (reload) t.onFiles?.(c); refresh(); }
  function refresh() {
    if (!c.alive()) return;
    const r = t.ready ? t.ready(c) : true;
    run.disabled = r !== true; note.textContent = r === true ? 'Ready when you are. ✨' : r;
  }
  function addFiles(list, from) {
    const ok = list.filter(f => accepts(t, f)), bad = list.length - ok.length;
    if (bad) { toast(`Kit only eats ${what} here. Skipped ${bad} file${bad > 1 ? 's' : ''}.`); }
    if (!ok.length) return;
    if (multi) c.files.push(...ok); else c.files = [ok[0]];
    el.result.innerHTML = ''; clearErr();
    ate(ok.length > 1 ? `${ok.length} files` : ok[0].name, from);
    drawFiles(); t.onFiles?.(c); refresh();
  }
  c.files = c.files; // keep reference stable for tools
  if (pending.length) { const inc = pending; pending = []; addFiles(inc, document.getElementById('kitbox')); }
  refresh();
}

/* Kit eats a file */
async function ate(label, from) {
  if (K.isBusy()) return;
  K.setMood('hungry'); K.say(`Ooh, ${label.length > 26 ? label.slice(0, 24) + '…' : label}. Yum. 😋`);
  await K.fly(label, from || document.getElementById('kitbox'));
  if (K.isBusy()) return;
  K.setMood('idle');
  const t = ctx?.t;
  K.say(t ? pickOne(["Got it! Set the options, then hit the big button.", "Tasty. Check the options below, then go.", "Ready when you are. 👇"]) : 'Got it!');
}

function clearErr() { ctx?.el.err.classList.remove('on'); }
function fail(e) {
  console.error(e);
  const unlocking = ctx?.t.id === 'unlock';
  K.setMood('sad'); K.say(e?.locked ? (unlocking ? "Hmm, that key didn't fit. 🔑 Try the password again?" : "This one is locked 🔒. Unlock it first, then come back.") : "Hmm, I got stuck on that one. 😕");
  if (ctx) { ctx.el.err.textContent = e?.message || 'Something went wrong.'; ctx.el.err.classList.add('on'); if (e?.locked && ctx.t.id !== 'unlock') { ctx.el.err.append(' ', h('a', { href: '#/unlock', text: 'Go to Unlock →' })); } }
  setTimeout(() => K.getMood() === 'sad' && K.setMood('idle'), 3500);
}

/* ---------- running a job ---------- */
async function job(fn) {
  if (K.isBusy() || !ctx) return;
  const c = ctx; K.setBusy(true); clearErr(); c.el.result.innerHTML = '';
  K.setMood('shy'); K.say('Covering my eyes. Your file never leaves this device. 🫣'); K.log('uploads · <b>0 KB</b>');
  await K.wait(850);
  K.setMood('chew'); K.setAcc(c.t.acc); K.say(pickOne(['Chewing carefully…', 'Mmm, nice PDF.', 'On it. Not rushing quality.', 'Working my paper magic…']));
  K.belly(.05);
  const t0 = performance.now();
  const progress = (p, msg) => { K.belly(.05 + .9 * Math.max(0, Math.min(1, p || 0))); if (msg) K.log(esc(msg)); };
  try {
    const out = await fn(progress);
    K.belly(1); await K.wait(200); K.belly(0);
    const secs = ((performance.now() - t0) / 1000).toFixed(1);
    if (!c.alive()) return;
    showResult(c, out, secs);
    K.setMood('proud');
    const inSize = c.files.reduce((a, f) => a + f.size, 0);
    K.say(out.say || (inSize && c.t.id === 'compress' ? `Ta-da! ${E.fmt(inSize)} → ${E.fmt(out.blob.size)}. ✨` : `Ta-da! Done in ${secs} s. Nothing left your device. ✨`));
    K.log(`done in <b>${secs} s</b> · uploaded <b>0 KB</b>`);
    K.confetti();
    setTimeout(() => { if (K.getMood() === 'proud' && !K.isBusy()) K.setMood('idle'); }, 3200);
  } catch (e) { K.belly(0); fail(e); }
  finally { K.setBusy(false); K.setAcc(c.t.acc); }
}

function showResult(c, out, secs) {
  const r = c.el.result; r.innerHTML = '';
  const inSize = c.files.reduce((a, f) => a + f.size, 0);
  const isPdfOut = out.blob.type === 'application/pdf', isZip = /zip/.test(out.blob.type), isImg = out.blob.type.startsWith('image/');
  const th = h('div', { class: 'fi2', text: isZip ? 'ZIP' : isPdfOut ? 'PDF' : 'IMG' });
  if (isImg) { th.textContent = ''; th.append(h('img', { src: URL.createObjectURL(out.blob), alt: 'result preview' })); }
  if (isPdfOut) { const f = new File([out.blob], out.name, { type: 'application/pdf' }); pdfThumb(f, th, 120); }
  const change = inSize && !out.same && c.t.id === 'compress' ?Math.round((1 - out.blob.size / inSize) * 100) : null;
  const card = h('div', { class: 'result' },
    h('div', { class: 'rf' }, th, h('div', {}, h('b', { text: out.name }), h('small', { text: `${inSize ? E.fmt(inSize) + ' → ' : ''}${E.fmt(out.blob.size)}${out.note ? ' · ' + out.note : ''}` }))),
    h('div', { class: 'rstats' },
      h('div', {}, h('b', { text: '0 KB' }), h('small', { text: 'uploaded' })),
      h('div', {}, h('b', { text: `${secs} s` }), h('small', { text: "Kit's time" })),
      h('div', {}, h('b', { text: change == null ? '✓' : change > 0 ? `−${change}%` : change < 0 ? `+${-change}%` : '±0' }), h('small', { text: change == null ? 'done' : 'size change' }))));
  if (out.checks) {
    const ck = h('div', { class: 'checks' });
    out.checks.forEach(([a, b, ok]) => ck.append(h('div', {}, h('span', { text: a }), h('b', { class: ok ? 'ok' : 'bad', text: `${b} ${ok ? '✓' : '✗'}` }))));
    if (out.meter) {
      const { min, max, val } = out.meter, top = max * 1.3, m = h('div', { class: 'meter' }, h('i'), h('u'));
      m.querySelector('i').style.cssText = `left:${min / top * 100}%;width:${(max - min) / top * 100}%`;
      m.querySelector('u').style.left = `calc(${Math.min(100, val / top * 100)}% - 2px)`;
      ck.append(m);
    }
    card.append(ck);
  }
  if (out.text != null) {
    const ta = h('textarea', { class: 'textout', readonly: true, 'aria-label': 'Text Kit read' }); ta.value = out.text.trim() || '(Kit found no readable text.)';
    card.append(ta, h('div', { class: 'racts' },
      h('button', { class: 'btn ghost sm', type: 'button', text: '📋 Copy text', onclick: () => navigator.clipboard?.writeText(ta.value).then(() => toast('Text copied!')) }),
      h('button', { class: 'btn ghost sm', type: 'button', text: '⬇ Save as .txt', onclick: () => download(new Blob([ta.value], { type: 'text/plain' }), E.base(out.name) + '.txt') })));
  }
  const file = new File([out.blob], out.name, { type: out.blob.type });
  const acts = h('div', { class: 'racts' },
    h('button', { class: 'btn', type: 'button', text: '⬇ Save', onclick: () => { download(out.blob, out.name); K.say('Saved! Check your Downloads. 📥'); } }));
  if (navigator.canShare?.({ files: [file] })) acts.append(h('button', { class: 'btn ghost', type: 'button', text: '↗ Share', onclick: () => navigator.share({ files: [file], title: out.name }).catch(() => { }) }));
  if (isPdfOut) acts.append(h('button', { class: 'btn ghost', type: 'button', text: '➡ Next job', title: 'Use this result in another tool', onclick: () => { pending = [file]; goPick(); } }));
  if (!c.t.custom) acts.append(h('button', { class: 'btn ghost', type: 'button', text: '↺ Start over', onclick: () => route() }));
  card.append(acts);
  r.append(card);
  card.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
}

function goPick() { if (location.hash === '#/pick') route(); else location.hash = '#/pick'; }

/* ---------- drop anywhere ---------- */
let dc = 0;
const hasFiles = e => [...(e.dataTransfer?.types || [])].includes('Files');
addEventListener('dragenter', e => { if (!hasFiles(e)) return; e.preventDefault(); if (K.isBusy()) return; dc++; document.body.classList.add('dragging'); K.setMood('hungry'); K.say('Aaa… drop it right here. 😮'); });
addEventListener('dragover', e => { if (hasFiles(e)) e.preventDefault(); });
addEventListener('dragleave', e => { if (!hasFiles(e)) return; if (--dc <= 0) { dc = 0; document.body.classList.remove('dragging'); if (!K.isBusy()) { K.setMood('idle'); K.say('Aww. Changed your mind? 🥺'); } } });
addEventListener('drop', e => {
  if (!hasFiles(e)) return; e.preventDefault(); dc = 0; document.body.classList.remove('dragging');
  const files = [...e.dataTransfer.files]; if (!files.length || K.isBusy()) return;
  if (ctx && !ctx.t.custom) ctx.addFiles(files, document.getElementById('kitbox'));
  else { pending = files; goPick(); }
});

/* ---------- arrivals: share target, "Open with", installs ---------- */
async function takeShared() {
  if (!new URLSearchParams(location.search).has('shared')) return false;
  try {
    const cache = await caches.open('pk-share'); const keys = await cache.keys(); const files = [];
    for (const k of keys) { const res = await cache.match(k); const blob = await res.blob(); files.push(new File([blob], decodeURIComponent(res.headers.get('x-name') || 'shared.pdf'), { type: blob.type })); await cache.delete(k); }
    history.replaceState(null, '', '/#/pick');
    if (files.length) { pending = files; return true; }
  } catch (e) { console.warn(e); }
  history.replaceState(null, '', '/');
  return false;
}
if ('launchQueue' in window) {
  window.launchQueue.setConsumer(async p => {
    if (!p.files?.length) return;
    pending = await Promise.all(p.files.map(fh => fh.getFile()));
    goPick();
  });
}
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; });
addEventListener('appinstalled', () => toast('Kit moved into your home screen 🏠'));
if ('serviceWorker' in navigator && location.protocol === 'https:' || location.hostname === 'localhost') {
  navigator.serviceWorker?.register('/sw.js').catch(() => { });
}
addEventListener('offline', () => { K.say("We're offline. No problem, I work without internet. ✈️"); });

K.initPoke();
K.wake();
takeShared().then(() => route());
