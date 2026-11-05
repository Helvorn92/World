/* ═══════════════════════════════════════════════════════════════
   GWERNIA · ACCESSO E TAVOLI
   Un solo modulo, caricato da tutte le pagine.

   Dati (Firestore)
     books, icons, maps/ravenholm/pins   originali, li legge solo il master, ogni voce ha tables: [id, ...]
     tables/{t}                          il tavolo
     tables/{t}/members/{uid}            chi può entrare nel tavolo
     tables/{t}/books|icons|pins/{id}    copia di ciò che è sbloccato per quel tavolo
     tables/{t}/meta/shelf|gallery       numero totale di voci (segnaposto "?")
     players/{uid}                       nome utente e tavoli del giocatore
     secrets/{uid}                       codice del giocatore, solo per il master

   Il menu e il muro di accesso sono nascosti dal CSS fin dal primo disegno
   (classe html.gw-hint, ricordata in localStorage), quindi non c'è sfarfallio.
   ═══════════════════════════════════════════════════════════════ */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, getDoc, getDocs, deleteDoc, updateDoc, onSnapshot, writeBatch, query, where, arrayRemove } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const CFG = {
  apiKey: "AIzaSyCCfucSV5KmGd4M9Bg7mD4UPhbBK4ce0-k",
  authDomain: "gwernia.firebaseapp.com",
  projectId: "gwernia",
  storageBucket: "gwernia.firebasestorage.app",
  messagingSenderId: "442880358118",
  appId: "1:442880358118:web:71b180258d8dc98d786d27",
  measurementId: "G-4TEN29F7HG"
};
const app = initializeApp(CFG);
const auth = getAuth(app);
const db = getFirestore(app);
setPersistence(auth, browserLocalPersistence).catch(() => {});

const PAGE = window.GW_PAGE || '';
const DOMAIN = '@giocatori.gwernia';                       /* i giocatori accedono con nome@giocatori.gwernia, senza vederlo */
const GATED_PAGES = ['metropoli', 'ravenholm', 'crevasse'];  /* pagine dell'index riservate ai tavoli */
const MAP = 'ravenholm';
const META_OF = { books: 'shelf', icons: 'gallery' };

const G = window.GW = { ready: false, user: null, isAdmin: false, isPlayer: false, username: '', tables: [], tableNames: {}, tablesAll: {}, players: {}, secrets: {} };
let resolveReady; G.whenReady = new Promise(r => { resolveReady = r; });

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const isPlayerEmail = e => !!e && String(e).toLowerCase().endsWith(DOMAIN);
const slug = s => String(s || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '.').replace(/[^a-z0-9._-]/g, '');
const toEmail = name => name.indexOf('@') > -1 ? name.trim() : slug(name) + DOMAIN;
const tableName = id => (G.tablesAll[id] && G.tablesAll[id].name) || G.tableNames[id] || 'Tavolo';
const sortedTables = () => Object.keys(G.tablesAll).sort((a, b) => tableName(a).localeCompare(tableName(b), 'it'));
const noop = () => {};

