/* ═══════════════════════════════════════════════════════════════
   GWERNIA · ACCESSO E TAVOLI
   Un solo modulo, caricato da tutte le pagine.
   · accesso giocatori (nome utente + codice) e accesso del master (email + password)
   · tavoli: ogni tavolo ha i suoi giocatori e i suoi contenuti sbloccati
   · Archivio, Iconoteca e pin di Ravenholm: ognuno vede solo ciò che è sbloccato per i suoi tavoli
   · Metropoli, Iconoteca e Archivio compaiono solo dopo l'accesso

   Struttura dei dati (Firestore)
     books, icons, maps/ravenholm/pins   contenuti originali, li legge solo il master
                                         ogni voce ha  tables: [idTavolo, ...]
     tables/{t}                          il tavolo (nome)
     tables/{t}/members/{uid}            chi può entrare nel tavolo
     tables/{t}/books|icons|pins/{id}    copia dei contenuti sbloccati per quel tavolo
     tables/{t}/meta/shelf|gallery       numero totale di voci (per i segnaposto "?")
     players/{uid}                       nome utente e tavoli del giocatore
     secrets/{uid}                       codice del giocatore, solo per il master
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
const DOMAIN = '@giocatori.gwernia';            /* i giocatori accedono con nome@giocatori.gwernia, ma non lo vedono mai */
const GATED_PAGES = ['metropoli', 'ravenholm', 'crevasse'];   /* pagine dell'index riservate ai tavoli */
const MAP = 'ravenholm';

/* ── stato ── */
const G = window.GW = { ready: false, user: null, isAdmin: false, isPlayer: false, username: '', tables: [], tableNames: {}, tablesAll: {}, players: {}, secrets: {} };
let resolveReady; G.whenReady = new Promise(r => { resolveReady = r; });

const isPlayerEmail = e => !!e && String(e).toLowerCase().endsWith(DOMAIN);
const slug = s => String(s || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '.').replace(/[^a-z0-9._-]/g, '');
const toEmail = name => name.indexOf('@') > -1 ? name.trim() : slug(name) + DOMAIN;
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const $ = id => document.getElementById(id);
const tableName = id => (G.tablesAll[id] && G.tablesAll[id].name) || G.tableNames[id] || 'Tavolo';

