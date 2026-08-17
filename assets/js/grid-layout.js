// Masonry layout for .portfolio-grid.
//
// Two passes per layout cycle:
//
//   Pass 1 (round-robin) — runs on DOMContentLoaded, before images have
//     loaded. Item i goes into column i % N, which gives an immediate visible
//     layout that already guarantees: when photo_count >= column_count, every
//     column has >= 1 photo. Heights aren't balanced yet because we don't
//     know image dimensions yet.
//
//   Pass 2 (shortest-column-first) — runs after window.load, when every img
//     has reported its rendered height. We measure each tile, then greedily
//     re-distribute: each tile (in original linear order) goes into whichever
//     column is currently shortest. This evens out the column heights so the
//     gallery doesn't have one column much taller than the others.
//
// On resize across a breakpoint, both passes run again (the second one in a
// rAF tick so the browser can apply the new flex column widths first).
//
// Original tile order is recovered from the inline onclick="openModal(N, …)"
// — N is set by the Liquid include in image_index order, so it's the canonical
// linear position of the tile regardless of where it currently sits in the
// DOM.

(function () {
  'use strict';

  // Keep in sync with media queries in _sass/portfolio.scss.
  function getColumnCount() {
    var w = window.innerWidth;
    if (w <= 850) return 2;
    if (w <= 1280) return 3;
    if (w <= 1500) return 4;
    return 5;
  }

  // Preload each tile's blur image via new Image() to read naturalWidth/Height,
  // then apply CSS aspect-ratio to the <img class="thumb">. Browsers reserve
  // the correct height for a thumb even before it's lazy-loaded, so the LPT
  // algorithm has accurate measurements for below-the-fold tiles.
  //
  // Blur images are already loaded by CSS background-image, so these
  // new Image() calls are typically cache hits and complete instantly.
  function ensureAspectsKnown(grid) {
    var tiles = Array.from(grid.querySelectorAll('.photo-tile'));
    return Promise.all(tiles.map(function (tile) {
      if (tile.dataset.aspect) return Promise.resolve();
      var url = GridUtils.getBlurUrl(tile);
      if (!url) return Promise.resolve();
      return new Promise(function (resolve) {
        var img = new Image();
        img.onload = function () {
          if (img.naturalWidth && img.naturalHeight) {
            tile.dataset.aspect = String(img.naturalWidth / img.naturalHeight);
            var thumb = tile.querySelector('img.thumb');
            if (thumb) {
              thumb.style.aspectRatio = img.naturalWidth + ' / ' + img.naturalHeight;
            }
          }
          resolve();
        };
        img.onerror = function () { resolve(); };
        img.src = url;
      });
    }));
  }

  // ---- Pass 1: round-robin (no measurements needed) -------------------
  //
  // Returns true if the grid was actually rebuilt (i.e. column count
  // changed or first run), false if it was already laid out for the
  // current viewport.
  function distributeRoundRobin(grid) {
    var tiles = Array.from(grid.querySelectorAll('.photo-tile'));
    if (tiles.length === 0) {
      grid.classList.add('js-grid');
      return false;
    }

    var cols = getColumnCount();
    if (grid.classList.contains('js-grid')
        && grid.dataset.layoutCols === String(cols)) {
      return false;
    }

    tiles.sort(function (a, b) { return GridUtils.getTileIndex(a) - GridUtils.getTileIndex(b); });

    grid.innerHTML = '';
    grid.classList.add('js-grid');
    grid.dataset.layoutCols = String(cols);
    // Drop the rebalanced flag — we just rebuilt the structure.
    delete grid.dataset.layoutRebalanced;

    var colEls = [];
    for (var i = 0; i < cols; i++) {
      var c = document.createElement('div');
      c.className = 'grid-col';
      grid.appendChild(c);
      colEls.push(c);
    }

    for (var j = 0; j < tiles.length; j++) {
      colEls[j % cols].appendChild(tiles[j]);
    }
    return true;
  }

  // ---- Pass 2: LPT (Longest Processing Time) masonry ------------------
  //
  // Naive shortest-column greedy in DOM order is a poor approximation
  // when item heights vary a lot — a single tall portrait that arrives
  // after a few landscapes ends up doubling the height of whatever
  // column it lands in.
  //
  // LPT fixes this by placing items tallest-first: each item, in
  // descending-height order, goes into whichever column is currently
  // shortest. This is a 4/3-approximation of the optimal partition and
  // typically gets column-height spread under 25% even on mixed
  // landscape/portrait galleries.
  //
  // After the placement is decided, tiles are appended to their assigned
  // columns in their *original* (linear/openModal) order, so within a
  // column the photos still flow top→bottom in the canonical sequence.
  function distributeMasonry(grid) {
    if (!grid.classList.contains('js-grid')) return;

    var cols = Array.prototype.filter.call(grid.children, function (c) {
      return c.classList && c.classList.contains('grid-col');
    });
    if (cols.length === 0) return;

    var tiles = Array.from(grid.querySelectorAll('.photo-tile'));
    if (tiles.length === 0) return;

    tiles.sort(function (a, b) { return GridUtils.getTileIndex(a) - GridUtils.getTileIndex(b); });

    // Measure heights BEFORE detaching — detached elements report 0.
    var heights = tiles.map(function (t) {
      var cs = window.getComputedStyle(t);
      var mb = parseFloat(cs.marginBottom) || 0;
      // Fallback for a tile that hasn't been laid out yet (e.g. img
      // hasn't loaded and there's no aspect-ratio reservation).
      var h = t.offsetHeight || 200;
      return h + mb;
    });

    // Build [originalIndex, height] pairs and sort by height descending.
    // Ties broken by originalIndex ascending so the layout is stable.
    var indices = tiles.map(function (_, i) { return i; });
    indices.sort(function (a, b) {
      if (heights[b] !== heights[a]) return heights[b] - heights[a];
      return a - b;
    });

    // First pass — pick a column for each tile (LPT order).
    var assignment = new Array(tiles.length);
    var colHeights = cols.map(function () { return 0; });
    for (var p = 0; p < indices.length; p++) {
      var i = indices[p];
      var minIdx = 0;
      for (var k = 1; k < colHeights.length; k++) {
        if (colHeights[k] < colHeights[minIdx]) minIdx = k;
      }
      assignment[i] = minIdx;
      colHeights[minIdx] += heights[i];
    }

    // Detach existing children of all column wrappers.
    cols.forEach(function (col) {
      while (col.firstChild) col.removeChild(col.firstChild);
    });

    // Second pass — append tiles in original order so within each column
    // they read top→bottom in canonical sequence.
    for (var n = 0; n < tiles.length; n++) {
      cols[assignment[n]].appendChild(tiles[n]);
    }

    grid.dataset.layoutRebalanced = '1';
  }

  // Scroll reveal is shared with curated-grid.js — see grid-utils.js. This
  // just needs one observer for every grid this engine manages.
  var revealObserver = null;

  function observeReveal() {
    var grids = managedGrids('.portfolio-grid');
    if (!revealObserver) revealObserver = GridUtils.createRevealObserver();
    if (!revealObserver) {
      grids.forEach(function (grid) {
        GridUtils.revealAllImmediately(Array.from(grid.querySelectorAll('.photo-tile')));
      });
      return;
    }
    // observe() on an already-observed element is a harmless no-op, so it's
    // safe to call this again after every relayout without tracking state.
    grids.forEach(function (grid) {
      grid.querySelectorAll('.photo-tile').forEach(function (t) {
        revealObserver.observe(t);
      });
    });
  }

  // ---- Drivers --------------------------------------------------------

  // The home page's curated grid (.portfolio-wrapper .portfolio-grid) is
  // owned by curated-grid.js instead — it needs true CSS Grid (with
  // column/row spans) to support user-configurable "large" tiles, which
  // this flex-column masonry can't express. Skip it here so the two
  // engines never fight over the same element.
  function managedGrids(selector) {
    return Array.from(document.querySelectorAll(selector)).filter(function (g) {
      // Belt-and-suspenders: the ancestor check is the primary guard, but
      // also skip anything curated-grid.js has already claimed (its own
      // resize handler owns re-layout for those from here on), in case a
      // resize fires mid-boot before curated-grid.js has run yet.
      return !g.closest('.portfolio-wrapper') && !g.classList.contains('cg-grid');
    });
  }

  function layoutAll() {
    managedGrids('.portfolio-grid').forEach(distributeRoundRobin);
  }

  function rebalanceAll() {
    var grids = managedGrids('.portfolio-grid.js-grid');
    Promise.all(grids.map(ensureAspectsKnown)).then(function () {
      // After aspect-ratio CSS is applied the browser needs a layout pass
      // before offsetHeight reports the new reserved heights. rAF gives us
      // that pass.
      requestAnimationFrame(function () {
        grids.forEach(distributeMasonry);
      });
    });
  }

  // First pass: round-robin as soon as the DOM is parseable.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      layoutAll();
      observeReveal();
    });
  } else {
    layoutAll();
    observeReveal();
  }

  // Second pass: rebalance once aspects are known. Trigger this after
  // DOMContentLoaded so layoutAll has already run; window.load is fine
  // too (blur preloads will be cache hits either way).
  if (document.readyState !== 'loading') {
    rebalanceAll();
  } else {
    document.addEventListener('DOMContentLoaded', rebalanceAll);
  }

  // Resize: redistribute (round-robin) if the column count changed, then
  // rebalance after a frame so flex widths and tile heights settle first.
  var resizeTimer = null;
  window.addEventListener('resize', function () {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      layoutAll();
      requestAnimationFrame(rebalanceAll);
      observeReveal();
    }, 120);
  }, { passive: true });

  // Public hook so a script that reorders tiles in .portfolio-grid (e.g.
  // portfolio-color-sort.js) can request a fresh distribution + rebalance
  // without having to know our internals.
  window.__refreshGridLayout = function () {
    layoutAll();
    requestAnimationFrame(rebalanceAll);
    observeReveal();
  };
})();
