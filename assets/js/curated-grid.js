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
// lets us guarantee no gaps: see layoutMasonry() for how large tiles are
// seated without leaving empty space behind.
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

  // Shortest-column-first masonry with span support, and no holes.
  //
  // Single-column tiles simply go at the bottom of whichever column is
  // currently shortest, so they can never leave a gap. A large (2-column)
  // tile is the hard case: it has to start at the same y in both columns
  // it spans, and those two columns are almost never exactly level. Any
  // difference left under it is a visible hole.
  //
  // So a large tile is only ever placed on a pair of columns that has been
  // made *exactly* level first:
  //
  //   1. Backfill — upcoming single tiles that fit are pulled (slightly out
  //      of order) into the shorter column, optionally plus one that
  //      overshoots, whichever leaves the smaller difference.
  //   2. Level — the remaining difference is absorbed by resizing the
  //      tiles in both columns' "tails" (everything placed since the last
  //      large tile in that column — nothing above is touched, so earlier
  //      alignments stay intact). The shorter column's tail grows and the
  //      taller one's shrinks, proportionally, so each photo is cropped
  //      (object-fit: cover) by the same small fraction — typically a few
  //      percent — instead of one tile taking the whole correction.
  //
  // If the crop needed would exceed MAX_STRETCH the large tile waits: the
  // next single tiles are placed normally and it is retried after each
  // one. After MAX_DEFER tries (or at the end of the list) it is placed
  // with the looser MAX_STRETCH_FORCED limit, and if even that isn't
  // possible it is shown at normal size instead — a single-column tile
  // can't create a hole. Finally the bottom edge is levelled the same way
  // (best effort), so the grid ends in a straight line.
  var MAX_STRETCH = 0.14; // preferred limit on how much a tile is resized
  var MAX_STRETCH_FORCED = 0.3; // last resort before demoting a large tile
  var MAX_DEFER = 8; // singles to place before forcing a waiting large tile
  var MAX_STRETCH_BOTTOM = 0.2; // limit when levelling the grid's bottom edge

  // Pure placement: works out a position and size for every tile of `base`
  // (in the given order) without touching the DOM. Returns the placed items
  // plus how uneven the bottom edge ended up (`ragged`, px).
  function computeLayout(base, cols, colWidth) {
    var colHeights = new Array(cols).fill(0);
    // Per column: single tiles placed since the last large tile there.
    var tails = [];
    for (var t = 0; t < cols; t++) tails.push([]);
    // Per column: the large tile it currently ends in, if its tail is empty.
    var endLarge = new Array(cols).fill(null);

    var meta = base.map(function (b) {
      var width = b.span === 2 ? colWidth * 2 + GAP : colWidth;
      return {
        tile: b.tile,
        span: b.span,
        aspect: b.aspect,
        width: width,
        height: width / b.aspect,
        col: 0,
        y: 0,
        placed: false,
        deferred: 0,
      };
    });

    function shortestCol() {
      var col = 0;
      for (var c = 1; c < cols; c++)
        if (colHeights[c] < colHeights[col]) col = c;
      return col;
    }

    function tailSum(col) {
      var sum = 0;
      for (var k = 0; k < tails[col].length; k++) sum += tails[col][k].height;
      return sum;
    }

    function placeSingle(m, col) {
      m.col = col;
      m.y = colHeights[col];
      m.placed = true;
      tails[col].push(m);
      colHeights[col] += m.height + GAP;
    }

    // Grow (delta > 0) or shrink (delta < 0) a column by resizing its tail
    // tiles proportionally, then restack them.
    function resizeTail(col, delta) {
      var tail = tails[col];
      if (!tail.length || !delta) return;
      var sum = tailSum(col);
      var factor = (sum + delta) / sum;
      var y = tail[0].y;
      for (var k = 0; k < tail.length; k++) {
        tail[k].height *= factor;
        tail[k].y = y;
        y += tail[k].height + GAP;
      }
      colHeights[col] = y;
    }

    // Make columns a and b end at exactly the same y.
    function levelPair(a, b) {
      var s = colHeights[a] <= colHeights[b] ? a : b;
      var tall = s === a ? b : a;
      var diff = colHeights[tall] - colHeights[s];
      var sumS = tailSum(s);
      var sumT = tailSum(tall);
      if (diff <= 0 || sumS + sumT === 0) return;
      var grow = (diff * sumS) / (sumS + sumT);
      resizeTail(s, grow);
      resizeTail(tall, -(diff - grow));
    }

    // Works out how a large tile could go on columns p / p+1: which single
    // tiles to backfill and how much resizing levelling would then need
    // (cost = fraction each affected tile is resized by). Changes nothing.
    function planPair(p) {
      var s = colHeights[p] <= colHeights[p + 1] ? p : p + 1;
      var tall = s === p ? p + 1 : p;
      var gap = colHeights[tall] - colHeights[s];
      var fill = [];
      var fillSum = 0;
      for (var j = 0; j < meta.length && gap > GAP + 4; j++) {
        var cand = meta[j];
        if (cand.placed || cand.span !== 1) continue;
        if (cand.height <= gap - GAP) {
          fill.push(cand);
          fillSum += cand.height;
          gap -= cand.height + GAP;
        }
      }
      var sumS = tailSum(s) + fillSum;
      var sumT = tailSum(tall);
      var cost = sumS + sumT > 0 ? gap / (sumS + sumT) : gap < 0.5 ? 0 : Infinity;
      var extra = null;
      if (gap > 0.5) {
        // One more tile that overshoots may leave less to correct.
        for (var q = 0; q < meta.length; q++) {
          var over = meta[q];
          if (over.placed || over.span !== 1 || fill.indexOf(over) !== -1) continue;
          var overCost = (over.height + GAP - gap) / (sumS + over.height + sumT);
          if (overCost >= 0 && overCost < cost) {
            cost = overCost;
            extra = over;
          }
        }
      }
      var top = Math.max(colHeights[p], colHeights[p + 1]);
      if (extra) top = colHeights[s] + (colHeights[tall] - colHeights[s] - gap) + extra.height + GAP;
      return { p: p, s: s, fill: fill, extra: extra, cost: cost, top: top };
    }

    // Place a large tile if some adjacent pair can take it within `limit`,
    // preferring the highest position (keeps it closest to its own place
    // in the order). Returns false if no pair qualifies.
    function placeLarge(m, limit) {
      var best = null;
      for (var p = 0; p <= cols - 2; p++) {
        var plan = planPair(p);
        if (plan.cost > limit) continue;
        if (!best || plan.top < best.top - 0.5 ||
            (Math.abs(plan.top - best.top) <= 0.5 && plan.cost < best.cost)) {
          best = plan;
        }
      }
      if (!best) return false;

      for (var f = 0; f < best.fill.length; f++) placeSingle(best.fill[f], best.s);
      if (best.extra) placeSingle(best.extra, best.s);
      levelPair(best.p, best.p + 1);

      var y = Math.max(colHeights[best.p], colHeights[best.p + 1]);
      m.col = best.p;
      m.y = y;
      m.placed = true;
      colHeights[best.p] = colHeights[best.p + 1] = y + m.height + GAP;
      tails[best.p] = [];
      tails[best.p + 1] = [];
      endLarge[best.p] = endLarge[best.p + 1] = m;
      return true;
    }

    // Last resort for a large tile that can't be seated without a hole.
    function forceLarge(m) {
      if (placeLarge(m, MAX_STRETCH_FORCED)) return;
      m.span = 1;
      m.width = colWidth;
      m.height = colWidth / m.aspect;
      placeSingle(m, shortestCol());
    }

    var pending = []; // large tiles waiting for a level pair, in order

    function settlePending() {
      while (pending.length && placeLarge(pending[0], MAX_STRETCH)) pending.shift();
    }

    for (var i = 0; i < meta.length; i++) {
      var m = meta[i];
      if (m.placed) continue;

      if (m.span === 2) {
        pending.push(m);
        settlePending();
        continue;
      }

      placeSingle(m, shortestCol());
      if (pending.length) {
        settlePending();
        if (pending.length && ++pending[0].deferred >= MAX_DEFER) {
          forceLarge(pending.shift());
          settlePending();
        }
      }
    }
    while (pending.length) forceLarge(pending.shift());

    // Level the bottom edge so the grid ends in a straight line. Each
    // column is adjusted through its tail; a pair of columns that ends in
    // a large tile is adjusted through that tile's own height. If every
    // column can reach a common line within MAX_STRETCH_BOTTOM that line
    // is used; otherwise each gets as close to the average as the limit
    // allows — an uneven last row is a ragged edge, not a hole in the grid.
    var units = [];
    for (var c1 = 0; c1 < cols; c1++) {
      if (tails[c1].length) {
        units.push({ col: c1, span: 1, end: colHeights[c1], size: tailSum(c1), large: null });
      } else if (endLarge[c1]) {
        var big = endLarge[c1];
        var wholePair = !tails[big.col].length && !tails[big.col + 1].length;
        if (wholePair && big.col === c1) {
          units.push({ col: c1, span: 2, end: colHeights[c1], size: big.height, large: big });
        } else if (!wholePair) {
          // Its other column has grown past it since, so resizing the
          // large tile would open a hole there: this column stays put.
          units.push({ col: c1, span: 1, end: colHeights[c1], size: 0, large: null });
        }
      }
    }
    if (units.length > 1) {
      var target = 0;
      var weight = 0;
      var lo = -Infinity;
      var hi = Infinity;
      units.forEach(function (u) {
        target += u.end * u.span;
        weight += u.span;
        lo = Math.max(lo, u.end - u.size * MAX_STRETCH_BOTTOM);
        hi = Math.min(hi, u.end + u.size * MAX_STRETCH_BOTTOM);
      });
      target /= weight;
      if (lo <= hi) target = Math.max(lo, Math.min(hi, target));
      units.forEach(function (u) {
        var maxDelta = u.size * MAX_STRETCH_BOTTOM;
        var delta = Math.max(-maxDelta, Math.min(maxDelta, target - u.end));
        if (u.large) {
          u.large.height += delta;
          colHeights[u.col] = colHeights[u.col + 1] = u.end + delta;
        } else {
          resizeTail(u.col, delta);
        }
      });
    }

    var used = colHeights.filter(function (h) { return h > 0; });
    return {
      items: meta,
      height: used.length ? Math.max.apply(null, used) : 0,
      ragged: used.length ? Math.max.apply(null, used) - Math.min.apply(null, used) : 0,
    };
  }

  // A large tile among the very last photos has nothing after it to fill
  // the columns beside it, so it would stick out below the rest of the
  // grid. When the bottom edge can't be levelled, retry with the last
  // large tile moved a few places earlier (position only — DOM order, and
  // so the lightbox order, is untouched) and keep the most even result.
  var REORDER_STEP = 4;
  var MAX_REORDER_TRIES = 16;

  function layoutMasonry(grid) {
    var cols = columnCount();
    var containerWidth = grid.getBoundingClientRect().width;
    if (!containerWidth) return;
    var colWidth = (containerWidth - (cols - 1) * GAP) / cols;
    var tileEls = Array.from(grid.querySelectorAll(".photo-tile"));

    // Below 1500px there isn't enough room for a 2-column-wide tile to
    // read as a deliberate "featured" moment rather than just crowding
    // everything else — so under that width every tile renders at normal
    // size regardless of its large/enlarged state.
    var allowLarge = window.innerWidth >= 1500;

    var order = tileEls.map(function (tile) {
      var isLarge = tile.classList.contains("photo-tile--large") && cols >= 2 && allowLarge;
      return {
        tile: tile,
        span: isLarge ? 2 : 1,
        aspect: parseFloat(tile.dataset.aspect) || 4 / 3,
      };
    });

    var best = computeLayout(order, cols, colWidth);
    for (var tries = 0; best.ragged > 1 && tries < MAX_REORDER_TRIES; tries++) {
      var last = -1;
      for (var n = order.length - 1; n >= 0; n--) {
        if (order[n].span === 2) { last = n; break; }
      }
      if (last <= 0) break;
      var moved = order.splice(last, 1)[0];
      order.splice(Math.max(0, last - REORDER_STEP), 0, moved);
      var attempt = computeLayout(order, cols, colWidth);
      if (attempt.ragged < best.ragged - 0.5) best = attempt;
    }

    // Write phase — every position is final by now.
    for (var w = 0; w < best.items.length; w++) {
      var item = best.items[w];
      var style = item.tile.style;
      style.position = "absolute";
      style.left = item.col * (colWidth + GAP) + "px";
      style.top = item.y + "px";
      style.width = item.width + "px";
      style.height = item.height + "px";
    }

    grid.style.height = Math.max(best.height - GAP, 0) + "px";

    // Tiles are where they belong now — let scroll reveal look at them.
    grid.removeAttribute("data-reveal-hold");
    GridUtils.refreshReveal();
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
      GridUtils.randomizePopDuration(t);
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
    // Until the first layout runs every tile sits stacked at the grid's
    // top-left corner; keep scroll reveal away from them until then.
    grid.setAttribute("data-reveal-hold", "");

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
