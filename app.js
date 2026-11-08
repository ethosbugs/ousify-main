'use strict';
/* =====================================================================
   Ousify v3 — reproductor de mp3 con listas
   Datos: localStorage (listas y ajustes) + IndexedDB (mp3 guardados)
   ===================================================================== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };
const uid = () => Math.random().toString(36).slice(2, 9);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const enc = encodeURIComponent;
const fmt = s => isFinite(s) && s > 0 ? Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0') : '0:00';
const hexA = (h, a) => { const n = parseInt(h.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; };

const I = {
  prev: '<path d="M7 5v14"/><path d="M19 5L9 12l10 7z" fill="currentColor"/>',
  next: '<path d="M17 5v14"/><path d="M5 5l10 7-10 7z" fill="currentColor"/>',
  play: '<path d="M8 5l11 7-11 7z" fill="currentColor"/>',
  pause: '<path d="M8 5v14M16 5v14" stroke-width="3.2"/>',
  heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
  shuf: '<path d="M3 7h4l10 10h4M3 17h4l3-3M14 10l3-3h4"/><path d="M18 4l3 3-3 3M18 14l3 3-3 3"/>',
  rep: '<path d="M4 11V9a3 3 0 0 1 3-3h12M16 3l3 3-3 3M20 13v2a3 3 0 0 1-3 3H5M8 21l-3-3 3-3"/>',
  down: '<path d="M6 9l6 6 6-6"/>', up: '<path d="M6 15l6-6 6 6"/>',
  pip: '<rect x="3" y="5" width="18" height="14" rx="2"/><rect x="12" y="11" width="7" height="5" rx="1" fill="currentColor"/>',
  dl: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="M5 19l1-4L16 5l3 3L9 18z"/>',
};
const ic = (n, s = 20) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${I[n]}</svg>`;

/* ---------------------------- estado ---------------------------- */
const FAV = 'fav';
const DEF = {
  lists: [{ id: FAV, name: 'Tus favoritas', ids: [], cover: '', order: 'manual' }],
  orders: {},
  mini: { visible: true, mode: 'full', cover: true, blur: true, accent: '#1db954', bg: '#16161c', text: '#ffffff', style: 'solid', op: .96, scale: 1, x: null, y: null },
  keys: { jamendo: '' },
  vol: 1, view: 'lib', fname: 'ta', autoCover: true,
};
let S; try { S = JSON.parse(localStorage.getItem('ld3')); } catch { }
{ const d = structuredClone(DEF); S = Object.assign(d, S || {}); S.mini = { ...DEF.mini, ...S.mini }; S.keys = { ...DEF.keys, ...S.keys };
  if (!S.lists.some(l => l.id === FAV)) S.lists.unshift(structuredClone(DEF.lists[0])); }
const save = () => localStorage.setItem('ld3', JSON.stringify(S));
let toastT;
function toast(m) {
  let t = $('#toast'); if (!t) { t = el('div'); t.id = 'toast'; document.body.append(t); }
  t.textContent = m; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 4500);
}

/* ---------------------------- IndexedDB ---------------------------- */
const dbp = new Promise((res, rej) => {
  const r = indexedDB.open('ousify', 2);
  r.onupgradeneeded = () => { const d = r.result;
    if (!d.objectStoreNames.contains('tracks')) d.createObjectStore('tracks', { keyPath: 'id' });
    if (!d.objectStoreNames.contains('blobs')) d.createObjectStore('blobs'); };
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});
const tx = async (mode, fn) => {
  const d = await dbp;
  return new Promise((res, rej) => { const t = d.transaction('tracks', mode), r = fn(t.objectStore('tracks')); t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); });
};
let lib = [];
const putTrack = t => tx('readwrite', s => s.put(t));
const delTrack = id => tx('readwrite', s => s.delete(id));
async function refreshLib() {
  lib = ((await tx('readonly', s => s.getAll())) || []).map(t => ({ ...t, cover: t.cover || t.thumb || '' })).sort((a, b) => a.added - b.added);
  if (P.cur && P.cur.id) P.cur = lib.find(t => t.id === P.cur.id) || P.cur;
  emit(true);
}
const isMp3 = f => /\.mp3$/i.test(f.name) || f.type === 'audio/mpeg';
let OFF = []; /* listas verificadas de Ousify (playlists.json) */
async function addFiles(files) {
  const all = [...files], list = all.filter(isMp3), newIds = [];
  for (const f of list) {
    const base = f.name.replace(/\.mp3$/i, ''), m = base.split(/\s+-\s+/);
    const first = m[0], rest = m.slice(1).join(' - ');
    const [name, artist] = m.length < 2 ? [base, ''] : S.fname === 'at' ? [rest, first] : [first, rest]; /* por defecto: "Título - Artista" */
    const id = uid(); newIds.push(id);
    await putTrack({ id, name, artist, cover: '', blob: f, added: Date.now() });
  }
  if (all.length > list.length) toast(`${all.length - list.length} archivo(s) ignorados: solo se admiten mp3.`);
  await refreshLib();
  if (S.autoCover !== false && newIds.length) autoCovers(newIds); /* en segundo plano */
  return list.length;
}