/* ═══════════ STILE (solo finestre del modulo, il resto sta nel tema) ═══════════ */
const style = document.createElement('style');
style.textContent = `
.gw-ov{position:fixed;inset:0;z-index:99990;background:rgba(5,5,9,.86);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);display:none;align-items:center;justify-content:center;padding:16px}
.gw-ov.open{display:flex}
.gw-box{position:relative;background:#101017;border:1px solid #a28b6e;border-top:2px solid #a28b6e;width:min(560px,100%);max-height:92vh;overflow:auto;padding:28px 30px 26px;color:#e7e1d6;font-family:'Spectral',Georgia,serif;font-size:1.05rem;box-shadow:0 30px 70px rgba(0,0,0,.7)}
.gw-box.wide{width:min(1020px,100%);padding:0;display:flex;flex-direction:column;height:min(760px,92vh)}
.gw-x{position:absolute;top:10px;right:14px;background:none;border:0;color:#b9b0a0;font-size:1.3rem;cursor:pointer;z-index:2;line-height:1}
.gw-x:hover{color:#e7e1d6}
.gw-h{font-family:'Forum',Georgia,serif;font-weight:400;font-size:1.8rem;color:#e7e1d6;margin:0 0 .3rem;text-align:center}
.gw-sub{text-align:center;color:#b9b0a0;font-size:1rem;margin:0 0 1.1rem;line-height:1.5}
.gw-l{display:block;font-family:'Forum',Georgia,serif;font-size:.82rem;letter-spacing:.2em;text-transform:uppercase;color:#a28b6e;margin:1.1rem 0 .4rem}
.gw-box input[type=text],.gw-box input[type=password],.gw-box select{width:100%;box-sizing:border-box;background:#0b0b0f;border:1px solid rgba(162,139,110,.45);color:#e7e1d6;font-family:'Spectral',Georgia,serif;font-size:1.05rem;padding:.6rem .8rem;border-radius:0;outline:0;min-width:0}
.gw-box input:focus,.gw-box select:focus{border-color:#c9b697}
.gw-btn{font-family:'Forum',Georgia,serif;font-size:.95rem;letter-spacing:.14em;text-transform:uppercase;color:#e7e1d6;background:#14121c;border:1px solid rgba(162,139,110,.6);padding:.6rem 1.1rem;cursor:pointer;border-radius:0;white-space:nowrap}
.gw-btn:hover{border-color:#c9b697;background:#1c1824}
.gw-btn:disabled{opacity:.5;cursor:default}
.gw-btn.pri{background:linear-gradient(180deg,#6a2432,#5a1f2b);border-color:rgba(231,225,214,.45)}
.gw-btn.pri:hover{background:linear-gradient(180deg,#7a2a3a,#661f2f)}
.gw-btn.dng{border-color:rgba(184,112,124,.6);color:#d49aa4}
.gw-btn.sm{font-size:.78rem;padding:.4rem .75rem;letter-spacing:.1em}
.gw-row{display:flex;gap:10px;align-items:center}
.gw-row.end{justify-content:flex-end}
.gw-row.wrap{flex-wrap:wrap}
.gw-err{color:#d49aa4;font-size:.95rem;min-height:1.2em;margin:.7rem 0 0;text-align:center}
.gw-muted{color:#8f8678;font-size:.95rem}
.gw-chk{display:inline-flex;align-items:center;gap:7px;cursor:pointer;color:#e7e1d6}
.gw-chk input{accent-color:#a28b6e;width:16px;height:16px}
.gw-tp{display:flex;flex-wrap:wrap;gap:6px 16px}
/* pannello del master */
.gw-head{flex:0 0 auto;padding:22px 30px 0;border-bottom:1px solid rgba(162,139,110,.35)}
.gw-head .gw-h{text-align:left;font-size:1.9rem;margin:0 0 14px}
.gw-tabs{display:flex;gap:4px}
.gw-tab{font-family:'Forum',Georgia,serif;font-size:.95rem;letter-spacing:.16em;text-transform:uppercase;background:none;border:0;border-bottom:2px solid transparent;color:#b9b0a0;padding:.7rem 1.3rem;cursor:pointer;margin-bottom:-1px}
.gw-tab:hover{color:#e7e1d6}
.gw-tab.on{color:#e7e1d6;border-bottom-color:#a28b6e;background:rgba(90,31,43,.35)}
.gw-body{flex:1 1 auto;min-height:0;overflow:auto;padding:24px 30px}
.gw-foot{flex:0 0 auto;min-height:2.6rem;padding:.7rem 30px;border-top:1px solid rgba(162,139,110,.25);font-size:.95rem;color:#b9b0a0}
.gw-foot.ok{color:#b5c9a0}.gw-foot.ko{color:#d49aa4}
.gw-split{display:grid;grid-template-columns:280px minmax(0,1fr);gap:28px;align-items:start}
.gw-side{display:flex;flex-direction:column;gap:8px}
.gw-li{display:flex;justify-content:space-between;align-items:center;gap:10px;text-align:left;width:100%;background:rgba(20,18,28,.7);border:1px solid rgba(162,139,110,.3);color:#e7e1d6;font-family:'Spectral',Georgia,serif;font-size:1.08rem;padding:.75rem .95rem;cursor:pointer;border-radius:0}
.gw-li:hover{border-color:#c9b697}
.gw-li.on{background:linear-gradient(180deg,#6a2432,#5a1f2b);border-color:rgba(231,225,214,.45)}
.gw-li em{font-style:normal;color:#b9b0a0;font-size:.92rem}
.gw-card{border:1px solid rgba(162,139,110,.3);background:rgba(20,18,28,.7);padding:1rem 1.2rem;margin:0 0 14px}
.gw-card h3{font-family:'Forum',Georgia,serif;font-weight:400;font-size:1.25rem;margin:0 0 .6rem;color:#e7e1d6}
.gw-line{display:flex;align-items:center;gap:12px;padding:.55rem 0;border-top:1px solid rgba(162,139,110,.18)}
.gw-line:first-of-type{border-top:0}
.gw-line b{font-weight:500;flex:1;min-width:0;overflow-wrap:anywhere}
.gw-code{font-family:ui-monospace,Consolas,monospace;color:#c9b697;background:#0b0b0f;padding:3px 9px;border:1px solid rgba(162,139,110,.3)}
.gw-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:.5rem}
.gw-chip{font-family:'Spectral',Georgia,serif;font-size:.98rem;color:#b9b0a0;background:transparent;border:1px solid rgba(162,139,110,.35);padding:.3rem .8rem;cursor:pointer;border-radius:0}
.gw-chip:hover{border-color:#c9b697;color:#e7e1d6}
.gw-chip.on{background:rgba(90,31,43,.75);border-color:rgba(231,225,214,.45);color:#e7e1d6}
.gw-grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
@media (max-width:760px){
  .gw-split{grid-template-columns:1fr;gap:18px}
  .gw-head,.gw-body,.gw-foot{padding-left:16px;padding-right:16px}
  .gw-tab{padding:.7rem .6rem;letter-spacing:.08em}
  .gw-grid2{grid-template-columns:1fr}
  .gw-box{padding:24px 18px 20px}
}
`;
document.head.appendChild(style);

