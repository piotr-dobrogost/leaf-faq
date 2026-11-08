// Wybrana generacja Leafa: z adresu (?gen=I|II|III, jak ?q= dla wyszukiwania), a bez niego z pamięci przeglądarki.
// Zmiana wyboru zapisuje go w przeglądarce i w adresie, żeby link z wybraną generacją dało się udostępnić.
var LeafGen = (function () {
  var TO = { I: '1', II: '2', III: '3', 1: '1', 2: '2', 3: '3' };
  var FROM = { 1: 'I', 2: 'II', 3: 'III' };
  var get = function () {
    var g = null;
    try { g = new URLSearchParams(location.search).get('gen'); } catch (e) {}
    if (g && TO[g.toUpperCase()]) {
      g = TO[g.toUpperCase()];
      try { localStorage.setItem('leafGen', g); } catch (e) {}
      return g;
    }
    try { g = localStorage.getItem('leafGen'); } catch (e) {}
    return /^[123]$/.test(g || '') ? g : 'all';
  };
  var set = function (g) {
    try { localStorage.setItem('leafGen', g); } catch (e) {}
    try {
      var url = new URL(location.href);
      if (FROM[g]) url.searchParams.set('gen', FROM[g]); else url.searchParams.delete('gen');
      if (url.href !== location.href) history.replaceState(null, '', url.href);
    } catch (e) {}
  };
  return { get: get, set: set };
})();