/* ---------------------------- portadas automáticas (iTunes Search API: gratis y sin clave) ---------------------------- */
const sleep = ms => new Promise(r => setTimeout(r, ms));
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\(.*?\)|\[.*?\]|\b(feat|ft)\b.*$/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
function jsonp(url) {
  return new Promise((res, rej) => {
    const cb = 'jp' + uid(), s = document.createElement('script');
    const end = () => { clearTimeout(to); delete window[cb]; s.remove(); }, to = setTimeout(() => { end(); rej(new Error('timeout')); }, 9000);
    window[cb] = d => { end(); res(d); }; s.onerror = () => { end(); rej(new Error('jsonp')); };
    s.src = url + '&callback=' + cb; document.head.append(s);
  });
}
async function itunes(term) {
  const url = `https://itunes.apple.com/search?media=music&entity=song&limit=10&term=${enc(term)}`;
  try { const r = await fetch(url); if (!r.ok) throw new Error('http'); return await r.json(); } catch { return await jsonp(url); }
}
/* devuelve { cover, album, year } o null; lanza error si no hay red */
async function findCover(name, artist) {
  const n = norm(name), a = norm(artist).split(' ')[0] || '';
  const queries = [`${name} ${artist}`.trim()]; if (artist) queries.push(name);
  let fallback = null;
  for (const q of queries) {
    const rs = ((await itunes(q)).results || []).filter(x => x.artworkUrl100);
    const score = x => { const tn = norm(x.trackName); return (tn === n ? 3 : tn.includes(n) || n.includes(tn) ? 1 : 0) + (a && norm(x.artistName + ' ' + (x.collectionName || '')).includes(a) ? 2 : 0); };
    const best = rs.map(x => [score(x), x]).sort((p, q) => q[0] - p[0])[0];
    if (best && best[0] >= (a ? 3 : 1)) return fmtCover(best[1]);
    if (!fallback && rs[0]) fallback = rs[0]; /* mejor resultado de "título + artista" por si el título difiere un poco */
  }
  return fallback ? fmtCover(fallback) : null;
}
const fmtCover = x => ({ cover: x.artworkUrl100.replace(/\/\d+x\d+(bb)?\.(jpg|png)/, '/600x600bb.$2'), album: x.collectionName || '', year: (x.releaseDate || '').slice(0, 4) });
let covering = false;
async function autoCovers(only) {
  if (covering) return;
  const todo = lib.filter(t => !t.cover && !t.coverTried && t.name && (!only || only.includes(t.id)));
  if (!todo.length) { toast('No hay canciones pendientes de portada.'); return; }
  covering = true; let ok = 0;
  for (let i = 0; i < todo.length; i++) {
    toast(`Buscando portadas… ${i + 1}/${todo.length}`);
    try {
      const r = await findCover(todo[i].name, todo[i].artist), t = lib.find(x => x.id === todo[i].id); /* siempre sobre la versión actual */
      if (t && !t.cover) { if (r) { Object.assign(t, { cover: r.cover, coverAuto: true }); if (r.album) t.album = r.album; if (r.year) t.year = r.year; ok++; } t.coverTried = true; await putTrack({ ...t }); emit(true); }
    } catch (e) { toast('No se pudo buscar portadas (¿sin conexión?). Inténtalo de nuevo más tarde.'); covering = false; return; }
    await sleep(3200); /* Apple admite ~20 consultas por minuto */
  }
  covering = false; toast(`Portadas encontradas: ${ok} de ${todo.length}. Si alguna está mal, edítala con ✎.`);
}

/* ---------------------------- pistas y listas ---------------------------- */
const keyOf = t => t.blob ? 'b' + t.id : 'u' + t.url;
const libFor = t => t.id ? lib.find(x => x.id === t.id) : lib.find(x => x.url && x.url === t.url);
const listBy = id => S.lists.find(l => l.id === id);
const inList = (t, lid) => { const l = libFor(t); return !!l && listBy(lid).ids.includes(l.id); };
const isFav = t => !!t && inList(t, FAV);
const hue = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
const cover = t => t && t.cover ? `center/cover url('${t.cover.replace(/'/g, '%27')}')` :
  `linear-gradient(135deg,hsl(${hue(t ? t.name : 'x')} 70% 45%),hsl(${(hue(t ? t.name : 'x') + 60) % 360} 70% 28%))`;

async function ensureInLib(t) {
  let l = libFor(t); if (l) return l;
  l = { id: uid(), name: t.name, artist: t.artist || '', cover: t.cover || '', url: t.url, dl: t.dl, from: t.from, added: Date.now() };
  await putTrack(l); lib.push(l); return l;
}
async function toggleInList(t, lid, silent) {
  const l = await ensureInLib(t), list = listBy(lid), i = list.ids.indexOf(l.id);
  if (i >= 0) list.ids.splice(i, 1); else list.ids.push(l.id);
  save(); emit(true);
  if (!silent) toast(i >= 0 ? `Quitada de “${list.name}”` : `Añadida a “${list.name}”`);
}
const toggleFav = t => t && toggleInList(t, FAV, true);

const sorters = {
  title: (a, b) => a.name.localeCompare(b.name, 'es'),
  artist: (a, b) => (a.artist || '').localeCompare(b.artist || '', 'es') || a.name.localeCompare(b.name, 'es'),
  recent: (a, b) => b.added - a.added,
  old: (a, b) => a.added - b.added,
};
function viewTracks(view) {
  const ord = S.orders[view] || (view === 'lib' ? 'old' : 'manual');
  let arr = view === 'lib' ? [...lib] : view.startsWith('o:') ? ((OFF.find(o => 'o:' + o.id === view) || { tracks: [] }).tracks.map(t => ({ ...t }))) : listBy(view).ids.map(id => lib.find(t => t.id === id)).filter(Boolean);
  if (ord !== 'manual' && sorters[ord]) arr.sort(sorters[ord]);
  return arr;
}

/* ---------------------------- motor de reproducción ---------------------------- */
const audio = new Audio(); audio.preload = 'metadata'; audio.volume = S.vol;
const P = { queue: [], i: -1, cur: null, url: null, shuf: false, rep: false, played: new Set(), back: [] };
const subs = new Set(), tsubs = new Set();
/* cada suscriptor va aislado: si uno falla, el reproductor sigue actualizándose */
const safe = f => a => { try { f(a); } catch (err) { console.error(err); } };
const emit = full => subs.forEach(f => safe(f)(full)); const tick = () => tsubs.forEach(f => safe(f)());
['play', 'pause', 'playing', 'loadedmetadata', 'durationchange', 'seeked', 'emptied'].forEach(e => audio.addEventListener(e, () => emit()));
audio.addEventListener('timeupdate', tick);
audio.addEventListener('ended', () => next(true));
audio.addEventListener('error', () => { if (P.cur) toast('No se puede reproducir este mp3 (¿enlace caído o bloqueado?).'); });
const curTime = () => audio.currentTime || 0;
const durTime = () => isFinite(audio.duration) ? audio.duration : 0;

