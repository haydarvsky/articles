/* ===== لوحةُ تحكّم المقالات: قراءةٌ وتعديلٌ ونشرٌ بالتزامٍ واحد ===== */
(function () {
  'use strict';

  var OWNER = 'haydarvsky', REPO = 'articles', BRANCH = 'main';
  var TOKEN_KEY = 'ar_token';
  var DATA_PATH = 'data/articles.json';

  var MOCK = /[?&]mock=1/.test(location.search);
  var gh = null;                 // GhApi
  var state = {
    articles: [],                // البيانات
    pending: {},                 // path -> {base64|text}  ملفاتٌ تُرفَعُ مع الحفظ
    deletes: [],                 // مساراتٌ تُحذَف
    editing: null,               // index أو null
    dirty: false,
    repoFiles: [],               // ملفاتُ html في المستودع
    categories: []               // تصنيفاتُه هو، بترتيبِها
  };

  var $ = function (id) { return document.getElementById(id); };
  var el = {};
  ['gate', 'app', 'token', 'tokenSave', 'tryMock', 'who', 'save', 'dirty', 'mock', 'rows', 'newBtn',
    'edTitle', 'drop', 'file', 'fname', 'pick', 'pickWrap', 'title', 'kicker', 'series', 'teaser',
    'tags', 'category', 'cats', 'newCat', 'addCat', 'dmonth', 'dyear', 'minutes', 'id', 'cov', 'covBtn', 'covClear', 'covThumb', 'featured', 'hidden',
    'apply', 'cancel', 'del', 'pcard', 'status'].forEach(function (k) { el[k] = $(k); });

  var AR = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  var MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  function arNum(n) { return String(n).replace(/[0-9]/g, function (d) { return AR[+d]; }); }
  function fmtDate(s) { if (!s) return ''; var p = String(s).split('-'); return (p[1] ? MONTHS[+p[1] - 1] + ' ' : '') + arNum(p[0] || ''); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function slugify(s) {
    return String(s || '').trim().toLowerCase()
      .replace(/[^؀-ۿa-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 40) || ('maqal-' + Date.now());
  }
  function say(msg, kind) {
    el.status.textContent = msg;
    el.status.className = 'status show' + (kind ? ' ' + kind : '');
    if (kind) setTimeout(function () { el.status.className = 'status'; }, 5200);
  }
  function markDirty(v) {
    state.dirty = v;
    el.dirty.hidden = !v;
    el.save.disabled = !v;
  }

  /* ---------------- الإقلاع ---------------- */
  function boot() {
    if (MOCK) return startMock();
    var t = localStorage.getItem(TOKEN_KEY);
    if (!t) { el.gate.hidden = false; return; }
    connect(t);
  }

  function startMock() {
    el.mock.hidden = false; el.gate.hidden = true; el.app.hidden = false;
    el.who.textContent = 'تجربةٌ محلّية — لا يُنشَرُ شيء';
    fetch(DATA_PATH, { cache: 'no-cache' }).then(function (r) { return r.json(); })
      .then(function (d) {
        state.articles = d.articles || [];
        state.categories = d.categories || [];
        renderCats(); renderRows(); newArticle();
      })
      .catch(function () { state.articles = []; renderCats(); renderRows(); newArticle(); });
  }

  function connect(token) {
    gh = new GhApi({ owner: OWNER, repo: REPO, branch: BRANCH, token: token });
    say('جارٍ التحقّقُ من الرمز…');
    gh.check().then(function (info) {
      if (!info.canPush) throw new Error('الرمزُ لا يملكُ صلاحيةَ الكتابةِ في المستودع');
      localStorage.setItem(TOKEN_KEY, token);
      el.gate.hidden = true; el.app.hidden = false;
      el.who.textContent = (info.user ? info.user + ' · ' : '') + info.repo;
      say('متّصل ✓', 'ok');
      return loadAll();
    }).catch(function (e) {
      el.gate.hidden = false; el.app.hidden = true;
      say('تعذّرَ الاتصال: ' + e.message, 'bad');
    });
  }

  function loadAll() {
    return Promise.all([
      gh.readText(DATA_PATH),
      gh.tree().catch(function () { return new Map(); })
    ]).then(function (res) {
      var f = res[0], tree = res[1];
      var parsed = f ? JSON.parse(f.text) : {};
      state.articles = parsed.articles || [];
      state.categories = parsed.categories || [];
      state.repoFiles = Array.from(tree.keys()).filter(function (p) {
        return /\.html?$/i.test(p) && p.indexOf('/') < 0 && p !== 'index.html' && p !== 'admin.html';
      });
      renderCats(); renderRows(); fillPick(); newArticle();
    });
  }

  /* ---------------- القائمة ---------------- */
  function renderRows() {
    var arr = state.articles;
    if (!arr.length) { el.rows.innerHTML = '<p class="hint">لا مقالةَ بعد — ابدأْ بـ«مقالةٌ جديدة».</p>'; return; }
    el.rows.innerHTML = arr.map(function (a, i) {
      return '<div class="row' + (state.editing === i ? ' sel' : '') + (a.hidden ? ' hid' : '') + '" draggable="true" data-i="' + i + '">'
        + '<span class="grip" title="اسحبْ للترتيب">⠿</span>'
        + '<span class="tx"><b>' + esc(a.title || '(بلا عنوان)') + '</b>'
        + '<i>' + (a.category ? esc(a.category) + ' · ' : '') + esc(a.file || '—')
        + (a.date ? ' · ' + esc(fmtDate(a.date)) : '') + '</i></span>'
        + '<span class="acts">'
        + '<button class="icobtn star' + (a.featured ? ' star-on' : '') + '" data-act="feat" title="مميّزة">'
        + '<svg viewBox="0 0 24 24" ' + (a.featured ? 'fill="currentColor" stroke="none"' : '') + '><path d="M12 3l2.6 5.6 6.1.8-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6L3.3 9.4l6.1-.8z"/></svg></button>'
        + '<button class="icobtn" data-act="hide" title="' + (a.hidden ? 'أظهرْ' : 'أخفِ') + '">'
        + (a.hidden
          ? '<svg viewBox="0 0 24 24"><path d="M3 3l18 18"/><path d="M10.6 5.3A8 8 0 0 1 21 12a17 17 0 0 1-2.2 2.8M6.2 6.6A16 16 0 0 0 3 12a8 8 0 0 0 11 6.6"/></svg>'
          : '<svg viewBox="0 0 24 24"><path d="M3 12s3.6-6 9-6 9 6 9 6-3.6 6-9 6-9-6-9-6z"/><circle cx="12" cy="12" r="2.6"/></svg>')
        + '</button>'
        + '<button class="icobtn" data-act="edit" title="عدّلْ"><svg viewBox="0 0 24 24"><path d="M4 20h4l10-10-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg></button>'
        + '<button class="icobtn del" data-act="del" title="احذفْ"><svg viewBox="0 0 24 24"><path d="M5 7h14M9 7V5h6v2M7 7l1 13h8l1-13"/></svg></button>'
        + '</span></div>';
    }).join('');
  }

  el.rows.addEventListener('click', function (e) {
    var row = e.target.closest('.row'); if (!row) return;
    var i = +row.dataset.i;
    var btn = e.target.closest('[data-act]');
    var act = btn && btn.dataset.act;
    if (act === 'feat') {
      state.articles.forEach(function (a, k) { a.featured = (k === i) ? !a.featured : false; });
      markDirty(true); renderRows(); return;
    }
    if (act === 'hide') { state.articles[i].hidden = !state.articles[i].hidden; markDirty(true); renderRows(); return; }
    if (act === 'del') {
      var a = state.articles[i];
      if (!confirm('حذفُ «' + (a.title || '') + '» من فهرسِ الصفحة؟\nملفُّ المقالة ' + (a.file || '') + ' يبقى في المستودع.')) return;
      if (a.cover && !/^https?:/.test(a.cover)) state.deletes.push(a.cover);
      state.articles.splice(i, 1);
      normalizeOrder(); state.editing = null; markDirty(true); renderRows(); newArticle(); return;
    }
    edit(i);
  });

  /* السحبُ للترتيب */
  var dragI = null;
  el.rows.addEventListener('dragstart', function (e) {
    var r = e.target.closest('.row'); if (!r) return;
    dragI = +r.dataset.i; r.classList.add('drag'); e.dataTransfer.effectAllowed = 'move';
  });
  el.rows.addEventListener('dragover', function (e) {
    e.preventDefault();
    var r = e.target.closest('.row'); if (!r) return;
    [].forEach.call(el.rows.children, function (c) { c.classList.remove('over'); });
    r.classList.add('over');
  });
  el.rows.addEventListener('drop', function (e) {
    e.preventDefault();
    var r = e.target.closest('.row'); if (!r || dragI == null) return;
    var to = +r.dataset.i;
    var moved = state.articles.splice(dragI, 1)[0];
    state.articles.splice(to, 0, moved);
    normalizeOrder(); dragI = null; markDirty(true); renderRows();
  });
  el.rows.addEventListener('dragend', function () {
    [].forEach.call(el.rows.children, function (c) { c.classList.remove('drag', 'over'); });
    dragI = null;
  });
  function normalizeOrder() { state.articles.forEach(function (a, i) { a.order = i; }); }

  /* ---------------- التصنيفات ---------------- */
  function catCount(c) {
    return state.articles.filter(function (a) { return a.category === c; }).length;
  }
  function renderCats() {
    el.cats.innerHTML = state.categories.length
      ? state.categories.map(function (c, i) {
        var n = catCount(c);
        return '<span class="catchip" draggable="true" data-i="' + i + '">'
          + '<b>' + esc(c) + '</b>'
          + '<i>' + (n ? arNum(n) : '٠') + '</i>'
          + '<button type="button" data-rmcat="' + i + '" title="احذفِ التصنيف">×</button></span>';
      }).join('')
      : '<span class="sm" style="color:rgba(42,26,15,.45)">لا تصنيفَ بعد — أضِفْ واحداً</span>';
    /* قائمةُ الاختيارِ في النموذج */
    var cur = draft ? (draft.category || '') : '';
    el.category.innerHTML = '<option value="">— بلا تصنيف —</option>'
      + state.categories.map(function (c) {
        return '<option value="' + esc(c) + '"' + (c === cur ? ' selected' : '') + '>' + esc(c) + '</option>';
      }).join('')
      + (cur && state.categories.indexOf(cur) < 0 ? '<option value="' + esc(cur) + '" selected>' + esc(cur) + ' (غيرُ مُدرَج)</option>' : '');
  }
  el.addCat.addEventListener('click', function () {
    var v = el.newCat.value.trim();
    if (!v) { el.newCat.focus(); return; }
    if (state.categories.indexOf(v) > -1) { say('هذا التصنيفُ موجودٌ سلفاً', 'bad'); return; }
    state.categories.push(v); el.newCat.value = '';
    markDirty(true); renderCats();
    say('أُضيفَ «' + v + '» — يظهرُ شريحةً في الصفحةِ حين تُنسَبُ إليه مقالة', 'ok');
  });
  el.newCat.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); el.addCat.click(); } });
  el.cats.addEventListener('click', function (e) {
    var b = e.target.closest('[data-rmcat]'); if (!b) return;
    var i = +b.dataset.rmcat, c = state.categories[i], n = catCount(c);
    if (n) { say('لا يُحذَفُ «' + c + '» وفيه ' + arNum(n) + ' مقالة — انقلْها إلى تصنيفٍ آخرَ أوّلاً', 'bad'); return; }
    if (!confirm('حذفُ التصنيف «' + c + '»؟')) return;
    state.categories.splice(i, 1); markDirty(true); renderCats();
  });
  /* سحبُ التصنيفاتِ لترتيبِ الشرائح */
  var dragC = null;
  el.cats.addEventListener('dragstart', function (e) {
    var c = e.target.closest('.catchip'); if (!c) return;
    dragC = +c.dataset.i; c.classList.add('drag');
  });
  el.cats.addEventListener('dragover', function (e) { e.preventDefault(); });
  el.cats.addEventListener('drop', function (e) {
    e.preventDefault();
    var c = e.target.closest('.catchip'); if (!c || dragC == null) return;
    var m = state.categories.splice(dragC, 1)[0];
    state.categories.splice(+c.dataset.i, 0, m);
    dragC = null; markDirty(true); renderCats();
  });
  el.cats.addEventListener('dragend', function () {
    [].forEach.call(el.cats.children, function (c) { c.classList.remove('drag'); });
    dragC = null;
  });

  /* ---------------- المحرّر ---------------- */
  var draft = null;

  function blank() {
    var d = new Date();
    return {
      id: '', file: '', title: '', kicker: '', teaser: '', category: (state.categories[0] || ''), series: '', tags: [],
      date: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'),
      minutes: 0, cover: '', featured: false, hidden: false, order: state.articles.length
    };
  }

  function newArticle() { state.editing = null; draft = blank(); fill(); renderRows(); }
  function edit(i) { state.editing = i; draft = JSON.parse(JSON.stringify(state.articles[i])); fill(); renderRows(); }

  function fill() {
    el.edTitle.textContent = state.editing == null ? 'مقالةٌ جديدة' : 'تعديلُ مقالة';
    el.del.hidden = state.editing == null;
    el.title.value = draft.title || '';
    el.kicker.value = draft.kicker || '';
    el.series.value = draft.series || '';
    el.teaser.value = draft.teaser || '';
    renderCats();
    el.tags.value = (draft.tags || []).join('، ');
    var dp = String(draft.date || '').split('-');
    el.dyear.value = dp[0] || '';
    el.dmonth.value = dp[1] || '';
    el.minutes.value = draft.minutes || 0;
    el.id.value = draft.id || '';
    el.featured.checked = !!draft.featured;
    el.hidden.checked = !!draft.hidden;
    el.fname.hidden = !draft.file;
    el.fname.textContent = draft.file ? 'الملفّ: ' + draft.file : '';
    el.drop.classList.toggle('has', !!draft.file);
    setCovThumb(coverSrc());
    preview();
  }

  /* مصدرُ عرضِ الغلاف: من المعلَّقاتِ إن كان جديداً (بنوعِه الصحيح) وإلا من المستودع */
  function coverSrc() {
    if (!draft.cover) return '';
    var p = state.pending[draft.cover];
    if (!p) return draft.cover;
    if (p.text) return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(p.text);
    return 'data:image/' + (/\.png$/i.test(draft.cover) ? 'png' : 'jpeg') + ';base64,' + p.base64;
  }

  function setCovThumb(src) {
    if (src) { el.covThumb.src = src; el.covThumb.style.visibility = 'visible'; el.covClear.hidden = false; }
    else { el.covThumb.removeAttribute('src'); el.covThumb.style.visibility = 'hidden'; el.covClear.hidden = true; }
  }

  function readForm() {
    draft.title = el.title.value.trim();
    draft.kicker = el.kicker.value.trim();
    draft.series = el.series.value.trim();
    draft.teaser = el.teaser.value.trim();
    draft.category = el.category.value;
    draft.tags = el.tags.value.split(/[،,]/).map(function (s) { return s.trim(); }).filter(Boolean);
    var yy = String(parseInt(el.dyear.value, 10) || '');
    draft.date = yy ? (yy + (el.dmonth.value ? '-' + el.dmonth.value : '')) : '';
    draft.minutes = Math.max(0, parseInt(el.minutes.value, 10) || 0);
    draft.id = el.id.value.trim() || (draft.title ? slugify(draft.title) : '');
    draft.featured = el.featured.checked;
    draft.hidden = el.hidden.checked;
    if (!draft.file && draft.id) draft.file = draft.id + '.html';
  }

  function preview() {
    readForm();
    var tags = (draft.tags || []).slice(0, 3).map(function (t) { return '<span>' + esc(t) + '</span>'; }).join('');
    var m = [];
    if (draft.date) m.push(fmtDate(draft.date));
    if (draft.minutes) m.push(arNum(draft.minutes) + ' دقيقةَ قراءة');
    if (draft.series) m.push(draft.series);
    var cs = coverSrc();
    el.pcard.innerHTML =
      (cs ? '<div class="pstrip"><img src="' + esc(cs) + '" alt=""></div>' : '')
      + (draft.kicker ? '<div class="k">' + esc(draft.kicker) + '</div>' : '')
      + '<h4>' + esc(draft.title || 'عنوانُ المقالة') + '</h4>'
      + (draft.teaser ? '<p class="t">' + esc(draft.teaser) + '</p>' : '')
      + (draft.category ? '<div class="tags"><span class="catbadge">' + esc(draft.category) + '</span></div>' : '')
      + (tags ? '<div class="tags">' + tags + '</div>' : '')
      + (m.length ? '<div class="m">' + esc(m.join(' · ')) + '</div>' : '');
  }

  ['title', 'kicker', 'series', 'teaser', 'tags', 'dmonth', 'dyear', 'minutes', 'id'].forEach(function (k) {
    el[k].addEventListener('input', preview);
  });
  el.category.addEventListener('change', function () { preview(); renderCats(); });
  el.featured.addEventListener('change', preview);
  el.hidden.addEventListener('change', preview);

  el.apply.addEventListener('click', function () {
    readForm();
    if (!draft.title) { el.title.classList.add('err'); el.title.focus(); say('العنوانُ مطلوب', 'bad'); return; }
    el.title.classList.remove('err');
    if (!draft.file) { say('اختر ملفَّ المقالة (HTML) أوّلاً', 'bad'); return; }
    if (draft.featured) state.articles.forEach(function (a) { a.featured = false; });
    if (state.editing == null) { state.articles.push(draft); state.editing = state.articles.length - 1; }
    else state.articles[state.editing] = draft;
    normalizeOrder(); markDirty(true); renderRows(); renderCats();
    say('أُثبِتَ التعديلُ في القائمة — اضغطْ «حفظٌ ونشر» ليظهرَ في الصفحة', 'ok');
    draft = JSON.parse(JSON.stringify(state.articles[state.editing]));
    el.edTitle.textContent = 'تعديلُ مقالة';
    el.del.hidden = false;
  });

  el.cancel.addEventListener('click', newArticle);
  el.newBtn.addEventListener('click', newArticle);
  el.del.addEventListener('click', function () {
    if (state.editing == null) return;
    var a = state.articles[state.editing];
    if (!confirm('حذفُ «' + (a.title || '') + '» من الفهرس؟')) return;
    state.articles.splice(state.editing, 1);
    normalizeOrder(); state.editing = null; markDirty(true); renderRows(); newArticle();
  });

  /* ---------------- ملفُّ المقالة ---------------- */
  el.drop.addEventListener('click', function () { el.file.click(); });
  el.drop.addEventListener('dragover', function (e) { e.preventDefault(); el.drop.classList.add('on'); });
  el.drop.addEventListener('dragleave', function () { el.drop.classList.remove('on'); });
  el.drop.addEventListener('drop', function (e) {
    e.preventDefault(); el.drop.classList.remove('on');
    var f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) takeHtml(f);
  });
  el.file.addEventListener('change', function () { if (el.file.files[0]) takeHtml(el.file.files[0]); });

  function takeHtml(file) {
    if (!/\.html?$/i.test(file.name)) { say('المطلوبُ ملفُ HTML', 'bad'); return; }
    var fr = new FileReader();
    fr.onload = function () {
      var text = String(fr.result);
      var meta = extract(text);
      draft.file = file.name;
      /* المعرّفُ يتبعُ اسمَ الملفّ إلا إن كتبَه المستخدمُ بنفسه */
      var base = file.name.replace(/\.html?$/i, '');
      if (!el.id.value.trim() || /^maqal-\d+$/.test(el.id.value.trim())) el.id.value = base;
      draft.id = el.id.value.trim();
      if (meta.title && !el.title.value.trim()) el.title.value = meta.title;
      if (meta.kicker && !el.kicker.value.trim()) el.kicker.value = meta.kicker;
      if (meta.teaser && !el.teaser.value.trim()) el.teaser.value = meta.teaser;
      if (meta.minutes && !+el.minutes.value) el.minutes.value = meta.minutes;
      state.pending[file.name] = { text: text };
      el.fname.hidden = false;
      el.fname.textContent = 'الملفّ: ' + file.name + ' · ' + ImgTools.fmtSize(text.length)
        + (meta.words ? ' · ' + arNum(meta.words) + ' كلمة' : '');
      el.drop.classList.add('has');
      markDirty(true); preview();
      say('قُرئَ الملفُّ واستُخرِجت بياناتُه — راجعْها ثمّ «أثبِتِ التعديل»', 'ok');
    };
    fr.readAsText(file, 'utf-8');
  }

  /* استخراجُ البيانات من صفحةِ المقالة */
  function extract(html) {
    var out = { title: '', kicker: '', teaser: '', words: 0, minutes: 0 };
    try {
      var doc = new DOMParser().parseFromString(html, 'text/html');
      var h1 = doc.querySelector('h1');
      out.title = (h1 ? h1.textContent : (doc.title || '')).replace(/\s+/g, ' ').trim();
      var k = doc.querySelector('.kicker');
      if (k) out.kicker = k.textContent.replace(/\s+/g, ' ').trim();
      /* أوّلُ فقرةٍ ذاتِ طولٍ معقول تصلحُ سطراً تعريفياً */
      var ps = doc.querySelectorAll('p');
      for (var i = 0; i < ps.length; i++) {
        var t = ps[i].textContent.replace(/\s+/g, ' ').trim();
        if (t.length > 60) { out.teaser = t.length > 160 ? t.slice(0, 157).replace(/[،,\s]+\S*$/, '') + '…' : t; break; }
      }
      var body = (doc.body ? doc.body.textContent : '').replace(/\s+/g, ' ').trim();
      out.words = body ? body.split(' ').length : 0;
      out.minutes = out.words ? Math.max(1, Math.round(out.words / 180)) : 0;
    } catch (e) { }
    return out;
  }

  function fillPick() {
    var indexed = {};
    state.articles.forEach(function (a) { if (a.file) indexed[a.file] = 1; });
    var free = state.repoFiles.filter(function (p) { return !indexed[p]; });
    if (!free.length) { el.pickWrap.hidden = true; return; }
    el.pickWrap.hidden = false;
    el.pick.innerHTML = '<option value="">—</option>' + free.map(function (p) { return '<option value="' + esc(p) + '">' + esc(p) + '</option>'; }).join('');
  }
  el.pick.addEventListener('change', function () {
    var v = el.pick.value; if (!v) return;
    draft.file = v;
    if (!el.id.value.trim()) el.id.value = v.replace(/\.html?$/i, '');
    el.fname.hidden = false; el.fname.textContent = 'الملفّ: ' + v + ' (موجودٌ في المستودع)';
    el.drop.classList.add('has');
    preview();
  });

  /* ---------------- الغلاف ---------------- */
  el.covBtn.addEventListener('click', function () { el.cov.click(); });
  el.covClear.addEventListener('click', function () {
    if (draft.cover && state.pending[draft.cover]) delete state.pending[draft.cover];
    else if (draft.cover) state.deletes.push(draft.cover);
    draft.cover = ''; setCovThumb(''); markDirty(true); preview();
  });
  el.cov.addEventListener('change', function () {
    var f = el.cov.files[0]; if (!f) return;
    readForm();
    var base = 'images/' + (draft.id || 'cover') + '-' + Date.now();

    /* SVG يُحفَظُ نصّاً كما هو */
    if (/\.svg$/i.test(f.name) || f.type === 'image/svg+xml') {
      var fr = new FileReader();
      fr.onload = function () {
        var path = base + '.svg';
        state.pending[path] = { text: String(fr.result) };
        draft.cover = path;
        setCovThumb('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(String(fr.result)));
        markDirty(true); preview();
        say('جُهِّزَ الغلافُ (SVG) — يُرفَعُ مع الحفظ', 'ok');
      };
      fr.readAsText(f, 'utf-8');
      return;
    }

    /* PNG/WEBP تُبقى PNG كي **لا تُفقَدَ الخلفيةُ الشفّافة**؛ وغيرُها JPEG */
    var keepAlpha = /\.(png|webp)$/i.test(f.name) || f.type === 'image/png' || f.type === 'image/webp';
    ImgTools.compress(f, {
      maxEdge: 1600,
      quality: keepAlpha ? 1 : 0.85,
      type: keepAlpha ? 'image/png' : 'image/jpeg'
    }).then(function (r) {
      var path = base + (keepAlpha ? '.png' : '.jpg');
      state.pending[path] = { base64: r.base64 };
      draft.cover = path;
      setCovThumb(r.dataUrl);
      markDirty(true); preview();
      say('جُهِّزَ الغلافُ ' + (keepAlpha ? 'بشفافيتِه (PNG) ' : '') + '(' + ImgTools.fmtSize(r.size)
        + ' · ' + arNum(r.w) + '×' + arNum(r.h) + ') — يُرفَعُ مع الحفظ', 'ok');
    }).catch(function () { say('تعذّرَ تجهيزُ الصورة', 'bad'); });
  });

  /* ---------------- الحفظُ والنشر ---------------- */
  el.save.addEventListener('click', function () {
    if (MOCK) {
      say('وضعُ التجربة: كان سيُنشَرُ ' + arNum(Object.keys(state.pending).length + 1) + ' ملفاً و'
        + arNum(state.articles.length) + ' مقالةً في الفهرس', 'ok');
      markDirty(false); return;
    }
    if (!gh) return;
    el.save.disabled = true;
    normalizeOrder();

    /* يُعاد قراءةُ الفهرسِ الطازج قبل الكتابةِ كي لا نطمسَ تعديلاً من جهازٍ آخر */
    gh.readText(DATA_PATH).then(function (cur) {
      var payload = {
        updated: new Date().toISOString().slice(0, 10),
        categories: state.categories,
        articles: state.articles
      };
      var files = [{ path: DATA_PATH, text: JSON.stringify(payload, null, 2) + '\n' }];
      Object.keys(state.pending).forEach(function (p) {
        var v = state.pending[p];
        files.push(v.base64 != null ? { path: p, base64: v.base64 } : { path: p, text: v.text });
      });
      return gh.commit({
        message: 'المقالات: تحديثُ الفهرس' + (files.length > 1 ? ' ورفعُ ' + (files.length - 1) + ' ملفاً' : ''),
        files: files,
        deletes: state.deletes.slice(),
        onProgress: function (p) {
          if (p.stage === 'upload') say('رفعُ الملفات… ' + arNum(p.done) + '/' + arNum(p.total));
          else if (p.stage === 'tree') say('بناءُ الشجرة…');
          else if (p.stage === 'commit') say('تسجيلُ الالتزام…');
        }
      });
    }).then(function (r) {
      state.pending = {}; state.deletes = [];
      markDirty(false);
      say('نُشِرَ ✓ ستظهرُ الصفحةُ المحدَّثةُ بعد نحوِ دقيقة (جِتهَب پيجز)', 'ok');
      renderRows();
    }).catch(function (e) {
      el.save.disabled = false;
      say('فشلَ النشر: ' + e.message, 'bad');
    });
  });

  /* تحذيرٌ عند المغادرةِ بتغييراتٍ غيرِ منشورة */
  addEventListener('beforeunload', function (e) { if (state.dirty) { e.preventDefault(); e.returnValue = ''; } });

  /* ---------------- الرمز ---------------- */
  el.tokenSave.addEventListener('click', function () {
    var t = el.token.value.trim();
    if (!t) { el.token.classList.add('err'); return; }
    el.token.classList.remove('err');
    connect(t);
  });
  el.token.addEventListener('keydown', function (e) { if (e.key === 'Enter') el.tokenSave.click(); });
  el.tryMock.addEventListener('click', function () { location.search = '?mock=1'; });

  boot();
})();
