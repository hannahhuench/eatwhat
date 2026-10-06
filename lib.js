(function (root) {
  'use strict';

  function parseCSV(text) {
    text = String(text || '').replace(/^\uFEFF/, '');
    var first = text.split(/\r?\n/, 1)[0] || '';
    var counts = { ',': 0, ';': 0, '\t': 0 };
    var q = false;
    for (var k = 0; k < first.length; k++) {
      var c = first[k];
      if (c === '"') q = !q;
      else if (!q && counts.hasOwnProperty(c)) counts[c]++;
    }
    var delim = ',';
    if (counts[';'] > counts[delim]) delim = ';';
    if (counts['\t'] > counts[delim]) delim = '\t';

    var rows = [], row = [], field = '', inQ = false, i = 0, n = text.length;
    while (i < n) {
      var ch = text[i];
      if (inQ) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          inQ = false; i++; continue;
        }
        field += ch; i++; continue;
      }
      if (ch === '"') { inQ = true; i++; continue; }
      if (ch === delim) { row.push(field); field = ''; i++; continue; }
      if (ch === '\r') { i++; continue; }
      if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
      field += ch; i++;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (f) { return f.trim() !== ''; }); });
  }

  var ALIASES = {
    name: ['name', 'title', 'restaurant', 'place', 'restaurant name'],
    info: ['info', 'note', 'notes', 'description', 'about', 'summary'],
    comment: ['comment', 'comments'],
    url: ['url', 'link', 'maps', 'map', 'google maps', 'maps url', 'map url', 'google maps url'],
    cuisine: ['cuisine', 'cuisines', 'type', 'types', 'category', 'food'],
    area: ['area', 'location', 'district', 'neighbourhood', 'neighborhood', 'region'],
    meal: ['meal', 'meals'],
    occasion: ['occasion', 'occasions', 'vibe', 'mood'],
    price: ['price', 'price range', 'budget', 'cost'],
    tags: ['tags', 'tag', 'labels', 'label'],
    photo: ['photo', 'image', 'picture', 'img', 'photo url', 'image url', 'pic'],
    been: ['been', 'visited', 'have been', 'tried']
  };

  function headerKey(h) {
    var s = String(h || '').trim().toLowerCase();
    for (var key in ALIASES) if (ALIASES[key].indexOf(s) !== -1) return key;
    return null;
  }

  function splitList(s) {
    return String(s || '').split(/[;|,\u3001\uFF0C\n]/).map(function (x) { return x.trim(); }).filter(Boolean);
  }

  function isHttp(u) { return /^https?:\/\//i.test(u || ''); }

  function cleanPhoto(p) {
    p = String(p || '').trim();
    if (!p) return '';
    if (isHttp(p)) return p;
    if (/^[a-z][a-z0-9+.\-]*:/i.test(p) || p.indexOf('//') === 0) return '';
    p = p.replace(/^\.?\//, '');
    if (!p || p.split('/').indexOf('..') !== -1) return '';
    return p.indexOf('%') === -1 ? encodeURI(p) : p;
  }

  function toRestaurants(rows) {
    if (!rows || rows.length < 2) return [];
    var keys = rows[0].map(headerKey);
    var out = [], seen = {};
    for (var r = 1; r < rows.length; r++) {
      var o = {};
      for (var c = 0; c < keys.length; c++) {
        var k = keys[c];
        if (k && o[k] === undefined && rows[r][c] !== undefined) o[k] = String(rows[r][c]).trim();
      }
      if (!o.name) continue;
      var cuisine = splitList(o.cuisine);
      if (!cuisine.length) cuisine = splitList(o.tags);
      var info = [o.info, o.comment].filter(Boolean).join(' \u00B7 ');
      var url = isHttp(o.url) ? o.url : '';
      var rest = {
        name: o.name,
        info: info,
        url: url,
        photo: cleanPhoto(o.photo),
        been: (o.been || '').trim(),
        cuisines: cuisine,
        meals: splitList(o.meal),
        areas: splitList(o.area),
        occasions: splitList(o.occasion),
        price: (o.price || '').trim()
      };
      rest.id = (rest.name + '|' + (url || rest.areas.join(','))).toLowerCase();
      if (seen[rest.id]) continue;
      seen[rest.id] = 1;
      out.push(rest);
    }
    return out;
  }

  function parseRestaurants(text) { return toRestaurants(parseCSV(text)); }

  function facetsOf(list) {
    var f = { meals: {}, cuisines: {}, areas: {}, prices: {}, been: {}, occasions: {} };
    function add(bucket, v) { var k = v.toLowerCase(); if (!bucket[k]) bucket[k] = v; }
    list.forEach(function (r) {
      r.meals.forEach(function (v) { add(f.meals, v); });
      r.cuisines.forEach(function (v) { add(f.cuisines, v); });
      r.areas.forEach(function (v) { add(f.areas, v); });
      r.occasions.forEach(function (v) { add(f.occasions, v); });
      if (r.price) add(f.prices, r.price);
    });
    function arr(b) { return Object.keys(b).sort().map(function (k) { return b[k]; }); }
    function prices(b) {
      return Object.keys(b).sort(function (a, c) { return a.length - c.length || (a < c ? -1 : 1); }).map(function (k) { return b[k]; });
    }
    return { meals: arr(f.meals), cuisines: arr(f.cuisines), areas: arr(f.areas), prices: prices(f.prices), been: arr(f.been), occasions: arr(f.occasions) };
  }

  function lowerSet(a) { var s = {}; (a || []).forEach(function (v) { s[String(v).toLowerCase()] = 1; }); return s; }
  function anyIn(values, set) { return values.some(function (v) { return set[v.toLowerCase()]; }); }

  function filterRestaurants(list, sel, hiddenIds) {
    sel = sel || {};
    var m = lowerSet(sel.meals), c = lowerSet(sel.cuisines), a = lowerSet(sel.areas), o = lowerSet(sel.occasions), p = lowerSet(sel.prices), b = lowerSet(sel.been);
    var hidSet = {}; (hiddenIds || []).forEach(function (id) { hidSet[id] = 1; });
    var has = function (s) { return Object.keys(s).length > 0; };
    return list.filter(function (r) {
      if (hidSet[r.id]) return false;
      if (has(m) && !anyIn(r.meals, m)) return false;
      if (has(c) && !anyIn(r.cuisines, c)) return false;
      if (has(a) && !anyIn(r.areas, a)) return false;
      if (has(o) && !anyIn(r.occasions, o)) return false;
      if (has(b) && String(r.been || '').toLowerCase() !== Object.keys(b)[0]) return false;
      if (has(p) && !(r.price && p[r.price.toLowerCase()])) return false;
      return true;
    });
  }

  function shuffle(arr, rand) {
    rand = rand || Math.random;
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  function mapsLink(r) {
    if (r.url) return r.url;
    var q = [r.name].concat(r.areas.slice(0, 1)).join(' ');
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);
  }

  var EMOJI = [
    [/dim sum|cantonese|chinese|roast|congee|noodle|wonton/i, '\uD83E\uDD5F'],
    [/hot ?pot|shabu|bbq|barbecue|grill|yakiniku|korean/i, '\uD83C\uDF72'],
    [/sushi|japan|ramen|izakaya|udon/i, '\uD83C\uDF63'],
    [/pizza|ital|pasta/i, '\uD83C\uDF55'],
    [/burger|american|fast|diner/i, '\uD83C\uDF54'],
    [/cafe|coffee|brunch|bakery|dessert|sweet|tea/i, '\u2615'],
    [/thai|viet|indian|curry|spicy|sichuan/i, '\uD83C\uDF5B'],
    [/seafood|crab|fish/i, '\uD83E\uDD90'],
    [/bar|pub|cocktail|beer/i, '\uD83C\uDF7B'],
    [/vegan|vegetarian|salad|health/i, '\uD83E\uDD57'],
    [/western|steak|french/i, '\uD83E\uDD69']
  ];
  function emojiFor(r) {
    var s = r.cuisines.join(' ') + ' ' + r.name;
    for (var i = 0; i < EMOJI.length; i++) if (EMOJI[i][0].test(s)) return EMOJI[i][1];
    return '\uD83C\uDF7D\uFE0F';
  }

  var api = {
    parseCSV: parseCSV, parseRestaurants: parseRestaurants, toRestaurants: toRestaurants,
    facetsOf: facetsOf, filterRestaurants: filterRestaurants, shuffle: shuffle,
    mapsLink: mapsLink, emojiFor: emojiFor, splitList: splitList, cleanPhoto: cleanPhoto
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FF = api;
})(typeof self !== 'undefined' ? self : this);