(function () {
  'use strict';

  // Przełącznik motywu (zapamiętywany lokalnie, jeśli przeglądarka pozwala).
  var toggle = document.querySelector('.theme-toggle');
  if (toggle) {
    toggle.addEventListener('click', function () {
      var root = document.documentElement;
      var dark = root.dataset.theme
        ? root.dataset.theme === 'dark'
        : window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.dataset.theme = dark ? 'light' : 'dark';
      try { localStorage.setItem('theme', root.dataset.theme); } catch (e) {}
    });
  }

  // Kopiowanie krótkiego linku do pytania.
  document.querySelectorAll('.copy-link').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var url = new URL('../' + btn.dataset.short + '/', location.href).href;
      var done = function () {
        btn.dataset.copied = url.replace(/^https?:\/\//, '');
        btn.classList.add('ok');
        clearTimeout(btn._okTimer);
        btn._okTimer = setTimeout(function () { btn.classList.remove('ok'); }, 2500);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(done, function () { window.prompt('Krótki link:', url); });
      } else {
        window.prompt('Krótki link:', url);
      }
    });
  });

  // Kopiowanie linku do sekcji odpowiedzi (przycisk obok „#” w nagłówku): bieżący adres z kotwicą sekcji.
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('.copy-anchor');
    if (!btn) return;
    var url = location.href.split('#')[0] + '#' + btn.dataset.anchor;
    var done = function () {
      btn.classList.add('ok');
      clearTimeout(btn._okTimer);
      btn._okTimer = setTimeout(function () { btn.classList.remove('ok'); }, 1800);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done, function () { window.prompt('Link do sekcji:', url); });
    } else {
      window.prompt('Link do sekcji:', url);
    }
  });

  // Kotwica wskazująca element w zwiniętej liście (np. #z3 w źródłach): rozwijamy ją i przewijamy do elementu.
  var openTarget = function () {
    var el = null;
    try { el = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1))); } catch (e) {}
    var d = el && el.parentElement && el.parentElement.closest('details:not([open])');
    if (!d) return;
    for (; d; d = d.parentElement && d.parentElement.closest('details:not([open])')) d.open = true;
    el.scrollIntoView();
  };
  openTarget();
  window.addEventListener('hashchange', openTarget);

  // Wyszukiwarka po indeksie JSON generowanym przez Hugo: filtruje listy pytań w kategoriach na stronie głównej.
  var input = document.getElementById('q');
  var status = document.getElementById('search-status');
  var noResults = document.getElementById('no-results');
  var blocks = Array.prototype.slice.call(document.querySelectorAll('.cat-block'));
  if (!input || !blocks.length) return;

  var norm = function (s) {
    return (s || '').toLowerCase().replace(/ł/g, 'l').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  };
  // Uproszczona odmiana: od słowa odcinana jest typowa końcówka, a oboczności są ujednolicane
  // (drodze → drog, Leafie → leaf, ładuje → ładowan), tak samo w pytaniu i w indeksie.
  var RULES = [
    ['owaniami', 'owan'], ['owaniach', 'owan'], ['owaniem', 'owan'], ['owania', 'owan'], ['owanie', 'owan'],
    ['owaniu', 'owan'], ['owalem', 'owan'], ['owala', 'owan'], ['owali', 'owan'], ['owal', 'owan'], ['owac', 'owan'],
    ['ujemy', 'owan'], ['ujesz', 'owan'], ['uje', 'owan'], ['uja', 'owan'],
    ['dzie', 'd'], ['cie', 't'], ['rze', 'r'], ['dze', 'g'], ['czce', 'czk'], ['rce', 'rk'], ['sce', 'sk'], ['ek', 'k'],
    ['iami', ''], ['iach', ''], ['owie', ''], ['ami', ''], ['ach', ''], ['owi', ''], ['ego', ''], ['emu', ''],
    ['ymi', ''], ['imi', ''], ['iej', ''], ['ych', ''], ['ich', ''], ['iom', ''], ['iow', ''],
    ['ym', ''], ['im', ''], ['om', ''], ['ow', ''], ['em', ''], ['ie', ''], ['ia', ''], ['ii', ''], ['iu', ''],
    ['io', ''], ['ej', ''], ['a', ''], ['e', ''], ['i', ''], ['y', ''], ['u', ''], ['o', '']
  ].sort(function (a, b) { return b[0].length - a[0].length; });
  var stemCache = {};
  var stem = function (w) {
    if (w.length < 4 || /\d/.test(w)) return w;
    if (stemCache[w]) return stemCache[w];
    var out = w;
    for (var i = 0; i < RULES.length; i++) {
      var r = RULES[i];
      var cut = w.length - r[0].length;
      if (cut >= 3 && w.slice(cut) === r[0]) { out = w.slice(0, cut) + r[1]; break; }
    }
    return (stemCache[w] = out);
  };
  var WORD = /[a-z0-9]+/g;
  var FIELDS = ['t', 'w', 'k', 's', 'c'];
  // Pole indeksu: tekst znormalizowany (dopasowanie fragmentu) i tematy słów (dopasowanie odmiany od początku słowa).
  var field = function (text) {
    var raw = norm(text);
    return { raw: raw, stems: ' ' + (raw.match(WORD) || []).map(stem).join(' ') };
  };
  var has = function (f, term) { return f.raw.indexOf(term.t) >= 0 || f.stems.indexOf(' ' + term.s) >= 0; };
  // Trafienia w tekście: całe słowa pasujące odmianą oraz fragmenty (np. „6,6”), jako rozłączne
  // przedziały [początek, koniec] w tekście znormalizowanym.
  var matches = function (text, terms) {
    var n = norm(text), found = [], m;
    WORD.lastIndex = 0;
    while ((m = WORD.exec(n))) {
      var w = m[0], ws = stem(w);
      if (terms.some(function (t) { return w.indexOf(t.t) >= 0 || ws.indexOf(t.s) === 0; })) found.push([m.index, m.index + w.length]);
    }
    terms.forEach(function (t) {
      for (var i = n.indexOf(t.t); i >= 0; i = n.indexOf(t.t, i + t.t.length)) found.push([i, i + t.t.length]);
    });
    found.sort(function (a, b) { return a[0] - b[0]; });
    var out = [];
    found.forEach(function (r) {
      var last = out[out.length - 1];
      if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]); else out.push(r.slice());
    });
    return out;
  };

  var esc = function (s) {
    return s.replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  };
  // Wybrana generacja Leafa (przełącznik „Generacja”, wspólny z przełącznikiem w odpowiedziach): ukrywa pytania
  // o innej generacji, a wyszukiwarka pomija w treści fragmenty oznaczone innymi generacjami.
  var gen = LeafGen.get();
  // Treść odpowiedzi do przeszukania: część wspólna (c) i fragmenty wybranej generacji (g1–g3).
  var body = function (it) {
    return gen === 'all' ? [it.c, it.g1, it.g2, it.g3].join(' ') : it.c + ' ' + (it['g' + gen] || '');
  };
  // Pola indeksu liczone przy pierwszym użyciu, osobno dla każdej generacji (zmienia się tylko treść).
  var fields = function (it) {
    if (!it._f[gen]) {
      var f = {}, text = body(it);
      ['t', 'w', 'k', 's'].forEach(function (k) { f[k] = it._base[k] || (it._base[k] = field(it[k])); });
      f.c = field(text);
      f.all = field([it.id, it.t, it.w, it.k, it.s, text].join(' '));
      it._f[gen] = f;
    }
    return it._f[gen];
  };
  var data = null;
  var loading = null;
  var load = function () {
    if (loading) return loading;
    loading = fetch(input.dataset.index).then(function (r) { return r.json(); }).then(function (d) {
      data = {};
      d.forEach(function (it) {
        it._f = {};
        it._base = {};
        data[it.id] = it;
      });
      return data;
    });
    return loading;
  };
  var base = input.dataset.index.replace(/index\.json$/, '');

  // Elementy list pytań wraz z oryginalnymi tytułami i licznikami kategorii.
  var items = [];
  blocks.forEach(function (block) {
    var count = block.querySelector('h2 .count');
    block._count = count;
    block._total = count ? count.textContent : '';
    block._items = Array.prototype.slice.call(block.querySelectorAll('.q-list li')).map(function (li) {
      var qt = li.querySelector('.qt');
      var item = { li: li, id: li.dataset.id, qt: qt, title: qt.textContent, link: li.querySelector('a'),
        gens: (li.dataset.gen || '').split(' ').filter(Boolean) };
      items.push(item);
      return item;
    });
  });

  // Pierwsze wystąpienie słowa w tekście znormalizowanym: najpierw dokładna forma, dopiero potem odmiana.
  var find = function (n, t) {
    var i = n.indexOf(t.t), m;
    if (i >= 0) return i;
    WORD.lastIndex = 0;
    while ((m = WORD.exec(n))) if (stem(m[0]).indexOf(t.s) === 0) return m.index;
    return -1;
  };
  // Fragmenty z trafieniami: po jednym dla każdego słowa, zachodzące na siebie łączone w jeden.
  var snippets = function (text, terms) {
    var n = norm(text), spans = [];
    terms.forEach(function (t) {
      var i = find(n, t);
      if (i < 0) return;
      var a = Math.max(0, i - 60), b = Math.min(text.length, i + t.t.length + 80);
      if (a) a = text.lastIndexOf(' ', a) + 1;
      if (b < text.length) { b = text.indexOf(' ', b); if (b < 0) b = text.length; }
      spans.push([a, b]);
    });
    spans.sort(function (x, y) { return x[0] - y[0]; });
    var out = [];
    spans.forEach(function (r) {
      var last = out[out.length - 1];
      if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]); else out.push(r.slice());
    });
    return out.map(function (r) {
      var part = text.slice(r[0], r[1]).trim();
      return (r[0] ? '…' : '') + part + (r[1] < text.length && !/[.!?…]$/.test(part) ? '…' : '');
    });
  };
  // Podświetlenie na tekście znormalizowanym (bez ogonków), żeby indeksy zgadzały się z oryginałem.
  var highlight = function (text, terms) {
    var marks = matches(text, terms);
    if (!marks.length || norm(text).length !== text.length) return esc(text);
    var out = '', pos = 0;
    marks.forEach(function (m) {
      out += esc(text.slice(pos, m[0])) + '<mark>' + esc(text.slice(m[0], m[1])) + '</mark>';
      pos = m[1];
    });
    return out + esc(text.slice(pos));
  };

  var WEIGHT = { t: 6, w: 3, k: 2, s: 2, c: 1 };
  var score = function (it, q, terms, every) {
    if (it.id === q) return 1000;
    var f = fields(it);
    var hit = every ? terms.every : terms.some;
    if (!hit.call(terms, function (t) { return has(f.all, t); })) return 0;
    var sc = 0;
    terms.forEach(function (t) {
      FIELDS.forEach(function (k) { if (has(f[k], t)) sc += WEIGHT[k]; });
    });
    return sc || 1;
  };

  var setStatus = function (html) { if (status) status.innerHTML = html; };
  var hint = status ? status.innerHTML : '';
  var best = null;

  // Pytanie z etykietą generacji (np. tylko Leaf I) znika, gdy wybrano inną generację.
  var allowed = function (x) { return gen === 'all' || !x.gens.length || x.gens.indexOf(gen) >= 0; };
  var counts = function () {
    blocks.forEach(function (b) {
      var n = b._items.filter(function (x) { return !x.li.hidden; }).length;
      b.hidden = !n;
      if (b._count) b._count.textContent = n;
    });
  };
  var reset = function () {
    best = null;
    items.forEach(function (x) { x.li.hidden = !allowed(x); x.qt.textContent = x.title; });
    counts();
    if (noResults) noResults.hidden = true;
    setStatus(hint);
  };

  var render = function (text) {
    var q = norm((typeof text === 'string' ? text : input.value).trim());
    if (!q) { reset(); return; }
    var words = q.split(/\s+/).filter(function (t) { return t.length > 1 || /\d/.test(t); });
    if (!words.length) words = [q];
    var terms = words.map(function (t) {
      var w = t.match(WORD);
      return { t: t, s: w && w.length === 1 && w[0] === t ? stem(t) : t };
    });
    // Najpierw pytania zawierające wszystkie słowa; jeśli takich nie ma – dowolne z nich.
    var scores = {};
    var found = 0;
    [true, false].some(function (every) {
      found = 0;
      items.forEach(function (x) {
        var it = data[x.id];
        scores[x.id] = it && allowed(x) ? score(it, q, terms, every) : 0;
        if (scores[x.id]) found++;
      });
      return found > 0;
    });
    best = null;
    items.forEach(function (x) {
      var sc = scores[x.id];
      x.li.hidden = !sc;
      if (!sc) return;
      if (!best || sc > scores[best.id]) best = x;
      var it = data[x.id];
      // Słowa spoza tytułu dostają fragmenty tekstu, w których występują.
      var rest = terms.filter(function (t) { return !has(fields(it).t, t); });
      var snips = rest.length ? snippets(it.w.replace(/ \| /g, ' · ') + ' · ' + (it.s || '') + ' ' + body(it), rest) : [];
      x.qt.innerHTML = highlight(x.title, terms) + snips.map(function (sn) {
        return '<span class="q-snip">' + highlight(sn, terms) + '</span>';
      }).join('');
    });
    counts();
    if (noResults) noResults.hidden = found > 0;
    var word = found === 1 ? 'pytanie' : (found % 10 >= 2 && found % 10 <= 4 && (found % 100 < 10 || found % 100 >= 20)) ? 'pytania' : 'pytań';
    setStatus(found
      ? 'Znaleziono <span class="status-n">' + found + '</span> ' + word + ' – poniżej, w swoich kategoriach. ' +
        '<button type="button" class="link-btn" data-clear>Wyczyść</button>'
      : 'Brak wyników. <button type="button" class="link-btn" data-clear>Wyczyść</button>');
  };

  var clear = function () { input.value = ''; reset(); syncUrl(); input.focus(); };
  document.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('[data-clear]')) clear();
  });
  // Skrót „/” aktywuje pole wyszukiwania (poza polami tekstowymi).
  document.addEventListener('keydown', function (e) {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
    var t = e.target;
    if (t && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName))) return;
    e.preventDefault();
    input.focus();
    input.select();
    var r = input.getBoundingClientRect();
    if (r.top < 70 || r.bottom > window.innerHeight) input.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });
  // Animacja przy wejściu z frazą w adresie: fraza „wpisuje się” w pole, a pole pulsuje.
  function intro(text) {
    var calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var r = input.getBoundingClientRect();
    if (r.bottom > window.innerHeight || r.top < 0) input.scrollIntoView({ block: 'center', behavior: calm ? 'auto' : 'smooth' });
    var pulse = function () {
      input.classList.remove('q-intro');
      void input.offsetWidth;
      input.classList.add('q-intro');
    };
    if (calm) { pulse(); return; }
    var chars = Array.from(text);
    var step = Math.max(25, Math.min(70, 900 / chars.length));
    var i = 0;
    var stop = function () { clearInterval(timer); input.value = text; };
    input.value = '';
    input.classList.add('q-typing');
    var timer = setInterval(function () {
      i++;
      input.value = chars.slice(0, i).join('');
      if (i >= chars.length) { clearInterval(timer); input.classList.remove('q-typing'); pulse(); }
    }, step);
    ['pointerdown', 'keydown'].forEach(function (ev) {
      input.addEventListener(ev, function () { if (i < chars.length) { stop(); input.classList.remove('q-typing'); } }, { once: true });
    });
  }
  input.addEventListener('animationend', function (e) { if (e.animationName === 'q-pulse') input.classList.remove('q-intro'); });

  // Fraza w adresie (?q=…): wypełnia pole przy wejściu, a pisanie aktualizuje adres, żeby wynik dało się udostępnić.
  var syncUrl = function () {
    try {
      var url = new URL(location.href);
      var v = input.value.trim();
      if (v) url.searchParams.set('q', v); else url.searchParams.delete('q');
      if (url.href !== location.href) history.replaceState(null, '', url.href);
    } catch (e) {}
  };
  var initial = '';
  try { initial = new URLSearchParams(location.search).get('q') || ''; } catch (e) {}
  if (initial) {
    input.value = initial;
    load().then(function () { render(initial); });
    intro(initial);
  }

  // Przełącznik „Generacja” nad wyszukiwarką.
  var picks = Array.prototype.slice.call(document.querySelectorAll('.gen-pick button[data-gen]'));
  var showGen = function () { picks.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.gen === gen)); }); };
  picks.forEach(function (b) {
    b.addEventListener('click', function () {
      gen = b.dataset.gen;
      LeafGen.set(gen);
      showGen();
      if (input.value.trim()) load().then(function () { render(); }); else reset();
    });
  });
  showGen();
  if (!initial) reset();

  input.addEventListener('focus', load, { once: true });
  input.addEventListener('input', function () { load().then(render); syncUrl(); });
  input.addEventListener('search', function () { if (!input.value) { reset(); syncUrl(); } });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { clear(); return; }
    if (e.key !== 'Enter') return;
    load().then(function () {
      render();
      var q = norm(input.value.trim());
      if (data[q]) { location.href = base + q + '/'; return; }
      if (best) location.href = best.link.href;
    });
  });
})();