/* ═══════════ FINESTRE ═══════════ */
/* si chiude con la X o con Esc; il fondo chiude solo se si preme e si rilascia fuori, e solo se lo si permette */
function overlay(id, opts) {
  let ov = $(id);
  if (ov) return ov;
  opts = opts || {};
  ov = document.createElement('div'); ov.id = id; ov.className = 'gw-ov';
  ov.innerHTML = '<div class="gw-box' + (opts.wide ? ' wide' : '') + '" role="dialog" aria-modal="true"><button class="gw-x" type="button" data-act="close" aria-label="Chiudi">✕</button><div class="gw-in" style="display:contents"></div></div>';
  let down = false;
  ov.addEventListener('mousedown', e => { down = e.target === ov; });
  ov.addEventListener('click', e => {
    const x = e.target.closest && e.target.closest('[data-act="close"]');
    if (x) { ov.classList.remove('open'); return; }
    if (down && e.target === ov && opts.backdrop !== false) ov.classList.remove('open');
    down = false;
  });
  document.body.appendChild(ov);
  return ov;
}
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const open = document.querySelectorAll('.gw-ov.open'); if (open.length) open[open.length - 1].classList.remove('open');
});

/* ═══════════ STATO DI ACCESSO ═══════════ */
function applyState() {
  const u = G.user;
  const root = document.documentElement;
  root.classList.toggle('gw-hint', !!u);
  try { localStorage.setItem('gw_in', u ? '1' : '0'); } catch (e) { /* niente */ }
  document.body.classList.toggle('is-admin', G.isAdmin);
  window.fbIsAdmin = G.isAdmin;
  const btn = $('admin-login-btn');
  if (btn) {
    btn.classList.toggle('is-admin', G.isAdmin);
    btn.title = u ? (G.isAdmin ? 'Master' : (G.username || 'Giocatore')) : 'Accedi';
  }
  renderLogin();
}

onAuthStateChanged(auth, async user => {
  G.user = user || null;
  G.isAdmin = !!user && !isPlayerEmail(user.email);
  G.isPlayer = !!user && !G.isAdmin;
  G.username = ''; G.tables = []; G.tableNames = {};
  if (G.isPlayer) {
    try {
      const s = await getDoc(doc(db, 'players', user.uid));
      if (s.exists()) { const d = s.data(); G.username = d.username || ''; G.tables = Array.isArray(d.tables) ? d.tables : []; }
      else G.username = String(user.email).split('@')[0];
      /* i nomi dei tavoli servono solo alla finestra del profilo, non bloccano nulla */
      G.tables.forEach(t => getDoc(doc(db, 'tables', t)).then(x => { if (x.exists()) { G.tableNames[t] = x.data().name; renderLogin(); } }).catch(noop));
    } catch (e) { console.error('Profilo giocatore:', e); }
  }
  if (G.isAdmin) watchTables(); else unwatchAdmin();
  const first = !G.ready;
  G.ready = true; resolveReady();
  applyState();
  const detail = { isAdmin: G.isAdmin, email: user ? user.email : null, uid: user ? user.uid : null };
  window.dispatchEvent(new CustomEvent('admin-state-changed', { detail }));
  window.dispatchEvent(new CustomEvent('auth-changed', { detail: { uid: G.isAdmin ? user.uid : null, email: detail.email } }));
  if (first) replayPending();
});

async function logout() {
  await signOut(auth);
  try { if (PAGE === 'index') sessionStorage.setItem('gwernia_page', 'home'); } catch (e) { /* niente */ }
  location.reload();
}
window.fbAdminLogout = logout;

/* ═══════════ FINESTRA DI ACCESSO ═══════════ */
let loginMsg = '';
function openLogin(msg) {
  loginMsg = msg || '';
  overlay('gw-login').classList.add('open');
  renderLogin();
  setTimeout(() => { const i = $('gw-user'); if (i) i.focus(); }, 60);
}
function renderLogin() {
  const ov = $('gw-login'); if (!ov) return;
  const box = ov.querySelector('.gw-in');
  if (!G.user) {
    box.innerHTML = '<h2 class="gw-h">Accesso</h2><p class="gw-sub">' + esc(loginMsg || 'Entra con il nome utente e il codice del tuo tavolo.') + '</p>' +
      '<form id="gw-form" autocomplete="on"><label class="gw-l" for="gw-user">Nome utente</label><input type="text" id="gw-user" autocomplete="username" autocapitalize="off" spellcheck="false">' +
      '<label class="gw-l" for="gw-code">Codice</label><input type="password" id="gw-code" autocomplete="current-password">' +
      '<p class="gw-err" id="gw-err"></p><div class="gw-row end"><button class="gw-btn pri" type="submit">Accedi</button></div></form>' +
      '<p class="gw-muted" style="text-align:center;margin:1rem 0 0">Il master accede con la sua email e la sua password.</p>';
    $('gw-form').addEventListener('submit', async e => {
      e.preventDefault();
      const n = $('gw-user').value, c = $('gw-code').value, err = $('gw-err'), btn = e.target.querySelector('button');
      if (!n.trim() || !c) { err.textContent = 'Scrivi nome utente e codice.'; return; }
      err.textContent = ''; btn.disabled = true;
      try { await signInWithEmailAndPassword(auth, toEmail(n), c); location.reload(); }
      catch (x) { err.textContent = 'Nome utente o codice non validi.'; btn.disabled = false; }
    });
  } else if (G.isAdmin) {
    box.innerHTML = '<h2 class="gw-h">Master</h2><p class="gw-sub">' + esc(G.user.email) + '</p>' +
      '<div class="gw-row wrap" style="justify-content:center"><button class="gw-btn pri" type="button" id="gw-open-admin">Tavoli e giocatori</button><button class="gw-btn" type="button" id="gw-out">Esci</button></div>';
    $('gw-open-admin').onclick = () => { ov.classList.remove('open'); openAdmin(); };
    $('gw-out').onclick = logout;
  } else {
    const tn = G.tables.map(tableName);
    box.innerHTML = '<h2 class="gw-h">' + esc(G.username || 'Giocatore') + '</h2><p class="gw-sub">' + (tn.length ? 'Tavoli: ' + esc(tn.join(', ')) : 'Non fai ancora parte di nessun tavolo.') + '</p>' +
      '<div class="gw-row" style="justify-content:center"><button class="gw-btn" type="button" id="gw-out">Esci</button></div>';
    $('gw-out').onclick = logout;
  }
}
window.openAdminLogin = () => openLogin();
window.closeAdminLogin = () => { const o = $('gw-login'); if (o) o.classList.remove('open'); };
window.fbLogin = (e, p) => signInWithEmailAndPassword(auth, e, p);   /* usata dal login di Avventure */
window.fbLogout = logout;

