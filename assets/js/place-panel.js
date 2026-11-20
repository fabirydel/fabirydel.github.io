// The location panel shared by Explore and Trips: a place's photos as a
// justified collage plus a full-screen photo viewer. Markup lives in
// _includes/place_panel.html and place_viewer.html, styles in _sass/place-ui.scss.
//
//   var panel = PlacePanel({ isMobile: fn, countryTitle: fn, onViewerClose: fn });
//   panel.fill({ name, title, country, photos: ['loc/file.jpg', ...] });
//   panel.open() / panel.close()
//   panel.viewerOpen(), panel.relayout(), panel.autoScroll(dt)
//
// Rows are filled left to right and each row's height is solved so it spans
// the panel exactly, so every photo keeps its own shape and nothing is
// cropped. Shapes aren't known at build time, so thumbnails are probed in
// batches (more load as you scroll) and each batch appends the rows it completes.

(function () {
  'use strict';

  window.PlacePanel = function (opts) {
    opts = opts || {};
    var isMobile = opts.isMobile || function () { return window.innerWidth <= 850; };
    var countryTitle = opts.countryTitle || function (n) {
      return String(n || '').replace(/_/g, ' ').replace(/\b\w/g, function (m) { return m.toUpperCase(); });
    };
    var $ = function (id) { return document.getElementById(id); };

    var panelEl = $('place-panel');
    var collage = $('place-collage');
    var current = null;
    var ratios = {};           // photo path -> width / height
    var photoIndex = 0;        // photo shown in the full-screen viewer
    var collageToken = 0;
    var known = 0;             // photos of the current place with a known shape
    var rowsRendered = 0;
    var tilesRendered = 0;
    var loadingBatch = false;
    var panelTouched = false;  // user scrolled the collage: stop auto-scrolling
    var scrollPos = 0;
    var GAP = 6, BATCH = 24;

    function probe(paths, done) {
      var left = paths.length;
      if (!left) return done();
      paths.forEach(function (p) {
        if (ratios[p]) { if (!--left) done(); return; }
        var im = new Image();
        im.onload = im.onerror = function () {
          ratios[p] = im.naturalWidth && im.naturalHeight ? im.naturalWidth / im.naturalHeight : 1.5;
          if (!--left) done();
        };
        im.src = '/images/thumb/' + p;
      });
    }

    // Greedy justified rows over photos[0..count). Row targets cycle through a
    // few heights so the collage has some rhythm instead of even stripes.
    function buildRows(photos, count, width, complete, zoom) {
      var scale = (isMobile() ? 0.78 : 1) * (zoom || 1);
      var targets = [158, 124, 140];
      var rows = [], row = [], sum = 0;
      // The opening row is taller so the collage starts with a statement.
      function target() { return (rows.length ? targets[rows.length % targets.length] : 205) * scale; }
      for (var i = 0; i < count; i++) {
        var r = ratios[photos[i]] || 1.5;
        if (i === 0 && r >= 1.15) {
          // Lead photo: a landscape opener gets the full width to itself.
          rows.push({ h: width / r, items: [{ i: 0, w: width }], lead: true });
          continue;
        }
        var t = target();
        // Would adding this photo squeeze the row below its target height? If
        // the row is nearer the target without it, close the row first, so a
        // run of portraits never ends up as a strip of slivers.
        if (row.length) {
          var hWith = (width - GAP * row.length) / (sum + r);
          var hWithout = (width - GAP * (row.length - 1)) / sum;
          if (hWith < t && Math.abs(Math.log(hWithout / t)) < Math.abs(Math.log(hWith / t))) {
            rows.push({ h: hWithout, items: row.map(function (x) { return { i: x.i, w: x.r * hWithout }; }) });
            row = []; sum = 0;
            t = target();
          }
        }
        row.push({ i: i, r: r });
        sum += r;
        var inner = width - GAP * (row.length - 1);
        if (sum * t >= inner) {
          var h = inner / sum;
          rows.push({ h: h, items: row.map(function (x) { return { i: x.i, w: x.r * h }; }) });
          row = []; sum = 0;
        }
      }
      if (row.length && complete) {
        var lastH = Math.min(target() * 1.25, (width - GAP * (row.length - 1)) / sum);
        rows.push({ h: lastH, items: row.map(function (t) { return { i: t.i, w: t.r * lastH }; }) });
      }
      return rows;
    }

    // With only a handful of photos the default row heights leave half the
    // panel empty, so grow the rows until the collage fills the height. Tries
    // progressively larger rows and keeps the one that lands closest to full;
    // a small overflow (which just scrolls) beats a big gap.
    var collageZoom = 1;

    function fitZoom(photos, width) {
      var avail = collage.clientHeight - 30;
      if (avail <= 0) return 1;
      var best = 1, bestScore = Infinity;
      for (var z = 1; z <= 6.01; z += 0.1) {
        var rows = buildRows(photos, photos.length, width, true, z);
        var total = GAP * (rows.length - 1);
        rows.forEach(function (r) { total += r.h; });
        var fill = total / avail;
        // Under-filling costs its gap; overflowing costs more, and past 30% is out.
        var score = fill <= 1 ? 1 - fill : (fill <= 1.3 ? (fill - 1) * 1.6 : Infinity);
        if (score < bestScore) { bestScore = score; best = z; }
      }
      return best;
    }

    // For a small set, try every way of splitting the photos (in order) into
    // rows. Each row is justified to the full width, so there is never a ragged
    // edge; the split whose total height best matches the panel wins.
    var SMALL_SET = 12, MIN_ROW = 120;

    function fitSplit(photos, width) {
      var n = photos.length;
      var avail = collage.clientHeight - 30;
      if (avail <= 0) return null;
      var r = photos.map(function (p) { return ratios[p] || 1.5; });
      var best = null, bestFill = 0, bestScore = Infinity;
      for (var mask = 0; mask < (1 << (n - 1)); mask++) {
        var rows = [], start = 0, total = 0, minH = Infinity, maxH = 0;
        for (var i = 0; i < n; i++) {
          if (i === n - 1 || (mask >> i) & 1) {
            var sum = 0;
            for (var k = start; k <= i; k++) sum += r[k];
            // A row is justified to the width unless that would make it taller
            // than the panel (a lone portrait); then it is capped and centred.
            var h = Math.min((width - GAP * (i - start)) / sum, n === 1 ? avail : avail * 0.8);
            var items = [];
            for (k = start; k <= i; k++) items.push({ i: k, w: r[k] * h });
            rows.push({ h: h, items: items });
            total += h;
            minH = Math.min(minH, h); maxH = Math.max(maxH, h);
            start = i + 1;
          }
        }
        total += GAP * (rows.length - 1);
        var fill = total / avail;
        var score = fill <= 1 ? 1 - fill : (fill <= 1.35 ? (fill - 1) * 1.6 : 10 + fill);
        // Rows of similar height read as a collage; one giant photo over a
        // strip of tiny ones does not. Penalise imbalance, and penalise hard
        // any row too short to see the photos in it.
        score += 0.12 * (maxH / minH - 1);
        if (minH < MIN_ROW) score += 3 * (MIN_ROW - minH) / MIN_ROW;
        if (score < bestScore) { bestScore = score; best = rows; bestFill = fill; }
      }
      return { rows: best, fill: bestFill };
    }

    function renderRows() {
      if (!current) return;
      var width = collage.clientWidth;
      if (!width) return;
      var photos = current.photos;
      // Only sets that arrive in one batch are fitted; longer ones scroll anyway.
      if (rowsRendered === 0) collageZoom = known >= photos.length ? fitZoom(photos, width) : 1;
      var rows = buildRows(photos, known, width, known >= photos.length, collageZoom);
      if (rowsRendered === 0 && known >= photos.length && photos.length <= SMALL_SET) {
        // If no clean split comes close (say a landscape plus a portrait), keep
        // the enlarged rows instead: the short last row is centred by CSS.
        var split = fitSplit(photos, width);
        if (split && split.fill >= 0.72) rows = split.rows;
      }
      var html = '';
      for (var r = rowsRendered; r < rows.length; r++) {
        var row = rows[r];
        html += '<div class="place-collage__row" style="height:' + row.h.toFixed(2) + 'px">';
        row.items.forEach(function (t) {
          var path = photos[t.i];
          // Big tiles get the full-size file; small ones stay on thumbnails.
          var size = t.w > 300 ? 'full' : 'thumb';
          html += '<button type="button" class="place-tile" data-index="' + t.i + '" aria-label="Photo ' + (t.i + 1) + ' of ' + photos.length + '"' +
            ' style="width:' + t.w.toFixed(2) + 'px;--i:' + (tilesRendered % BATCH) + ';background-image:url(&quot;/images/blur/' + path + '&quot;)">' +
            '<img alt="" loading="lazy" decoding="async" src="/images/' + size + '/' + path + '"></button>';
          tilesRendered++;
        });
        html += '</div>';
      }
      rowsRendered = rows.length;
      if (html) collage.insertAdjacentHTML('beforeend', html);
    }

    function loadMore() {
      if (!current || loadingBatch || known >= current.photos.length) return;
      loadingBatch = true;
      var token = collageToken;
      var upTo = Math.min(current.photos.length, known + BATCH);
      probe(current.photos.slice(known, upTo), function () {
        if (token !== collageToken) return;
        loadingBatch = false;
        known = upTo;
        renderRows();
        fillIfShort();
      });
    }

    function fillIfShort() {
      if (collage.scrollHeight - collage.scrollTop - collage.clientHeight < 400) loadMore();
    }

    function resetCollage() {
      collageToken++;
      loadingBatch = false;
      known = rowsRendered = tilesRendered = 0;
      collage.innerHTML = '';
      collage.scrollTop = scrollPos = 0;
    }

    collage.addEventListener('scroll', fillIfShort, { passive: true });
    ['wheel', 'touchstart', 'pointerdown', 'keydown'].forEach(function (evt) {
      collage.addEventListener(evt, function () { panelTouched = true; }, { passive: true });
    });
    collage.addEventListener('click', function (e) {
      var t = e.target.closest('.place-tile');
      if (t) openViewer(Number(t.dataset.index));
    });


      function showPhoto(index) {
        if (!current) return;
        var n = current.photos.length;
        photoIndex = ((index % n) + n) % n;
        if (viewerOpen) paintViewer();
      }
    var viewer = $('place-viewer');
    var viewerOpen = false;

    function paintViewer() {
      if (!current) return;
      $('place-viewer-img').src = '/images/full/' + current.photos[photoIndex];
      $('place-viewer-caption').textContent = current.title + ', ' + countryTitle(current.country) + ' · ' + (photoIndex + 1) + ' / ' + current.photos.length;
    }
    function openViewer(index) {
      if (!current) return;
      photoIndex = index || 0;
      viewerOpen = true;
      viewer.hidden = false;
      paintViewer();
      $('place-viewer-close').focus();
    }
    function closeViewer() {
      viewerOpen = false;
      viewer.hidden = true;
      if (opts.onViewerClose) opts.onViewerClose();
      var tile = collage.querySelector('.place-tile[data-index="' + photoIndex + '"]');
      if (tile) tile.focus({ preventScroll: true });
    }
    $('place-viewer-close').addEventListener('click', closeViewer);
    $('place-viewer-prev').addEventListener('click', function () { showPhoto(photoIndex - 1); });
    $('place-viewer-next').addEventListener('click', function () { showPhoto(photoIndex + 1); });
    viewer.addEventListener('click', function (e) { if (e.target === viewer) closeViewer(); });

    // Drag the photo: sideways to flick to the next or previous one, down to
    // dismiss. The photo follows the finger and springs back if it isn't thrown far enough.
    (function () {
      var img = $('place-viewer-img');
      var drag = null;
      function reset(animate) {
        img.style.transition = animate ? 'transform 0.28s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.28s ease' : 'none';
        img.style.transform = '';
        img.style.opacity = '';
      }
      img.addEventListener('pointerdown', function (e) {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        drag = { x: e.clientX, y: e.clientY, dx: 0, dy: 0, axis: '', id: e.pointerId };
        img.style.transition = 'none';
      });
      img.addEventListener('pointermove', function (e) {
        if (!drag || e.pointerId !== drag.id) return;
        drag.dx = e.clientX - drag.x;
        drag.dy = e.clientY - drag.y;
        if (!drag.axis && Math.max(Math.abs(drag.dx), Math.abs(drag.dy)) > 8) {
          drag.axis = Math.abs(drag.dx) > Math.abs(drag.dy) ? 'x' : 'y';
          try { img.setPointerCapture(e.pointerId); } catch (err) { /* not capturable */ }
        }
        if (drag.axis === 'x') {
          img.style.transform = 'translateX(' + drag.dx + 'px) rotate(' + (drag.dx / 60) + 'deg)';
        } else if (drag.axis === 'y' && drag.dy > 0) {
          img.style.transform = 'translateY(' + drag.dy + 'px)';
          img.style.opacity = String(Math.max(0.3, 1 - drag.dy / 360));
        }
      });
      function end() {
        if (!drag) return;
        var d = drag; drag = null;
        if (d.axis === 'x' && Math.abs(d.dx) > 70) {
          showPhoto(photoIndex + (d.dx < 0 ? 1 : -1));
          reset(false);
        } else if (d.axis === 'y' && d.dy > 110) {
          reset(false);
          closeViewer();
        } else {
          reset(true);
        }
      }
      img.addEventListener('pointerup', end);
      img.addEventListener('pointercancel', end);
      img.addEventListener('dragstart', function (e) { e.preventDefault(); });
    })();


    function viewerIsOpen() { return viewerOpen; }

    function fill(place) {
      current = place;
      var n = place.photos.length;
      var link = '/countries/' + place.country + '#chapter-' + place.name;
      $('place-panel-country').textContent = countryTitle(place.country);
      $('place-panel-country').href = '/countries/' + place.country;
      $('place-panel-title').textContent = place.title;
      $('place-panel-title').href = link;
      $('place-panel-meta').textContent = n + (n === 1 ? ' photo' : ' photos');
      $('place-country-link').href = link;
      $('place-country-link').textContent = 'Open the ' + countryTitle(place.country) + ' gallery →';
      panelTouched = false;
      resetCollage();
      loadMore();
    }

    // Row geometry depends on the panel width: re-flow what is loaded.
    function relayout() {
      if (!current) return;
      var keep = known;
      collage.innerHTML = '';
      rowsRendered = tilesRendered = 0;
      known = keep;
      renderRows();
    }

    // During a journey the collage drifts down on its own so photos below
    // the fold get seen; any scroll by the user hands it back.
    function autoScroll(dt) {
      if (panelTouched || viewerIsOpen()) return;
      var maxScroll = collage.scrollHeight - collage.clientHeight;
      if (scrollPos < maxScroll) {
        scrollPos = Math.min(maxScroll, Math.max(scrollPos, collage.scrollTop) + dt * 34);
        collage.scrollTop = scrollPos;
      }
    }

    // Viewer keys (captured so the page's own arrow-key handlers stay out).
    document.addEventListener('keydown', function (e) {
      if (!viewerIsOpen() || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Escape') closeViewer();
      else if (e.key === 'ArrowRight') showPhoto(photoIndex + 1);
      else if (e.key === 'ArrowLeft') showPhoto(photoIndex - 1);
      else return;
      e.preventDefault();
      e.stopImmediatePropagation();
    }, true);

    return {
      fill: fill,
      open: function () { panelEl.classList.add('is-open'); },
      close: function () { panelEl.classList.remove('is-open'); if (viewerIsOpen()) closeViewer(); },
      viewerOpen: viewerIsOpen,
      relayout: relayout,
      autoScroll: autoScroll
    };
  };
})();