// Przełącznik generacji Leafa w odpowiedziach: ukrywa sekcje (nagłówki z data-gen) i punkty/akapity
// z plakietkami innych generacji. Treść bez etykiety (wspólna dla Leafa I i II) zawsze zostaje.
// Wybór zapamiętujemy w przeglądarce (localStorage), żeby obowiązywał na kolejnych stronach.
(function () {
  var box = document.querySelector('.gen-filter');
  var answer = document.querySelector('.answer');
  if (!box || !answer) return;
  var heads = Array.prototype.slice.call(answer.querySelectorAll('h2[data-gen], h3[data-gen], h4[data-gen]'));
  var items = Array.prototype.slice.call(answer.querySelectorAll('.gens[data-gen]'));
  var qgen = (box.dataset.qgen || '').split(' ').filter(Boolean);
  if (!heads.length && !items.length && !qgen.length) return;
  box.hidden = false;
  var NAMES = { '1': 'Leafa I', '2': 'Leafa II', '3': 'Leafa III' };
  var note = box.querySelector('.gen-filter-note');
  var buttons = Array.prototype.slice.call(box.querySelectorAll('button[data-gen]'));
  var level = function (el) { return /^H[2-4]$/.test(el.tagName) ? +el.tagName[1] : 0; };
  var apply = function (sel) {
    var hidden = 0;
    answer.querySelectorAll('.gen-hidden').forEach(function (el) { el.classList.remove('gen-hidden'); });
    if (sel !== 'all') {
      heads.forEach(function (h) {
        if (h.dataset.gen.split(' ').indexOf(sel) >= 0) return;
        hidden++;
        h.classList.add('gen-hidden');
        for (var el = h.nextElementSibling; el && !(level(el) && level(el) <= level(h)); el = el.nextElementSibling) {
          el.classList.add('gen-hidden');
        }
      });
      items.forEach(function (b) {
        if (b.dataset.gen.split(' ').indexOf(sel) >= 0) return;
        var block = b.closest('li') || b.closest('p');
        if (block && !block.classList.contains('gen-hidden')) { block.classList.add('gen-hidden'); hidden++; }
      });
      // Listy, z których ukryto wszystkie punkty, nie zostawiają pustego miejsca.
      answer.querySelectorAll('ul, ol').forEach(function (list) {
        var lis = Array.prototype.filter.call(list.children, function (li) { return li.tagName === 'LI'; });
        if (lis.length && lis.every(function (li) { return li.classList.contains('gen-hidden'); })) list.classList.add('gen-hidden');
      });
    }
    buttons.forEach(function (btn) { btn.setAttribute('aria-pressed', String(btn.dataset.gen === sel)); });
    var msg = [];
    if (sel !== 'all' && qgen.length && qgen.indexOf(sel) < 0) {
      msg.push('To pytanie dotyczy ' + qgen.map(function (g) { return NAMES[g]; }).join(' i ') + '.');
    }
    if (hidden) msg.push('Ukryto ' + hidden + ' ' + (hidden === 1 ? 'fragment dotyczący' : (hidden % 10 >= 2 && hidden % 10 <= 4 && (hidden % 100 < 10 || hidden % 100 >= 20)) ? 'fragmenty dotyczące' : 'fragmentów dotyczących') + ' innych generacji.');
    note.textContent = msg.join(' ');
    document.dispatchEvent(new Event('leafgen:apply'));
  };
  apply(LeafGen.get());
  // Link (#kotwica) do fragmentu ukrytego przez filtr: pokazujemy treść dla wszystkich generacji i przewijamy do niego.
  // Zapamiętany wybór generacji się nie zmienia (przeglądarka nie przewinęła do ukrytego elementu, więc robimy to sami).
  var reveal = function () {
    var el = null;
    try { el = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1))); } catch (e) {}
    if (!el || !el.closest('.gen-hidden')) return;
    apply('all');
    note.textContent = 'Link prowadzi do fragmentu o innej generacji Leafa, dlatego pokazano treść dla wszystkich generacji.';
    el.scrollIntoView();
  };
  reveal();
  window.addEventListener('hashchange', reveal);
  buttons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      LeafGen.set(btn.dataset.gen);
      apply(btn.dataset.gen);
    });
  });
})();

