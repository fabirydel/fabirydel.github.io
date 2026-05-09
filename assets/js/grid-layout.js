// Round-robin masonry layout for .portfolio-grid.
//
// CSS multi-column tries to balance column heights, which can leave a column
// completely empty when items have very uneven aspect ratios (e.g. one tall
// portrait + several landscapes). This script rebuilds the grid as a flex
// container with one .grid-col element per visible column and distributes
// tiles round-robin: item i → column (i % N).
//
// As a result, whenever `photo_count >= column_count`, every column is
// guaranteed to receive at least one photo, regardless of item heights.
// When `photo_count < column_count`, the trailing columns sit empty (which
// the user explicitly asked for).
//
// Breakpoints mirror _sass/portfolio.scss so visual column counts match the
// fallback multi-column path 1:1.

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

  // Pull every photo-tile out of the grid (whether they're at the top level
  // — first run — or nested inside .grid-col — subsequent runs after a
  // resize), then rebuild the grid with N column wrappers and slot tiles
  // round-robin.
  function redistribute(grid) {
    var tiles = Array.from(grid.querySelectorAll('.photo-tile'));
    if (tiles.length === 0) {
      grid.classList.add('js-grid');
      return;
    }

    var cols = getColumnCount();

    // If the grid is already laid out for this count, nothing to do.
    if (grid.classList.contains('js-grid')
        && grid.dataset.layoutCols === String(cols)) {
      return;
    }

    // Detach tiles (innerHTML clears children but JS references stay alive
    // and keep their listeners + state intact).
    grid.innerHTML = '';
    grid.classList.add('js-grid');
    grid.dataset.layoutCols = String(cols);

    // Build column wrappers.
    var colEls = [];
    for (var i = 0; i < cols; i++) {
      var c = document.createElement('div');
      c.className = 'grid-col';
      grid.appendChild(c);
      colEls.push(c);
    }

    // Round-robin distribute.
    for (var j = 0; j < tiles.length; j++) {
      colEls[j % cols].appendChild(tiles[j]);
    }
  }

  function redistributeAll() {
    document.querySelectorAll('.portfolio-grid').forEach(redistribute);
  }

  // Debounced resize handler — re-distribute only when crossing a breakpoint
  // changes the column count.
  var resizeTimer = null;
  function onResize() {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(redistributeAll, 120);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', redistributeAll);
  } else {
    redistributeAll();
  }
  window.addEventListener('resize', onResize, { passive: true });
})();
