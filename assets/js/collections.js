// Collections pages.
//
//   /collections/         every collection is a stack of prints: the stack
//                         tilts towards the pointer and fans out on hover.
//   /collections/<name>   the photos are dealt from the cover print across
//                         the table. "Collage" mode leaves them scattered and
//                         draggable, "Grid" tidies them up, "Shuffle" deals
//                         them again in a new order.
//
// Styles: _sass/collections.scss. Markup: collections.html and
// _layouts/collection.html (which inlines the photo list as #cx-data).

(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Local-only affordances (links to the collection editor).
  var host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host.endsWith('.local')) {
    document.documentElement.classList.add('cx-dev');
  }

  var table = document.querySelector('.cx-table');
  if (table) initIndex(table);

  var spread = document.getElementById('cx-spread');
  if (spread) initSpread(spread);

  // -------------------------------------------------------------------
  // Index
  // -------------------------------------------------------------------
  function initIndex(root) {
    var stacks = Array.prototype.slice.call(root.querySelectorAll('.cx-stack'));

    stacks.forEach(function (stack) {
      // Lean the pile towards the pointer.
      stack.addEventListener('pointermove', function (e) {
        if (e.pointerType === 'touch') return;
        var r = stack.getBoundingClientRect();
        stack.style.setProperty('--tx', (((e.clientX - r.left) / r.width) * 2 - 1).toFixed(3));
        stack.style.setProperty('--ty', (((e.clientY - r.top) / r.height) * 2 - 1).toFixed(3));
      });
      stack.addEventListener('pointerleave', function () {
        stack.style.setProperty('--tx', 0);
        stack.style.setProperty('--ty', 0);
      });

      // Name the clicked cover so it travels to the collection page's hero
      // (cross-document view transition; a plain navigation elsewhere).
      stack.addEventListener('click', function () {
        stacks.forEach(function (s) {
          var c = s.querySelector('.cx-print--cover');
          if (c) c.style.viewTransitionName = s === stack ? 'cx-cover' : '';
        });
      });
    });

    // No hover on touch screens: fan out whichever stack is mid-screen.
    if (window.matchMedia('(hover: none)').matches && 'IntersectionObserver' in window) {
      var io = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (en) {
            en.target.classList.toggle('is-fanned', en.isIntersecting);
          });
        },
        { rootMargin: '-38% 0px -38% 0px' }
      );
      stacks.forEach(function (s) { io.observe(s); });
    }
  }

  // -------------------------------------------------------------------
  // Collection page
  // -------------------------------------------------------------------
  function initSpread(root) {
    var dataEl = document.getElementById('cx-data');
    if (!dataEl) return;
    var data = JSON.parse(dataEl.textContent);
    var places = data.places || {};
    var heroPrint = document.getElementById('cx-hero-print');
    var modeButtons = Array.prototype.slice.call(document.querySelectorAll('.cx-seg [data-mode]'));
    var shuffleBtn = document.getElementById('cx-shuffle');

    var mode = 'table';
    try {
      if (localStorage.getItem('cx-mode') === 'grid') mode = 'grid';
    } catch (err) { /* storage unavailable */ }

    var zTop = 1;
    var byEl = new Map();

    function rand(min, max) { return min + Math.random() * (max - min); }

    function scatter(it) {
      it.r = rand(-5.5, 5.5);
      it.jx = rand(-0.5, 0.5);
      it.jy = rand(-0.5, 0.5);
      it.dx = 0;
      it.dy = 0;
    }

    function placeName(path) {
      var slug = path.split('/')[0];
      if (places[slug]) return places[slug];
      var s = slug.replace(/_/g, ' ');
      return s.charAt(0).toUpperCase() + s.slice(1);
    }

    var items = data.paths.map(function (path, index) {
      var url = encodeURI(path);
      var el = document.createElement('button');
      el.type = 'button';
      el.className = 'cx-photo';
      el.dataset.photoPath = path; // used by the dev-only collection picker
      var name = placeName(path);
      el.setAttribute('aria-label', 'Open photo: ' + name);

      var inner = document.createElement('span');
      inner.className = 'cx-photo__inner';
      inner.style.backgroundImage = 'url("/images/blur/' + url + '")';

      var img = document.createElement('img');
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.draggable = false;
      img.src = '/images/thumb/' + url;

      var cap = document.createElement('span');
      cap.className = 'cx-photo__cap';
      cap.textContent = name;

      inner.appendChild(img);
      inner.appendChild(cap);
      el.appendChild(inner);

      var it = { el: el, index: index, url: url, ratio: 1.5, x: 0, y: 0, w: 0, h: 0 };
      scatter(it);
      byEl.set(el, it);
      return it;
    });

    var order = items.slice();

    // The blur placeholders are tiny, so they tell us every photo's shape
    // almost immediately; lay out once they are in (or after a short wait).
    function loadRatios() {
      return new Promise(function (resolve) {
        var left = items.length;
        if (!left) return resolve();
        var timer = setTimeout(resolve, 2500);
        function done() {
          left -= 1;
          if (left === 0) { clearTimeout(timer); resolve(); }
        }
        items.forEach(function (it) {
          var probe = new Image();
          probe.onload = function () {
            if (probe.naturalWidth && probe.naturalHeight) {
              it.ratio = probe.naturalWidth / probe.naturalHeight;
            }
            done();
          };
          probe.onerror = done;
          probe.src = '/images/blur/' + it.url;
        });
      });
    }

    function apply(it) {
      var loose = mode === 'table';
      var s = it.el.style;
      // Where the print actually sits (also used by the collage download).
      it.px = it.x + (loose ? it.jx * it.jitter + it.dx : 0);
      it.py = it.y + (loose ? it.jy * it.jitter + it.dy : 0);
      it.pr = loose ? it.r : 0;
      s.width = it.w + 'px';
      s.height = it.h + 'px';
      s.setProperty('--x', it.px.toFixed(1) + 'px');
      s.setProperty('--y', it.py.toFixed(1) + 'px');
      s.setProperty('--r', it.pr.toFixed(2) + 'deg');
    }

    // Masonry: each photo goes to the shortest column.
    function layout() {
      var W = root.clientWidth;
      if (!W) return;
      var loose = mode === 'table';
      var cols = W < 520 ? 2 : W < 900 ? 3 : W < 1320 ? 4 : 5;
      cols = Math.max(1, Math.min(cols, Math.max(2, items.length)));
      var gap = loose ? Math.max(16, Math.round(W * 0.024)) : W < 520 ? 6 : 12;
      var border = loose ? (W < 520 ? 4 : 7) : 0;
      var top = loose ? 14 : 0;
      var pw = (W - gap * (cols - 1)) / cols;
      var heights = [];
      for (var c = 0; c < cols; c++) heights.push(top);

      order.forEach(function (it) {
        var col = 0;
        for (var i = 1; i < cols; i++) if (heights[i] < heights[col] - 0.5) col = i;
        it.w = pw;
        it.h = (pw - border * 2) / it.ratio + border * 2;
        it.x = col * (pw + gap);
        it.y = heights[col];
        it.jitter = gap * 0.9;
        it.border = border;
        heights[col] += it.h + gap;
        apply(it);
      });

      root.dataset.mode = mode;
      root.style.height = Math.max.apply(null, heights) + 'px';
    }

    // Deal the prints that land on screen out of the cover print.
    function deal() {
      if (reduceMotion || !heroPrint || !root.animate) return;
      var hr = heroPrint.getBoundingClientRect();
      var rr = root.getBoundingClientRect();
      var limit = window.innerHeight * 1.3 - rr.top;
      var n = 0;
      order.forEach(function (it) {
        if (it.y > limit) return;
        var fromX = hr.left - rr.left + (hr.width - it.w) / 2;
        var fromY = hr.top - rr.top + (hr.height - it.h) / 2;
        it.el.animate(
          [
            { translate: fromX + 'px ' + fromY + 'px', rotate: rand(-14, 14) + 'deg', scale: 0.55, opacity: 0 },
            { opacity: 1, offset: 0.2 },
            { translate: it.el.style.getPropertyValue('--x') + ' ' + it.el.style.getPropertyValue('--y'),
              rotate: it.el.style.getPropertyValue('--r'), scale: 1, opacity: 1 }
          ],
          { duration: 800, delay: 260 + n * 42, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', fill: 'backwards' }
        );
        n += 1;
      });
    }

    function setMode(next) {
      mode = next;
      modeButtons.forEach(function (b) {
        b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
      });
      try { localStorage.setItem('cx-mode', mode); } catch (err) { /* ignore */ }
    }

    function stagger() {
      order.forEach(function (it, i) {
        it.el.style.transitionDelay = Math.min(i * 14, 320) + 'ms';
      });
      setTimeout(function () {
        items.forEach(function (it) { it.el.style.transitionDelay = ''; });
      }, 1200);
    }

    modeButtons.forEach(function (b) {
      b.addEventListener('click', function () {
        if (b.dataset.mode === mode) return;
        setMode(b.dataset.mode);
        items.forEach(function (it) { it.dx = 0; it.dy = 0; });
        stagger();
        layout();
      });
    });

    if (shuffleBtn) {
      shuffleBtn.addEventListener('click', function () {
        for (var i = order.length - 1; i > 0; i--) {
          var j = Math.floor(Math.random() * (i + 1));
          var t = order[i]; order[i] = order[j]; order[j] = t;
        }
        items.forEach(function (it) {
          scatter(it);
          it.el.style.zIndex = '';
        });
        zTop = 1;
        stagger();
        layout();
      });
    }

    // Drag a print around the table (mouse / pen; touch keeps scrolling).
    var press = null;
    var suppressClick = false;

    root.addEventListener('pointerdown', function (e) {
      var el = e.target.closest ? e.target.closest('.cx-photo') : null;
      if (!el || e.button !== 0) return;
      var it = byEl.get(el);
      press = {
        it: it,
        x: e.clientX,
        y: e.clientY,
        dx: it.dx,
        dy: it.dy,
        moved: false,
        canDrag: mode === 'table' && e.pointerType !== 'touch'
      };
    });

    window.addEventListener('pointermove', function (e) {
      if (!press || !press.canDrag) return;
      var mx = e.clientX - press.x;
      var my = e.clientY - press.y;
      if (!press.moved) {
        if (Math.abs(mx) + Math.abs(my) < 6) return;
        press.moved = true;
        press.it.el.classList.add('is-dragging');
        press.it.el.style.zIndex = String(++zTop);
      }
      press.it.dx = press.dx + mx;
      press.it.dy = press.dy + my;
      apply(press.it);
    });

    function endPress() {
      if (!press) return;
      if (press.moved) {
        press.it.el.classList.remove('is-dragging');
        suppressClick = true;
        setTimeout(function () { suppressClick = false; }, 0);
      }
      press = null;
    }
    window.addEventListener('pointerup', endPress);
    window.addEventListener('pointercancel', endPress);

    root.addEventListener('click', function (e) {
      var el = e.target.closest ? e.target.closest('.cx-photo') : null;
      if (!el) return;
      if (suppressClick) { e.preventDefault(); return; }
      if (typeof window.openModal === 'function') {
        window.openModal(byEl.get(el).index, 'myPortfolioModal');
      }
    });

    // ---------------------------------------------------------------
    // Download the collage: redraw the prints, exactly as arranged, on a
    // canvas (full-size photos, cropped to the prints' bounding box).
    // ---------------------------------------------------------------
    var downloadBtn = document.getElementById('cx-download');
    var downloadLabel = downloadBtn ? downloadBtn.querySelector('span') : null;
    var MAX_PIXELS = 16e6; // stays under the canvas size limit on phones

    function loadImage(src) {
      return new Promise(function (resolve, reject) {
        var im = new Image();
        im.decoding = 'async';
        im.onload = function () { resolve(im); };
        im.onerror = function () { reject(new Error('Could not load ' + src)); };
        im.src = src;
      });
    }

    // Load a list with a few requests at a time; onStep(done, total).
    function loadAll(sources, onStep) {
      var results = new Array(sources.length);
      var next = 0;
      var done = 0;
      function worker() {
        if (next >= sources.length) return Promise.resolve();
        var i = next++;
        return loadImage(sources[i]).then(function (im) {
          results[i] = im;
          onStep(++done, sources.length);
          return worker();
        });
      }
      var workers = [];
      for (var k = 0; k < Math.min(6, sources.length); k++) workers.push(worker());
      return Promise.all(workers).then(function () { return results; });
    }

    function buildCollage(onStep) {
      // Back to front: layout order, then anything dragged on top.
      var pos = new Map();
      order.forEach(function (it, i) { pos.set(it, i); });
      var stack = items.slice().sort(function (a, b) {
        return (parseInt(a.el.style.zIndex, 10) || 0) - (parseInt(b.el.style.zIndex, 10) || 0) || pos.get(a) - pos.get(b);
      });

      // Bounding box of the rotated prints.
      var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      stack.forEach(function (it) {
        var cx = it.px + it.w / 2;
        var cy = it.py + it.h / 2;
        var a = (it.pr * Math.PI) / 180;
        var cos = Math.abs(Math.cos(a));
        var sin = Math.abs(Math.sin(a));
        var hw = (it.w * cos + it.h * sin) / 2;
        var hh = (it.w * sin + it.h * cos) / 2;
        minX = Math.min(minX, cx - hw); maxX = Math.max(maxX, cx + hw);
        minY = Math.min(minY, cy - hh); maxY = Math.max(maxY, cy + hh);
      });

      var loose = mode === 'table';
      var margin = loose ? 48 : 24;
      var footer = 34; // room for the credit line
      var cssW = maxX - minX + margin * 2;
      var cssH = maxY - minY + margin * 2 + footer;
      var scale = Math.min(2.5, Math.sqrt(MAX_PIXELS / (cssW * cssH)));

      // Thumbnails are enough only when a print is drawn smaller than one.
      var sources = stack.map(function (it) {
        return '/images/' + (it.w * scale <= 400 ? 'thumb' : 'full') + '/' + it.url;
      });

      return loadAll(sources, onStep).then(function (images) {
        var canvas = document.createElement('canvas');
        canvas.width = Math.round(cssW * scale);
        canvas.height = Math.round(cssH * scale);
        var ctx = canvas.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.fillStyle = '#0b0c0e';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.scale(scale, scale);
        ctx.translate(margin - minX, margin - minY);

        stack.forEach(function (it, i) {
          var im = images[i];
          var b = it.border || 0;
          ctx.save();
          ctx.translate(it.px + it.w / 2, it.py + it.h / 2);
          ctx.rotate((it.pr * Math.PI) / 180);

          if (loose) {
            // The paper, with its shadow (shadow sizes are in canvas pixels).
            ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
            ctx.shadowBlur = 22 * scale;
            ctx.shadowOffsetY = 9 * scale;
            ctx.fillStyle = '#f2efe9';
            ctx.fillRect(-it.w / 2, -it.h / 2, it.w, it.h);
            ctx.shadowColor = 'transparent';
          }

          // The photo, cropped to fill its frame like object-fit: cover.
          var fw = it.w - b * 2;
          var fh = it.h - b * 2;
          var ir = im.naturalWidth / im.naturalHeight;
          var fr = fw / fh;
          var sw = im.naturalWidth, sh = im.naturalHeight, sx = 0, sy = 0;
          if (ir > fr) { sw = sh * fr; sx = (im.naturalWidth - sw) / 2; }
          else { sh = sw / fr; sy = (im.naturalHeight - sh) / 2; }
          ctx.drawImage(im, sx, sy, sw, sh, -fw / 2, -fh / 2, fw, fh);
          ctx.restore();
        });

        // Credit line, bottom right.
        ctx.fillStyle = 'rgba(242, 239, 233, 0.55)';
        ctx.font = '500 13px "poppins", sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText((data.title ? data.title + '  ·  ' : '') + 'Fabian Rydel', maxX, maxY + margin + footer - 22);

        return new Promise(function (resolve, reject) {
          canvas.toBlob(function (blob) {
            if (blob) resolve(blob);
            else reject(new Error('The image is too large for this browser.'));
          }, 'image/jpeg', 0.92);
        });
      });
    }

    if (downloadBtn) {
      downloadBtn.addEventListener('click', function () {
        if (downloadBtn.disabled) return;
        downloadBtn.disabled = true;
        var label = downloadLabel ? downloadLabel.textContent : '';
        function say(text) { if (downloadLabel) downloadLabel.textContent = text; }
        say('Preparing…');
        buildCollage(function (done, total) { say('Preparing ' + done + '/' + total); })
          .then(function (blob) {
            var a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = (data.slug || 'collage') + '-collage.jpg';
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
            say('Downloaded');
          })
          .catch(function (err) {
            console.error('[collections] collage download failed', err);
            say('Download failed');
          })
          .then(function () {
            setTimeout(function () { say(label); downloadBtn.disabled = false; }, 1800);
          });
      });
    }

    var resizeTimer;
    var lastWidth = 0;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        if (root.clientWidth === lastWidth) return;
        lastWidth = root.clientWidth;
        layout();
      }, 120);
    });

    setMode(mode);
    loadRatios().then(function () {
      layout();
      lastWidth = root.clientWidth;
      var frag = document.createDocumentFragment();
      items.forEach(function (it) { frag.appendChild(it.el); });
      root.appendChild(frag);
      deal();
    });
  }
})();
