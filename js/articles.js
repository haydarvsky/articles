/* ===== صفحةُ المقالات: تحميلُ البيانات، التصفية، الحركة ===== */
(function () {
  'use strict';

  var REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var FINE = matchMedia('(hover: hover) and (pointer: fine)').matches;

  var AR_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  var MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  function arNum(n) { return String(n).replace(/[0-9]/g, function (d) { return AR_DIGITS[+d]; }); }
  function fmtDate(s) {
    if (!s) return '';
    var p = String(s).split('-');
    var y = arNum(p[0] || '');
    var m = p[1] ? MONTHS[parseInt(p[1], 10) - 1] : '';
    return m ? m + ' ' + y : y;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  var els = {
    list: document.getElementById('list'),
    feat: document.getElementById('feat'),
    chips: document.getElementById('chips'),
    q: document.getElementById('q'),
    count: document.getElementById('count'),
    empty: document.getElementById('empty'),
    reset: document.getElementById('reset')
  };

  var ALL = [];
  var activeTag = '';

  /* ---------- التحميل ---------- */
  fetch('data/articles.json', { cache: 'no-cache' })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      ALL = (d.articles || [])
        .filter(function (a) { return !a.hidden && a.file; })
        .sort(function (a, b) {
          if ((a.order || 0) !== (b.order || 0)) return (a.order || 0) - (b.order || 0);
          return String(b.date || '').localeCompare(String(a.date || ''));
        });
      buildChips();
      render();
    })
    .catch(function () {
      els.list.innerHTML = '<div class="empty"><b>تعذَّر تحميلُ المقالات</b>أعِدْ تحديثَ الصفحة بعد قليل.</div>';
    });

  /* ---------- شرائحُ الموضوعات ---------- */
  function buildChips() {
    var counts = {};
    ALL.forEach(function (a) { (a.tags || []).forEach(function (t) { counts[t] = (counts[t] || 0) + 1; }); });
    var tags = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; }).slice(0, 7);
    if (!tags.length) return;
    var html = '<button class="chip" type="button" data-tag="" aria-pressed="true">الكلّ</button>';
    tags.forEach(function (t) {
      html += '<button class="chip" type="button" data-tag="' + esc(t) + '" aria-pressed="false">' + esc(t) + '</button>';
    });
    els.chips.innerHTML = html;
    els.chips.addEventListener('click', function (e) {
      var b = e.target.closest('.chip'); if (!b) return;
      activeTag = b.dataset.tag || '';
      [].forEach.call(els.chips.children, function (c) { c.setAttribute('aria-pressed', String(c === b)); });
      render();
    });
  }

  /* ---------- التصفية والعرض ---------- */
  function match(a, q) {
    if (activeTag && (a.tags || []).indexOf(activeTag) < 0) return false;
    if (!q) return true;
    var hay = [a.title, a.kicker, a.teaser, a.series].concat(a.tags || []).join(' ');
    return hay.indexOf(q) > -1;
  }

  function metaHtml(a) {
    var bits = [];
    if (a.date) bits.push('<b>' + esc(fmtDate(a.date)) + '</b>');
    if (a.minutes) bits.push('<b>' + arNum(a.minutes) + ' دقيقةَ قراءة</b>');
    if (a.series) bits.push('<b>' + esc(a.series) + '</b>');
    return bits.length ? '<div class="meta">' + bits.join('<span class="dot"></span>') + '</div>' : '';
  }

  function cardHtml(a, i) {
    var tags = (a.tags || []).slice(0, 3).map(function (t) { return '<span class="tag">' + esc(t) + '</span>'; }).join('');
    return '<a class="item" href="' + esc(a.file) + '" data-in style="--d:' + (Math.min(i, 8) * 55) + 'ms">'
      + (a.kicker ? '<div class="kicker">' + esc(a.kicker) + '</div>' : '')
      + '<h3>' + esc(a.title) + '</h3>'
      + (a.teaser ? '<p class="teaser">' + esc(a.teaser) + '</p>' : '')
      + (tags ? '<div class="tagrow">' + tags + '</div>' : '')
      + metaHtml(a)
      + '<span class="go">اقرأ المقال <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 6l-6 6 6 6"/></svg></span>'
      + '</a>';
  }

  function featHtml(a) {
    var cover = a.cover
      ? '<div class="cover"><img src="' + esc(a.cover) + '" alt="" loading="lazy" onerror="this.closest(\'.feat\').classList.remove(\'has-cover\');this.parentNode.remove()"></div>'
      : '';
    return '<a class="feat' + (a.cover ? ' has-cover' : '') + '" href="' + esc(a.file) + '" data-in>'
      + '<div class="body">'
      + '<span class="star"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.6 5.6 6.1.8-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6L3.3 9.4l6.1-.8z"/></svg>المقالةُ المميّزة</span>'
      + (a.kicker ? '<div class="kicker">' + esc(a.kicker) + '</div>' : '')
      + '<h2>' + esc(a.title) + '</h2>'
      + (a.teaser ? '<p class="teaser">' + esc(a.teaser) + '</p>' : '')
      + metaHtml(a)
      + '</div>' + cover + '</a>';
  }

  function render() {
    var q = (els.q.value || '').trim();
    var shown = ALL.filter(function (a) { return match(a, q); });

    var featured = (!q && !activeTag) ? shown.filter(function (a) { return a.featured; })[0] : null;
    var rest = featured ? shown.filter(function (a) { return a !== featured; }) : shown;

    els.feat.innerHTML = featured ? featHtml(featured) : '';
    els.list.innerHTML = rest.map(cardHtml).join('');
    els.empty.hidden = shown.length > 0;
    els.count.textContent = shown.length
      ? arNum(shown.length) + ' ' + (shown.length === 1 ? 'مقالة' : (shown.length === 2 ? 'مقالتان' : 'مقالات'))
        + (activeTag ? ' في «' + activeTag + '»' : '')
      : '';

    animateIn();
    if (FINE) glow();
  }

  /* ---------- الحركة ---------- */
  var io = ('IntersectionObserver' in window) ? new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { rootMargin: '0px 0px -8% 0px' }) : null;

  function animateIn() {
    var fresh = document.querySelectorAll('main [data-in]:not(.in)');
    if (!io) { fresh.forEach(function (el) { el.classList.add('in'); }); return; }
    fresh.forEach(function (el) { io.observe(el); });
    setTimeout(function () { fresh.forEach(function (el) { el.classList.add('in'); }); }, 2600);
  }

  function glow() {
    document.querySelectorAll('.item:not([data-glow]),.feat:not([data-glow])').forEach(function (c) {
      c.setAttribute('data-glow', '1');
      c.addEventListener('mousemove', function (e) {
        var r = c.getBoundingClientRect();
        c.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100).toFixed(1) + '%');
        c.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100).toFixed(1) + '%');
      });
    });
  }

  /* ترويسةٌ تدخلُ مع الخطوط */
  var headIns = document.querySelectorAll('.head [data-in]');
  function enterHead() {
    headIns.forEach(function (el) { el.classList.add('in'); });
    var rule = document.querySelector('.head .rule'); if (rule) rule.classList.add('in');
    setTimeout(function () { headIns.forEach(function (el) { el.style.setProperty('--d', '0ms'); }); }, 1400);
  }
  var started = false;
  function startOnce() { if (started) return; started = true; requestAnimationFrame(enterHead); }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(startOnce);
  setTimeout(startOnce, 900);

  /* شريطُ التقدّم */
  var bar = document.querySelector('.progress i'), ticking = false;
  addEventListener('scroll', function () {
    if (ticking) return; ticking = true;
    requestAnimationFrame(function () {
      var max = document.documentElement.scrollHeight - innerHeight;
      bar.style.transform = 'scaleX(' + (max > 0 ? Math.min((scrollY || 0) / max, 1) : 0) + ')';
      ticking = false;
    });
  }, { passive: true });

  /* ---------- البحث ---------- */
  var t;
  els.q.addEventListener('input', function () { clearTimeout(t); t = setTimeout(render, 140); });
  els.reset.addEventListener('click', function () {
    els.q.value = ''; activeTag = '';
    [].forEach.call(els.chips.children, function (c) { c.setAttribute('aria-pressed', String(!c.dataset.tag)); });
    render(); els.q.focus();
  });
  /* Esc يُفرِغ البحث */
  els.q.addEventListener('keydown', function (e) { if (e.key === 'Escape') { els.q.value = ''; render(); } });
})();
