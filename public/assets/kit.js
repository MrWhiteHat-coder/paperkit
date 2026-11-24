// Kit — the little paper buddy who does your PDF jobs. Moods live on <body data-mood>.
const B = document.body, $ = s => document.querySelector(s);
const MOODS = {
  idle: 'awake', curious: 'listening', hungry: 'hungry', shy: 'not peeking',
  chew: 'working', proud: 'proud', sleepy: 'napping', sad: 'confused',
};
let mood = 'idle', typing, idleT, busy = false;
export const TOUCH = matchMedia('(hover:none)').matches;

export function setMood(m) { mood = m; B.dataset.mood = m; const w = $('#moodWord'); if (w) w.textContent = MOODS[m] || m; }
export function setAcc(a) { B.dataset.acc = a || ''; }
export function getMood() { return mood; }
export function setBusy(b) { busy = b; if (!b) wake(); }
export function isBusy() { return busy; }

export function say(text) {
  clearInterval(typing);
  const el = $('#say'); if (!el) return;
  el.textContent = ''; let i = 0;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) { el.textContent = text; return; }
  typing = setInterval(() => { el.textContent = text.slice(0, ++i); if (i >= text.length) clearInterval(typing); }, 15);
}
export function log(html) { const l = $('#log'); if (l) l.innerHTML = html; }
export function belly(p) {
  const r = $('#belly'); if (!r) return; const h = 220 * Math.max(0, Math.min(1, p));
  r.setAttribute('y', 230 - h); r.setAttribute('height', h);
}
export const wait = ms => new Promise(r => setTimeout(r, ms));

/* eyes follow you */
function look(x, y) {
  if (['shy', 'sleepy', 'proud'].includes(mood)) return;
  document.querySelectorAll('.pupil').forEach(p => {
    const r = p.parentNode.querySelector('ellipse').getBoundingClientRect();
    const dx = x - (r.left + r.width / 2), dy = y - (r.top + r.height / 2), d = Math.hypot(dx, dy) || 1, k = Math.min(1, d / 220) * 7.5;
    p.setAttribute('transform', `translate(${dx / d * k} ${dy / d * k})`);
  });
}
addEventListener('pointermove', e => { look(e.clientX, e.clientY); wake(); }, { passive: true });
addEventListener('pointerdown', e => { look(e.clientX, e.clientY); wake(); }, { passive: true });
addEventListener('keydown', () => wake());

/* blinking */
(function blink() {
  setTimeout(() => {
    B.classList.add('blink');
    setTimeout(() => { B.classList.remove('blink'); if (Math.random() < .25) setTimeout(() => { B.classList.add('blink'); setTimeout(() => B.classList.remove('blink'), 110); }, 170); }, 120);
    blink();
  }, 2200 + Math.random() * 3200);
})();

/* naps when ignored */
let restore = null;
export function wake() {
  clearTimeout(idleT);
  if (mood === 'sleepy' && !busy) { setMood('idle'); say("Oh! I'm up, I'm up. 😳"); restore?.(); }
  idleT = setTimeout(() => {
    if (busy) return;
    const s = $('#say')?.textContent, l = $('#log')?.innerHTML;
    restore = () => { setTimeout(() => { say(s || 'Where were we?'); log(l || ''); }, 1400); };
    setMood('sleepy'); say('zZ… wake me up with a file.'); log('napping · still offline-ready');
  }, 40000);
}

/* poke */
const POKES = ["Hehe, that tickles. 🤭", "Careful, I'm made of paper.", "Poke me again and I'll staple you. Kidding.", "Still here. Still offline. Still yours.", "I don't read your files. I just fix them."];
let pk = 0;
export function initPoke() {
  const k = $('#kitbox'); if (!k) return;
  k.addEventListener('click', () => {
    if (busy) return;
    k.classList.remove('squish'); void k.offsetWidth; k.classList.add('squish');
    const prev = mood; setMood('proud'); say(POKES[pk++ % POKES.length]);
    setTimeout(() => { if (!busy && mood === 'proud') setMood(prev === 'proud' ? 'idle' : prev); }, 1400);
  });
}

/* a file flies into Kit's mouth */
export async function fly(label, fromEl) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const m = $('#mouthAnchor')?.getBoundingClientRect(); if (!m || !m.width && !m.left) return;
  const f = document.createElement('div'); f.className = 'fly'; f.textContent = '📄 ' + (label.length > 24 ? label.slice(0, 22) + '…' : label);
  document.body.appendChild(f);
  const a = (fromEl || document.body).getBoundingClientRect();
  const x0 = a.left + a.width / 2 - 60, y0 = a.top + Math.min(a.height / 2, 60), x1 = m.left - 40, y1 = m.top - 14;
  try {
    await f.animate([
      { transform: `translate(${x0}px,${y0}px) scale(1)` },
      { transform: `translate(${(x0 + x1) / 2}px,${Math.min(y0, y1) - 100}px) scale(.9) rotate(-12deg)`, offset: .55 },
      { transform: `translate(${x1}px,${y1}px) scale(.15) rotate(20deg)`, opacity: .2 },
    ], { duration: 800, easing: 'cubic-bezier(.5,0,.6,1)' }).finished;
  } catch { }
  f.remove();
}

export function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const c = ['#D4FF3A', '#FF6B5B', '#A78BFA', '#7DD3FC', '#F4F1EA'], r = $('#kitbox').getBoundingClientRect();
  for (let i = 0; i < 36; i++) {
    const d = document.createElement('i'); d.className = 'conf'; d.style.background = c[i % 5]; document.body.appendChild(d);
    const x = r.left + r.width / 2, y = r.top + r.height * .35, ang = Math.random() * Math.PI * 2, v = 100 + Math.random() * 200;
    d.animate([{ transform: `translate(${x}px,${y}px)`, opacity: 1 }, { transform: `translate(${x + Math.cos(ang) * v}px,${y + Math.sin(ang) * v + 240}px) rotate(${720 * Math.random()}deg)`, opacity: 0 }],
      { duration: 1300 + Math.random() * 700, easing: 'cubic-bezier(.2,.6,.4,1)' }).finished.then(() => d.remove());
  }
}
