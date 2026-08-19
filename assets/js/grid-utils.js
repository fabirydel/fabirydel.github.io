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
  // The reveal/hide transition itself moves the tile up to 90px (see the
  // Pop rule in portfolio.scss) — enough to cross this same threshold on
  // its own once the transition settles, with no further scrolling. Left
  // unchecked that's a real feedback loop, not just jitter: hiding shifts
  // the tile back toward the viewport, which can re-reveal it, which shifts
  // it back out, forever, at whatever scroll position happens to straddle
  // the boundary. window.scrollY is the one signal a tile's own transform
  // can never move, so a crossing only commits if the page has actually
  // scrolled a meaningful amount since this tile's last commit — a
  // self-caused crossing shows zero scroll movement and gets ignored.
  // A short debounce on top just collapses truly-simultaneous entries
  // (e.g. both thresholds firing in the same batch) into one commit.
  var ENTER_RATIO = 0.12;
  var COMMIT_DELAY_MS = 100;
  var MIN_SCROLL_DELTA_PX = 4;

  function createRevealObserver() {
    if (!("IntersectionObserver" in window)) return null;

    function commit(tile, willReveal) {
      clearTimeout(tile.__revealCommitTimer);
      tile.__revealCommitTimer = setTimeout(function () {
        var lastY = tile.__lastCommitScrollY;
        if (lastY !== undefined && Math.abs(window.scrollY - lastY) < MIN_SCROLL_DELTA_PX) {
          return; // no real scroll since last commit — this is our own transform
        }
        tile.__lastCommitScrollY = window.scrollY;
        tile.classList.toggle("cg-in", willReveal);
      }, COMMIT_DELAY_MS);
    }

    // Reveal, plus the ordinary hide while scrolling down: fires right at
    // the natural edge, same threshold either direction crosses to enter.
    var edgeIO = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          var tile = entry.target;
          var willReveal = entry.intersectionRatio >= ENTER_RATIO;
          var willHide = !entry.isIntersecting;
          if (willReveal) {
            commit(tile, true);
          } else if (willHide) {
            // While scrolling up, a tile that already appeared shouldn't
            // vanish again just because a small reversal re-crosses the
            // same shallow edge it entered through — farIO below decides
            // hide in that case instead, once it's scrolled meaningfully
            // out of view rather than just barely.
            if (document.documentElement.getAttribute("data-scroll-dir") !== "up") {
              commit(tile, false);
            }
          }
        });
      },
      { threshold: [0, ENTER_RATIO], rootMargin: "0px 0px -60px 0px" },
    );

    // Hide while scrolling up: only once a tile is well clear of the
    // viewport (not just past its entry edge), so scrolling up a little
    // right after a reveal doesn't immediately hide it again. Positive
    // rootMargin *grows* the root outward past the real viewport edges —
    // a tile only counts as "not intersecting" once it's fully past that
    // grown boundary, i.e. a real 20%-of-viewport distance beyond the
    // actual edge, not merely touching the edge itself.
    var farIO = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) commit(entry.target, false);
        });
      },
      { threshold: 0, rootMargin: "20% 0px 20% 0px" },
    );

    return {
      observe: function (tile) {
        edgeIO.observe(tile);
        farIO.observe(tile);
      },
    };
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