/* ═══════════ STILE ═══════════ */
const css = document.createElement('style');
css.textContent = `
body:not(.gw-in) [data-gw-gate]{display:none !important}
.gw-ov{position:fixed;inset:0;z-index:99990;background:rgba(5,5,9,.84);backdrop-filter:blur(8px);display:none;align-items:center;justify-content:center;padding:16px}
.gw-ov.open{display:flex}
.gw-box{position:relative;background:#101017;border:1px solid #a28b6e;border-top:2px solid #a28b6e;width:min(600px,100%);max-height:90vh;overflow:auto;padding:26px 28px 24px;color:#e7e1d6;font-family:'Spectral',Georgia,serif;font-size:1.05rem;box-shadow:0 30px 70px rgba(0,0,0,.7)}
.gw-box.wide{width:min(760px,100%)}
.gw-x{position:absolute;top:10px;right:14px;background:none;border:0;color:#b9b0a0;font-size:1.3rem;cursor:pointer}
.gw-x:hover{color:#e7e1d6}
.gw-h{font-family:'Forum',Georgia,serif;font-weight:400;font-size:1.7rem;color:#e7e1d6;margin:0 0 .3rem;text-align:center}
.gw-sub{text-align:center;color:#b9b0a0;font-size:.98rem;margin:0 0 1.1rem;line-height:1.5}
.gw-l{display:block;font-family:'Forum',Georgia,serif;font-size:.85rem;letter-spacing:.2em;text-transform:uppercase;color:#a28b6e;margin:.9rem 0 .35rem}
.gw-in-t,.gw-box input[type=text],.gw-box input[type=password],.gw-box input[type=email],.gw-box select{width:100%;box-sizing:border-box;background:#0b0b0f;border:1px solid rgba(162,139,110,.45);color:#e7e1d6;font-family:'Spectral',Georgia,serif;font-size:1.05rem;padding:.6rem .8rem;border-radius:0;outline:0}
.gw-box input:focus,.gw-box select:focus{border-color:#c9b697}
.gw-btn{font-family:'Forum',Georgia,serif;font-size:1rem;letter-spacing:.14em;text-transform:uppercase;color:#e7e1d6;background:#14121c;border:1px solid rgba(162,139,110,.6);padding:.6rem 1.2rem;cursor:pointer;border-radius:0}
.gw-btn:hover{border-color:#c9b697;background:#1c1824}
.gw-btn.pri{background:linear-gradient(180deg,#6a2432,#5a1f2b);border-color:rgba(231,225,214,.45)}
.gw-btn.pri:hover{background:linear-gradient(180deg,#7a2a3a,#661f2f)}
.gw-btn.dng{border-color:rgba(184,112,124,.6);color:#d49aa4}
.gw-btn.sm{font-size:.82rem;padding:.35rem .7rem;letter-spacing:.1em}
.gw-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.gw-row.end{justify-content:flex-end}
.gw-err{color:#d49aa4;font-size:.95rem;min-height:1.2em;margin:.7rem 0 0;text-align:center}
.gw-ok{color:#b5c9a0}
.gw-tabs{display:flex;gap:0;margin:.3rem 0 1rem;border-bottom:1px solid rgba(162,139,110,.4)}
.gw-tab{flex:1;font-family:'Forum',Georgia,serif;font-size:.95rem;letter-spacing:.12em;text-transform:uppercase;background:none;border:0;color:#b9b0a0;padding:.7rem .4rem;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px}
.gw-tab.on{color:#e7e1d6;border-bottom-color:#a28b6e;background:rgba(90,31,43,.35)}
.gw-item{border:1px solid rgba(162,139,110,.3);padding:.8rem 1rem;margin:.6rem 0;background:rgba(20,18,28,.7)}
.gw-item b{font-weight:500;color:#e7e1d6}
.gw-code{font-family:ui-monospace,Consolas,monospace;color:#c9b697;background:#0b0b0f;padding:1px 7px;border:1px solid rgba(162,139,110,.3)}
.gw-tp{display:flex;flex-wrap:wrap;gap:6px 16px;margin:.2rem 0}
.gw-chk{display:inline-flex;align-items:center;gap:7px;cursor:pointer;font-size:1rem;color:#e7e1d6}
.gw-chk input{accent-color:#a28b6e;width:16px;height:16px}
.gw-muted{color:#8f8678;font-size:.95rem}
.gw-wall{position:fixed;left:0;right:0;bottom:0;top:64px;z-index:5000;display:none;align-items:center;justify-content:center;text-align:center;padding:24px;background:linear-gradient(180deg,#0e0e13 0%,#1c1824 70%,#2a1620 100%)}
.gw-wall.on{display:flex}
.gw-wall div{max-width:520px}
.gw-wall h2{font-family:'Forum',Georgia,serif;font-weight:400;font-size:2.4rem;color:#e7e1d6;margin:0 0 .6rem}
.gw-wall p{color:#b9b0a0;font-size:1.2rem;line-height:1.55;margin:0 0 1.4rem}
#admin-login-btn.gw-logged::after{content:attr(data-gw-label) !important}
`;
document.head.appendChild(css);