/* ═══════════ BLOCCO DELLE PAGINE ═══════════ */
let pending = null;
function replayPending() { if (pending && typeof window.showPage === 'function') { const p = pending; pending = null; window.showPage(p[0], p[1]); } }
window.GW_GATED = id => GATED_PAGES.indexOf(id) > -1 && !G.user;
if (PAGE === 'index' && typeof window.showPage === 'function') {
  const orig = window.showPage;
  window.showPage = function (id, link) {
    if (GATED_PAGES.indexOf(id) > -1) {
      if (!G.ready) { pending = [id, link]; return; }
      if (!G.user) {
        openLogin('Accedi per entrare nelle Metropoli.');
        if (!document.querySelector('.page.active')) orig.call(this, 'home');
        return;
      }
    }
    return orig.apply(this, arguments);
  };
}
const wallBtn = $('gw-wall-btn'); if (wallBtn) wallBtn.onclick = () => openLogin();

/* ═══════════ LETTURA DEI CONTENUTI ═══════════ */
const stat = { visible: 0, total: 0 }, metaListeners = new Set();
function emitMeta() { const n = G.isAdmin ? 0 : Math.max(0, stat.total - stat.visible); metaListeners.forEach(cb => { try { cb({ lockedCount: n }); } catch (e) { /* niente */ } }); }
const stopAll = list => () => list.forEach(u => { try { u(); } catch (e) { /* niente */ } });

/* Master: legge l'originale. Giocatore: legge le copie dei suoi tavoli. Ospite: niente. */
function subscribeItems(coll, cb) {
  let dead = false; const unsubs = [];
  G.whenReady.then(() => {
    if (dead) return;
    if (!G.user) { cb({}); return; }
    if (G.isAdmin) {
      unsubs.push(onSnapshot(collection(db, coll), snap => {
        const out = {};
        snap.forEach(d => { const v = d.data(); v.locked = !(Array.isArray(v.tables) && v.tables.length); out[d.id] = v; });
        cb(out);
      }, err => console.error(coll + ':', err)));
      return;
    }
    if (!G.tables.length) { cb({}); return; }
    const per = {}, totals = {};
    const emit = () => {
      const out = {}; Object.values(per).forEach(m => Object.assign(out, m));
      stat.visible = Object.values(out).filter(b => !b.deleted).length;
      stat.total = Math.max(0, ...Object.values(totals));
      cb(out); emitMeta();
    };
    G.tables.forEach(t => {
      per[t] = {}; totals[t] = 0;
      unsubs.push(onSnapshot(collection(db, 'tables', t, coll), snap => { const m = {}; snap.forEach(d => { m[d.id] = d.data(); }); per[t] = m; emit(); }, err => console.error('Tavolo ' + t + ':', err)));
      unsubs.push(onSnapshot(doc(db, 'tables', t, 'meta', META_OF[coll]), s => { totals[t] = s.exists() && typeof s.data().total === 'number' ? s.data().total : 0; emit(); }, noop));
    });
  });
  return () => { dead = true; stopAll(unsubs)(); };
}
function subscribePins(mapName, cb) {
  let dead = false; const unsubs = [];
  G.whenReady.then(() => {
    if (dead) return;
    if (!G.user) { cb({}); return; }
    if (G.isAdmin) {
      unsubs.push(onSnapshot(collection(db, 'maps', mapName, 'pins'), snap => { const out = {}; snap.forEach(d => { out[d.id] = d.data(); }); cb(out); }, err => console.error('Pin:', err)));
      return;
    }
    if (!G.tables.length) { cb({}); return; }
    const per = {};
    const emit = () => { const out = {}; Object.values(per).forEach(m => Object.assign(out, m)); cb(out); };
    G.tables.forEach(t => {
      per[t] = {};
      unsubs.push(onSnapshot(collection(db, 'tables', t, 'pins'), snap => {
        const m = {}; snap.forEach(d => { const v = d.data(); if (v.map === mapName) m[v.pinId || d.id] = v; }); per[t] = m; emit();
      }, err => console.error('Pin tavolo:', err)));
    });
  });
  return () => { dead = true; stopAll(unsubs)(); };
}

