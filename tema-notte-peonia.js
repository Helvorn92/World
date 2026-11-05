/* Tema Notte e Peonia (solo estetica)
   1) colora le etichette delle organizzazioni in base al tipo
   2) tiene ogni titolo su una sola riga riducendo il corpo solo se serve */
(function () {
  function tag() {
    document.querySelectorAll('.gw-kicker').forEach(function (k) {
      var t = (k.textContent || '').toLowerCase();
      k.classList.remove('kick-neg', 'kick-pos', 'kick-neu');
      if (t.indexOf('negativ') > -1) k.classList.add('kick-neg');
      else if (t.indexOf('positiv') > -1) k.classList.add('kick-pos');
      else if (t.indexOf('neutral') > -1) k.classList.add('kick-neu');
    });
  }
  function tagSec() {
    document.querySelectorAll('.cat-section-label').forEach(function (k) {
      var t = (k.textContent || '').toLowerCase();
      k.classList.remove('sec-neg', 'sec-pos', 'sec-neu');
      if (t.indexOf('negativ') > -1) k.classList.add('sec-neg');
      else if (t.indexOf('positiv') > -1) k.classList.add('sec-pos');
      else if (t.indexOf('neutral') > -1) k.classList.add('sec-neu');
    });
  }
  function fit() {
    document.querySelectorAll('.gw-title,.cat-index-title,.page-header-title,.mystery-title').forEach(function (el) {
      el.style.setProperty('white-space', 'nowrap', 'important');
      el.style.removeProperty('font-size');
      if (!el.clientWidth) return;                       /* pagina nascosta */
      var box = el.parentElement, cs = box ? getComputedStyle(box) : null, max = box ? box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) : el.clientWidth;
      var size = parseFloat(getComputedStyle(el).fontSize), n = 0;
      while (el.scrollWidth > max + 1 && size > 18 && n++ < 60) {
        size -= 1;
        el.style.setProperty('font-size', size + 'px', 'important');
      }
    });
  }
  /* Organizzazioni e Cosmologia: i pulsanti stanno sotto titolo e dati, prima del testo (niente colonna a sinistra) */
  function orgTabs() {
    document.querySelectorAll('.gw').forEach(function (g) {
      var pg = g.closest('.page'), terr = ['page-eldoria','page-arinthel','page-draconia','page-murondir','page-underdark'];
      if (g.getAttribute('data-orgtabs') || (pg && terr.indexOf(pg.id) > -1) || !g.querySelector('.gw-bar .gw-tab')) return;
      g.setAttribute('data-orgtabs', '1');
      var orig = Array.prototype.slice.call(g.querySelectorAll('.gw-bar .gw-tab'));
      g.querySelectorAll('.gw-stage > .gw-panel').forEach(function (p) {
        var row = document.createElement('div'); row.className = 'gw-orgtabs';
        orig.forEach(function (o) {
          var b = document.createElement('button'); b.type = 'button'; b.className = 'gw-otab'; b.setAttribute('data-for', o.getAttribute('data-p'));
          b.textContent = (o.textContent || '').trim();
          b.addEventListener('click', function () { o.click(); });
          row.appendChild(b);
        });
        var meta = p.querySelector('.gw-metaline'), sub = p.querySelector('.gw-subtitle'), title = p.querySelector('.gw-title'), head = p.querySelector('.gw-card-head'), desc = p.querySelector('.gw-desc');
        if (head) head.appendChild(row);
        else if (desc) desc.parentNode.insertBefore(row, desc);
        else if (meta) meta.parentNode.insertBefore(row, meta.nextSibling);
        else if (title) title.parentNode.insertBefore(row, title.nextSibling);
        else { row.classList.add('gw-orgtabs-top'); p.insertBefore(row, p.firstChild); }
      });
      function sync() { g.querySelectorAll('.gw-otab').forEach(function (b) { var o = orig.filter(function (x) { return x.getAttribute('data-p') === b.getAttribute('data-for'); })[0]; b.classList.toggle('gw-on', !!(o && o.classList.contains('gw-on'))); }); }
      sync();
      if (window.MutationObserver) { var mo = new MutationObserver(sync); orig.forEach(function (o) { mo.observe(o, { attributes: true, attributeFilter: ['class'] }); }); }
    });
  }

  /* Territori: colonna a sinistra con stemma, titolo, pulsanti numerati e ritorno all'elenco */
  function terrSide() {
    var ids = ['page-eldoria', 'page-arinthel', 'page-draconia', 'page-murondir', 'page-underdark'], num = ['I', 'II', 'III', 'IV', 'V', 'VI'];
    ids.forEach(function (id) {
      var pg = document.getElementById(id), g = pg && pg.querySelector('.gw'), bar = g && g.querySelector('.gw-bar'), inn = bar && bar.querySelector('.gw-bar-in');
      if (!g || !bar || !inn || g.getAttribute('data-side')) return;
      g.setAttribute('data-side', '1');
      var side = document.createElement('div'); side.className = 'gw-side';
      var em = g.querySelector('.gw-emblem');
      if (em) {
        var c = em.cloneNode(true); c.className = 'gw-emblem gw-side-emb';
        c.querySelectorAll('.gw-draw,.gw-dash,.gw-dots').forEach(function (n) { n.removeAttribute('class'); });
        side.appendChild(c);
      }
      var k = document.createElement('span'); k.className = 'gw-side-kick'; k.textContent = 'Territori'; side.appendChild(k);
      var h = document.createElement('div'); h.className = 'gw-side-title'; h.textContent = g.getAttribute('data-title') || ''; side.appendChild(h);
      var hr = document.createElement('i'); hr.className = 'gw-side-rule'; side.appendChild(hr);
      bar.insertBefore(side, inn);
      inn.querySelectorAll('.gw-tab').forEach(function (t, i) {
        var n = document.createElement('span'); n.className = 'gw-num'; n.textContent = num[i] || ''; t.insertBefore(n, t.firstChild);
      });
      var back = document.createElement('a'); back.className = 'gw-back'; back.setAttribute('role', 'button'); back.tabIndex = 0;
      back.innerHTML = '&lsaquo;&nbsp; Tutti i territori';
      back.addEventListener('click', function () { if (window.showPage) window.showPage('gwernia'); });
      back.addEventListener('keydown', function (e) { if (e.key === 'Enter') back.click(); });
      bar.appendChild(back);
    });
  }
  var t;
  function later() { clearTimeout(t); t = setTimeout(fit, 120); }
  function start() {
    tag(); tagSec(); orgTabs(); terrSide(); fit();
    window.addEventListener('resize', later);
    document.addEventListener('click', function () { setTimeout(fit, 450); setTimeout(fit, 1100); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
    /* si riadatta solo quando cambia la pagina visibile, non a ogni classe della pagina */
    if (window.MutationObserver) { var mo = new MutationObserver(later); document.querySelectorAll('.page').forEach(function (pg) { mo.observe(pg, { attributes: true, attributeFilter: ['class'] }); }); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