/* ═══════════ ACCESSO ═══════════ */
function markGates() {
  document.querySelectorAll('.nav-item').forEach(li => {
    const a = li.querySelector('.nav-link'); if (!a) return;
    const t = (a.textContent || '').trim().toLowerCase();
    if (t === 'metropoli' || t === 'iconoteca' || t === 'archivio') li.setAttribute('data-gw-gate', '1');
  });
}
function applyState() {
  const u = G.user;
  document.body.classList.toggle('gw-in', !!u);
  document.body.classList.toggle('gw-admin', G.isAdmin);
  document.body.classList.toggle('gw-player', G.isPlayer);
  document.body.classList.toggle('is-admin', G.isAdmin);
  window.fbIsAdmin = G.isAdmin;
  const btn = $('admin-login-btn');
  if (btn) {
    btn.classList.toggle('is-admin', G.isAdmin);
    btn.classList.toggle('gw-logged', !!u);
    btn.setAttribute('data-gw-label', G.isAdmin ? 'Master' : (G.username || 'Esci'));
    btn.title = u ? (G.isAdmin ? 'Master' : (G.username || 'Giocatore')) : 'Accedi';
  }
  const wall = $('gw-wall');
  if (wall) wall.classList.toggle('on', G.ready && !u);
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
      await Promise.all(G.tables.map(async t => { try { const x = await getDoc(doc(db, 'tables', t)); if (x.exists()) G.tableNames[t] = x.data().name; } catch (e) { /* tavolo senza nome */ } }));
    } catch (e) { console.error('Profilo giocatore:', e); }
  }
  if (G.isAdmin) startAdminListeners(); else stopAdminListeners();
  const first = !G.ready;
  G.ready = true; resolveReady();
  applyState();
  const detail = { isAdmin: G.isAdmin, email: user ? user.email : null, uid: user ? user.uid : null };
  window.dispatchEvent(new CustomEvent('admin-state-changed', { detail }));
  window.dispatchEvent(new CustomEvent('auth-changed', { detail: { uid: G.isAdmin ? user.uid : null, email: user ? user.email : null } }));
  window.dispatchEvent(new CustomEvent('gw-state', { detail }));
  if (first) replayPending();
});

async function login(name, code) {
  const email = toEmail(name);
  await signInWithEmailAndPassword(auth, email, code);
}
async function logout() {
  await signOut(auth);
  try { if (PAGE === 'index') sessionStorage.setItem('gwernia_page', 'home'); } catch (e) { /* niente */ }
  location.reload();
}
window.fbAdminLogout = logout;
window.fbAdminLogin = (email, pw) => signInWithEmailAndPassword(auth, email, pw);

/* ═══════════ FINESTRA DI ACCESSO ═══════════ */
function mkOverlay(id, wide) {
  let ov = $(id);
  if (ov) return ov;
  ov = document.createElement('div'); ov.id = id; ov.className = 'gw-ov';
  ov.innerHTML = '<div class="gw-box' + (wide ? ' wide' : '') + '"><button class="gw-x" data-x="1" aria-label="Chiudi">✕</button><div class="gw-in"></div></div>';
  ov.addEventListener('click', e => { if (e.target === ov || (e.target.dataset && e.target.dataset.x)) ov.classList.remove('open'); });
  document.body.appendChild(ov);
  return ov;
}
let loginMsg = '';
function openLogin(msg) { loginMsg = msg || ''; mkOverlay('gw-login').classList.add('open'); renderLogin(); setTimeout(() => { const i = $('gw-user'); if (i) i.focus(); }, 60); }
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
      const n = $('gw-user').value, c = $('gw-code').value, err = $('gw-err');
      if (!n.trim() || !c) { err.textContent = 'Scrivi nome utente e codice.'; return; }
      err.textContent = ''; $('gw-form').querySelector('button').disabled = true;
      try { await login(n, c); location.reload(); }
      catch (x) { err.textContent = 'Nome utente o codice non validi.'; $('gw-form').querySelector('button').disabled = false; }
    });
  } else if (G.isAdmin) {
    box.innerHTML = '<h2 class="gw-h">Master</h2><p class="gw-sub">' + esc(G.user.email) + '</p>' +
      '<div class="gw-row" style="justify-content:center;margin-top:.8rem"><button class="gw-btn pri" id="gw-open-admin">Tavoli e giocatori</button><button class="gw-btn" id="gw-out">Esci</button></div>';
    $('gw-open-admin').onclick = () => { ov.classList.remove('open'); openAdmin(); };
    $('gw-out').onclick = logout;
  } else {
    const tn = G.tables.map(tableName);
    box.innerHTML = '<h2 class="gw-h">' + esc(G.username || 'Giocatore') + '</h2><p class="gw-sub">' + (tn.length ? 'Tavoli: ' + esc(tn.join(', ')) : 'Non fai ancora parte di nessun tavolo.') + '</p>' +
      '<div class="gw-row" style="justify-content:center;margin-top:.8rem"><button class="gw-btn" id="gw-out">Esci</button></div>';
    $('gw-out').onclick = logout;
  }
}
window.openAdminLogin = () => openLogin();
window.closeAdminLogin = () => { const o = $('gw-login'); if (o) o.classList.remove('open'); };
if (PAGE === 'avventure') { window.openLogin = () => openLogin(); }

