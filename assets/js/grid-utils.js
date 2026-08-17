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

  // ---- Reveal observer --------------------------------------------------
  //
  // Watches tiles and toggles .cg-in as they cross the viewport threshold
  // (hysteresis: reveal once 12% visible, only reset once fully out of
  // view, so a tile sitting right on the boundary doesn't flicker).
  //
  // Critically, a tile stops being watched the instant its own state
  // changes, resuming only after its transition settles. The reveal's own
  // transform changes a tile's bounding box while it animates — if the
  // observer kept watching that same box mid-transition, the box moving
  // could re-cross the threshold on its own and restart the transition,
  // which reads as glitching right at the scroll boundary.
  var ENTER_RATIO = 0.12;
  // Derived from POP_DURATION_MAX (the longest a reveal transition can run)
  // plus a safety margin, so this can't silently drift shorter than the
  // transition it's meant to outlast if that range ever changes.
  var SETTLE_MS = Math.round((POP_DURATION_MAX + 0.15) * 1000);

  function createRevealObserver() {
    if (!("IntersectionObserver" in window)) return null;
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          var tile = entry.target;
          var willReveal = entry.intersectionRatio >= ENTER_RATIO;
          var willHide = !entry.isIntersecting;
          if (!willReveal && !willHide) return; // dead zone — leave state alone

          tile.classList.toggle("cg-in", willReveal);

          io.unobserve(tile);
          clearTimeout(tile.__revealResumeTimer);
          tile.__revealResumeTimer = setTimeout(function () {
            io.observe(tile);
          }, SETTLE_MS);
        });
      },
      { threshold: [0, ENTER_RATIO], rootMargin: "0px 0px -60px 0px" },
    );
    return io;
  }

  // No IntersectionObserver support: reveal everything immediately rather
  // than leaving tiles permanently hidden.
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
    revealAllImmediately: revealAllImmediately,
  };
})();