/* ═══════════ SCRITTURA (SOLO MASTER) ═══════════ */
async function syncTotals(coll, ids) {
  const snap = await getDocs(collection(db, coll));
  let n = 0; snap.forEach(d => { if (!d.data().deleted) n++; });
  await Promise.all((ids || Object.keys(G.tablesAll)).map(t => setDoc(doc(db, 'tables', t, 'meta', META_OF[coll]), { total: n }, { merge: true })));
}
/* salva l'originale e tiene allineate le copie nei tavoli scelti */
async function saveWithCopies(masterRef, copyRef, extra, data) {
  const prev = (await getDoc(masterRef)).data() || {};
  const clean = Object.assign({}, data); delete clean.locked;
  await setDoc(masterRef, clean, { merge: true });
  const full = Object.assign({}, prev, clean);
  const nowT = full.deleted ? [] : (Array.isArray(full.tables) ? full.tables : []);
  const all = Array.from(new Set((Array.isArray(prev.tables) ? prev.tables : []).concat(nowT)));
  if (!all.length) return;
  const b = writeBatch(db);
  all.forEach(t => { const r = copyRef(t); if (nowT.indexOf(t) > -1) b.set(r, Object.assign({}, full, extra)); else b.delete(r); });
  await b.commit();
}
async function saveItem(coll, id, data) {
  await saveWithCopies(doc(db, coll, id), t => doc(db, 'tables', t, coll, id), {}, data);
  await syncTotals(coll);
}
const savePin = (mapName, id, data) => saveWithCopies(doc(db, 'maps', mapName, 'pins', id), t => doc(db, 'tables', t, 'pins', mapName + '__' + id), { map: mapName, pinId: id }, data);

const COLL = PAGE === 'archivio' ? 'books' : (PAGE === 'iconoteca' ? 'icons' : '');
if (COLL) {
  window.fbSubscribeBooks = (_isAdmin, cb) => subscribeItems(COLL, cb);
  window.fbSaveBook = (id, data) => saveItem(COLL, id, data);
  window.fbSaveMeta = () => Promise.resolve();
  window.fbSubscribeMeta = cb => { metaListeners.add(cb); emitMeta(); return () => metaListeners.delete(cb); };
}
if (PAGE === 'index') { window.fbSubscribePins = subscribePins; window.fbSavePin = savePin; }
if (PAGE === 'avventure') {
  window.fbSaveAdv = (id, data) => setDoc(doc(db, 'adventures', id), data, { merge: false });
  window.fbSubscribeAdvs = cb => onSnapshot(collection(db, 'adventures'), snap => { const out = {}; snap.forEach(d => { out[d.id] = d.data(); }); cb(out); }, err => console.error('Avventure:', err));
}

/* ═══════════ SCELTA DEI TAVOLI (per voci e pin) ═══════════ */
G.renderTablePicker = function (el, selected) {
  if (!el) return;
  const ids = sortedTables();
  if (!ids.length) { el.className = ''; el.innerHTML = '<span class="gw-muted">Nessun tavolo. Creane uno da Accedi, Tavoli e giocatori.</span>'; return; }
  el.className = 'gw-tp';
  el.innerHTML = ids.map(t => '<label class="gw-chk"><input type="checkbox" value="' + esc(t) + '"' + ((selected || []).indexOf(t) > -1 ? ' checked' : '') + '><span>' + esc(tableName(t)) + '</span></label>').join('');
};
G.readTablePicker = el => el ? Array.prototype.map.call(el.querySelectorAll('input:checked'), i => i.value) : [];
G.pickTablesDialog = function (selected, onSave, title) {
  const ov = overlay('gw-pick'), box = ov.querySelector('.gw-in');
  box.innerHTML = '<h2 class="gw-h">' + esc(title || 'Visibile ai tavoli') + '</h2><p class="gw-sub">Spunta i tavoli che possono vedere questa voce. Senza spunte resta nascosta a tutti.</p><div id="gw-pick-tp"></div><div class="gw-row end" style="margin-top:1.4rem"><button class="gw-btn pri" type="button" id="gw-pick-ok">Salva</button></div>';
  G.renderTablePicker($('gw-pick-tp'), selected);
  $('gw-pick-ok').onclick = () => { const v = G.readTablePicker($('gw-pick-tp')); ov.classList.remove('open'); onSave(v); };
  ov.classList.add('open');
};

/* ═══════════ PANNELLO DEL MASTER ═══════════ */
/* i tavoli servono subito (per le caselle nelle schede), giocatori e codici solo quando si apre il pannello */
let adminUnsubs = [], adminDeep = false;
function watch(coll, store) {
  return onSnapshot(collection(db, coll), snap => { G[store] = {}; snap.forEach(d => { G[store][d.id] = d.data(); }); render(); }, err => console.error(coll + ':', err));
}
function watchTables() { if (!adminUnsubs.length) adminUnsubs.push(watch('tables', 'tablesAll')); }
function watchDeep() { if (adminDeep || !G.isAdmin) return; adminDeep = true; adminUnsubs.push(watch('players', 'players'), watch('secrets', 'secrets')); }
function unwatchAdmin() { stopAll(adminUnsubs)(); adminUnsubs = []; adminDeep = false; G.tablesAll = {}; G.players = {}; G.secrets = {}; }