/* ═══════════ BLOCCO DELLE PAGINE ═══════════ */
let pending = null;
function replayPending() { if (pending && typeof window.showPage === 'function') { const p = pending; pending = null; window.showPage(p[0], p[1]); } }
window.GW_GATED = id => GATED_PAGES.indexOf(id) > -1 && !G.user;
if (PAGE === 'index' && typeof window.showPage === 'function') {
  const orig = window.showPage;
  window.showPage = function (id, link) {
    if (GATED_PAGES.indexOf(id) > -1) {
      if (!G.ready) { pending = [id, link]; return; }
      if (!G.user) { openLogin('Accedi per entrare nelle Metropoli.'); if (!document.querySelector('.page.active')) orig.call(this, 'home'); return; }
    }
    return orig.apply(this, arguments);
  };
}
if (PAGE === 'archivio' || PAGE === 'iconoteca') {
  const w = document.createElement('div'); w.id = 'gw-wall'; w.className = 'gw-wall';
  w.innerHTML = '<div><h2>Accesso riservato</h2><p>Questa sezione si apre solo ai giocatori dei tavoli. Entra con il tuo nome utente e il tuo codice.</p><button class="gw-btn pri" id="gw-wall-btn">Accedi</button></div>';
  document.body.appendChild(w);
  $('gw-wall-btn').onclick = () => openLogin();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { markGates(); applyState(); }); else { markGates(); applyState(); }

/* ═══════════ LETTURA DEI CONTENUTI ═══════════ */
const metaStat = { visible: 0, total: 0 }, metaListeners = new Set();
function emitMeta() { const lc = G.isAdmin ? 0 : Math.max(0, metaStat.total - metaStat.visible); metaListeners.forEach(cb => { try { cb({ lockedCount: lc }); } catch (e) { /* niente */ } }); }

/* Master: legge l'originale. Giocatore: legge le copie dei suoi tavoli. Ospite: niente. */
function subscribeItems(coll, metaName, cb) {
  let dead = false; const unsubs = [];
  G.whenReady.then(() => {
    if (dead) return;
    if (!G.user) { cb({}); return; }
    if (G.isAdmin) {
      unsubs.push(onSnapshot(collection(db, coll), snap => {
        const out = {};
        snap.forEach(d => { const v = d.data(); v.locked = !(Array.isArray(v.tables) && v.tables.length); out[d.id] = v; });
        cb(out);
      }, err => console.error('Firestore ' + coll + ':', err)));
      return;
    }
    const per = {}, totals = {};
    const emit = () => {
      const out = {}; Object.keys(per).forEach(t => Object.assign(out, per[t]));
      metaStat.visible = Object.values(out).filter(b => !b.deleted).length;
      metaStat.total = Math.max(0, ...Object.values(totals), 0);
      cb(out); emitMeta();
    };
    if (!G.tables.length) { cb({}); return; }
    G.tables.forEach(t => {
      per[t] = {}; totals[t] = 0;
      unsubs.push(onSnapshot(collection(db, 'tables', t, coll), snap => { const m = {}; snap.forEach(d => { m[d.id] = d.data(); }); per[t] = m; emit(); }, err => console.error('Firestore tavolo ' + t + ':', err)));
      unsubs.push(onSnapshot(doc(db, 'tables', t, 'meta', metaName), s => { totals[t] = s.exists() && typeof s.data().total === 'number' ? s.data().total : 0; emit(); }, () => {}));
    });
  });
  return () => { dead = true; unsubs.forEach(u => { try { u(); } catch (e) { /* niente */ } }); };
}

