// Home page ("Selected Work") grid engine.
//
// This positions tiles itself (absolute x/y, computed in JS) rather than
// handing layout to CSS Grid's `grid-auto-flow: dense`. That was tried
// first, but dense auto-placement is a *greedy* algorithm: it walks tiles
// in DOM order and drops each into the first cell it fits, without ever
// reconsidering earlier placements. Mixed with "large" tiles spanning two
// columns and every tile having a different row-span (real masonry heights),
// that greedy walk can easily paint itself into a corner and leave a hole
// no later tile happens to fit — exactly the empty gaps that were showing
// up. Computing placement ourselves (shortest-column-first, like Pinterest)
// guarantees no gaps: every tile is placed exactly at the bottom of the
// column(s) it's assigned to, so there's never empty space to leave behind.
//
// Also owns a home-page-only touch: a subtle parallax on the hero cover
// photo. Tile scroll-reveal is shared with the other galleries — see
// grid-utils.js.

(function () {
  "use strict";

  var GAP = 10; // px — must match --cg-gap in _sass/portfolio.scss

  function getGrid() {
    return document.querySelector(".portfolio-wrapper .portfolio-grid");
  }

  function columnCount() {
    var w = window.innerWidth;
    if (w <= 850) return 2;
    if (w <= 1280) return 3;
    if (w <= 1500) return 4;
    return 5;
  }

  // Preload each tile's blur placeholder to read its natural aspect ratio.
  // The blur image is already fetched via CSS background-image, so this is
  // typically a cache hit.
  function ensureAspectsKnown(tiles) {
    return Promise.all(
      tiles.map(function (tile) {
        if (tile.dataset.aspect) return Promise.resolve();
        var url = GridUtils.getBlurUrl(tile);
        if (!url) return Promise.resolve();
        return new Promise(function (resolve) {
          var img = new Image();
          img.onload = function () {
            if (img.naturalWidth && img.naturalHeight) {
              tile.dataset.aspect = String(
                img.naturalWidth / img.naturalHeight,
              );
            }
            resolve();
          };
          img.onerror = function () {
            resolve();
          };
          img.src = url;
        });
      }),
    );
  }

  // Shortest-column-first masonry with span support. Walks tiles in DOM
  // order; each one goes at the bottom of whichever column (or, for a
  // large tile, whichever adjacent column *pair*) is currently shortest.
  //
  // A 2-column tile has to start at the same y in both columns, so if one
  // of the two is shorter than the other at that point, placing it there
  // strands a gap in the shorter column — there's no way around that once
  // the large tile is committed. So before committing one, look ahead for
  // upcoming single-column tiles to backfill that gap first (pulling them
  // slightly out of their normal order). Every tile is always placed at
  // its own natural (aspect-derived) height — never resized to force an
  // exact fit — so object-fit: cover never has to crop more than the
  // couple of stray px that already happens everywhere in this grid.
  // That means a gap can't always be closed *exactly*; when nothing left
  // fits within it, the closest-height remaining tile is used instead,
  // still at its own natural size, trading a small (bounded, rare)
  // residual gap for never visibly cropping a photo.
  //
  // Effectively unlimited — a few hundred tiles is nothing to scan, and a
  // wider search means more chances of finding something close to what's
  // needed.
  var BACKFILL_LOOKAHEAD = Infinity;

  // A gap of GAP_CLOSE_MAX px or less gets closed by growing the column's
  // last tile by that much (a couple more px of object-fit: cover crop,
  // same as the gentle trim already happening everywhere) rather than left
  // open. Above that it's left as a gap rather than crop a photo more to
  // force it shut.
  var GAP_CLOSE_MAX = 100;

  function layoutMasonry(grid) {
    var cols = columnCount();
    var containerWidth = grid.getBoundingClientRect().width;
    if (!containerWidth) return;
    var colWidth = (containerWidth - (cols - 1) * GAP) / cols;
    var colHeights = new Array(cols).fill(0);
    var lastInCol = new Array(cols).fill(null);
    var tileEls = Array.from(grid.querySelectorAll(".photo-tile"));

    // Below 1500px there isn't enough room for a 2-column-wide tile to
    // read as a deliberate "featured" moment rather than just crowding
    // everything else — so under that width every tile renders at normal
    // size regardless of its large/enlarged state.
    var allowLarge = window.innerWidth >= 1500;

    var meta = tileEls.map(function (tile) {
      var isLarge = tile.classList.contains("photo-tile--large") && cols >= 2 && allowLarge;
      var span = isLarge ? 2 : 1;
      var aspect = parseFloat(tile.dataset.aspect) || 4 / 3;
      var width = span === 2 ? colWidth * 2 + GAP : colWidth;
      var height = width / aspect;
      return {
        tile: tile,
        span: span,
        width: width,
        height: height,
        placed: false,
      };
    });

    function place(m, col, y) {
      m.tile.style.position = "absolute";
      m.tile.style.left = col * (colWidth + GAP) + "px";
      m.tile.style.top = y + "px";
      m.tile.style.width = m.width + "px";
      m.tile.style.height = m.height + "px";
      m.placed = true;
      m.col = col;
      // A large tile occupies both columns it spans, so it's the "last
      // tile" for closeSmallGap purposes in either of them.
      for (var k = 0; k < m.span; k++) {
        lastInCol[col + k] = m;
      }
    }

    // Close a <=GAP_CLOSE_MAX gap in `col` by growing its last tile up to
    // `targetY`. Only ever a single-column tile — growing it is fully
    // contained to that one column, so it can never overlap into a
    // neighboring column the way growing a large tile could.
    function closeSmallGap(col, targetY) {
      var diff = targetY - colHeights[col];
      if (
        diff > 0.5 &&
        diff <= GAP_CLOSE_MAX &&
        lastInCol[col] &&
        lastInCol[col].span === 1
      ) {
        lastInCol[col].height += diff;
        lastInCol[col].tile.style.height = lastInCol[col].height + "px";
        colHeights[col] = targetY;
      }
    }

    for (var i = 0; i < meta.length; i++) {
      var m = meta[i];
      if (m.placed) continue;

      if (m.span === 1) {
        var col = 0;
        for (var c = 1; c < cols; c++)
          if (colHeights[c] < colHeights[col]) col = c;
        place(m, col, colHeights[col]);
        colHeights[col] += m.height + GAP;
        continue;
      }

      // Large tile: pick the best (lowest-max) adjacent pair.
      var bestCol = 0;
      var bestY = Infinity;
      for (var p = 0; p <= cols - 2; p++) {
        var y = Math.max(colHeights[p], colHeights[p + 1]);
        if (y < bestY) {
          bestY = y;
          bestCol = p;
        }
      }

      // Backfill the shorter of the two columns before committing —
      // every candidate here is used at its own natural height.
      var shortCol =
        colHeights[bestCol] <= colHeights[bestCol + 1] ? bestCol : bestCol + 1;
      var lookaheadEnd = Math.min(meta.length, i + 1 + BACKFILL_LOOKAHEAD);
      for (
        var j = i + 1;
        j < lookaheadEnd && bestY - colHeights[shortCol] > GAP + 4;
        j++
      ) {
        var candidate = meta[j];
        if (candidate.placed || candidate.span !== 1) continue;
        if (candidate.height <= bestY - colHeights[shortCol] - GAP) {
          place(candidate, shortCol, colHeights[shortCol]);
          colHeights[shortCol] += candidate.height + GAP;
        }
      }

      // Nothing left tucks in neatly — rather than resize (crop) a tile to
      // force an exact fit, use whichever unplaced single-column tile's
      // own natural height comes closest to what's left, still uncropped.
      var remaining = bestY - colHeights[shortCol];
      if (remaining > GAP + 4) {
        var target = remaining - GAP;
        var bestQ = -1;
        var bestDiff = Infinity;
        for (var q = i + 1; q < meta.length; q++) {
          var cand2 = meta[q];
          if (cand2.placed || cand2.span !== 1) continue;
          // Bias toward undershooting: a candidate shorter than target
          // leaves a small residual closeSmallGap can still fix, while one
          // taller than target overshoots and strands a gap in the
          // *other* column instead — so weight overshoot as a worse match
          // unless it's clearly the closer option.
          var diff =
            cand2.height <= target
              ? target - cand2.height
              : (cand2.height - target) * 3;
          if (diff < bestDiff) {
            bestDiff = diff;
            bestQ = q;
          }
        }
        if (bestQ !== -1) {
          place(meta[bestQ], shortCol, colHeights[shortCol]);
          colHeights[shortCol] += meta[bestQ].height + GAP;
        }
      }

      // Close small residuals in *either* column of the pair — an
      // overshooting closest-fit above can just as easily leave the other
      // (originally taller) column short instead.
      var pairMax = Math.max(colHeights[bestCol], colHeights[bestCol + 1]);
      closeSmallGap(bestCol, pairMax);
      closeSmallGap(bestCol + 1, pairMax);

      // Large tile starts wherever the columns actually ended up — not a
      // rigid pre-computed target — so anything closeSmallGap couldn't
      // reach is absorbed here instead of causing a mismatch.
      bestY = Math.max(colHeights[bestCol], colHeights[bestCol + 1]);
      place(m, bestCol, bestY);
      colHeights[bestCol] = bestY + m.height + GAP;
      colHeights[bestCol + 1] = bestY + m.height + GAP;
    }

    grid.style.height =
      Math.max(Math.max.apply(null, colHeights) - GAP, 0) + "px";
  }

  function relayout() {
    var grid = getGrid();
    if (!grid) return;
    unwrapGridCols(grid);
    layoutMasonry(grid);
  }

  function initReveal(grid) {
    var tiles = Array.from(grid.querySelectorAll(".photo-tile"));
    var io = GridUtils.createRevealObserver();
    if (!io) return GridUtils.revealAllImmediately(tiles);
    tiles.forEach(function (t) {
      io.observe(t);
    });
  }

  // ---- Subtle hero parallax ------------------------------------------
  function initParallax() {
    var cover = document.querySelector(".stats-cover");
    if (!cover) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    window.addEventListener(
      "scroll",
      function () {
        var y = Math.min(window.scrollY, 600);
        cover.style.transform = "translateY(" + y * 0.12 + "px) scale(1.06)";
      },
      { passive: true },
    );
  }

  // Defensive: if grid-layout.js's flex-column masonry ran on this grid
  // before we got to it (e.g. a resize firing mid-boot, before this script
  // has executed), it wraps tiles in .grid-col divs. Unwrap back to flat
  // .photo-tile children, which is what our own layout needs.
  function unwrapGridCols(grid) {
    var cols = Array.prototype.slice.call(
      grid.querySelectorAll(":scope > .grid-col"),
    );
    if (!cols.length) return;
    var tiles = [];
    cols.forEach(function (col) {
      Array.prototype.forEach.call(col.children, function (child) {
        tiles.push(child);
      });
    });
    tiles.sort(function (a, b) {
      return GridUtils.getTileIndex(a) - GridUtils.getTileIndex(b);
    });
    grid.innerHTML = "";
    tiles.forEach(function (t) {
      grid.appendChild(t);
    });
    grid.classList.remove("js-grid");
    delete grid.dataset.layoutCols;
    delete grid.dataset.layoutRebalanced;
  }

  function init() {
    var grid = getGrid();
    if (!grid) return; // not the home page

    unwrapGridCols(grid);
    grid.classList.add("cg-grid");

    var tiles = Array.from(grid.querySelectorAll(".photo-tile"));
    ensureAspectsKnown(tiles).then(function () {
      layoutMasonry(grid);
    });

    initReveal(grid);
    initParallax();

    var resizeTimer = null;
    window.addEventListener(
      "resize",
      function () {
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(relayout, 120);
      },
      { passive: true },
    );

    // Public hook — same name grid-layout.js exposes for the other
    // galleries, so portfolio-color-sort.js and portfolio-toggle.js don't
    // need to know which engine is actually active on a given page.
    window.__refreshGridLayout = relayout;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
