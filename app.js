/* Vocabdeck Cards: German words as swipe cards. Words are downloaded once from Supabase into IndexedDB;
   progress lives in localStorage on this phone. */
(() => {
  'use strict';
  const LV = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  const CATS = [['noun', 'Nouns'], ['verb', 'Verbs'], ['adjective', 'Adjectives'], ['adverb', 'Adverbs'], ['other', 'Other']];
  const ART = { m: 'der', f: 'die', n: 'das', p: 'die' };
  const GCLS = { m: 'g-m', f: 'g-f', n: 'g-n', p: 'g-f' };
  const KEY_P = 'vocabdeck.progress.v1', KEY_META = 'vocabdeck.vocabmeta.v1', KEY_THEME = 'vocabdeck.theme';
  const COLS = 'id,word,cefr_level,pos,gender,english_translation,example_sentence_native,example_sentence_english,word_frequency,is_separable_verb';

  /* ---------- tiny DOM helper ---------- */
  const h = (tag, attrs, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat(Infinity)) { if (kid == null || kid === false) continue; el.append(kid.nodeType ? kid : document.createTextNode(kid)); }
    return el;
  };
  const $ = (s, r = document) => r.querySelector(s);
  const svg = (d, extra = '') => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '1.7'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.setAttribute('aria-hidden', 'true'); s.innerHTML = d + extra; return s; };
  const ICON = {
    deck: '<rect x="6" y="3.5" width="12" height="15" rx="2.5"/><path d="M4 7v11a2.5 2.5 0 0 0 2.5 2.5H15"/>',
    review: '<path d="M4 12a8 8 0 0 1 13.7-5.6L20 8.5"/><path d="M20 4v4.5h-4.5"/><path d="M20 12a8 8 0 0 1-13.7 5.6L4 15.5"/><path d="M4 20v-4.5h4.5"/>',
    quiz: '<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.6 2.2c-.8.4-1.2 1-1.2 1.8"/><path d="M12 16.6v.1"/>',
    progress: '<path d="M5 20V11"/><path d="M12 20V5"/><path d="M19 20v-6.5"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 14.5a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3h0a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8v0a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z"/>',
    sound: '<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4Z"/><path d="M15.5 9a4 4 0 0 1 0 6"/><path d="M18 6.5a7.5 7.5 0 0 1 0 11"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>', cross: '<path d="M6 6l12 12M18 6L6 18"/>', undo: '<path d="M9 7L4.5 11.5 9 16"/><path d="M5 11.5h9a5 5 0 0 1 0 10h-2"/>',
  };

  /* ---------- progress (localStorage) ---------- */
  const defaults = () => ({ v: 1, st: {}, deck: null, hist: [], quiz: { n: 0, ok: 0 }, prefs: { level: 'B1', size: 24, types: ['noun', 'verb'], order: 'freq' } });
  let P;
  try { P = Object.assign(defaults(), JSON.parse(localStorage.getItem(KEY_P) || '{}')); P.prefs = Object.assign(defaults().prefs, P.prefs); P.quiz = Object.assign({ n: 0, ok: 0 }, P.quiz); } catch (e) { P = defaults(); }
  const save = () => { try { localStorage.setItem(KEY_P, JSON.stringify(P)); } catch (e) { toast('Could not save progress: storage is full or blocked.'); } };

  /* ---------- vocabulary (IndexedDB) ---------- */
  let WORDS = [], BYID = new Map();
  const idb = () => new Promise((res, rej) => { const r = indexedDB.open('vocabdeck', 1); r.onupgradeneeded = () => r.result.createObjectStore('words', { keyPath: 'id' }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const reqP = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  async function loadWords() { const db = await idb(); WORDS = await reqP(db.transaction('words').objectStore('words').getAll()); BYID = new Map(WORDS.map((w) => [w.id, w])); }
  async function storeWords(list) {
    const db = await idb(); const tx = db.transaction('words', 'readwrite'); const os = tx.objectStore('words'); os.clear(); list.forEach((w) => os.put(w));
    await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });
  }
  const POSMAP = { noun: 'noun', verb: 'verb', adj: 'adjective', adjective: 'adjective', adjektiv: 'adjective', adv: 'adverb', adverb: 'adverb' };
  function normalize(r) {
    const pos = String(r.pos || '').trim().toLowerCase();
    if (pos === 'discard') return null;
    const p = POSMAP[pos] || 'other';
    const g = p === 'noun' ? ({ masculine: 'm', feminine: 'f', neuter: 'n', plural: 'p' }[String(r.gender || '').toLowerCase()] || '') : '';
    const lvl = String(r.cefr_level || '').toUpperCase();
    if (!LV.includes(lvl) || !r.word) return null;
    return { id: r.id, w: String(r.word).trim(), l: lvl, p, g, e: String(r.english_translation || '').trim(), x: r.example_sentence_native || '', y: r.example_sentence_english || '', f: r.word_frequency == null ? 1e9 : Number(r.word_frequency), s: !!r.is_separable_verb };
  }
  async function download(onProg) {
    const out = []; let off = 0, total = 0; const PAGE = 1000;
    for (;;) {
      const r = await fetch(`${CFG.URL}/rest/v1/${CFG.TABLE}?select=${COLS}&order=id.asc&limit=${PAGE}&offset=${off}`, { headers: { apikey: CFG.KEY, Authorization: 'Bearer ' + CFG.KEY, Prefer: 'count=exact' } });
      if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? 'The database refused access (check the read policy).' : `Server answered ${r.status}.`);
      if (!total) { const m = /\/(\d+)$/.exec(r.headers.get('content-range') || ''); if (m) total = +m[1]; }
      const rows = await r.json();
      if (!rows.length) break;
      rows.forEach((x) => { const n = normalize(x); if (n) out.push(n); });
      off += rows.length; onProg(off, total);
      if (total && off >= total) break;
    }
    if (!out.length) throw new Error('The table returned no words.');
    await storeWords(out);
    WORDS = out; BYID = new Map(WORDS.map((w) => [w.id, w]));
    localStorage.setItem(KEY_META, JSON.stringify({ n: out.length, t: Date.now() }));
    return out.length;
  }
  const vocabMeta = () => { try { return JSON.parse(localStorage.getItem(KEY_META) || 'null'); } catch (e) { return null; } };

  /* ---------- helpers ---------- */
  const fmt = (n) => n.toLocaleString('en-US');
  const gcls = (w) => GCLS[w.g] || 'g-o';
  const shuffle = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const senses = (w) => w.e.split(';').map((s) => s.trim()).filter(Boolean);
  const firstSense = (w) => senses(w)[0] || w.e;
  const wordLine = (w, withArt = true) => (w.g && withArt ? [h('span', { class: 'art' }, ART[w.g]), w.w, ...(w.g === 'p' ? [h('span', { class: 'pl' }, 'pl.')] : [])] : [w.w]);
  const spoken = (w) => (w.g ? `${ART[w.g]} ${w.w}` : w.w);
  const activeIds = () => new Set(P.deck && !P.deck.done ? P.deck.ids : []);
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2800); }
  const ok = (name) => name;

  /* ---------- speech ---------- */
  let voices = [];
  const loadVoices = () => { try { voices = speechSynthesis.getVoices(); } catch (e) {} };
  if ('speechSynthesis' in window) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }
  function say(parts) {
    if (!('speechSynthesis' in window)) return toast('This browser has no speech.');
    speechSynthesis.cancel();
    const v = voices.find((x) => /^de[-_]DE/i.test(x.lang)) || voices.find((x) => /^de/i.test(x.lang));
    if (!v && voices.length) toast('No German voice found. Install one in Android Settings > Text-to-speech.');
    parts.filter(Boolean).forEach((txt, i) => { const u = new SpeechSynthesisUtterance(txt); u.lang = 'de-DE'; if (v) u.voice = v; u.rate = i === 0 ? .85 : .92; speechSynthesis.speak(u); });
  }

  /* ---------- state + shell ---------- */
  const S = { tab: 'deck', sess: null, quiz: null, mode: null };
  const app = $('#app');
  let main;

  function shell() {
    const nav = h('nav', { class: 'tabs', 'aria-label': 'Main' },
      [['deck', 'Deck', ICON.deck], ['review', 'Review', ICON.review], ['quiz', 'Quiz', ICON.quiz], ['progress', 'Progress', ICON.progress]].map(([id, label, ic]) =>
        h('button', { type: 'button', 'data-tab': id, 'aria-current': S.tab === id ? 'page' : null, onclick: () => go(id) }, svg(ic), label, id === 'review' && reviewCount() ? h('span', { class: 'badge' }, String(Math.min(reviewCount(), 999))) : null)));
    main = h('main', { id: 'main' });
    app.replaceChildren(
      h('div', { class: 'top' }, h('div', { class: 'brand' }, h('i', {}, h('b'), h('b'), h('b')), 'Vocabdeck'), h('div', { class: 'topbtns' }, h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Toggle light/dark mode', onclick: toggleTheme }, svg(isDark() ? ICON.sun : ICON.moon)), h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Settings', onclick: openSettings }, svg(ICON.gear)))),
      main, nav);
  }
  function updateBadge() { const b = $('nav.tabs [data-tab=review]'); if (!b) return; let bd = $('.badge', b); const n = reviewCount(); if (!n) { bd && bd.remove(); return; } if (!bd) { bd = h('span', { class: 'badge' }); b.append(bd); } bd.textContent = String(Math.min(n, 999)); }
  const reviewCount = () => Object.values(P.st).filter((v) => v === 'r').length;
  function go(tab) { S.tab = tab; S.sess = null; S.mode = null; if (tab !== 'quiz') S.quiz = null; speechSynthesis && speechSynthesis.cancel(); render(); }
  function render() {
    shell();
    if (!WORDS.length) return viewDownload();
    ({ deck: viewDeck, review: viewReview, quiz: viewQuiz, progress: viewProgress }[S.tab])();
  }

  /* ---------- first run / download ---------- */
  function viewDownload(err) {
    const bar = h('i'), msg = h('p', { class: 'muted small center' });
    const btn = h('button', { class: 'btn block', type: 'button', onclick: async () => {
      btn.disabled = true; msg.textContent = 'Downloading words ...'; wrapper.hidden = false;
      try { const n = await download((o, t) => { bar.style.width = (t ? Math.round((o / t) * 100) : 50) + '%'; msg.textContent = `Downloading words: ${fmt(o)}${t ? ' of ' + fmt(t) : ''}`; }); toast(`${fmt(n)} words ready.`); render(); }
      catch (e) { btn.disabled = false; wrapper.hidden = true; msg.textContent = (navigator.onLine ? '' : 'You are offline. ') + (e.message || 'Download failed.') + ' Try again.'; }
    } }, WORDS.length ? 'Update words' : 'Download words');
    const wrapper = h('div', { class: 'bar-dl', hidden: true }, bar);
    main.replaceChildren(h('h1', {}, 'Welcome'), h('p', { class: 'lead' }, 'Your words live in your Supabase table. The app downloads them once (about 20,000 words) and then works without internet.'),
      h('div', { class: 'legend' }, h('span', {}, h('i', { style: 'background:var(--m)' }), 'der'), h('span', {}, h('i', { style: 'background:var(--f)' }), 'die'), h('span', {}, h('i', { style: 'background:var(--n)' }), 'das'), h('span', {}, h('i', { style: 'background:var(--o)' }), 'no article')),
      btn, h('div', { style: 'height:12px' }), wrapper, msg);
    if (err) msg.textContent = err;
  }

  /* ---------- Deck tab ---------- */
  function pool(level, types) { const act = activeIds(); return WORDS.filter((w) => w.l === level && types.includes(w.p) && !P.st[w.id] && !act.has(w.id)); }
  function viewDeck() {
    main.className = '';
    if (P.deck && !P.deck.done) return startSession('deck');
    const pr = P.prefs;
    const stats = h('p', { class: 'avail' }), go1 = h('button', { class: 'btn block', type: 'button' }, 'Create deck');
    const num = h('input', { class: 'num', type: 'number', inputmode: 'numeric', min: 1, max: 200, value: pr.size, 'aria-label': 'Number of words' });
    const refresh = () => { const n = pool(pr.level, pr.types).length; stats.textContent = n ? `${fmt(n)} new ${pr.level} words available with these types.` : `No new ${pr.level} words left with these types. Pick another level or type.`; go1.disabled = !n || !pr.types.length; };
    const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Level' }, LV.slice(0, 5).map((l) => h('button', { type: 'button', 'aria-pressed': pr.level === l, onclick: (e) => { pr.level = l; seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', b.textContent === l)); save(); refresh(); } }, l)));
    const presetBox = h('div', { class: 'presets' }, [12, 24, 48].map((n) => h('button', { type: 'button', 'data-n': n, 'aria-pressed': pr.size === n, onclick: () => { pr.size = n; num.value = n; syncPresets(); save(); } }, String(n))));
    const syncPresets = () => presetBox.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', +b.dataset.n === +num.value));
    num.addEventListener('input', () => { pr.size = Math.max(1, Math.min(200, +num.value || 1)); syncPresets(); save(); });
    const chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Word types' }, CATS.map(([id, label]) => h('button', { class: 'chip', type: 'button', 'aria-pressed': pr.types.includes(id), onclick: (e) => { const on = pr.types.includes(id); pr.types = on ? pr.types.filter((t) => t !== id) : [...pr.types, id]; e.currentTarget.setAttribute('aria-pressed', !on); save(); refresh(); } }, label)));
    const ord = h('div', { class: 'seg', role: 'group', 'aria-label': 'Order' }, [['freq', 'Most common first'], ['rand', 'Random']].map(([id, label]) => h('button', { type: 'button', 'aria-pressed': pr.order === id, onclick: () => { pr.order = id; ord.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-pressed', ['freq', 'rand'][i] === id)); save(); } }, label)));
    go1.addEventListener('click', () => {
      const size = Math.max(1, Math.min(200, +num.value || 24)); let list = pool(pr.level, pr.types);
      list = pr.order === 'rand' ? shuffle(list) : list.sort((a, b) => a.f - b.f);
      const ids = list.slice(0, size).map((w) => w.id);
      if (!ids.length) return;
      P.deck = { id: Date.now(), ts: Date.now(), level: pr.level, types: [...pr.types], ids, pos: 0, done: false }; save(); render();
    });
    const last = P.hist[0];
    main.replaceChildren(h('h1', {}, 'New deck'), h('p', { class: 'lead' }, 'Pick a level and how many words. Words you have already seen never come back in a new deck.'),
      h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Level'), seg),
      h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Number of words'), h('div', { class: 'count-row' }, num, presetBox)),
      h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Word types'), chips),
      h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Order'), ord),
      stats, go1,
      last ? h('p', { class: 'muted small center', style: 'margin-top:16px' }, `Last deck: ${last.level}, ${last.n} words, ${last.known} known, ${last.review} to review.`) : '',
      h('div', { class: 'legend', style: 'justify-content:center;margin-top:18px' }, h('span', {}, h('i', { style: 'background:var(--m)' }), 'der'), h('span', {}, h('i', { style: 'background:var(--f)' }), 'die'), h('span', {}, h('i', { style: 'background:var(--n)' }), 'das'), h('span', {}, h('i', { style: 'background:var(--o)' }), 'other')));
    refresh();
  }

  /* ---------- card session (deck + review) ---------- */
  function startSession(mode) {
    const ids = mode === 'deck' ? P.deck.ids : S.mode.ids;
    S.sess = { mode, ids, i: mode === 'deck' ? P.deck.pos : 0, log: [], k: 0, r: 0, flipped: false };
    drawSession();
  }
  const finishedDeckStats = () => { const d = P.deck; return { known: d.ids.filter((i) => P.st[i] === 'k').length, review: d.ids.filter((i) => P.st[i] === 'r').length }; };
  function drawSession() {
    const s = S.sess; main.className = 'fill';
    if (s.i >= s.ids.length) return drawDone();
    const w = BYID.get(s.ids[s.i]);
    if (!w) { s.i++; return drawSession(); }
    const track = h('i', { style: `width:${Math.round((s.i / s.ids.length) * 100)}%` });
    const sbar = h('div', { class: 'sbar' },
      s.mode === 'deck' ? h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Close deck options', onclick: deckMenu }, svg(ICON.gear.replace(/./, (c) => c))) : h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Back to Review', onclick: () => go('review') }, svg(ICON.cross)),
      h('div', { class: 'track' }, track), h('span', { class: 'pos' }, `${s.i + 1} / ${s.ids.length}`),
      h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Undo last card', disabled: !s.log.length, onclick: undo }, svg(ICON.undo)));
    sbar.lastChild.style.opacity = s.log.length ? 1 : .3;
    const front = h('div', { class: 'face front' },
      h('div', { class: 'ftags' }, h('span', {}, w.p === 'noun' && !w.g ? 'noun' : w.p + (w.s ? ' · separable' : '')), h('span', {}, w.l)),
      h('div', { class: 'fmain' }, h('div', { class: 'word' }, wordLine(w)), w.x ? h('p', { class: 'sent' }, w.x) : null),
      h('div', { class: 'ffoot' }, h('button', { class: 'speak', type: 'button', 'aria-label': 'Listen', onpointerdown: (e) => e.stopPropagation(), onclick: (e) => { e.stopPropagation(); say([spoken(w), w.x]); } }, svg(ICON.sound))));
    const back = h('div', { class: 'face back' },
      h('div', { class: 'ftags' }, h('span', {}, ''), h('span', {}, '')),
      h('div', { class: 'fmain' }, h('div', { class: 'meaning' }, senses(w).join(' · ') || w.e), w.y ? h('p', { class: 'sent en' }, w.y) : null),
      h('div', { class: 'ffoot' }, 'tap to flip back'));
    const stampK = h('div', { class: 'stamp k' }, 'Known'), stampR = h('div', { class: 'stamp r' }, 'Review');
    const drag = h('div', { class: `drag enter ${gcls(w)}` }, h('div', { class: 'flip' }, front, back), stampK, stampR);
    const stage = h('div', { class: 'stage' }, drag);
    const actions = h('div', { class: 'actions' },
      h('button', { class: 'round r', type: 'button', 'aria-label': 'Not known, review later', onclick: () => fling(-1) }, svg(ICON.cross)),
      h('button', { class: 'round k', type: 'button', 'aria-label': 'Known', onclick: () => fling(1) }, svg(ICON.check)));
    main.replaceChildren(sbar, stage, h('div', {}, actions, h('p', { class: 'hintline' }, 'Tap to flip · swipe left = review · swipe right = known')));
    s.flipped = false;

    /* gestures */
    let sx = 0, sy = 0, dx = 0, t0 = 0, down = false, moved = false, busy = false;
    const TH = () => Math.min(120, stage.clientWidth * .28);
    const setX = (x) => { drag.style.transform = `translateX(${x}px) rotate(${x / 22}deg)`; const r = Math.min(1, Math.abs(x) / TH()); stampK.style.opacity = x > 0 ? r : 0; stampR.style.opacity = x < 0 ? r : 0; };
    stage.addEventListener('pointerdown', (e) => { if (busy || e.target.closest('button')) return; down = true; moved = false; sx = e.clientX; sy = e.clientY; dx = 0; t0 = Date.now(); drag.classList.remove('enter'); drag.style.transition = 'none'; stage.setPointerCapture(e.pointerId); });
    stage.addEventListener('pointermove', (e) => { if (!down) return; dx = e.clientX - sx; if (Math.abs(dx) > 8 || Math.abs(e.clientY - sy) > 8) moved = true; if (moved) setX(dx); });
    const end = (e) => {
      if (!down) return; down = false; drag.style.transition = 'transform .22s ease';
      const v = Math.abs(dx) / Math.max(1, Date.now() - t0);
      if (!moved && Date.now() - t0 < 400) { setX(0); return flip(); }
      if (Math.abs(dx) > TH() || (v > .6 && Math.abs(dx) > 40)) return fling(dx > 0 ? 1 : -1);
      setX(0);
    };
    stage.addEventListener('pointerup', end); stage.addEventListener('pointercancel', () => { down = false; setX(0); });
    function flip() { s.flipped = !s.flipped; drag.classList.toggle('flipped', s.flipped); }
    function fling(dir) {
      if (busy) return; busy = true; drag.style.transition = 'transform .24s ease-in, opacity .24s'; drag.style.opacity = 0;
      stampK.style.opacity = dir > 0 ? 1 : 0; stampR.style.opacity = dir < 0 ? 1 : 0;
      drag.style.transform = `translateX(${dir * stage.clientWidth * 1.1}px) rotate(${dir * 14}deg)`;
      setTimeout(() => answer(w, dir > 0 ? 'k' : 'r'), 200);
    }
    S.sess.keys = (e) => { if (busy) return; if (e.key === 'ArrowRight') fling(1); else if (e.key === 'ArrowLeft') fling(-1); else if (e.key === ' ' || e.key === 'Enter') { if (!e.target.closest('button')) { e.preventDefault(); flip(); } } };
  }
  document.addEventListener('keydown', (e) => { if (S.sess && S.sess.keys && !document.querySelector('dialog[open]')) S.sess.keys(e); });
  function answer(w, res) {
    const s = S.sess; s.log.push({ id: w.id, prev: P.st[w.id], i: s.i });
    P.st[w.id] = res; res === 'k' ? s.k++ : s.r++;
    s.i++; if (s.mode === 'deck') { P.deck.pos = s.i; if (s.i >= s.ids.length) completeDeck(); } save(); updateBadge(); drawSession();
  }
  function completeDeck() { const d = P.deck; d.done = true; const f = finishedDeckStats(); P.hist.unshift({ id: d.id, ts: Date.now(), level: d.level, n: d.ids.length, known: f.known, review: f.review }); P.hist = P.hist.slice(0, 60); }
  function undo() {
    const s = S.sess, l = s.log.pop(); if (!l) return;
    if (l.prev) P.st[l.id] = l.prev; else delete P.st[l.id];
    s.i = l.i; if (s.mode === 'deck') { P.deck.done = false; P.deck.pos = s.i; if (P.hist[0] && P.hist[0].id === P.deck.id) P.hist.shift(); }
    save(); drawSession();
  }
  function drawDone() {
    const s = S.sess; main.className = '';
    const total = s.ids.length, pctK = total ? s.k / total : 0;
    const again = s.mode === 'deck' ? h('button', { class: 'btn block', type: 'button', onclick: () => { S.sess = null; P.deck = null; save(); render(); } }, 'Make a new deck')
      : h('button', { class: 'btn block', type: 'button', onclick: () => go('review') }, 'Back to Review');
    main.replaceChildren(h('div', { class: 'done' },
      h('div', { class: 'ring', style: `--p:${Math.round(pctK * 360)}deg` }), h('div', { class: 'big' }, `${s.k} of ${total}`),
      h('p', { class: 'lead', style: 'margin:0' }, s.mode === 'deck' ? 'Deck finished.' : 'Review finished.'),
      h('div', { class: 'stats3' }, h('div', {}, h('b', {}, String(s.k)), h('span', {}, 'known')), h('div', {}, h('b', {}, String(s.r)), h('span', {}, 'to review')), h('div', {}, h('b', {}, String(reviewCount())), h('span', {}, 'in review tab'))),
      again, s.r && s.mode === 'deck' ? h('button', { class: 'btn ghost block', type: 'button', onclick: () => { S.sess = null; go('review'); } }, 'Go to Review') : ''));
    updateBadge();
  }
  function deckMenu() {
    const d = P.deck, done = d.ids.filter((i) => P.st[i]).length;
    const dlg = h('dialog', { class: 'sheet' }, h('div', { class: 'sheet-in' }, h('h3', {}, 'This deck'),
      h('p', { class: 'muted', style: 'margin:0' }, `${d.level} · ${d.ids.length} words · ${done} answered. If you discard it, the words you have not answered go back into the pool.`),
      h('button', { class: 'btn danger block', type: 'button', onclick: () => { P.deck = null; save(); S.sess = null; dlg.close(); render(); } }, 'Discard this deck'),
      h('button', { class: 'btn ghost block', type: 'button', onclick: () => dlg.close() }, 'Keep going')));
    dlg.addEventListener('close', () => dlg.remove()); document.body.append(dlg); dlg.showModal();
  }

  /* ---------- Review tab ---------- */
  function viewReview() {
    main.className = '';
    const ids = Object.keys(P.st).filter((k) => P.st[k] === 'r').map(Number).filter((i) => BYID.has(i));
    if (!ids.length) return main.replaceChildren(h('h1', {}, 'Review'), h('p', { class: 'lead' }, 'Words you swipe left on collect here. Nothing to review right now.'), h('button', { class: 'btn ghost block', type: 'button', onclick: () => go('deck') }, 'Go to deck'));
    const words = ids.map((i) => BYID.get(i));
    const start = h('button', { class: 'btn block', type: 'button', onclick: () => { S.mode = { ids: shuffle(ids) }; startSession('review'); } }, `Review ${ids.length} word${ids.length > 1 ? 's' : ''}`);
    const show = words.slice(0, 150);
    main.replaceChildren(h('h1', {}, 'Review'), h('p', { class: 'lead' }, 'Swipe right when you know a word and it leaves this list.'), start,
      h('h2', {}, 'Your list'), h('ul', { class: 'wlist' }, show.map((w) => h('li', { class: gcls(w) }, h('span', { class: 'w' }, wordLine(w)), h('span', { class: 'e' }, firstSense(w))))),
      words.length > show.length ? h('p', { class: 'muted small center' }, `+ ${words.length - show.length} more`) : '');
  }

  /* ---------- Quiz tab ---------- */
  const QPREF = { scope: 'mine', level: 'all', n: 10 };
  function viewQuiz() {
    main.className = '';
    if (S.quiz && S.quiz.i < S.quiz.qs.length) return drawQuestion();
    if (S.quiz) return drawQuizDone();
    const seen = WORDS.filter((w) => P.st[w.id]).length;
    if (QPREF.scope === 'mine' && seen < 8) QPREF.scope = 'all';
    const seg = (key, items) => { const el = h('div', { class: 'seg' }, items.map(([v, l]) => h('button', { type: 'button', 'aria-pressed': String(QPREF[key]) === String(v), onclick: () => { QPREF[key] = v; el.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-pressed', String(items[i][0]) === String(v))); } }, l))); return el; };
    main.replaceChildren(h('h1', {}, 'Quiz'), h('p', { class: 'lead' }, 'Random words. For nouns I also ask for the article.'),
      h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Words from'), seg('scope', [['mine', `Words I have seen (${fmt(seen)})`], ['all', 'All words']])),
      h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Level'), h('div', { class: 'chips' }, [['all', 'All'], ...LV.slice(0, 5).map((l) => [l, l])].map(([v, l]) => h('button', { class: 'chip', type: 'button', 'aria-pressed': QPREF.level === v, onclick: (e) => { QPREF.level = v; e.currentTarget.parentNode.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', b === e.currentTarget)); } }, l)))),
      h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Questions'), seg('n', [[10, '10'], [20, '20'], [30, '30']])),
      h('button', { class: 'btn block', type: 'button', onclick: startQuiz }, 'Start quiz'));
  }
  function startQuiz() {
    let list = WORDS.filter((w) => (QPREF.scope === 'all' || P.st[w.id]) && (QPREF.level === 'all' || w.l === QPREF.level) && senses(w).length);
    if (list.length < 4) { toast('Not enough words for that choice. Try All words.'); return; }
    const picks = shuffle(list).slice(0, +QPREF.n);
    const qs = picks.map((w) => {
      const art = w.g && w.g !== 'p' && Math.random() < .5;
      if (art) return { t: 'art', w, opts: ['der', 'die', 'das'], a: ART[w.g] };
      const same = WORDS.filter((x) => x.p === w.p && x.id !== w.id && (x.l === w.l) && senses(x).length && firstSense(x).toLowerCase() !== firstSense(w).toLowerCase());
      const wrong = shuffle(same).slice(0, 3).map(firstSense);
      return { t: 'mean', w, opts: shuffle([firstSense(w), ...wrong]), a: firstSense(w) };
    });
    S.quiz = { qs, i: 0, ok: 0, wrong: [], answered: false }; render();
  }
  function drawQuestion() {
    const q = S.quiz, cur = q.qs[q.i], w = cur.w;
    const opts = h('div', { class: `opts ${cur.t === 'art' ? 'art' : ''}` });
    const next = h('button', { class: 'btn block', type: 'button', hidden: true, onclick: () => { q.i++; q.answered = false; render(); } }, q.i === q.qs.length - 1 ? 'See result' : 'Next');
    const card = cur.t === 'art'
      ? h('div', { class: `qcard ${gcls(w)}` }, h('span', { class: 'sub' }, 'Which article?'), h('div', { class: 'word' }, h('span', { class: 'art', 'data-blank': '1' }, '___'), w.w), h('span', { class: 'sub' }, firstSense(w)))
      : h('div', { class: `qcard ${gcls(w)}` }, h('span', { class: 'sub' }, 'What does it mean?'), h('div', { class: 'word' }, wordLine(w)), h('button', { class: 'speak', type: 'button', style: 'justify-self:center;margin-top:6px', 'aria-label': 'Listen', onclick: () => say([spoken(w)]) }, svg(ICON.sound)));
    cur.opts.forEach((o) => opts.append(h('button', { class: 'opt', type: 'button', onclick: (e) => {
      if (q.answered) return; q.answered = true; const good = o === cur.a; q.ok += good ? 1 : 0; P.quiz.n++; P.quiz.ok += good ? 1 : 0;
      if (!good) { q.wrong.push(w); P.st[w.id] = 'r'; }
      opts.querySelectorAll('button').forEach((b) => { if (b.textContent === cur.a) b.classList.add('right'); });
      if (!good) e.currentTarget.classList.add('wrong');
      if (cur.t === 'art') { const bl = card.querySelector('[data-blank]'); bl.textContent = cur.a; }
      save(); next.hidden = false; if (good) { const at = q.i; setTimeout(() => { if (S.quiz === q && q.i === at) next.click(); }, 750); }
    } }, o)));
    main.replaceChildren(h('div', { class: 'sbar' }, h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Quit quiz', onclick: () => go('quiz') }, svg(ICON.cross)), h('div', { class: 'track' }, h('i', { style: `width:${Math.round((q.i / q.qs.length) * 100)}%` })), h('span', { class: 'pos' }, `${q.i + 1} / ${q.qs.length}`)),
      h('div', { class: 'q' }, card, opts, next));
  }
  function drawQuizDone() {
    const q = S.quiz, n = q.qs.length;
    main.replaceChildren(h('div', { class: 'done' }, h('div', { class: 'ring', style: `--p:${Math.round((q.ok / n) * 360)}deg` }), h('div', { class: 'big' }, `${q.ok} / ${n}`),
      h('p', { class: 'lead', style: 'margin:0' }, q.wrong.length ? 'Missed words were added to Review.' : 'Perfect round.'),
      q.wrong.length ? h('ul', { class: 'wlist', style: 'width:100%;text-align:left' }, q.wrong.map((w) => h('li', { class: gcls(w) }, h('span', { class: 'w' }, wordLine(w)), h('span', { class: 'e' }, firstSense(w))))) : null,
      h('button', { class: 'btn block', type: 'button', onclick: () => { S.quiz = null; render(); } }, 'Another round')));
    updateBadge();
  }

  /* ---------- Progress tab ---------- */
  function viewProgress() {
    main.className = '';
    const stat = {}; LV.forEach((l) => { stat[l] = {}; CATS.forEach(([c]) => (stat[l][c] = { t: 0, k: 0, r: 0 })); stat[l].noun_g = { m: 0, f: 0, n: 0, o: 0 }; });
    let T = 0, K = 0, R = 0;
    WORDS.forEach((w) => { const c = stat[w.l][w.p]; c.t++; T++; const st = P.st[w.id]; if (st === 'k') { c.k++; K++; } else if (st === 'r') { c.r++; R++; } if (w.p === 'noun') stat[w.l].noun_g[w.g || 'o']++; });
    const pct = (a, b) => (b ? (a / b) * 100 : 0);
    const fp = (v) => (v > 0 && v < 1 ? '<1%' : Math.round(v) + '%');
    const bar = (c) => h('div', { class: 'bar' }, h('i', { class: 'seen', style: `width:${pct(c.k + c.r, c.t)}%` }), h('i', { class: 'known', style: `width:${pct(c.k, c.t)}%` }));
    const levels = LV.filter((l) => CATS.some(([c]) => stat[l][c].t)).map((l) => {
      const tot = CATS.reduce((a, [c]) => ({ t: a.t + stat[l][c].t, k: a.k + stat[l][c].k, r: a.r + stat[l][c].r }), { t: 0, k: 0, r: 0 });
      return h('details', { class: 'lv', open: (l === P.prefs.level) || null },
        h('summary', {}, h('span', { class: 'lvname' }, l), h('div', {}, bar(tot), h('div', { class: 'muted small', style: 'margin-top:5px' }, `${fmt(tot.k)} known · ${fmt(tot.r)} in review · ${fmt(tot.t)} words`)), h('span', { class: 'pct' }, fp(pct(tot.k, tot.t)))),
        h('div', { class: 'catrows' }, CATS.filter(([c]) => stat[l][c].t).map(([c, name]) => { const s = stat[l][c];
          return h('div', { class: 'cat' }, h('span', { class: 'name' }, name,
            c === 'noun' ? h('span', { class: 'dots', title: 'der / die / das / none' }, [['m', 'm'], ['f', 'f'], ['n', 'n'], ['o', 'o']].map(([g, v]) => h('i', { style: `background:var(--${v})`, title: String(stat[l].noun_g[g]) }))) : null),
            h('span', { class: 'nums' }, `${fmt(s.k)} / ${fmt(s.t)} · ${fp(pct(s.k, s.t))}`), bar(s)); })));
    });
    main.replaceChildren(h('h1', {}, 'Progress'), h('p', { class: 'lead' }, 'Known = you swiped right. Lighter bar = seen, still in review.'),
      h('div', { class: 'sum' }, h('div', {}, h('b', {}, fmt(K)), h('span', {}, 'known')), h('div', {}, h('b', {}, fmt(R)), h('span', {}, 'in review')), h('div', {}, h('b', {}, fp(pct(K, T))), h('span', {}, `of ${fmt(T)} words`))),
      ...levels,
      h('div', { class: 'panel row' }, h('span', {}, 'Quiz answers'), h('b', {}, P.quiz.n ? `${P.quiz.ok} / ${P.quiz.n} correct (${Math.round((P.quiz.ok / P.quiz.n) * 100)}%)` : 'none yet')),
      ...(P.hist.length ? [h('h2', {}, 'Past decks'), h('div', { class: 'panel' }, P.hist.slice(0, 8).map((d) => h('div', { class: 'row small', style: 'padding:4px 0' }, h('span', {}, `${new Date(d.ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · ${d.level} · ${d.n} words`), h('span', { class: 'muted' }, `${d.known} known`))))] : []));
  }

  /* ---------- Settings ---------- */
  function fitWords() {
    document.querySelectorAll('.face .word, .qcard .word').forEach((el) => {
      el.style.fontSize = ''; el.style.overflowWrap = '';
      let sz = parseFloat(getComputedStyle(el).fontSize);
      const over = () => el.scrollWidth > el.clientWidth;
      while (over() && sz > 16) { sz -= 1; el.style.fontSize = sz + 'px'; }
      if (over()) el.style.overflowWrap = 'anywhere';
    });
  }
  new MutationObserver(() => requestAnimationFrame(fitWords)).observe(document.body, { childList: true, subtree: true });
  addEventListener('resize', fitWords); if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitWords);
  function isDark() { const t = document.documentElement.dataset.theme; return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; }
  function toggleTheme() { setTheme(isDark() ? 'light' : 'dark'); const b = document.querySelector('.top .iconbtn'); if (b) b.replaceChildren(svg(isDark() ? ICON.sun : ICON.moon)); }
  function setTheme(t) { try { t === 'system' ? localStorage.removeItem(KEY_THEME) : localStorage.setItem(KEY_THEME, t); } catch (e) {} t === 'system' ? delete document.documentElement.dataset.theme : (document.documentElement.dataset.theme = t); const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = getComputedStyle(document.body).backgroundColor; }
  function openSettings() {
    const meta = vocabMeta(); const cur = localStorage.getItem(KEY_THEME) || 'system';
    const dlg = h('dialog', { class: 'sheet' });
    const themeSeg = h('div', { class: 'seg' }, [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']].map(([v, l]) => h('button', { type: 'button', 'aria-pressed': cur === v, onclick: () => { setTheme(v); themeSeg.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-pressed', ['system', 'light', 'dark'][i] === v)); } }, l)));
    const msg = h('p', { class: 'muted small', style: 'margin:0' }, meta ? `${fmt(meta.n)} words, downloaded ${new Date(meta.t).toLocaleDateString('en-GB')}.` : 'No words downloaded yet.');
    const bar = h('i'), wrap = h('div', { class: 'bar-dl', hidden: true }, bar);
    const upd = h('button', { class: 'btn ghost block', type: 'button', onclick: async () => {
      upd.disabled = true; wrap.hidden = false;
      try { const n = await download((o, t) => { bar.style.width = (t ? Math.round((o / t) * 100) : 50) + '%'; msg.textContent = `Downloading: ${fmt(o)}${t ? ' / ' + fmt(t) : ''}`; }); msg.textContent = `${fmt(n)} words updated.`; render(); }
      catch (e) { msg.textContent = (navigator.onLine ? '' : 'Offline. ') + e.message; } finally { upd.disabled = false; wrap.hidden = true; }
    } }, 'Update words from Supabase');
    const file = h('input', { type: 'file', accept: 'application/json', hidden: true, onchange: async () => {
      try { const j = JSON.parse(await file.files[0].text()); if (!j || j.v !== 1 || typeof j.st !== 'object') throw 0; P = Object.assign(defaults(), j); save(); dlg.close(); toast('Progress restored.'); render(); } catch (e) { toast('That file is not a Vocabdeck backup.'); } } });
    const reset = h('button', { class: 'btn danger block', type: 'button', onclick: () => { if (reset.dataset.arm) { P = defaults(); save(); dlg.close(); S.sess = null; S.quiz = null; toast('Progress reset.'); render(); } else { reset.dataset.arm = 1; reset.textContent = 'Tap again to erase all progress'; } } }, 'Reset progress');
    dlg.append(h('div', { class: 'sheet-in' }, h('h3', {}, 'Settings'),
      h('div', { class: 'sec' }, h('span', { class: 'lbl muted small' }, 'Appearance'), themeSeg),
      h('div', { class: 'sec' }, h('span', { class: 'lbl muted small' }, 'Vocabulary'), msg, wrap, upd),
      h('div', { class: 'sec' }, h('span', { class: 'lbl muted small' }, 'Backup'), h('p', { class: 'muted small', style: 'margin:0' }, 'Progress is kept on this phone. A backup file protects it if you clear browser data or change phones.'),
        h('button', { class: 'btn ghost block', type: 'button', onclick: () => { const b = new Blob([JSON.stringify(P)], { type: 'application/json' }); const a = h('a', { href: URL.createObjectURL(b), download: `vocabdeck-progress-${new Date().toISOString().slice(0, 10)}.json` }); document.body.append(a); a.click(); a.remove(); } }, 'Export backup'),
        h('button', { class: 'btn ghost block', type: 'button', onclick: () => file.click() }, 'Restore from backup'), file),
      h('div', { class: 'sec' }, reset),
      h('button', { class: 'btn block', type: 'button', onclick: () => dlg.close() }, 'Done')));
    dlg.addEventListener('close', () => dlg.remove()); document.body.append(dlg); dlg.showModal();
  }

  /* ---------- boot ---------- */
  (async function boot() {
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
    try { await loadWords(); } catch (e) { WORDS = []; }
    if (P.deck && !P.deck.done && !WORDS.length) P.deck = null;
    render();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  })();
})();
