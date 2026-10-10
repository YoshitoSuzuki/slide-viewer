/*
 * slide-viewer — Web ページに埋め込むスライドビューア
 *
 *   <script src="/slide-viewer/slide-viewer.js" defer></script>
 *   <div class="slide-viewer" data-deck="usage"></div>
 *
 * 設定（後のものほど優先。ただしダウンロードはサーバーの deck.json が許可したときだけ）:
 *   既定値 < SlideViewer.config({...}) < data-* 属性 < SlideViewer.mount(el, {...})
 *   endpoint  API の場所（既定はこのファイルと同じ場所の api/）
 *   static    PHP を使わず、資料のフォルダ（<static>/<deck>/deck.json …）を直接読む。ダウンロード対策は効かない
 *   lang      ボタンの読み上げ名の言語（"ja" / "en"。既定はページの lang）
 *   download  ダウンロードボタンを出すか（true / false）
 *   thumbs    サムネイル: true（ボタンあり）/ "open"（開いた状態で始める）/ false（ボタンなし）
 *   header    タイトルとページ数の行を出すか
 *   start     最初に出すページ
 *   accent    アクセント色
 *
 * ページ側から操作する: SlideViewer.get(el).go(9) / .next() / .prev() / .page()
 */
(function () {
  'use strict';

  var script = document.currentScript;
  var base = script ? new URL('.', script.src).href : '/viewer/';
  var version = script ? new URL(script.src).search : ''; // ?v=... を CSS にも付けてキャッシュを切り替える
  var DEFAULTS = { endpoint: base + 'api', static: '', download: true, thumbs: true, header: true, start: 1, accent: '', lang: '' };
  var site = {};
  var KEEP = 3; // 前後この枚数までページ画像を手元に残す
  var IDLE_MS = 2500; // 全画面で操作ボタンを隠すまでの時間
  var TOP_ZONE = 96; // 全画面で × を出す、上端からの距離（px）

  var ICON = {
    prev: '<path d="M15 18l-6-6 6-6"/>',
    next: '<path d="M9 18l6-6-6-6"/>',
    thumbs: '<rect x="3" y="5" width="18" height="10" rx="1.5"/><path d="M4 20h3M10.5 20h3M17 20h3"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    full: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    retry: '<path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5"/>'
  };

  var LABELS = {
    ja: {
      region: 'スライド', retry: '再読み込み', close: '全画面を閉じる', prev: '前のページ', next: '次のページ',
      thumbs: 'サムネイル', download: 'ダウンロード', full: '全画面',
      pages: function (n) { return n + 'ページ'; }, nth: function (n) { return n + 'ページ目'; }
    },
    en: {
      region: 'slides', retry: 'Reload', close: 'Exit full screen', prev: 'Previous page', next: 'Next page',
      thumbs: 'Thumbnails', download: 'Download', full: 'Full screen',
      pages: function (n) { return n + (n === 1 ? ' page' : ' pages'); }, nth: function (n) { return 'Page ' + n; }
    }
  };

  // 並べ替えたマスの順番。tools/scramble.php の sv_order() と同じ計算（xorshift32 で Fisher–Yates）
  function order(seed, page, n) {
    var x = (seed + page * 2654435761) % 4294967296;
    if (x === 0) x = 1;
    var a = [];
    for (var k = 0; k < n; k++) a.push(k);
    for (var i = n - 1; i > 0; i--) {
      x = (x ^ (x << 13)) >>> 0;
      x = (x ^ (x >>> 17)) >>> 0;
      x = (x ^ (x << 5)) >>> 0;
      var j = x % (i + 1);
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // マスを元の並びに戻す。等倍で描くので、マスの境目に隙間やにじみは出ない
  function unscramble(bmp, sc, page, w, h) {
    var t = sc.tile, cols = Math.round(bmp.width / t), rows = Math.round(bmp.height / t);
    var c = document.createElement('canvas');
    c.width = Math.min(w, cols * t);
    c.height = Math.min(h, rows * t);
    var ctx = c.getContext('2d');
    order(sc.seed, page, cols * rows).forEach(function (from, i) {
      ctx.drawImage(bmp, (i % cols) * t, Math.floor(i / cols) * t, t, t, (from % cols) * t, Math.floor(from / cols) * t, t, t);
    });
    bmp.close();
    return createImageBitmap(c);
  }

  function svg(name) {
    return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON[name] + '</svg>';
  }

  function button(cls, label, icon) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'sv-btn ' + cls;
    b.setAttribute('aria-label', label);
    b.innerHTML = svg(icon);
    return b;
  }

  function el(tag, cls) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
  }

  function flag(v) {
    if (v === undefined || v === null || v === '') return undefined;
    if (typeof v === 'boolean' || v === 'open') return v;
    return !/^(false|0|off|no)$/i.test(String(v));
  }

  function fromData(d) {
    var o = {};
    if (d.endpoint) o.endpoint = d.endpoint;
    if (d.static) o.static = d.static;
    if (d.lang) o.lang = d.lang;
    if (flag(d.download) !== undefined) o.download = flag(d.download);
    if (flag(d.thumbs) !== undefined) o.thumbs = flag(d.thumbs);
    if (flag(d.header) !== undefined) o.header = flag(d.header);
    if (d.start) o.start = parseInt(d.start, 10) || 1;
    if (d.accent) o.accent = d.accent;
    return o;
  }

  function loadCss() {
    if (document.querySelector('link[data-sv-css]')) return;
    var l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = base + 'slide-viewer.css' + version;
    l.setAttribute('data-sv-css', '');
    document.head.appendChild(l);
  }

  function Viewer(root, opts) {
    this.root = root;
    this.o = Object.assign({}, DEFAULTS, site, fromData(root.dataset), opts || {});
    this.deck = this.o.deck || root.dataset.deck;
    this.ep = this.o.endpoint.replace(/\/$/, '');
    this.st = this.o.static ? new URL(this.o.static.replace(/\/?$/, '/'), document.baseURI).href : '';
    var lang = (this.o.lang || document.documentElement.lang || navigator.language || '').toLowerCase();
    this.t = LABELS[lang.indexOf('ja') === 0 ? 'ja' : 'en'];
    this.cur = 0;
    this.meta = null;
    this.full = new Map();
    this.thumbBuilt = false;
    this.build();
    this.load();
  }

  Viewer.prototype.build = function () {
    var r = this.root, self = this;
    r.classList.add('sv-root');
    r.innerHTML = '';
    r.tabIndex = 0;
    r.setAttribute('role', 'region');
    r.setAttribute('aria-roledescription', this.t.region);
    if (this.o.accent) r.style.setProperty('--sv-accent', this.o.accent);

    this.head = el('div', 'sv-head');
    this.title = el('div', 'sv-title');
    this.count = el('div', 'sv-count');
    this.head.append(this.title, this.count);
    if (!this.o.header) this.head.hidden = true;

    this.card = el('div', 'sv-card');
    this.stage = el('div', 'sv-stage');
    this.canvas = el('canvas', 'sv-canvas');
    this.spinner = el('div', 'sv-spinner');
    this.retry = button('sv-retry', this.t.retry, 'retry');
    this.retry.hidden = true;
    this.closeBtn = button('sv-close', this.t.close, 'close');
    this.stage.append(this.canvas, this.spinner, this.retry, this.closeBtn);

    this.progress = el('div', 'sv-progress');
    this.progressBar = el('div', 'sv-progress-bar');
    this.progress.append(this.progressBar);

    this.strip = el('div', 'sv-thumbs');
    this.strip.hidden = true;

    var bar = el('div', 'sv-bar');
    var left = el('div', 'sv-group');
    var right = el('div', 'sv-group');
    this.prevBtn = button('sv-prev', this.t.prev, 'prev');
    this.nextBtn = button('sv-next', this.t.next, 'next');
    this.pageLabel = el('div', 'sv-page');
    this.pageLabel.setAttribute('aria-live', 'polite');
    left.append(this.prevBtn, this.pageLabel, this.nextBtn);

    this.thumbBtn = button('sv-thumb-toggle', this.t.thumbs, 'thumbs');
    this.thumbBtn.setAttribute('aria-pressed', 'false');
    this.thumbBtn.hidden = this.o.thumbs === false;
    this.dlLink = el('a', 'sv-btn sv-download');
    this.dlLink.setAttribute('aria-label', this.t.download);
    this.dlLink.innerHTML = svg('download');
    this.dlLink.hidden = true;
    this.fsBtn = button('sv-full', this.t.full, 'full');
    right.append(this.thumbBtn, this.dlLink, this.fsBtn);
    bar.append(left, right);

    this.card.append(this.stage, this.progress, this.strip, bar);
    r.append(this.head, this.card);

    this.prevBtn.onclick = function () { self.go(self.cur - 1); };
    this.nextBtn.onclick = function () { self.go(self.cur + 1); };
    this.thumbBtn.onclick = function () { self.toggleThumbs(); };
    this.fsBtn.onclick = function () { self.toggleFullscreen(); };
    this.closeBtn.onclick = function () { self.toggleFullscreen(false); };
    this.retry.onclick = function () { self.retry.hidden = true; self.meta ? self.go(self.cur, true) : self.load(); };

    r.addEventListener('keydown', function (e) {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      var k = e.key;
      if (k === 'ArrowLeft' || k === 'PageUp') self.go(self.cur - 1);
      else if (k === 'ArrowRight' || k === 'PageDown' || k === ' ') self.go(self.cur + 1);
      else if (k === 'Home') self.go(1);
      else if (k === 'End' && self.meta) self.go(self.meta.pages);
      else if (k === 'Escape' && r.classList.contains('sv-fs')) self.toggleFullscreen(false);
      else return;
      e.preventDefault();
    });

    // スワイプ
    var sx = null, sy = 0;
    this.stage.addEventListener('pointerdown', function (e) { sx = e.clientX; sy = e.clientY; });
    this.stage.addEventListener('pointerup', function (e) {
      if (sx === null) return;
      var dx = e.clientX - sx, dy = e.clientY - sy;
      sx = null;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) self.go(self.cur + (dx < 0 ? 1 : -1));
    });

    // 右クリック・ドラッグでの保存をさせない
    r.addEventListener('contextmenu', function (e) {
      if (e.target.closest('.sv-stage, .sv-thumbs')) e.preventDefault();
    });
    r.addEventListener('dragstart', function (e) { e.preventDefault(); });

    document.addEventListener('fullscreenchange', function () {
      self.setFs(document.fullscreenElement === r);
    });

    // 全画面では、しばらくマウスが動かないと操作ボタンとポインタを隠す。
    // キー操作では出さない。× はポインタを上端に近づけたときだけ出す
    var lx = -1, ly = -1;
    function onPointer(e) {
      if (!r.classList.contains('sv-fs')) return;
      if (e.type === 'pointermove' && Math.abs(e.clientX - lx) < 3 && Math.abs(e.clientY - ly) < 3) return;
      lx = e.clientX;
      ly = e.clientY;
      var nearTop = e.clientY - r.getBoundingClientRect().top < TOP_ZONE;
      r.classList.toggle('sv-top', e.pointerType === 'touch' || nearTop);
      self.wake();
    }
    r.addEventListener('pointermove', onPointer);
    r.addEventListener('pointerdown', onPointer);
    // Tab でボタンを選んだときは出す
    r.addEventListener('focusin', function (e) {
      if (!r.classList.contains('sv-fs') || !e.target.matches(':focus-visible')) return;
      if (e.target === self.closeBtn) r.classList.add('sv-top');
      if (e.target !== r) self.wake();
    });
    new ResizeObserver(function () { self.draw(); }).observe(this.stage);
  };

  // 資料の情報とトークンを取る（同時に何度呼ばれても1回にまとめる）
  Viewer.prototype.fetchMeta = function () {
    var self = this;
    if (!this.metaReq) {
      var u = this.st ? this.st + encodeURIComponent(this.deck) + '/deck.json' : this.ep + '/deck/?deck=' + encodeURIComponent(this.deck);
      this.metaReq = fetch(u, { credentials: 'same-origin', cache: 'no-store' })
        .then(function (res) {
          if (!res.ok) throw new Error('deck ' + res.status);
          return res.json();
        })
        .then(function (m) {
          if (self.st) m.exp = Infinity; // 静的な資料にはトークンが無い
          self.meta = m;
          return m;
        })
        .finally(function () { self.metaReq = null; });
    }
    return this.metaReq;
  };

  Viewer.prototype.load = function () {
    var self = this;
    this.busy(true);
    this.fetchMeta().then(function (m) {
      self.root.style.setProperty('--sv-ratio', m.width + ' / ' + m.height);
      self.root.setAttribute('aria-label', m.title);
      self.title.textContent = m.title;
      self.count.textContent = self.t.pages(m.pages);
      if (m.download && self.o.download) {
        if (self.st) {
          self.dlLink.href = self.st + encodeURIComponent(self.deck) + '/original.pdf';
          self.dlLink.setAttribute('download', self.deck + '.pdf');
        } else {
          self.dlLink.href = self.ep + '/download/?deck=' + encodeURIComponent(self.deck);
        }
        self.dlLink.hidden = false;
      }
      if (self.o.thumbs === 'open') self.toggleThumbs(true);
      self.go(Math.min(Math.max(self.o.start, 1), m.pages), true);
    }).catch(function () { self.fail(); });
  };

  Viewer.prototype.image = function (p, size) {
    var self = this;
    return this.fetchImage(p, size).then(function (bmp) {
      var m = self.meta;
      return size === 'full' && m.scramble ? unscramble(bmp, m.scramble, p, m.width, m.height) : bmp;
    });
  };

  Viewer.prototype.fetchImage = function (p, size, retried) {
    var self = this;
    var m = this.meta;
    var ready = m.exp - Date.now() / 1000 < 30 ? this.fetchMeta() : Promise.resolve(m);
    return ready.then(function (m) {
      if (self.st) {
        return fetch(self.st + encodeURIComponent(self.deck) + '/' + size + '/' + String(p).padStart(3, '0') + '.webp', { credentials: 'same-origin' });
      }
      var u = self.ep + '/page/?deck=' + encodeURIComponent(self.deck) + '&p=' + p + '&s=' + size +
        '&e=' + m.exp + '&t=' + m.token;
      return fetch(u, { credentials: 'same-origin', cache: 'no-store' });
    }).then(function (res) {
      if (res.status === 403 && !retried && !self.st) {
        return self.fetchMeta().then(function () { return self.fetchImage(p, size, true); });
      }
      if (!res.ok) throw new Error('page ' + res.status);
      return res.blob().then(createImageBitmap);
    });
  };

  Viewer.prototype.page = function (p) {
    var self = this;
    if (!this.full.has(p)) {
      var req = this.image(p, 'full');
      this.full.set(p, req);
      req.catch(function () { self.full.delete(p); });
    }
    return this.full.get(p);
  };

  Viewer.prototype.go = function (p, force) {
    var self = this, m = this.meta;
    if (!m) return;
    p = Math.min(Math.max(p, 1), m.pages);
    if (p === this.cur && !force) return;
    this.cur = p;
    // 資料の値は文字として入れる（deck.json を HTML として解釈させない）
    var total = el('span');
    total.textContent = '/ ' + m.pages;
    this.pageLabel.replaceChildren(String(p) + ' ', total);
    this.prevBtn.disabled = p === 1;
    this.nextBtn.disabled = p === m.pages;
    this.progressBar.style.width = (p / m.pages * 100) + '%';
    this.markThumb();

    this.busy(true);
    this.page(p).then(function (bmp) {
      if (self.cur !== p) return;
      self.bitmap = bmp;
      self.busy(false);
      self.draw();
      // 前後を先に読んでおき、遠いページは手放す
      if (p < m.pages) self.page(p + 1);
      if (p > 1) self.page(p - 1);
      self.full.forEach(function (req, k) {
        if (Math.abs(k - p) > KEEP) {
          self.full.delete(k);
          req.then(function (b) { b.close(); }, function () {});
        }
      });
    }).catch(function () { if (self.cur === p) self.fail(); });
  };

  Viewer.prototype.draw = function () {
    var c = this.canvas, b = this.bitmap;
    var w = c.clientWidth, h = c.clientHeight;
    if (!b || !w || !h) return;
    var dpr = window.devicePixelRatio || 1;
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    var s = Math.min(c.width / b.width, c.height / b.height);
    var dw = b.width * s, dh = b.height * s;
    var ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(b, (c.width - dw) / 2, (c.height - dh) / 2, dw, dh);
  };

  Viewer.prototype.busy = function (on) {
    // 一瞬で読めたときにちらつかないよう、少し待ってから出す
    var self = this;
    clearTimeout(this.busyTimer);
    if (on) this.busyTimer = setTimeout(function () { self.spinner.classList.add('sv-on'); }, 150);
    else this.spinner.classList.remove('sv-on');
  };

  Viewer.prototype.fail = function () {
    this.busy(false);
    this.retry.hidden = false;
  };

  Viewer.prototype.toggleThumbs = function (open) {
    if (open === undefined) open = this.strip.hidden;
    this.strip.hidden = !open;
    this.thumbBtn.setAttribute('aria-pressed', String(open));
    if (open && this.meta && !this.thumbBuilt) this.buildThumbs();
    if (open) this.markThumb();
  };

  Viewer.prototype.buildThumbs = function () {
    var self = this, m = this.meta;
    this.thumbBuilt = true;
    var list = [];
    for (var i = 1; i <= m.pages; i++) {
      (function (p) {
        var b = el('button', 'sv-thumb');
        b.type = 'button';
        b.setAttribute('aria-label', self.t.nth(p));
        var c = el('canvas');
        b.append(c);
        b.onclick = function () { self.go(p); };
        self.strip.append(b);
        list.push([p, c]);
      })(i);
    }
    // 1枚ずつ順に読む（一度に大量の要求を出さない）
    list.reduce(function (chain, item) {
      return chain.then(function () {
        return self.image(item[0], 'thumb').then(function (bmp) {
          item[1].width = bmp.width;
          item[1].height = bmp.height;
          item[1].getContext('2d').drawImage(bmp, 0, 0);
          bmp.close();
        }).catch(function () {});
      });
    }, Promise.resolve());
    this.markThumb();
  };

  Viewer.prototype.markThumb = function () {
    if (this.strip.hidden || !this.thumbBuilt) return;
    var t = this.strip.children[this.cur - 1];
    for (var i = 0; i < this.strip.children.length; i++) {
      this.strip.children[i].classList.toggle('sv-current', i === this.cur - 1);
    }
    if (!t) return;
    // scrollIntoView はページ全体までスクロールさせるので、列の中だけ動かす
    var s = this.strip;
    if (t.offsetLeft < s.scrollLeft) s.scrollLeft = t.offsetLeft - 16;
    else if (t.offsetLeft + t.offsetWidth > s.scrollLeft + s.clientWidth) s.scrollLeft = t.offsetLeft + t.offsetWidth - s.clientWidth + 16;
  };

  Viewer.prototype.toggleFullscreen = function (on) {
    var r = this.root;
    var active = document.fullscreenElement === r || r.classList.contains('sv-fs');
    if (on === undefined) on = !active;
    if (on === active) return;
    if (r.requestFullscreen && document.fullscreenEnabled) {
      if (on) r.requestFullscreen();
      else document.exitFullscreen();
    } else {
      // iPhone の Safari は要素の全画面に対応していないので、画面いっぱいに重ねて代わりにする
      document.documentElement.classList.toggle('sv-lock', on);
      this.setFs(on);
    }
    r.focus();
  };

  Viewer.prototype.setFs = function (on) {
    this.root.classList.toggle('sv-fs', on);
    this.draw();
    if (on) this.wake();
    else {
      clearTimeout(this.idleTimer);
      this.root.classList.remove('sv-idle', 'sv-top');
    }
  };

  Viewer.prototype.wake = function () {
    var r = this.root, self = this;
    if (!r.classList.contains('sv-fs')) return;
    r.classList.remove('sv-idle');
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(function () {
      // ボタンの上にポインタがある間と、Tab でボタンを選んでいる間は隠さない
      var busy = r.querySelector('.sv-bar:hover, .sv-close:hover, .sv-thumbs:hover, .sv-btn:focus-visible, .sv-thumb:focus-visible');
      if (busy) return self.wake();
      r.classList.add('sv-idle');
      r.classList.remove('sv-top');
    }, IDLE_MS);
  };

  function mount(root, opts) {
    if (root.__slideViewer) return root.__slideViewer;
    loadCss();
    var v = new Viewer(root, opts);
    root.__slideViewer = {
      go: function (p) { v.meta ? v.go(p) : (v.o.start = p); },
      next: function () { v.go(v.cur + 1); },
      prev: function () { v.go(v.cur - 1); },
      page: function () { return v.cur; }
    };
    return root.__slideViewer;
  }

  function mountAll(scope) {
    (scope || document).querySelectorAll('.slide-viewer[data-deck]').forEach(function (e) { mount(e); });
  }

  window.SlideViewer = {
    config: function (o) { Object.assign(site, o); },
    mount: mount,
    mountAll: mountAll,
    get: function (root) { return root.__slideViewer || null; }
  };

  loadCss();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { mountAll(); });
  else mountAll();
})();
