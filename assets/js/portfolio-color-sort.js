// Sort the home Portfolio gallery (and its modal slides) by image colour so
// the page reads as a smooth spectrum starting from blue.
//
// Hue progression (key direction):
//   240° (blue) → 180° (cyan) → 120° (green) → 60° (yellow)
//                              → 0° (red)   → 300° (magenta) → back to blue.
//
// Implementation:
//   1. After grid-layout's pass 1, find every .photo-tile in the
//      .portfolio-grid.
//   2. For each tile, load its blur image (already loaded by CSS as
//      background-image, so this is a cache hit) into a 1×1 canvas. The
//      browser's downscale gives us the area-weighted average colour for
//      free.
//   3. Convert RGB → HSL, take a sort key that starts at 0 for blue and
//      walks through the spectrum.
//   4. Sort tiles + modal slides identically, then rewrite the onclick
//      indices so openModal(N) still maps tile N → slide N.
//   5. Tell grid-layout to redistribute round-robin again with the new
//      order, and rebalance.
//
// Runs only when both #myPortfolioModal and a .portfolio-grid exist on the
// page (i.e. the home portfolio page).

(function () {
  'use strict';

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var l = (max + min) / 2;
    var h = 0, s = 0;
    if (max !== min) {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r)      h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
      else if (max === g) h = ((b - r) / d + 2) * 60;
      else                h = ((r - g) / d + 4) * 60;
    }
    return { h: h, s: s, l: l };
  }

  // Distance from blue (240°) walking through the spectrum.
  function colorSortKey(rgb) {
    var hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    return (240 - hsl.h + 360) % 360;
  }

  function getBlurUrl(tile) {
    var style = tile.getAttribute('style') || '';
    var m = style.match(/url\(['"]?([^'")]+)['"]?\)/);
    return m ? m[1] : null;
  }

  function averageColor(url) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        try {
          var canvas = document.createElement('canvas');
          canvas.width = 1;
          canvas.height = 1;
          var ctx = canvas.getContext('2d');
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, 1, 1);
          var d = ctx.getImageData(0, 0, 1, 1).data;
          resolve({ r: d[0], g: d[1], b: d[2] });
        } catch (e) {
          // getImageData can throw on tainted canvas; for same-origin
          // images we should be fine, but resolve(null) just in case.
          resolve(null);
        }
      };
      img.onerror = function () { resolve(null); };
      img.src = url;
    });
  }

  function sortPortfolio() {
    var grid = document.querySelector('.portfolio-grid');
    var modal = document.getElementById('myPortfolioModal');
    if (!grid || !modal) return Promise.resolve(false);

    // Tiles in their canonical (Liquid-iteration) order. After grid-layout's
    // pass 1, tiles are nested inside .grid-col elements; we sort by the
    // openModal(N) index to recover the original order.
    var tiles = Array.from(grid.querySelectorAll('.photo-tile'));
    var slides = Array.from(modal.querySelectorAll('.slide'));
    if (tiles.length === 0 || tiles.length !== slides.length) {
      return Promise.resolve(false);
    }

    function originalIndex(tile) {
      var oc = tile.getAttribute('onclick') || '';
      var m = oc.match(/openModal\((\d+)/);
      return m ? parseInt(m[1], 10) : 0;
    }
    tiles.sort(function (a, b) { return originalIndex(a) - originalIndex(b); });

    // Compute the colour key for each (in original order). Blur images are
    // already in the HTTP cache from CSS background-image, so this is fast.
    return Promise.all(tiles.map(function (tile) {
      var url = getBlurUrl(tile);
      if (!url) return Promise.resolve({ tile: tile, key: 9999 });
      return averageColor(url).then(function (rgb) {
        return { tile: tile, key: rgb ? colorSortKey(rgb) : 9999 };
      });
    })).then(function (entries) {
      // Build a permutation: for each new position k, which original index
      // should the tile (and slide) come from?
      entries.forEach(function (e, i) { e.originalIdx = i; });
      entries.sort(function (a, b) {
        if (a.key !== b.key) return a.key - b.key;
        return a.originalIdx - b.originalIdx; // stable
      });

      // Reorder tiles back into the grid as a flat list. grid-layout will
      // redistribute them into .grid-col wrappers afterwards.
      grid.innerHTML = '';
      entries.forEach(function (e, newIdx) {
        // Update onclick so it points at the slide that will land at this
        // same new position.
        var oc = e.tile.getAttribute('onclick') || '';
        e.tile.setAttribute('onclick',
          oc.replace(/openModal\(\d+/, 'openModal(' + newIdx));
        grid.appendChild(e.tile);
      });

      // Reorder modal slides identically.
      // Insert before the prev/next arrows so they stay at the end.
      var modalContent = modal.querySelector('.modal-content');
      var prevBtn = modalContent.querySelector('.prev');
      slides.forEach(function (s) { s.parentNode && s.parentNode.removeChild(s); });
      entries.forEach(function (e) {
        var slide = slides[e.originalIdx];
        modalContent.insertBefore(slide, prevBtn);
      });

      // Mark and signal to grid-layout that the order changed.
      grid.classList.remove('js-grid');
      delete grid.dataset.layoutCols;
      delete grid.dataset.layoutRebalanced;

      if (typeof window.__refreshGridLayout === 'function') {
        window.__refreshGridLayout();
      }
      return true;
    });
  }

  function init() {
    if (!document.getElementById('myPortfolioModal')) return;
    if (!document.querySelector('.portfolio-grid')) return;
    // Run after grid-layout's first pass so we don't race with it.
    // We're loaded with `defer` and listed AFTER grid-layout.js in head.html,
    // so DOMContentLoaded for us fires after grid-layout's listener has run.
    sortPortfolio();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