const A = { tab: 'tavoli', sel: null, rn: '', nt: '', pn: '', pc: '', ptabs: [], addp: '', mig: '', status: '', ok: true };
function say(msg, ok) { A.status = msg; A.ok = ok !== false; const f = $('gw-foot'); if (f) { f.textContent = msg; f.className = 'gw-foot ' + (A.ok ? 'ok' : 'ko'); } }
function openAdmin() { watchDeep(); overlay('gw-admin', { wide: true, backdrop: false }).classList.add('open'); render(); }
const playersOf = t => Object.keys(G.players).filter(u => (G.players[u].tables || []).indexOf(t) > -1).sort((a, b) => (G.players[a].username || '').localeCompare(G.players[b].username || '', 'it'));
const chips = (ids, on, attrs) => '<div class="gw-chips">' + ids.map(t => '<button type="button" class="gw-chip' + (on.indexOf(t) > -1 ? ' on' : '') + '" ' + attrs + ' data-id="' + esc(t) + '">' + esc(tableName(t)) + '</button>').join('') + '</div>';

function render() {
  const ov = $('gw-admin'); if (!ov || !ov.classList.contains('open')) return;
  const box = ov.querySelector('.gw-in');
  const ids = sortedTables();
  if (!A.sel || !G.tablesAll[A.sel]) A.sel = ids[0] || null;
  if (A.rnFor !== A.sel) { A.rnFor = A.sel; A.rn = A.sel ? tableName(A.sel) : ''; }
  let body = '';
  if (A.tab === 'tavoli') {
    const list = ids.map(t => '<button type="button" class="gw-li' + (t === A.sel ? ' on' : '') + '" data-act="sel" data-id="' + esc(t) + '"><span>' + esc(tableName(t)) + '</span><em>' + playersOf(t).length + '</em></button>').join('') || '<p class="gw-muted">Nessun tavolo ancora.</p>';
    let det = '<p class="gw-muted">Crea un tavolo a sinistra per cominciare.</p>';
    if (A.sel) {
      const mem = playersOf(A.sel), free = Object.keys(G.players).filter(u => mem.indexOf(u) < 0).sort((a, b) => (G.players[a].username || '').localeCompare(G.players[b].username || '', 'it'));
      det = '<div class="gw-card"><h3>Nome del tavolo</h3><div class="gw-row"><input type="text" id="gw-rn" data-k="rn" value="' + esc(A.rn) + '" maxlength="60"><button class="gw-btn" type="button" data-act="rename">Rinomina</button></div></div>' +
        '<div class="gw-card"><h3>Giocatori del tavolo</h3>' +
        (mem.length ? mem.map(u => '<div class="gw-line"><b>' + esc(G.players[u].username) + '</b><button class="gw-btn sm" type="button" data-act="kick" data-u="' + esc(u) + '">Togli</button></div>').join('') : '<p class="gw-muted" style="margin:0">Nessun giocatore in questo tavolo.</p>') +
        (free.length ? '<div class="gw-row" style="margin-top:.9rem"><select id="gw-addp" data-k="addp"><option value="">Aggiungi un giocatore…</option>' + free.map(u => '<option value="' + esc(u) + '"' + (A.addp === u ? ' selected' : '') + '>' + esc(G.players[u].username) + '</option>').join('') + '</select><button class="gw-btn" type="button" data-act="addp">Aggiungi</button></div>' : '') +
        '</div><div class="gw-row end"><button class="gw-btn dng" type="button" data-act="deltable">Elimina il tavolo</button></div>';
    }
    body = '<div class="gw-split"><div class="gw-side">' + list + '<div class="gw-row" style="margin-top:8px"><input type="text" id="gw-nt" data-k="nt" placeholder="Nuovo tavolo" value="' + esc(A.nt) + '" maxlength="60"><button class="gw-btn pri" type="button" data-act="addtable">Crea</button></div></div><div>' + det + '</div></div>';
  } else if (A.tab === 'giocatori') {
    const uids = Object.keys(G.players).sort((a, b) => (G.players[a].username || '').localeCompare(G.players[b].username || '', 'it'));
    body = '<div class="gw-card"><h3>Nuovo giocatore</h3><div class="gw-grid2"><input type="text" id="gw-pn" data-k="pn" placeholder="Nome utente" value="' + esc(A.pn) + '" autocomplete="off"><input type="text" id="gw-pc" data-k="pc" placeholder="Codice, almeno 6 caratteri" value="' + esc(A.pc) + '" autocomplete="off"></div>' +
      (ids.length ? '<span class="gw-l" style="margin-top:1rem">Tavoli</span>' + chips(ids, A.ptabs, 'data-act="ptog"') : '') +
      '<div class="gw-row end" style="margin-top:1rem"><button class="gw-btn pri" type="button" data-act="addplayer">Crea giocatore</button></div></div>' +
      (uids.length ? uids.map(u => {
        const p = G.players[u], s = G.secrets[u] || {};
        return '<div class="gw-card"><div class="gw-row wrap"><h3 style="margin:0;flex:1">' + esc(p.username) + '</h3><span class="gw-muted">codice</span><span class="gw-code">' + esc(s.code || '?') + '</span><button class="gw-btn sm" type="button" data-act="copy" data-c="' + esc(s.code || '') + '">Copia</button><button class="gw-btn sm dng" type="button" data-act="delplayer" data-u="' + esc(u) + '">Elimina</button></div>' +
          (ids.length ? chips(ids, p.tables || [], 'data-act="pt" data-u="' + esc(u) + '"') : '') + '</div>';
      }).join('') : '<p class="gw-muted">Nessun giocatore ancora.</p>');
  } else {
    body = '<div class="gw-card"><h3>Passaggio dal vecchio sistema</h3><p class="gw-muted" style="margin:0 0 .9rem">Dà a un tavolo tutte le voci di Archivio e Iconoteca che prima erano sbloccate per tutti.</p><div class="gw-row"><select id="gw-mig" data-k="mig">' + ids.map(t => '<option value="' + esc(t) + '"' + (A.mig === t ? ' selected' : '') + '>' + esc(tableName(t)) + '</option>').join('') + '</select><button class="gw-btn" type="button" data-act="migrate">Assegna</button></div></div>' +
      '<div class="gw-card"><h3>Importa i pin di Ravenholm</h3><p class="gw-muted" style="margin:0 0 .9rem">Scegli il file pin-ravenholm.json. I pin entrano nascosti, poi li assegni ai tavoli aprendoli sulla mappa.</p><div class="gw-row"><input type="file" id="gw-pin-file" accept=".json,application/json" style="flex:1;min-width:0;color:#b9b0a0"><button class="gw-btn" type="button" data-act="importpins">Importa</button></div></div>';
  }
  /* ridisegno conservando scorrimento e campo attivo */
  const bodyEl = box.querySelector('.gw-body'), top = bodyEl ? bodyEl.scrollTop : 0, ae = document.activeElement, fid = ae && box.contains(ae) ? ae.id : '', pos = fid && ae.selectionStart != null ? [ae.selectionStart, ae.selectionEnd] : null;
  const tabs = [['tavoli', 'Tavoli'], ['giocatori', 'Giocatori'], ['strumenti', 'Strumenti']];
  box.innerHTML = '<div class="gw-head"><h2 class="gw-h">Tavoli e giocatori</h2><div class="gw-tabs">' + tabs.map(t => '<button type="button" class="gw-tab' + (A.tab === t[0] ? ' on' : '') + '" data-act="tab" data-id="' + t[0] + '">' + t[1] + '</button>').join('') + '</div></div><div class="gw-body">' + body + '</div><div class="gw-foot ' + (A.ok ? 'ok' : 'ko') + '" id="gw-foot">' + esc(A.status) + '</div>';
  const nb = box.querySelector('.gw-body'); if (nb) nb.scrollTop = top;
  if (fid && $(fid)) { $(fid).focus(); if (pos) try { $(fid).setSelectionRange(pos[0], pos[1]); } catch (e) { /* niente */ } }
}

