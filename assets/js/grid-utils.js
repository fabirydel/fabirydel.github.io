// Shared helpers for every script that manages a .photo-tile grid
// (curated-grid.js, grid-layout.js, portfolio-color-sort.js): reading a
// tile's canonical position and blur-placeholder URL back out of the DOM,
// and the scroll-reveal system behind every grid's ".cg-in" pop-in.
window.GridUtils = (function () {
  "use strict";

  // The Liquid include renders tiles in image_index order via
  // onclick="openModal(N, …)" — N is a tile's canonical linear position,
  // recoverable regardless of where the tile currently sits in the DOM
  // (columns get reshuffled for layout/color-sort purposes).
  function getTileIndex(tile) {
    var match = (tile.getAttribute("onclick") || "").match(/openModal\((\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  }

  // Tiles render their blur placeholder as a CSS background-image (already
  // fetched, so re-reading it via new Image() is normally a cache hit).
  function getBlurUrl(tile) {
    var style = tile.getAttribute("style") || "";
    var match = style.match(/url\(['"]?([^'")]+)['"]?\)/);
    return match ? match[1] : null;
  }

  // ---- Scroll-direction tracking --------------------------------------
  //
  // Exposed as <html data-scroll-dir="down"|"up">, read by the Pop reveal
  // CSS (portfolio.scss) to flip which side a tile pops in from.
  var lastScrollY = window.scrollY;
  document.documentElement.setAttribute("data-scroll-dir", "down");
  window.addEventListener(
    "scroll",
    function () {
      var y = window.scrollY;
      if (y > lastScrollY + 1) {
        document.documentElement.setAttribute("data-scroll-dir", "down");
      } else if (y < lastScrollY - 1) {
        document.documentElement.setAttribute("data-scroll-dir", "up");
      }
      lastScrollY = y;
    },
    { passive: true },
  );

  // Gives each tile its own --pop-duration (read by the Pop reveal CSS in
  // portfolio.scss), so a row of tiles doesn't all pop in in perfect
  // lockstep. Sampled once per tile and reused for every reveal/hide on
  // that tile, rather than re-rolled each time, so a given tile's speed
  // stays consistent across a scroll session.
  var POP_DURATION_MIN = 0.1;
  var POP_DURATION_MAX = 0.4;

  function randomizePopDuration(tile) {
    if (tile.style.getPropertyValue("--pop-duration")) return;
    var seconds =
      POP_DURATION_MIN + Math.random() * (POP_DURATION_MAX - POP_DURATION_MIN);
    tile.style.setProperty("--pop-duration", seconds.toFixed(2) + "s");
  }

  // ---- Scroll reveal ----------------------------------------------------
  //
  // Toggles .cg-in on tiles as they enter/leave the viewport (hysteresis:
  // reveal once a tile is ~12% visible, only reset once it is fully out of
  // view, so a tile sitting right on the boundary doesn't flicker).
  //
  // Visibility is computed from each tile's *layout* position (offsetTop /
  // offsetHeight), never from its painted box. The reveal/hide transition
  // itself moves a tile up to 90px (see the Pop rule in portfolio.scss); an
  // IntersectionObserver measures the transformed box, so it saw a tile's own
  // animation as scrolling — which needed timers and a "has the page really
  // scrolled?" guard to stop feedback loops, and that guard in turn dropped
  // legitimate changes (a tile moved into view by a relayout or by images
  // loading above it, with no scroll in between, stayed hidden until it was
  // scrolled away and back). Layout positions can't be moved by a transform,
  // so a tile's state here is a pure function of where it is, where the
  // viewport is and the scroll direction: no timers, nothing to get stuck.
  var ENTER_RATIO = 0.12; // share of a tile that must be in view to reveal…
  var ENTER_MAX_PX = 48; // …capped, so tall tiles don't wait for 100px+
  var BOTTOM_INSET_PX = 60; // tiles reveal slightly above the bottom edge
  var FAR_RATIO = 0.2; // extra distance (× viewport) before hiding when scrolling up

  var docEl = document.documentElement;
  var revealGrids = []; // [{ el, tiles: [], allOut: bool }]
  var revealScheduled = false;
  var revealListening = false;
  var resizeObserver = null;

  // `el`'s layout offset from the top of `ancestor`, ignoring transforms.
  function offsetTopWithin(el, ancestor) {
    var y = 0;
    var n = el;
    while (n && n !== ancestor && ancestor.contains(n)) {
      y += n.offsetTop;
      n = n.offsetParent;
    }
    if (!n || n === ancestor) return y;
    // `ancestor` isn't a positioning context, so the walk ended on one of
    // its own offset parents: subtract ancestor's offset to that same node.
    var m = ancestor;
    while (m && m !== n) {
      y -= m.offsetTop;
      m = m.offsetParent;
    }
    return y;
  }

  function updateReveal() {
    revealScheduled = false;
    var vh = window.innerHeight;
    var dirUp = docEl.getAttribute("data-scroll-dir") === "up";
    var far = vh * FAR_RATIO;
    // At the very end of the page nothing can scroll further into view, so
    // don't hold the last tiles back behind the bottom inset.
    var atPageEnd = window.scrollY + vh >= docEl.scrollHeight - 2;
    var rootBottom = atPageEnd ? vh : vh - BOTTOM_INSET_PX;
    var toShow = [];
    var toHide = [];

    // Read phase — no DOM writes in here, so this is a single layout.
    for (var g = 0; g < revealGrids.length; g++) {
      var grid = revealGrids[g];
      var el = grid.el;
      // A grid can ask to be skipped until its first layout has run (tiles
      // aren't where they will end up yet) — see curated-grid.js.
      if (!el.isConnected || el.hasAttribute("data-reveal-hold")) continue;
      var rect = el.getBoundingClientRect();
      if (!rect.width && !rect.height) continue;
      var farOut = rect.bottom < -far - 100 || rect.top > vh + far + 100;
      if (farOut && grid.allOut) continue;

      var anyIn = false;
      var tiles = grid.tiles;
      for (var i = 0; i < tiles.length; i++) {
        var tile = tiles[i];
        var h = tile.offsetHeight;
        if (!h) continue; // not rendered (display: none / detached)
        var top = rect.top + offsetTopWithin(tile, el);
        var bottom = top + h;
        var isIn = tile.classList.contains("cg-in");
        var next = isIn;
        var visible = Math.min(bottom, rootBottom) - Math.max(top, 0);
        if (visible >= Math.min(h * ENTER_RATIO, ENTER_MAX_PX)) {
          next = true;
        } else if (isIn) {
          // Only ever hide a tile that is completely off screen. While
          // scrolling up it also has to be well clear of the viewport, so a
          // small reversal right after a reveal doesn't replay the pop.
          if (bottom <= 0) next = dirUp && bottom >= -far;
          else if (top >= vh) next = dirUp && top <= vh + far;
        }
        if (next !== isIn) (next ? toShow : toHide).push(tile);
        if (next) anyIn = true;
      }
      grid.allOut = !anyIn;
    }

    // Write phase.
    for (var s = 0; s < toShow.length; s++) toShow[s].classList.add("cg-in");
    for (var d = 0; d < toHide.length; d++) toHide[d].classList.remove("cg-in");
  }

  // Re-evaluate every observed tile on the next frame. Cheap to call often:
  // multiple calls within a frame collapse into one pass.
  function refreshReveal() {
    if (revealScheduled) return;
    revealScheduled = true;
    requestAnimationFrame(updateReveal);
  }

  function startRevealListeners() {
    if (revealListening) return;
    revealListening = true;
    window.addEventListener("scroll", refreshReveal, { passive: true });
    window.addEventListener("resize", refreshReveal, { passive: true });
    window.addEventListener("pageshow", refreshReveal);
    document.addEventListener("visibilitychange", refreshReveal);
    // Anything that moves tiles without a scroll: images loading (load
    // doesn't bubble, hence capture) and content above changing height.
    document.addEventListener(
      "load",
      function (e) {
        if (e.target && e.target.tagName === "IMG") refreshReveal();
      },
      true,
    );
    if ("ResizeObserver" in window) {
      resizeObserver = new ResizeObserver(refreshReveal);
      resizeObserver.observe(document.body);
    }
  }

  // Kept as a factory for the callers' sake (curated-grid.js, grid-layout.js)
  // — every "observer" shares the one scroll-driven pass above. observe() on
  // an already-observed tile is a no-op.
  function createRevealObserver() {
    if (!("requestAnimationFrame" in window)) return null;
    startRevealListeners();
    return {
      observe: function (tile) {
        var el = tile.closest(".portfolio-grid") || tile.parentNode;
        if (!el) return;
        if (tile.__revealGrid === el) return;
        var grid = null;
        for (var i = 0; i < revealGrids.length; i++) {
          if (revealGrids[i].el === el) grid = revealGrids[i];
        }
        if (!grid) {
          grid = { el: el, tiles: [], allOut: false };
          revealGrids.push(grid);
          if (resizeObserver) resizeObserver.observe(el);
        }
        tile.__revealGrid = el;
        grid.tiles.push(tile);
        grid.allOut = false;
        refreshReveal();
      },
    };
  }

  // No requestAnimationFrame: reveal everything immediately rather than
  // leaving tiles permanently hidden.
  function revealAllImmediately(tiles) {
    tiles.forEach(function (t) {
      t.classList.add("cg-in");
    });
  }

  return {
    getTileIndex: getTileIndex,
    getBlurUrl: getBlurUrl,
    randomizePopDuration: randomizePopDuration,
    createRevealObserver: createRevealObserver,
    refreshReveal: refreshReveal,
    revealAllImmediately: revealAllImmediately,
  };
})();