/* ═══════════ SCRITTURA (SOLO MASTER) ═══════════ */
async function syncTotals(coll, metaName, ids) {
  const snap = await getDocs(collection(db, coll));
  let n = 0; snap.forEach(d => { if (!d.data().deleted) n++; });
  const list = ids || Object.keys(G.tablesAll);
  await Promise.all(list.map(t => setDoc(doc(db, 'tables', t, 'meta', metaName), { total: n }, { merge: true })));
}
/* Salva l'originale e tiene allineate le copie nei tavoli scelti */
async function saveGeneric(masterRef, copyRef, extra, data) {
  const before = await getDoc(masterRef);
  const prev = before.exists() ? before.data() : {};
  const clean = Object.assign({}, data); delete clean.locked;
  await setDoc(masterRef, clean, { merge: true });
  const full = Object.assign({}, prev, clean); delete full.locked;
  const nowT = full.deleted ? [] : (Array.isArray(full.tables) ? full.tables : []);
  const prevT = Array.isArray(prev.tables) ? prev.tables : [];
  const all = Array.from(new Set(prevT.concat(nowT)));
  if (all.length) {
    const b = writeBatch(db);
    all.forEach(t => { const r = copyRef(t); if (nowT.indexOf(t) > -1) b.set(r, Object.assign({}, full, extra)); else b.delete(r); });
    await b.commit();
  }
}
const META_OF = { books: 'shelf', icons: 'gallery' };
async function saveItem(coll, id, data) {
  await saveGeneric(doc(db, coll, id), t => doc(db, 'tables', t, coll, id), {}, data);
  await syncTotals(coll, META_OF[coll]);
}
async function savePin(mapName, id, data) {
  await saveGeneric(doc(db, 'maps', mapName, 'pins', id), t => doc(db, 'tables', t, 'pins', mapName + '__' + id), { map: mapName, pinId: id }, data);
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
    const per = {};
    const emit = () => { const out = {}; Object.keys(per).forEach(t => Object.assign(out, per[t])); cb(out); };
    if (!G.tables.length) { cb({}); return; }
    G.tables.forEach(t => {
      per[t] = {};
      unsubs.push(onSnapshot(collection(db, 'tables', t, 'pins'), snap => {
        const m = {}; snap.forEach(d => { const v = d.data(); if (v.map === mapName) m[v.pinId || d.id] = v; }); per[t] = m; emit();
      }, err => console.error('Pin tavolo:', err)));
    });
  });
  return () => { dead = true; unsubs.forEach(u => { try { u(); } catch (e) { /* niente */ } }); };
}

/* collegamento con le pagine */
const COLL = PAGE === 'archivio' ? 'books' : (PAGE === 'iconoteca' ? 'icons' : '');
if (COLL) {
  window.fbSubscribeBooks = (_isAdmin, cb) => subscribeItems(COLL, META_OF[COLL], cb);
  window.fbSaveBook = (id, data) => saveItem(COLL, id, data);
  window.fbSaveMeta = () => Promise.resolve();
  window.fbSubscribeMeta = cb => { metaListeners.add(cb); emitMeta(); return () => metaListeners.delete(cb); };
}
if (PAGE === 'index') {
  window.fbSubscribePins = subscribePins;
  window.fbSavePin = savePin;
}

/* ═══════════ SCELTA DEI TAVOLI (per voci e pin) ═══════════ */
G.renderTablePicker = function (el, selected) {
  if (!el) return;
  const ids = Object.keys(G.tablesAll).sort((a, b) => tableName(a).localeCompare(tableName(b), 'it'));
  if (!ids.length) { el.innerHTML = '<span class="gw-muted">Nessun tavolo. Creane uno da Accedi, Tavoli e giocatori.</span>'; return; }
  el.className = 'gw-tp';
  el.innerHTML = ids.map(t => '<label class="gw-chk"><input type="checkbox" value="' + esc(t) + '"' + ((selected || []).indexOf(t) > -1 ? ' checked' : '') + '><span>' + esc(tableName(t)) + '</span></label>').join('');
};
G.readTablePicker = function (el) { return el ? Array.prototype.map.call(el.querySelectorAll('input:checked'), i => i.value) : []; };
G.pickTablesDialog = function (selected, onSave, title) {
  const ov = mkOverlay('gw-pick'); const box = ov.querySelector('.gw-in');
  box.innerHTML = '<h2 class="gw-h">' + esc(title || 'Visibile ai tavoli') + '</h2><p class="gw-sub">Spunta i tavoli che possono vedere questa voce. Senza spunte resta nascosta a tutti.</p><div id="gw-pick-tp"></div><div class="gw-row end" style="margin-top:1.2rem"><button class="gw-btn pri" id="gw-pick-ok">Salva</button></div>';
  G.renderTablePicker($('gw-pick-tp'), selected);
  $('gw-pick-ok').onclick = () => { const v = G.readTablePicker($('gw-pick-tp')); ov.classList.remove('open'); onSave(v); };
  ov.classList.add('open');
};