/* operazioni */
async function createPlayer(name, code, tables) {
  if (!slug(name)) throw new Error('Il nome utente non è valido.');
  if (String(code).length < 6) throw new Error('Il codice deve avere almeno 6 caratteri.');
  const second = getAuth(initializeApp(CFG, 'creatore-' + Date.now()));   /* istanza separata, così il master resta collegato */
  let uid;
  try { uid = (await createUserWithEmailAndPassword(second, toEmail(name), code)).user.uid; await signOut(second); }
  catch (e) { throw new Error(e.code === 'auth/email-already-in-use' ? 'Esiste già un giocatore con questo nome.' : e.code === 'auth/weak-password' ? 'Codice troppo debole.' : 'Creazione non riuscita (' + (e.code || e.message) + ').'); }
  const b = writeBatch(db), un = name.trim();
  b.set(doc(db, 'players', uid), { username: un, tables, createdAt: Date.now() });
  b.set(doc(db, 'secrets', uid), { username: un, code });
  tables.forEach(t => b.set(doc(db, 'tables', t, 'members', uid), { username: un }));
  await b.commit();
}
async function setPlayerTables(uid, next) {
  const p = G.players[uid]; if (!p) return;
  const old = Array.isArray(p.tables) ? p.tables : [], b = writeBatch(db);
  b.update(doc(db, 'players', uid), { tables: next });
  next.filter(t => old.indexOf(t) < 0).forEach(t => b.set(doc(db, 'tables', t, 'members', uid), { username: p.username }));
  old.filter(t => next.indexOf(t) < 0).forEach(t => b.delete(doc(db, 'tables', t, 'members', uid)));
  await b.commit();
}
async function deletePlayer(uid) {
  const b = writeBatch(db);
  ((G.players[uid] || {}).tables || []).forEach(t => b.delete(doc(db, 'tables', t, 'members', uid)));
  b.delete(doc(db, 'players', uid)); b.delete(doc(db, 'secrets', uid));
  await b.commit();
}
async function createTable(name) {
  const id = 't_' + Date.now().toString(36);
  await setDoc(doc(db, 'tables', id), { name: name.trim(), createdAt: Date.now() });
  await Promise.all([syncTotals('books', [id]), syncTotals('icons', [id])]);
  return id;
}
async function wipe(colRef) {
  const s = await getDocs(colRef); let b = writeBatch(db), n = 0;
  for (const d of s.docs) { b.delete(d.ref); if (++n % 400 === 0) { await b.commit(); b = writeBatch(db); } }
  await b.commit();
}
async function deleteTable(id) {
  for (const sub of ['books', 'icons', 'pins', 'meta', 'members']) await wipe(collection(db, 'tables', id, sub));
  await deleteDoc(doc(db, 'tables', id));
  for (const uid of Object.keys(G.players)) if ((G.players[uid].tables || []).indexOf(id) > -1) await updateDoc(doc(db, 'players', uid), { tables: arrayRemove(id) });
  for (const c of [collection(db, 'books'), collection(db, 'icons'), collection(db, 'maps', MAP, 'pins')]) {
    const s = await getDocs(query(c, where('tables', 'array-contains', id)));
    for (const d of s.docs) await updateDoc(d.ref, { tables: arrayRemove(id) });
  }
}
async function migrateUnlocked(tableId) {
  let n = 0;
  for (const coll of ['books', 'icons']) {
    const s = await getDocs(collection(db, coll));
    for (const d of s.docs) { const v = d.data(); if (!v.deleted && v.locked === false && !(Array.isArray(v.tables) && v.tables.length)) { await saveItem(coll, d.id, { tables: [tableId] }); n++; } }
  }
  return n;
}
async function importPins(json) {
  const have = new Set((await getDocs(collection(db, 'maps', MAP, 'pins'))).docs.map(d => d.id));
  let n = 0;
  for (const id of Object.keys(json)) { if (have.has(id)) continue; await setDoc(doc(db, 'maps', MAP, 'pins', id), Object.assign({}, json[id], { tables: [] })); n++; }
  return n;
}

