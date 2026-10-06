(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var KEY = { data: 'se.data', sel: 'se.sel', hidden: 'se.hidden', hist: 'se.hist' };

  function load(k, d) { try { var v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function drop(k) { try { localStorage.removeItem(k); } catch (e) {} }

  var state = {
    all: [], custom: false, loadError: false,
    sel: { types: [], areas: [], occasions: [], prices: [] },
    hidden: load(KEY.hidden, []),
    history: load(KEY.hist, []),
    deck: [], idx: 0, busy: false, modal: false, sheet: null, temp: null
  };
  var s0 = load(KEY.sel, null);
  if (s0) ['types', 'areas', 'occasions', 'prices'].forEach(function (k) { if (Array.isArray(s0[k])) state.sel[k] = s0[k]; });

  var stage = $('stage');

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function toast(msg) {
    var t = $('toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(function () { t.hidden = true; }, 2200);
  }
  function tagsFor(r, parent) {
    r.types.forEach(function (v) { parent.appendChild(el('span', 'tag', v)); });
    r.areas.forEach(function (v) { parent.appendChild(el('span', 'tag loc', '\uD83D\uDCCD ' + v)); });
    r.occasions.forEach(function (v) { parent.appendChild(el('span', 'tag occ', v)); });
    if (r.price) parent.appendChild(el('span', 'tag price', r.price));
    if (r.been === 'Yes') {
      parent.appendChild(el('span', 'tag been', '✓ Been here'));
  } else if (r.been === 'No') {
      parent.appendChild(el('span', 'tag not-been', '✦ Not tried'));
  }

  }

  /* ---------- deck ---------- */
  function startRound() {
    state.deck = FF.shuffle(FF.filterRestaurants(state.all, state.sel, state.hidden));
    state.idx = 0; state.busy = false;
    render();
  }

  function render() {
    stage.innerHTML = '';
    var d = state.deck, n = d.length;
    var left = Math.max(0, n - state.idx);
    $('counter').textContent = n ? (left + ' left of ' + n) : '';
    $('btn-undo').disabled = state.idx === 0;
    $('btn-yes').disabled = $('btn-no').disabled = left === 0;
    updateBadge();

    if (left === 0) {
      var box = el('div', 'empty');
      if (n === 0) {
        box.appendChild(el('div', 'big', state.loadError ? '\u26A0\uFE0F' : '\uD83D\uDD0D'));
        box.appendChild(el('h2', '', state.loadError ? 'Could not load restaurants' : 'No restaurants match'));
        box.appendChild(el('p', 'muted', state.loadError ? 'Import a CSV from the menu.' : 'Try loosening your filters.'));
        var b1 = el('button', 'primary', 'Change filters'); b1.id = 'empty-filters';
        b1.onclick = function () { openSheet('filter'); };
        box.appendChild(b1);
      } else {
        box.appendChild(el('div', 'big', '\uD83E\uDD37'));
        box.appendChild(el('h2', '', 'You\u2019ve seen them all'));
        box.appendChild(el('p', 'muted', 'Nothing caught your eye. Reshuffle, or change the filters.'));
        var b2 = el('button', 'primary', 'Reshuffle'); b2.id = 'empty-reshuffle';
        b2.onclick = startRound;
        var b3 = el('button', 'secondary', 'Change filters');
        b3.onclick = function () { openSheet('filter'); };
        box.appendChild(b2); box.appendChild(b3);
      }
      stage.appendChild(box);
      return;
    }

    for (var depth = Math.min(2, left - 1); depth >= 0; depth--) {
      var r = d[state.idx + depth];
      var c = el('article', 'card');
      c.dataset.id = r.id;
      c.appendChild(el('div', 'emoji', FF.emojiFor(r)));
      if (r.photo) addPhoto(c, r.photo);
      var yes = el('div', 'stamp yes', 'YES'), no = el('div', 'stamp no', 'NOPE');
      c.appendChild(yes); c.appendChild(no);
      c.appendChild(el('h2', '', r.name));
      var tg = el('div', 'tags'); tagsFor(r, tg); c.appendChild(tg);
      if (r.info) c.appendChild(el('p', 'info', r.info));
      if (depth === 0) { c.classList.add('top'); attachDrag(c, yes, no); }
      else {
        c.style.transform = 'translateY(' + (depth * 10) + 'px) scale(' + (1 - depth * 0.04) + ')';
        c.style.pointerEvents = 'none';
      }
      stage.appendChild(c);
    }
  }

  function addPhoto(card, src) {
    var img = new Image();
    img.className = 'photo'; img.alt = ''; img.draggable = false;
    img.onload = function () { card.classList.add('has-photo'); };
    img.onerror = function () { img.remove(); };
    img.src = src;
    card.appendChild(img);
  }

  function attachDrag(card, yes, no) {
    var sx = 0, sy = 0, drag = false, dx = 0;
    card.addEventListener('pointerdown', function (e) {
      if (state.busy || state.modal || state.sheet) return;
      drag = true; sx = e.clientX; sy = e.clientY; dx = 0;
      card.style.transition = 'none';
      try { card.setPointerCapture(e.pointerId); } catch (x) {}
    });
    card.addEventListener('pointermove', function (e) {
      if (!drag) return;
      dx = e.clientX - sx; var dy = e.clientY - sy;
      card.style.transform = 'translate(' + dx + 'px,' + (dy * 0.3) + 'px) rotate(' + (dx / 18) + 'deg)';
      var p = Math.min(1, Math.abs(dx) / 100);
      yes.style.opacity = dx > 0 ? p : 0;
      no.style.opacity = dx < 0 ? p : 0;
    });
    function end() {
      if (!drag) return; drag = false;
      var threshold = Math.min(110, card.offsetWidth * 0.28);
      if (dx > threshold) decide(1);
      else if (dx < -threshold) decide(-1);
      else {
        card.style.transition = 'transform .25s ease';
        card.style.transform = '';
        yes.style.opacity = 0; no.style.opacity = 0;
      }
    }
    card.addEventListener('pointerup', end);
    card.addEventListener('pointercancel', end);
  }

  function decide(dir) {
    if (state.busy || state.modal || state.sheet) return;
    if (state.idx >= state.deck.length) return;
    var card = stage.querySelector('.card.top');
    if (!card) return;
    state.busy = true;
    var w = Math.max(window.innerWidth, 400);
    card.style.transition = 'transform .28s ease-in, opacity .28s ease-in';
    card.style.transform = 'translate(' + (dir * w * 1.3) + 'px,0) rotate(' + (dir * 28) + 'deg)';
    card.style.opacity = '0';
    var picked = state.deck[state.idx];
    setTimeout(function () {
      state.idx++; state.busy = false;
      render();
      if (dir > 0) showResult(picked);
    }, 290);
  }

  function undo() {
    if (state.busy || state.modal || state.sheet || state.idx === 0) return;
    state.idx--; render();
  }

  /* ---------- result ---------- */
  var current = null;
  function showResult(r) {
    current = r;
    state.history.unshift({ id: r.id, name: r.name, url: FF.mapsLink(r), t: Date.now() });
    state.history = state.history.slice(0, 30);
    save(KEY.hist, state.history);
    $('res-name').textContent = r.name;
    var tg = $('res-tags'); tg.innerHTML = ''; tagsFor(r, tg);
    $('res-info').textContent = r.info || '';
    $('res-info').hidden = !r.info;
    var ph = $('res-photo'); ph.hidden = true; ph.removeAttribute('src');
    if (r.photo) {
      ph.onload = function () { ph.hidden = false; };
      ph.onerror = function () { ph.hidden = true; };
      ph.src = r.photo;
    }
    $('res-link').href = FF.mapsLink(r);
    $('result').hidden = false; state.modal = true;
  }
  function closeResult() { $('result').hidden = true; state.modal = false; }

  $('res-continue').onclick = function () {
    if (current) { state.history.shift(); save(KEY.hist, state.history); }
    closeResult(); render();
  };
  $('res-again').onclick = function () { closeResult(); startRound(); };
  $('res-hide').onclick = function () {
    if (current) {
      if (state.hidden.indexOf(current.id) === -1) state.hidden.push(current.id);
      save(KEY.hidden, state.hidden);
      state.history.shift(); save(KEY.hist, state.history);
      state.deck = state.deck.filter(function (x) { return x.id !== current.id; });
      state.idx = Math.max(0, state.idx - 1);
      toast('Hidden. Un-hide it from the menu.');
    }
    closeResult(); render();
  };

  /* ---------- sheets ---------- */
  function openSheet(name) {
    closeSheet();
    state.sheet = name;
    if (name === 'filter') { state.temp = JSON.parse(JSON.stringify(state.sel)); drawFilters(); }
    if (name === 'menu') drawMenu();
    $('sheet-' + name).hidden = false; $('backdrop').hidden = false;
  }
  function closeSheet() {
    if (!state.sheet) return;
    $('sheet-' + state.sheet).hidden = true; $('backdrop').hidden = true;
    state.sheet = null; state.temp = null;
  }

  var FACETS = [['types', 'Type'], ['areas', 'Location'], ['occasions', 'Occasion'], ['prices', 'Price']];
  function drawFilters() {
    var f = FF.facetsOf(state.all), body = $('filter-body'); body.innerHTML = '';
    FACETS.forEach(function (p) {
      var vals = f[p[0]];
      if (!vals.length) return;
      body.appendChild(el('h3', '', p[1]));
      var wrap = el('div', 'chips');
      vals.forEach(function (v) {
        var b = el('button', 'chip', v); b.type = 'button';
        var on = state.temp[p[0]].some(function (x) { return x.toLowerCase() === v.toLowerCase(); });
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
        b.onclick = function () {
          var arr = state.temp[p[0]], i = -1;
          arr.forEach(function (x, j) { if (x.toLowerCase() === v.toLowerCase()) i = j; });
          if (i >= 0) arr.splice(i, 1); else arr.push(v);
          b.setAttribute('aria-pressed', i >= 0 ? 'false' : 'true');
          updateFilterCount();
        };
        wrap.appendChild(b);
      });
      body.appendChild(wrap);
    });
    updateFilterCount();
  }
  function updateFilterCount() {
    var n = FF.filterRestaurants(state.all, state.temp, state.hidden).length;
    $('filter-count').textContent = n + (n === 1 ? ' place matches' : ' places match');
    $('filter-apply').disabled = n === 0;
  }
  function selCount(s) { return s.types.length + s.areas.length + s.occasions.length + s.prices.length; }
  function updateBadge() {
    var n = selCount(state.sel), b = $('filter-badge');
    b.textContent = n; b.hidden = n === 0;
  }

  $('btn-filter').onclick = function () { openSheet('filter'); };
  $('btn-menu').onclick = function () { openSheet('menu'); };
  $('backdrop').onclick = function () { closeSheet(); };
  document.querySelectorAll('[data-close]').forEach(function (b) { b.onclick = function () { closeSheet(); }; });
  $('filter-clear').onclick = function () {
    state.temp = { types: [], areas: [], occasions: [], prices: [] };
    drawFilters();
  };
  $('filter-apply').onclick = function () {
    state.sel = state.temp; save(KEY.sel, state.sel);
    closeSheet(); startRound();
  };

  /* ---------- menu ---------- */
  function drawMenu() {
    var ul = $('history-list'); ul.innerHTML = '';
    if (!state.history.length) ul.appendChild(el('li', 'muted', 'No picks yet.'));
    state.history.slice(0, 15).forEach(function (h) {
      var li = el('li'); li.appendChild(el('span', '', h.name));
      var a = el('a', '', 'Map'); a.href = h.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
      li.appendChild(a); ul.appendChild(li);
    });
    $('data-info').textContent = state.all.length + ' restaurants loaded (' + (state.custom ? 'your imported CSV' : 'bundled list') + ').';
    $('hidden-count').textContent = state.hidden.length;
    $('unhide').disabled = state.hidden.length === 0;
    $('menu-msg').textContent = '';
  }
  $('history-clear').onclick = function () { state.history = []; save(KEY.hist, []); drawMenu(); };
  $('unhide').onclick = function () {
    state.hidden = []; save(KEY.hidden, []); drawMenu(); startRound();
    $('menu-msg').textContent = 'All hidden places are back in the deck.';
  };
  $('file-input').onchange = function (e) {
    var f = e.target.files && e.target.files[0]; if (!f) return;
    var rd = new FileReader();
    rd.onload = function () {
      var list = FF.parseRestaurants(String(rd.result));
      e.target.value = '';
      if (!list.length) { $('menu-msg').textContent = 'No restaurants found. The CSV needs a header row with a Name (or Title) column.'; return; }
      try { localStorage.setItem(KEY.data, String(rd.result)); } catch (x) {}
      setData(list, true);
      state.sel = { types: [], areas: [], occasions: [], prices: [] }; save(KEY.sel, state.sel);
      drawMenu(); startRound();
      $('menu-msg').textContent = 'Imported ' + list.length + ' restaurants.';
    };
    rd.readAsText(f);
  };
  $('data-reset').onclick = function () {
    drop(KEY.data);
    loadBundled().then(function () { drawMenu(); startRound(); $('menu-msg').textContent = 'Back to the bundled list.'; });
  };

  function setData(list, custom) { state.all = list; state.custom = !!custom; state.loadError = false; }

  function loadBundled() {
    return fetch('data/restaurants.csv').then(function (r) {
      if (!r.ok) throw new Error('http ' + r.status);
      return r.text();
    }).then(function (t) { setData(FF.parseRestaurants(t), false); })
      .catch(function () { state.all = []; state.loadError = true; });
  }

  /* ---------- wiring ---------- */
  $('btn-yes').onclick = function () { decide(1); };
  $('btn-no').onclick = function () { decide(-1); };
  $('btn-undo').onclick = undo;
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { if (state.sheet) closeSheet(); return; }
    if (e.key === 'ArrowRight') decide(1);
    else if (e.key === 'ArrowLeft') decide(-1);
  });
  document.addEventListener('contextmenu', function (e) { if (e.target.closest && e.target.closest('.card')) e.preventDefault(); });

  function init() {
    var stored = null;
    try { stored = localStorage.getItem(KEY.data); } catch (e) {}
    var p;
    if (stored) {
      var list = FF.parseRestaurants(stored);
      if (list.length) { setData(list, true); p = Promise.resolve(); }
    }
    if (!p) p = loadBundled();
    p.then(startRound);
  }
  init();

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  }

  window.__app = { state: state, decide: decide, startRound: startRound };
})();