// Spis sekcji obok odpowiedzi (widoczny od 1300 px, patrz CSS): linki do nagłówków h2 strony pytania,
// bieżąca sekcja podświetlona. Sekcje ukryte filtrem generacji znikają ze spisu (zdarzenie leafgen:apply).
(function () {
  var toc = document.querySelector('.toc');
  var list = toc && toc.querySelector('ol');
  if (!list) return;
  var heads = Array.prototype.slice.call(document.querySelectorAll('.faq h2[id]'));
  if (heads.length < 3) { toc.remove(); return; }
  var links = heads.map(function (h) {
    var label = h.cloneNode(true);
    label.querySelectorAll('.heading-anchor, .copy-anchor').forEach(function (el) { el.remove(); });
    var a = document.createElement('a');
    a.href = '#' + h.id;
    a.innerHTML = label.innerHTML.trim();
    var li = document.createElement('li');
    li.appendChild(a);
    list.appendChild(li);
    return a;
  });
  var current = -1;
  var update = function () {
    var cur = -1;
    var atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
    heads.forEach(function (h, i) {
      if (links[i].parentNode.hidden) return;
      if (atEnd || h.getBoundingClientRect().top < 120) cur = i;
    });
    if (cur === current) return;
    if (current >= 0) { links[current].classList.remove('active'); links[current].removeAttribute('aria-current'); }
    if (cur >= 0) { links[cur].classList.add('active'); links[cur].setAttribute('aria-current', 'location'); }
    current = cur;
  };
  var filter = function () {
    heads.forEach(function (h, i) { links[i].parentNode.hidden = !!h.closest('.gen-hidden'); });
    update();
  };
  var queued = false;
  var onScroll = function () {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () { queued = false; update(); });
  };
  filter();
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  document.addEventListener('leafgen:apply', filter);
})();