/* ═══════════ PANNELLO DEL MASTER ═══════════ */
let adminUnsubs = [], adminTab = 'tavoli';
function startAdminListeners() {
  if (adminUnsubs.length) return;
  const watch = (coll, store) => adminUnsubs.push(onSnapshot(collection(db, coll), snap => {
    G[store] = {}; snap.forEach(d => { G[store][d.id] = d.data(); });
    renderAdmin();
  }, err => console.error('Firestore ' + coll + ':', err)));
  watch('tables', 'tablesAll'); watch('players', 'players'); watch('secrets', 'secrets');
}
function stopAdminListeners() { adminUnsubs.forEach(u => u()); adminUnsubs = []; G.tablesAll = {}; G.players = {}; G.secrets = {}; }
function openAdmin() { mkOverlay('gw-admin', true).classList.add('open'); renderAdmin(); }

let creator = null;
async function createPlayer(name, code, tables) {
  const email = toEmail(name);
  if (!slug(name)) throw new Error('Nome non valido.');
  if (String(code).length < 6) throw new Error('Il codice deve avere almeno 6 caratteri.');
  if (!creator) { const a2 = initializeApp(CFG, 'creatore'); creator = getAuth(a2); }
  let uid;
  try { const cred = await createUserWithEmailAndPassword(creator, email, code); uid = cred.user.uid; await signOut(creator); }
  catch (e) { throw new Error(e.code === 'auth/email-already-in-use' ? 'Esiste già un giocatore con questo nome.' : (e.code === 'auth/weak-password' ? 'Codice troppo debole, usa almeno 6 caratteri.' : 'Creazione non riuscita (' + (e.code || e.message) + ').')); }
  const b = writeBatch(db);
  b.set(doc(db, 'players', uid), { username: name.trim(), tables: tables, createdAt: Date.now() });
  b.set(doc(db, 'secrets', uid), { username: name.trim(), code: code });
  tables.forEach(t => b.set(doc(db, 'tables', t, 'members', uid), { username: name.trim() }));
  await b.commit();
}
async function setPlayerTables(uid, newT) {
  const p = G.players[uid]; if (!p) return;
  const old = Array.isArray(p.tables) ? p.tables : [];
  const b = writeBatch(db);
  b.update(doc(db, 'players', uid), { tables: newT });
  newT.filter(t => old.indexOf(t) < 0).forEach(t => b.set(doc(db, 'tables', t, 'members', uid), { username: p.username }));
  old.filter(t => newT.indexOf(t) < 0).forEach(t => b.delete(doc(db, 'tables', t, 'members', uid)));
  await b.commit();
}
async function deletePlayer(uid) {
  const p = G.players[uid] || {}; const b = writeBatch(db);
  (p.tables || []).forEach(t => b.delete(doc(db, 'tables', t, 'members', uid)));
  b.delete(doc(db, 'players', uid)); b.delete(doc(db, 'secrets', uid));
  await b.commit();
}
async function createTable(name) {
  const id = 't_' + Date.now().toString(36);
  await setDoc(doc(db, 'tables', id), { name: name.trim(), createdAt: Date.now() });
  await syncTotals('books', 'shelf', [id]); await syncTotals('icons', 'gallery', [id]);
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
    for (const d of s.docs) { const v = d.data(); if (v.deleted) continue; if (v.locked === false && !(Array.isArray(v.tables) && v.tables.length)) { await saveItem(coll, d.id, { tables: [tableId] }); n++; } }
  }
  return n;
}
async function importPins(json) {
  const s = await getDocs(collection(db, 'maps', MAP, 'pins')); const have = new Set(); s.forEach(d => have.add(d.id));
  let n = 0;
  for (const id of Object.keys(json)) { if (have.has(id)) continue; await setDoc(doc(db, 'maps', MAP, 'pins', id), Object.assign({}, json[id], { tables: [] })); n++; }
  return n;
}