async function play(list, i, keep) {
  const t = list[i]; if (!t) return;
  if (!keep) { P.played.clear(); P.back = []; }
  audio.pause(); if (P.url) { URL.revokeObjectURL(P.url); P.url = null; }
  P.queue = list; P.i = i; P.cur = t;
  if (t.blob) { P.url = URL.createObjectURL(t.blob); audio.src = P.url; } else audio.src = t.url;
  if (!S.mini.visible) { S.mini.visible = true; save(); applyMini(); }
  try { await audio.play(); } catch (e) { console.warn(e); }
  if ('mediaSession' in navigator) {
    try { navigator.mediaSession.metadata = new MediaMetadata({ title: t.name, artist: t.artist || '', artwork: t.cover ? [{ src: t.cover }] : [] }); } catch { }
  }
  emit();
}
function toggle() {
  if (!P.cur) { const l = viewTracks(S.view === 'web' || S.view === 'set' ? 'lib' : S.view); if (l.length) play(l, 0); else toast('Añade primero algún mp3.'); return; }
  audio.paused ? audio.play() : audio.pause();
}
function next(auto) {
  const n = P.queue.length; if (!n) return;
  let i;
  if (P.shuf) {
    P.played.add(P.i); if (P.played.size >= n) { P.played.clear(); P.played.add(P.i); }
    const c = [...Array(n).keys()].filter(k => !P.played.has(k)); i = c[Math.floor(Math.random() * c.length)] ?? 0;
  } else { i = P.i + 1; if (i >= n) { if (P.rep || !auto) i = 0; else { audio.pause(); audio.currentTime = 0; emit(); return; } } }
  P.back.push(P.i); play(P.queue, i, true);
}
function prev() {
  if (!P.queue.length) return;
  if (curTime() > 3) { audio.currentTime = 0; return; }
  const i = P.back.length ? P.back.pop() : (P.i - 1 + P.queue.length) % P.queue.length; play(P.queue, i, true);
}
const seekTo = f => { const d = durTime(); if (d) audio.currentTime = f * d; };
if ('mediaSession' in navigator) {
  const ms = (a, f) => { try { navigator.mediaSession.setActionHandler(a, f); } catch { } };
  ms('play', toggle); ms('pause', toggle); ms('previoustrack', prev); ms('nexttrack', () => next());
  ms('seekto', d => { const du = durTime(); if (du) seekTo(d.seekTime / du); });
}
let lastPos = 0;
tsubs.add(() => { const n = Date.now(); if (n - lastPos < 1000 || !('mediaSession' in navigator)) return; lastPos = n;
  const d = durTime(); if (d) try { navigator.mediaSession.setPositionState({ duration: d, position: Math.min(curTime(), d), playbackRate: 1 }); } catch { } });