/* un solo gestore per tutti i pulsanti del pannello */
async function adminClick(e) {
  const t = e.target.closest && e.target.closest('[data-act]'); if (!t) return;
  const act = t.dataset.act, id = t.dataset.id, u = t.dataset.u;
  if (act === 'close') return;
  const busy = on => { t.disabled = on; };
  try {
    if (act === 'tab') { A.tab = id; A.status = ''; render(); return; }
    if (act === 'sel') { A.sel = id; A.addp = ''; render(); return; }
    if (act === 'ptog') { const i = A.ptabs.indexOf(id); if (i < 0) A.ptabs.push(id); else A.ptabs.splice(i, 1); render(); return; }
    if (act === 'copy') { try { await navigator.clipboard.writeText(t.dataset.c); say('Codice copiato.'); } catch (x) { say('Copia non riuscita, selezionalo a mano.', false); } return; }
    busy(true);
    if (act === 'addtable') {
      if (!A.nt.trim()) { say('Scrivi il nome del tavolo.', false); return; }
      const nid = await createTable(A.nt); A.nt = ''; A.sel = nid; say('Tavolo creato.');
    } else if (act === 'rename') {
      if (!A.rn.trim()) { say('Il nome non può essere vuoto.', false); return; }
      await updateDoc(doc(db, 'tables', A.sel), { name: A.rn.trim() }); say('Tavolo rinominato.');
    } else if (act === 'deltable') {
      if (!confirm('Eliminare il tavolo "' + tableName(A.sel) + '" e tutti i suoi sblocchi? I giocatori restano, ma perdono questo tavolo.')) return;
      say('Elimino il tavolo…'); await deleteTable(A.sel); A.sel = null; say('Tavolo eliminato.');
    } else if (act === 'kick') {
      await setPlayerTables(u, (G.players[u].tables || []).filter(x => x !== A.sel)); say('Giocatore tolto dal tavolo.');
    } else if (act === 'addp') {
      if (!A.addp) { say('Scegli un giocatore.', false); return; }
      await setPlayerTables(A.addp, (G.players[A.addp].tables || []).concat(A.sel)); A.addp = ''; say('Giocatore aggiunto.');
    } else if (act === 'pt') {
      const cur = G.players[u].tables || []; await setPlayerTables(u, cur.indexOf(id) > -1 ? cur.filter(x => x !== id) : cur.concat(id)); say('Salvato.');
    } else if (act === 'addplayer') {
      await createPlayer(A.pn.trim(), A.pc, A.ptabs.slice()); say('Giocatore "' + A.pn.trim() + '" creato.'); A.pn = ''; A.pc = ''; A.ptabs = [];
    } else if (act === 'delplayer') {
      if (!confirm('Eliminare il giocatore "' + ((G.players[u] || {}).username || '') + '"? Non potrà più vedere nulla.')) return;
      await deletePlayer(u); say('Giocatore eliminato.');
    } else if (act === 'migrate') {
      const tid = A.mig || (sortedTables()[0] || ''); if (!tid) { say('Crea prima un tavolo.', false); return; }
      say('Assegno le voci…'); say((await migrateUnlocked(tid)) + ' voci assegnate a "' + tableName(tid) + '".');
    } else if (act === 'importpins') {
      const f = $('gw-pin-file').files[0]; if (!f) { say('Scegli prima il file.', false); return; }
      say('Importo i pin…'); say((await importPins(JSON.parse(await f.text()))) + ' pin importati.');
    }
  } catch (x) { console.error(x); say('Errore: ' + (x.message || x), false); }
  finally { if (t.isConnected) t.disabled = false; render(); }
}
function adminInput(e) {
  const k = e.target.dataset && e.target.dataset.k; if (!k) return;
  A[k] = e.target.value;
}
document.addEventListener('click', e => { if (e.target.closest && e.target.closest('#gw-admin')) adminClick(e); });
document.addEventListener('input', e => { if (e.target.closest && e.target.closest('#gw-admin')) adminInput(e); });
document.addEventListener('change', e => { if (e.target.closest && e.target.closest('#gw-admin')) adminInput(e); });

G.openLogin = openLogin;
G.openAdmin = openAdmin;