function renderAdmin() {
  const ov = $('gw-admin'); if (!ov || !ov.classList.contains('open')) return;
  const box = ov.querySelector('.gw-in');
  /* non ridisegno mentre il master sta scrivendo in un campo */
  const ae = document.activeElement;
  if (ae && box.contains(ae) && (ae.tagName === 'INPUT' && ae.type !== 'checkbox' || ae.tagName === 'SELECT')) return;
  const tIds = Object.keys(G.tablesAll).sort((a, b) => tableName(a).localeCompare(tableName(b), 'it'));
  const tabs = [['tavoli', 'Tavoli'], ['giocatori', 'Giocatori'], ['strumenti', 'Strumenti']];
  let h = '<h2 class="gw-h">Tavoli e giocatori</h2><div class="gw-tabs">' + tabs.map(t => '<button class="gw-tab' + (adminTab === t[0] ? ' on' : '') + '" data-tab="' + t[0] + '">' + t[1] + '</button>').join('') + '</div>';
  if (adminTab === 'tavoli') {
    h += tIds.length ? tIds.map(t => {
      const n = Object.keys(G.players).filter(u => (G.players[u].tables || []).indexOf(t) > -1).length;
      return '<div class="gw-item"><div class="gw-row"><b style="flex:1">' + esc(tableName(t)) + '</b><span class="gw-muted">' + n + (n === 1 ? ' giocatore' : ' giocatori') + '</span><button class="gw-btn sm dng" data-deltable="' + esc(t) + '">Elimina</button></div></div>';
    }).join('') : '<p class="gw-muted">Nessun tavolo. Creane uno qui sotto.</p>';
    h += '<label class="gw-l">Nuovo tavolo</label><div class="gw-row"><input type="text" id="gw-nt" placeholder="Nome del tavolo" style="flex:1"><button class="gw-btn pri" id="gw-nt-add">Crea</button></div><p class="gw-err" id="gw-adm-err"></p>';
  } else if (adminTab === 'giocatori') {
    const uids = Object.keys(G.players).sort((a, b) => (G.players[a].username || '').localeCompare(G.players[b].username || '', 'it'));
    h += '<div class="gw-item"><b>Nuovo giocatore</b><div class="gw-row" style="margin-top:.6rem"><input type="text" id="gw-pn" placeholder="Nome utente" style="flex:1;min-width:150px"><input type="text" id="gw-pc" placeholder="Codice (min. 6)" style="flex:1;min-width:150px"></div><label class="gw-l">Tavoli</label><div id="gw-pt"></div><div class="gw-row end" style="margin-top:.8rem"><button class="gw-btn pri" id="gw-padd">Crea giocatore</button></div><p class="gw-err" id="gw-adm-err"></p></div>';
    h += uids.length ? uids.map(u => {
      const p = G.players[u], s = G.secrets[u] || {};
      return '<div class="gw-item" data-uid="' + esc(u) + '"><div class="gw-row"><b style="flex:1">' + esc(p.username) + '</b><span class="gw-muted">codice</span><span class="gw-code">' + esc(s.code || '?') + '</span><button class="gw-btn sm dng" data-delplayer="' + esc(u) + '">Elimina</button></div><div class="gw-tp" style="margin-top:.6rem">' +
        (tIds.length ? tIds.map(t => '<label class="gw-chk"><input type="checkbox" data-pt="' + esc(u) + '" value="' + esc(t) + '"' + ((p.tables || []).indexOf(t) > -1 ? ' checked' : '') + '><span>' + esc(tableName(t)) + '</span></label>').join('') : '<span class="gw-muted">Nessun tavolo</span>') + '</div></div>';
    }).join('') : '<p class="gw-muted">Nessun giocatore ancora.</p>';
  } else {
    h += '<div class="gw-item"><b>Passaggio dal vecchio sistema</b><p class="gw-muted" style="margin:.4rem 0 .7rem">Assegna a un tavolo tutte le voci di Archivio e Iconoteca che prima erano sbloccate per tutti.</p><div class="gw-row"><select id="gw-mig" style="flex:1">' + tIds.map(t => '<option value="' + esc(t) + '">' + esc(tableName(t)) + '</option>').join('') + '</select><button class="gw-btn" id="gw-mig-go">Assegna</button></div><p class="gw-err" id="gw-mig-msg"></p></div>';
    h += '<div class="gw-item"><b>Importa i pin di Ravenholm</b><p class="gw-muted" style="margin:.4rem 0 .7rem">Scegli il file pin-ravenholm.json. I pin entrano nascosti, poi li assegni ai tavoli aprendoli sulla mappa.</p><div class="gw-row"><input type="file" id="gw-pin-file" accept=".json,application/json" style="flex:1;color:#b9b0a0"><button class="gw-btn" id="gw-pin-go">Importa</button></div><p class="gw-err" id="gw-pin-msg"></p></div>';
  }
  box.innerHTML = h;
  if (adminTab === 'giocatori') G.renderTablePicker($('gw-pt'), []);
}
function adminErr(m, ok) { const e = $('gw-adm-err'); if (e) { e.textContent = m; e.className = 'gw-err' + (ok ? ' gw-ok' : ''); } }
document.addEventListener('click', async e => {
  const t = e.target; if (!t || !t.closest || !t.closest('#gw-admin')) return;
  try {
    if (t.dataset.tab) { adminTab = t.dataset.tab; renderAdmin(); return; }
    if (t.id === 'gw-nt-add') { const v = $('gw-nt').value.trim(); if (!v) return adminErr('Scrivi il nome del tavolo.'); t.disabled = true; await createTable(v); $('gw-nt').value = ''; t.disabled = false; adminErr('Tavolo creato.', 1); return; }
    if (t.dataset.deltable) { if (!confirm('Eliminare il tavolo "' + tableName(t.dataset.deltable) + '" e tutti i suoi sblocchi? I giocatori restano, ma perdono questo tavolo.')) return; t.disabled = true; await deleteTable(t.dataset.deltable); return; }
    if (t.id === 'gw-padd') {
      const n = $('gw-pn').value.trim(), c = $('gw-pc').value; if (!n || !c) return adminErr('Servono nome utente e codice.');
      t.disabled = true; try { await createPlayer(n, c, G.readTablePicker($('gw-pt'))); $('gw-pn').value = ''; $('gw-pc').value = ''; adminErr('Giocatore creato.', 1); } catch (x) { adminErr(x.message); } t.disabled = false; return;
    }
    if (t.dataset.delplayer) { const p = G.players[t.dataset.delplayer] || {}; if (!confirm('Eliminare il giocatore "' + (p.username || '') + '"? Non potrà più vedere nulla.')) return; await deletePlayer(t.dataset.delplayer); return; }
    if (t.id === 'gw-mig-go') { const v = $('gw-mig').value; if (!v) { $('gw-mig-msg').textContent = 'Crea prima un tavolo.'; return; } t.disabled = true; const n = await migrateUnlocked(v); $('gw-mig-msg').className = 'gw-err gw-ok'; $('gw-mig-msg').textContent = n + ' voci assegnate.'; t.disabled = false; return; }
    if (t.id === 'gw-pin-go') {
      const f = $('gw-pin-file').files[0]; if (!f) { $('gw-pin-msg').textContent = 'Scegli prima il file.'; return; }
      t.disabled = true; const n = await importPins(JSON.parse(await f.text())); $('gw-pin-msg').className = 'gw-err gw-ok'; $('gw-pin-msg').textContent = n + ' pin importati.'; t.disabled = false; return;
    }
  } catch (x) { console.error(x); adminErr('Errore: ' + (x.message || x)); if (t.disabled) t.disabled = false; }
});
document.addEventListener('change', async e => {
  const t = e.target; if (!t || !t.dataset || !t.dataset.pt) return;
  const uid = t.dataset.pt;
  const sel = Array.prototype.map.call(document.querySelectorAll('#gw-admin input[data-pt="' + uid + '"]:checked'), i => i.value);
  try { await setPlayerTables(uid, sel); } catch (x) { console.error(x); alert('Errore nel salvataggio: ' + x.message); }
});

if (PAGE === 'avventure') {
  window.fbLogin = (e, p) => signInWithEmailAndPassword(auth, e, p);
  window.fbLogout = logout;
  window.fbSaveAdv = (id, data) => setDoc(doc(db, 'adventures', id), data, { merge: false });
  window.fbSubscribeAdvs = cb => onSnapshot(collection(db, 'adventures'), snap => { const out = {}; snap.forEach(d => { out[d.id] = d.data(); }); cb(out); }, err => console.error('Avventure:', err));
}
G.openLogin = openLogin;
G.openAdmin = openAdmin;