/* ---------------------------- búsqueda de mp3 (Audius y Jamendo) ---------------------------- */
async function audiusSearch(q) {
  const r = await fetch(`https://api.audius.co/v1/tracks/search?query=${enc(q)}&limit=25&app_name=ousify`);
  if (!r.ok) throw new Error('audius'); const j = await r.json();
  return (j.data || []).map(d => ({ url: `https://api.audius.co/v1/tracks/${d.id}/stream?app_name=ousify`, name: d.title, artist: d.user && d.user.name, cover: d.artwork && d.artwork['480x480'] || '', from: 'Audius' }));
}
async function jamendoSearch(q) {
  const r = await fetch(`https://api.jamendo.com/v3.0/tracks/?client_id=${enc(S.keys.jamendo)}&format=json&limit=25&search=${enc(q)}&audiodlformat=mp32`);
  if (!r.ok) throw new Error('jamendo'); const j = await r.json();
  return (j.results || []).map(d => ({ url: d.audio, dl: d.audiodownload_allowed ? d.audiodownload : null, name: d.name, artist: d.artist_name, cover: d.image, from: 'Jamendo' }));
}
async function saveOffline(t) {
  let l = await ensureInLib(t);
  if (l.blob) return l;
  const r = await fetch(l.dl || l.url); if (!r.ok) throw new Error('HTTP ' + r.status);
  l.blob = await r.blob(); delete l.url; delete l.dl; await putTrack(l); await refreshLib(); return l;
}
async function exportMp3(t) {
  let blob = t.blob;
  if (!blob) { try { const r = await fetch(t.dl || t.url); if (!r.ok) throw 0; blob = await r.blob(); } catch { toast('El servidor no permite descargar este mp3.'); return; } }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `${t.artist ? t.artist + ' - ' : ''}${t.name}.mp3`.replace(/[\\/:*?"<>|]/g, '_'); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/* ---------------------------- utilidades UI ---------------------------- */
function drag(handle, target, { onend } = {}) {
  handle.addEventListener('pointerdown', ev => {
    if (ev.button !== 0 || ev.target.closest('button,input,select')) return;
    const r = target.getBoundingClientRect(), ox = ev.clientX - r.left, oy = ev.clientY - r.top, sx = ev.clientX, sy = ev.clientY; let moved = false;
    const mv = e => {
      if (!moved && Math.hypot(e.clientX - sx, e.clientY - sy) < 5) return; moved = true;
      target.style.left = clamp(e.clientX - ox, 60 - r.width, innerWidth - 60) + 'px'; target.style.top = clamp(e.clientY - oy, 0, innerHeight - 40) + 'px';
    };
    const up = e => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); onend && onend(e, moved); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up); ev.preventDefault();
  });
}
const MINI = $('#mini');
const menu = $('#menu');
const hideMenu = () => { menu.hidden = true; };
function showMenu(x, y, entries) {
  menu.innerHTML = '';
  entries.forEach(e => { if (e === '-') { menu.append(el('hr')); return; } const d = el('div', '', esc(e[0])); d.onclick = () => { hideMenu(); e[1](); }; menu.append(d); });
  menu.hidden = false;
  menu.style.left = Math.min(x, innerWidth - menu.offsetWidth - 6) + 'px'; menu.style.top = Math.min(y, innerHeight - menu.offsetHeight - 6) + 'px';
}
addEventListener('pointerdown', e => { if (!e.target.closest('#menu')) hideMenu(); });
addEventListener('blur', hideMenu);
function ask(title, fields, init = {}, extra = []) {
  return new Promise(res => {
    const m = el('div', 'modal'), f = el('form', 'card', `<h3>${esc(title)}</h3>`);
    fields.forEach(([k, label]) => { const l = el('label', '', esc(label)), i = el('input'); i.name = k; i.value = init[k] || ''; l.append(i); f.append(l); });
    const row = el('div', 'row2', '<button type="button" class="ghost">Cancelar</button><button class="pri">Aceptar</button>');
    extra.forEach(([label, fn]) => { const b = el('button', 'btn', esc(label)); b.type = 'button'; b.onclick = () => fn(f, b); row.prepend(b); });
    f.append(row);
    m.append(f); document.body.append(m); const first = f.querySelector('input'); first && first.focus();
    const close = v => { m.remove(); res(v); };
    $('.ghost', f).onclick = () => close(null);
    f.onsubmit = e => { e.preventDefault(); const o = {}; fields.forEach(([k]) => o[k] = f.elements[k].value.trim()); close(o); };
    m.addEventListener('pointerdown', e => { if (e.target === m) close(null); });
  });
}

/* ---------------------------- barra lateral ---------------------------- */
function renderSide() {
  const s = $('#side');
  const item = (id, label, count, drop) => `<div class="si${S.view === id ? ' on' : ''}" data-v="${id}"${drop ? ' data-drop' : ''}><span>${esc(label)}</span><i>${count ?? ''}</i></div>`;
  s.innerHTML = `<div class="logo"><img src="ousify2.png" alt="" width="30" height="30"> Ousify</div>${item('lib', 'Biblioteca', lib.length)}${item('web', 'Buscar mp3')}
    <div class="sh">Mis listas<button data-a="newlist" title="Nueva lista">+</button></div>
    ${S.lists.map(l => item(l.id, l.name, l.ids.length, true)).join('')}
    ${OFF.length ? `<div class="sh">Listas de Ousify ✓</div>${OFF.map(o => item('o:' + o.id, o.name, o.tracks.length)).join('')}` : ''}<div class="sp"></div>${item('set', 'Ajustes del reproductor')}`;
}
$('#side').onclick = e => {
  if (e.target.closest('[data-a=newlist]')) return newList();
  const v = e.target.closest('[data-v]'); if (v) { S.view = v.dataset.v; save(); render(); }
};
$('#side').addEventListener('dragover', e => { const t = e.target.closest('[data-drop]'); $$('.dropping').forEach(x => x.classList.remove('dropping')); if (t && e.dataTransfer.types.includes('text/track')) { e.preventDefault(); t.classList.add('dropping'); } });
$('#side').addEventListener('dragleave', () => $$('.dropping').forEach(x => x.classList.remove('dropping')));
$('#side').addEventListener('drop', e => {
  $$('.dropping').forEach(x => x.classList.remove('dropping'));
  const t = e.target.closest('[data-drop]'), id = e.dataTransfer.getData('text/track'); if (!t || !id) return; e.preventDefault();
  const l = listBy(t.dataset.v), tr = lib.find(x => x.id === id);
  if (l && tr && !l.ids.includes(id)) { l.ids.push(id); save(); emit(true); toast(`Añadida a “${l.name}”`); }
});
async function newList() {
  const r = await ask('Nueva lista', [['name', 'Nombre'], ['cover', 'Portada (enlace a una imagen, opcional)']]); if (!r || !r.name) return;
  const l = { id: uid(), name: r.name, ids: [], cover: r.cover, order: 'manual' }; S.lists.push(l); S.view = l.id; save(); render();
}

/* ---------------------------- vista principal ---------------------------- */
const V = { ctx: '', tracks: [], results: [], status: '', q: '', filter: '', manual: false };
const main = $('#main');
function rowHTML(t, i) {
  const l = V.ctx === 'web' ? libFor(t) : t, ctx = V.ctx, k = keyOf(t);
  return `<div class="row" data-i="${i}" data-k="${esc(k)}"${l && l.id && ctx !== 'web' ? ' draggable="true"' : ''}>
    ${V.manual ? '<span class="grip" title="Arrastra para ordenar">≡</span>' : ''}
    <div class="th" style="background:${cover(t)}"></div>
    <div class="n"><b>${esc(t.name)}</b><span>${esc(t.artist || '—')}${t.from ? `<i class="badge">${esc(t.from)}</i>` : ''}${t.blob ? '<i class="badge">mp3 guardado</i>' : ''}</span></div>
    <button class="fav${isFav(t) ? ' on' : ''}" data-h title="Tus favoritas">${ic('heart', 17)}</button>
    <button data-l title="Añadir a una lista">${ic('plus', 17)}</button>
    ${ctx !== 'web' && ctx !== 'off' ? `<button data-e title="Editar nombre, artista y portada">${ic('edit', 16)}</button>` : ''}
    <button data-dl title="${t.blob ? 'Descargar mp3 a tu equipo' : ctx === 'web' ? 'Guardar mp3 en tu biblioteca' : 'Guardar mp3 sin conexión'}">${ic('dl', 17)}</button>
    ${ctx === 'lib' ? `<button data-rm title="Borrar de la biblioteca">${ic('x', 15)}</button>` : ctx !== 'web' && ctx !== 'off' ? `<button data-rm title="Quitar de la lista">${ic('x', 15)}</button>` : ''}</div>`;
}
function paintRows() {
  const box = $('.rows', main); if (!box) return;
  if (V.ctx === 'web') V.tracks = V.results;
  else { const f = V.filter.toLowerCase(); V.tracks = viewTracks(S.view).filter(t => !f || (t.name + ' ' + (t.artist || '')).toLowerCase().includes(f)); }
  const empty = V.ctx === 'lib' ? 'Aún no hay música.<br>Pulsa “+ Archivos mp3” o “+ Enlace mp3”, o busca en “Buscar mp3”.' :
    V.ctx === 'web' ? 'Busca por título o artista (Audius y Jamendo) o pega un enlace directo a un mp3.' : 'Lista vacía.<br>Usa el botón + de cualquier canción o arrástrala a la lista.';
  box.innerHTML = V.status ? `<div class="hint">${esc(V.status)}</div>` : V.tracks.map(rowHTML).join('') || `<div class="hint">${empty}</div>`;
  markCur();
}
const markCur = () => { const k = P.cur ? keyOf(P.cur) : null; $$('.row', main).forEach(r => r.classList.toggle('cur', r.dataset.k === k)); };
function render() { renderSide(); renderMain(); }
function renderMain() {
  const v = S.view;
  if (v === 'set') return renderSettings();
  if (v.startsWith('o:')) return renderOfficial(v);
  if (v === 'web') {
    V.ctx = 'web'; V.manual = false;
    main.innerHTML = `<div class="mhd"><div><h1>Buscar mp3</h1><small>Audius y Jamendo (música libre). También puedes pegar un enlace directo a un mp3.</small></div></div>
      <div class="acts"><input id="qs" placeholder="Título, artista o enlace .mp3…" value="${esc(V.q)}"><button class="pri" data-a="go">Buscar</button></div><div class="rows"></div>`;
    $('#qs').onkeydown = e => { if (e.key === 'Enter') searchGo(); }; $('#qs').oninput = e => V.q = e.target.value;
    return paintRows();
  }
  const isLib = v === 'lib', l = isLib ? null : listBy(v); V.ctx = isLib ? 'lib' : 'list';
  const ord = S.orders[v] || (isLib ? 'old' : 'manual'); V.manual = !isLib && ord === 'manual';
  const total = isLib ? lib.length : l.ids.length;
  const opts = (isLib ? [] : [['manual', 'Mi orden (arrastrar)']]).concat([['title', 'Título A–Z'], ['artist', 'Artista A–Z'], ['recent', 'Más recientes'], ['old', 'Más antiguas']]);
  main.innerHTML = `<div class="mhd">${l ? `<div class="cv" style="background:${l.cover ? cover({ cover: l.cover }) : cover({ name: l.name })}"></div>` : ''}
    <div><small>${isLib ? 'Todo tu mp3' : v === FAV ? 'Favoritas' : 'Lista'}</small><h1>${esc(isLib ? 'Biblioteca' : l.name)}</h1><small>${total} canciones</small></div></div>
    <div class="acts"><button class="pri" data-a="playall">▶ Reproducir</button><button class="btn" data-a="shuffleall">Aleatorio</button>
      <select data-o title="Orden">${opts.map(([k, n]) => `<option value="${k}"${k === ord ? ' selected' : ''}>${n}</option>`).join('')}</select>
      <input data-f placeholder="Filtrar…" value="${esc(V.filter)}">
      ${isLib ? '<button class="btn" data-a="files">+ Archivos mp3</button><button class="btn" data-a="dir">+ Carpeta</button><button class="btn" data-a="link">+ Enlace mp3</button><button class="btn" data-a="covers" title="Busca automáticamente la portada de las canciones que no la tienen">🖼 Buscar portadas</button><button class="btn" data-a="swap" title="Si los títulos y artistas salen al revés">⇄ Invertir título/artista</button>' :
        `<button class="btn" data-a="editlist">Editar lista</button>${v === FAV ? '' : '<button class="btn" data-a="dellist">Eliminar lista</button>'}`}</div><div class="rows"></div>`;
  paintRows();
}
async function searchGo() {
  const q = ($('#qs') ? $('#qs').value : V.q).trim(); if (!q) return; V.q = q; V.status = 'Buscando…'; paintRows();
  if (/^https?:\/\/\S+/i.test(q)) {
    V.results = [{ url: q, name: decodeURIComponent(q.split('/').pop().split('?')[0] || 'mp3'), artist: '', cover: '' }]; V.status = ''; return paintRows();
  }
  const jobs = [audiusSearch(q)]; if (S.keys.jamendo) jobs.push(jamendoSearch(q));
  const res = await Promise.allSettled(jobs), lists = res.filter(r => r.status === 'fulfilled').map(r => r.value);
  V.results = []; for (let i = 0; lists.some(l => i < l.length); i++) lists.forEach(l => l[i] && V.results.push(l[i]));
  V.status = V.results.length ? '' : res.some(r => r.status === 'rejected') ? 'No se pudo buscar (¿sin conexión?). Prueba a pegar un enlace directo a un mp3.' : 'Sin resultados.';
  paintRows();
}
function renderOfficial(v) {
  V.ctx = 'off'; V.manual = false;
  const o = OFF.find(x => 'o:' + x.id === v);
  if (!o) { main.innerHTML = '<div class="hint">Lista no disponible.</div>'; return; }
  const ord = S.orders[v] || 'manual';
  const opts = [['manual', 'Orden original'], ['title', 'Título A–Z'], ['artist', 'Artista A–Z']];
  main.innerHTML = `<div class="mhd"><div class="cv" style="background:${cover({ cover: o.cover, name: o.name })}"></div>
    <div><small>✓ Lista verificada de Ousify</small><h1>${esc(o.name)}</h1><small>${o.tracks.length} canciones${o.description ? ' · ' + esc(o.description) : ''}</small></div></div>
    <div class="acts"><button class="pri" data-a="playall">▶ Reproducir</button><button class="btn" data-a="shuffleall">Aleatorio</button>
      <select data-o title="Orden">${opts.map(([k, n]) => `<option value="${k}"${k === ord ? ' selected' : ''}>${n}</option>`).join('')}</select>
      <input data-f placeholder="Filtrar…" value="${esc(V.filter)}"><button class="btn" data-a="copylist">Copiar a mis listas</button></div><div class="rows"></div>`;
  paintRows();
}
async function loadOfficial() {
  try {
    const r = await fetch('playlists.json', { cache: 'no-cache' }); if (!r.ok) return; const j = await r.json();
    OFF = (j.lists || []).filter(l => l && l.id && l.name).map(l => ({ ...l, tracks: (l.tracks || []).filter(t => t.url).map(t => ({ url: t.url, name: t.title || t.name || 'Sin título', artist: t.artist || '', album: t.album || '', year: t.year || '', cover: t.cover || '', from: 'Ousify' })) }));
    if (OFF.length) render();
  } catch { /* sin playlists.json o sin red: simplemente no hay listas verificadas */ }
}
async function editTrack(t) {
  const fields = [['name', 'Título'], ['artist', 'Artista'], ['cover', 'Portada (enlace a una imagen)']]; if (t.url) fields.push(['url', 'Enlace del mp3']);
  const find = ['🔎 Buscar portada', async (f, b) => {
    const txt = b.textContent; b.disabled = true; b.textContent = 'Buscando…';
    try { const x = await findCover(f.elements.name.value, f.elements.artist.value); if (x) { f.elements.cover.value = x.cover; toast('Portada encontrada. Pulsa Aceptar para guardarla.'); } else toast('No se encontró ninguna portada.'); }
    catch { toast('No se pudo buscar (¿sin conexión?).'); }
    b.disabled = false; b.textContent = txt;
  }];
  const r = await ask('Editar canción', fields, { name: t.name, artist: t.artist, cover: t.cover, url: t.url }, [find]); if (!r) return;
  if (r.cover !== t.cover) { t.coverAuto = false; t.coverTried = true; }
  Object.assign(t, { name: r.name || t.name, artist: r.artist, cover: r.cover }); if (t.url && r.url) t.url = r.url;
  const { from, ...rec } = t; await putTrack(rec); emit(true);
}
function listMenu(ev, t) {
  const rect = ev.target.closest('button').getBoundingClientRect(), l = libFor(t);
  const e = S.lists.map(li => [(l && li.ids.includes(l.id) ? '✓ ' : '') + li.name, () => toggleInList(t, li.id)]);
  showMenu(rect.left, rect.bottom + 4, [...e, '-', ['Nueva lista con esta canción…', async () => { await newList(); const nl = S.lists[S.lists.length - 1]; if (nl && !nl.ids.length) toggleInList(t, nl.id); }]]);
}
main.onclick = async e => {
  const bt = e.target.closest('button'), r = e.target.closest('.row'), a = bt && bt.dataset.a;
  if (a === 'covers') { lib.forEach(t => { if (!t.cover) t.coverTried = false; }); return autoCovers(); }
  if (a === 'copylist') {
    const o = OFF.find(x => 'o:' + x.id === S.view); if (!o) return;
    const l = { id: uid(), name: o.name, ids: [], cover: o.cover || '', order: 'manual' };
    for (const t of o.tracks) l.ids.push((await ensureInLib(t)).id);
    S.lists.push(l); S.view = l.id; save(); render(); toast(`Copiada a tus listas: “${l.name}”.`); return;
  }
  if (a === 'swap') {
    if (!confirm('¿Intercambiar título y artista en TODAS las canciones de la biblioteca que tengan artista?')) return;
    for (const t of lib) { if (!t.artist) continue; [t.name, t.artist] = [t.artist, t.name]; await putTrack({ ...t }); }
    await refreshLib(); toast('Título y artista intercambiados.'); return;
  }
  if (a === 'files') return $('#filepick').click(); if (a === 'dir') return $('#dirpick').click(); if (a === 'go') return searchGo();
  if (a === 'link') { const x = await ask('Añadir enlace mp3', [['url', 'Enlace directo al mp3'], ['name', 'Título'], ['artist', 'Artista'], ['cover', 'Portada (enlace a imagen)']]); if (!x || !x.url) return;
    await ensureInLib({ url: x.url, name: x.name || decodeURIComponent(x.url.split('/').pop().split('?')[0]) || 'mp3', artist: x.artist, cover: x.cover }); await refreshLib(); return; }
  if (a === 'playall' || a === 'shuffleall') { if (!V.tracks.length) return toast('No hay canciones.'); P.shuf = a === 'shuffleall'; play(V.tracks, P.shuf ? Math.floor(Math.random() * V.tracks.length) : 0); return; }
  if (a === 'editlist') { const l = listBy(S.view); const x = await ask('Editar lista', [['name', 'Nombre'], ['cover', 'Portada (enlace a imagen)']], { name: l.name, cover: l.cover }); if (x) { l.name = x.name || l.name; l.cover = x.cover; save(); render(); } return; }
  if (a === 'dellist') { const l = listBy(S.view); if (confirm(`¿Eliminar la lista “${l.name}”? (las canciones se mantienen en la biblioteca)`)) { S.lists = S.lists.filter(x => x !== l); S.view = 'lib'; save(); render(); } return; }
  if (!r) return; const t = V.tracks[+r.dataset.i]; if (!t) return;
  if (bt && bt.dataset.h != null) return toggleFav(t);
  if (bt && bt.dataset.l != null) return listMenu(e, t);
  if (bt && bt.dataset.e != null) return editTrack(t);
  if (bt && bt.dataset.dl != null) {
    bt.style.opacity = .3;
    try { if (t.blob) await exportMp3(t); else if (V.ctx === 'web') { await saveOffline(t); toast('mp3 guardado en tu biblioteca.'); } else { await saveOffline(t); toast('mp3 guardado sin conexión.'); } }
    catch { toast('Este servidor no permite descargar el mp3.'); } bt.style.opacity = ''; return;
  }
  if (bt && bt.dataset.rm != null) {
    if (V.ctx === 'lib') { if (!confirm(`¿Borrar “${t.name}” de la biblioteca?`)) return; await delTrack(t.id); S.lists.forEach(l => l.ids = l.ids.filter(id => id !== t.id)); save(); if (P.cur && P.cur.id === t.id) { audio.pause(); P.cur = null; } await refreshLib(); }
    else { const l = listBy(S.view); l.ids = l.ids.filter(id => id !== t.id); save(); emit(true); }
    return;
  }
  if (bt) return;
  play(V.tracks, +r.dataset.i);
};
main.onchange = e => { if (e.target.dataset.o) { S.orders[S.view] = e.target.value; save(); renderMain(); } };
main.oninput = e => { if (e.target.dataset.f != null) { V.filter = e.target.value; paintRows(); } };
/* arrastrar: reordenar (mi orden) y soltar en una lista de la barra lateral */
let dragId = null;
main.addEventListener('dragstart', e => { const r = e.target.closest('.row'); if (!r) return; const t = V.tracks[+r.dataset.i]; if (!t || !t.id) return; dragId = t.id; e.dataTransfer.setData('text/track', t.id); e.dataTransfer.effectAllowed = 'copyMove'; });
main.addEventListener('dragover', e => { if (!V.manual || !dragId) return; const r = e.target.closest('.row'); if (!r) return; e.preventDefault(); $$('.over', main).forEach(x => x.classList.remove('over')); r.classList.add('over'); });
main.addEventListener('drop', e => {
  if (!V.manual || !dragId) return; const r = e.target.closest('.row'); $$('.over', main).forEach(x => x.classList.remove('over')); if (!r) return; e.preventDefault();
  const to = V.tracks[+r.dataset.i]; if (!to || to.id === dragId) return;
  const l = listBy(S.view), from = l.ids.indexOf(dragId); l.ids.splice(from, 1); l.ids.splice(l.ids.indexOf(to.id), 0, dragId); save(); dragId = null; emit(true);
});
main.addEventListener('dragend', () => { dragId = null; $$('.over', main).forEach(x => x.classList.remove('over')); });

/* ---------------------------- ajustes del reproductor ---------------------------- */
const PRESETS = [['#16161c', '#1db954', '#ffffff'], ['#101828', '#38bdf8', '#e6f1ff'], ['#2a1020', '#ff4d8d', '#ffe3ee'], ['#1f1a0d', '#f5b301', '#fff4d6'], ['#f4f4f6', '#e11d48', '#15151a'], ['#0b1f17', '#4ade80', '#d9ffe9']];
function renderSettings() {
  V.ctx = 'set'; const c = S.mini;
  main.innerHTML = `<div class="set"><h2>Ajustes del reproductor</h2>
    <small>Los cambios se ven al instante en el reproductor. El reproductor flotante no muestra estos ajustes: solo usa lo que elijas aquí.</small>
    <label>Mostrar portada <input type="checkbox" data-c="cover"></label>
    <label>Fondo difuminado con la portada <input type="checkbox" data-c="blur"></label>
    <label>Buscar portadas solas al importar <input type="checkbox" data-t="autoCover"></label>
    <div class="fld">Nombre de los mp3 que importes <select data-fn><option value="ta">Título - Artista</option><option value="at">Artista - Título</option></select></div>
    <div class="fld">Tamaño <span class="cols"><button class="btn sz" data-sz="-1">−</button><input type="range" min=".7" max="1.8" step=".05" data-c="scale"><button class="btn sz" data-sz="1">+</button></span></div>
    <div class="fld">Formato <select data-c="mode"><option value="full">Completo</option><option value="compact">Compacto</option><option value="dot">Solo botón</option></select></div>
    <div class="fld">Estilo <select data-c="style"><option value="solid">Sólido</option><option value="grad">Degradado</option><option value="neon">Neón</option></select></div>
    <label>Color de fondo <input type="color" data-c="bg"></label>
    <label>Color principal (botones y barra) <input type="color" data-c="accent"></label>
    <label>Color del texto <input type="color" data-c="text"></label>
    <label>Opacidad <input type="range" min=".5" max="1" step=".02" data-c="op"></label>
    <div class="fld">Paletas <span class="cols">${PRESETS.map((p, i) => `<button class="pal" data-p="${i}" style="background:linear-gradient(135deg,${p[0]} 55%,${p[1]} 55%)"></button>`).join('')}</span></div>
    <label>Mostrar reproductor <input type="checkbox" data-c="visible"></label>
    <div class="fld">Posición <button class="btn" data-a="resetpos">Volver a la esquina</button></div>
    <div class="fld">Jamendo client_id (opcional) <input type="text" data-k="jamendo" placeholder="client_id" value="${esc(S.keys.jamendo)}"></div>
    <small>Con el client_id gratuito de developer.jamendo.com la búsqueda incluye Jamendo (mp3 descargables).</small></div>`;
  const fill = () => $$('[data-c]', main).forEach(i => { const v = c[i.dataset.c]; if (i.type === 'checkbox') i.checked = v; else i.value = v; });
  fill(); $('[data-fn]', main).value = S.fname || 'ta'; $('[data-t=autoCover]', main).checked = S.autoCover !== false;
  main.oninput = e => {
    if (e.target.dataset.t) { S[e.target.dataset.t] = e.target.checked; save(); return; }
    if (e.target.dataset.k) { S.keys[e.target.dataset.k] = e.target.value.trim(); save(); return; }
    const k = e.target.dataset.c; if (!k) { if (e.target.dataset.f != null) { V.filter = e.target.value; paintRows(); } return; }
    c[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.type === 'range' ? +e.target.value : e.target.value; save(); applyMini();
  };
  main.onchange = e => { if (e.target.dataset.fn) { S.fname = e.target.value; save(); return; } const k = e.target.dataset.c; if (k && e.target.tagName === 'SELECT') { c[k] = e.target.value; save(); applyMini(); } if (e.target.dataset.o) { S.orders[S.view] = e.target.value; save(); renderMain(); } };
  const base = main.onclick;
  main.onclick = e => {
    const p = e.target.closest('[data-p]'), z = e.target.closest('[data-sz]');
    if (p) { const x = PRESETS[+p.dataset.p]; Object.assign(c, { bg: x[0], accent: x[1], text: x[2] }); save(); applyMini(); fill(); return; }
    if (z) { c.scale = clamp(+(c.scale + .1 * +z.dataset.sz).toFixed(2), .7, 1.8); save(); applyMini(); fill(); return; }
    if (e.target.dataset.a === 'resetpos') { c.x = c.y = null; save(); applyMini(); return; }
    base(e);
  };
}

/* ---------------------------- mini reproductor ---------------------------- */
function buildMini() {
  const m = MINI;
  m.innerHTML = `
    <div class="mblur"><i></i></div>
    <div class="mhead"><span class="mgrip"></span>
      <button class="mbtn" data-m="pip" title="Ventana flotante fuera de la pestaña">${ic('pip', 18)}</button>
      <button class="mbtn" data-m="mode" title="Comprimir / expandir">${ic('down', 18)}</button></div>
    <div class="mbody">
      <div class="mcov"></div>
      <div class="minfo"><b class="mt">Nada sonando</b><span class="ma"></span></div>
      <input class="mseek" type="range" min="0" max="1000" value="0">
      <div class="mtm"><span class="mc">0:00</span><span class="md">0:00</span></div>
      <div class="mctl">
        <button class="mbtn" data-m="shuf" title="Aleatorio">${ic('shuf')}</button>
        <button class="mbtn" data-m="prev">${ic('prev', 22)}</button>
        <button class="mbtn mplay" data-m="play">${ic('play', 24)}</button>
        <button class="mbtn" data-m="next">${ic('next', 22)}</button>
        <button class="mbtn" data-m="rep" title="Repetir lista">${ic('rep')}</button>
        <button class="mbtn fav" data-m="fav" title="Tus favoritas">${ic('heart')}</button></div></div>
    <div class="mdot"><div class="mdcov"></div><button class="mbtn mplay" data-m="play" style="width:38px;height:38px">${ic('play', 20)}</button><button class="mbtn" data-m="mode" title="Expandir">${ic('up', 18)}</button></div>
    <div class="mrs" title="Arrastra para cambiar el tamaño"></div>`;
  m.onclick = e => {
    const b = e.target.closest('[data-m]'); if (!b) return; const a = b.dataset.m;
    if (a === 'play') toggle(); else if (a === 'next') next(); else if (a === 'prev') prev();
    else if (a === 'shuf') { P.shuf = !P.shuf; syncMini(); } else if (a === 'rep') { P.rep = !P.rep; syncMini(); }
    else if (a === 'fav') toggleFav(P.cur); else if (a === 'pip') popOut();
    else if (a === 'mode') { S.mini.mode = { full: 'compact', compact: 'dot', dot: 'full' }[S.mini.mode]; save(); applyMini(); }
  };
  m.oninput = e => { if (e.target.classList.contains('mseek')) seekTo(e.target.value / 1000); };
  const mv = () => { S.mini.x = parseInt(m.style.left); S.mini.y = parseInt(m.style.top); save(); };
  drag($('.mhead', m), m, { onend: (e, moved) => moved && mv() }); drag($('.mdcov', m), m, { onend: (e, moved) => moved && mv() });
  $('.mrs', m).addEventListener('pointerdown', ev => {
    ev.preventDefault(); const s0 = S.mini.scale, sx = ev.clientX, sy = ev.clientY;
    const mm = e => { S.mini.scale = clamp(+(s0 + ((e.clientX - sx) + (e.clientY - sy)) / 2 / 300).toFixed(2), .7, 1.8); applyMini(true); };
    const up = () => { removeEventListener('pointermove', mm); removeEventListener('pointerup', up); save(); if (S.view === 'set') renderSettings(); };
    addEventListener('pointermove', mm); addEventListener('pointerup', up);
  });
  subs.add(syncMini); tsubs.add(tickMini); applyMini(); syncMini();
}
function applyMini(keepPos) {
  const m = MINI, c = S.mini, pip = m.classList.contains('in-pip');
  m.hidden = !c.visible && !pip;
  m.className = `st-${c.style} m-${c.mode}` + (c.cover ? '' : ' no-cover') + (c.blur ? ' blur' : '') + (pip ? ' in-pip' : '');
  m.style.setProperty('--veil', hexA(c.bg, .4));
  const bg = c.style === 'grad' ? `linear-gradient(160deg,${hexA(c.bg, c.op)},color-mix(in srgb,${hexA(c.bg, c.op)} 62%,${c.accent}))` : hexA(c.bg, c.op);
  m.style.setProperty('--mbg', bg); m.style.setProperty('--ac', c.accent); m.style.setProperty('--tx', c.text);
  document.documentElement.style.setProperty('--ac', c.accent);
  m.style.transform = pip ? '' : `scale(${c.scale})`;
  if (pip) return;
  requestAnimationFrame(() => {
    const r = m.getBoundingClientRect();
    if (c.x == null) { c.x = Math.round(innerWidth - r.width - 20); c.y = Math.round(innerHeight - r.height - 24); }
    m.style.left = clamp(c.x, 0, Math.max(0, innerWidth - 60)) + 'px'; m.style.top = clamp(c.y, 0, Math.max(0, innerHeight - 40)) + 'px';
  });
}
function syncMini() {
  const m = MINI, t = P.cur;
  $('.mt', m).textContent = t ? t.name : 'Nada sonando'; $('.ma', m).textContent = t ? (t.artist || '') : 'Elige una canción';
  const cv = cover(t); $('.mcov', m).style.background = cv; $('.mdcov', m).style.background = cv; $('.mblur i', m).style.background = cv;
  $$('[data-m=play]', m).forEach(b => b.innerHTML = ic(audio.paused ? 'play' : 'pause', 24));
  $('[data-m=shuf]', m).classList.toggle('on', P.shuf); $('[data-m=rep]', m).classList.toggle('on', P.rep);
  $('[data-m=fav]', m).classList.toggle('on', isFav(t));
  document.title = t ? `${audio.paused ? '' : '▶ '}${t.name}${t.artist ? ' — ' + t.artist : ''}` : 'Ousify';
  if (P.pip) P.pip.document.title = document.title;
  tickMini();
}
function tickMini() {
  const m = MINI, d = durTime(), c = curTime(), s = $('.mseek', m);
  $('.mc', m).textContent = fmt(c); $('.md', m).textContent = fmt(d);
  if (!s.matches(':active') && d) s.value = c / d * 1000;
}
async function popOut() {
  const m = MINI;
  if (P.pip) { P.pip.close(); return; }
  if (!('documentPictureInPicture' in window)) { toast('Tu navegador no admite la ventana flotante (usa Chrome o Edge). Puedes controlar la música con las teclas multimedia.'); return; }
  try {
    const w = await documentPictureInPicture.requestWindow({ width: 340, height: S.mini.mode === 'full' ? (S.mini.cover ? 500 : 230) : 140 });
    P.pip = w;
    w.addEventListener('pagehide', () => { m.classList.remove('in-pip'); document.body.append(m); P.pip = null; applyMini(); syncMini(); });
    w.addEventListener('keydown', e => { if (e.code === 'Space') { e.preventDefault(); toggle(); } });
    const l = w.document.createElement('link'); l.rel = 'stylesheet'; l.href = new URL('style.css', location.href).href; w.document.head.append(l);
    w.document.body.style.cssText = `margin:0;background:${S.mini.bg};overflow:hidden`;
    m.classList.add('in-pip'); w.document.body.append(m); applyMini(); syncMini();
    w.setInterval(beat, 250); /* el flotante también se refresca por su cuenta */
  } catch (e) { console.error(e); toast('No se pudo abrir la ventana flotante.'); }
}

/* ---------------------------- arranque ---------------------------- */
$('#filepick').onchange = async e => { const n = await addFiles(e.target.files); e.target.value = ''; if (n) toast(`${n} mp3 añadidos.`); };
$('#dirpick').onchange = async e => { const n = await addFiles(e.target.files); e.target.value = ''; if (n) toast(`${n} mp3 añadidos.`); };
document.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); });
document.addEventListener('drop', async e => { if (e.dataTransfer.files.length) { e.preventDefault(); const n = await addFiles(e.dataTransfer.files); if (n) toast(`${n} mp3 añadidos.`); } });
addEventListener('keydown', e => { if (e.code === 'Space' && !e.target.closest('input,textarea,select,button')) { e.preventDefault(); toggle(); } });
addEventListener('resize', () => applyMini());
subs.add(full => { if (full) { renderSide(); if (S.view !== 'set') { if ($('.rows', main)) { const t = $('.mhd small:last-child', main); paintRows(); if (t && (V.ctx === 'lib' || V.ctx === 'list')) t.textContent = (S.view === 'lib' ? lib.length : listBy(S.view).ids.length) + ' canciones'; } } } else markCur(); });
buildMini(); render(); refreshLib(); loadOfficial();
/* latido: pase lo que pase, el reproductor (también el flotante) refleja la canción y el minuto reales */
let sig = '';
function beat() {
  const t = P.cur, s = [t ? keyOf(t) : '', t ? t.name : '', t ? t.artist : '', t ? t.cover : '', audio.paused, P.shuf, P.rep, isFav(t)].join('|');
  try { if (s !== sig) { sig = s; syncMini(); } else tickMini(); } catch (err) { console.error(err); }
}
setInterval(beat, 250);
