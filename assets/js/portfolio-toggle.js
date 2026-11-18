// Dev-only: per-tile portfolio toggle.
//
// Adds a small button to every .photo-tile[data-photo-path] that:
//   - Shows a slim white checkmark in a green pill if the photo is currently
//     in _data/portfolio.yml (always visible on non-portfolio pages, hover-
//     only on the portfolio page where every tile is in-portfolio anyway).
//   - Shows an empty outlined checkbox on hover if the photo is NOT in
//     portfolio.yml.
//   - On click, toggles state: writes _data/portfolio.yml in-place through
//     window.devFiles (assets/js/dev-files.js).
//   - On the portfolio page, un-checking also removes the tile and the
//     corresponding modal slide from the DOM in real time and re-runs the
//     grid layout — no full page reload required.
//
// This file is only loaded on dev builds (jekyll.environment != 'production'
// gate in head.html) and additionally guards on hostname so a dev build
// previewed over LAN doesn't expose the toggle either.

(function () {
  'use strict';

  // Hostname guard — dev builds may be served over LAN, where we still want
  // the feature off. Only run on localhost-ish.
  var h = window.location.hostname;
  var isLocal = h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0' || h.endsWith('.local');
  if (!isLocal) return;

  // File access goes through assets/js/dev-files.js: the dev server writes
  // the file itself when it can (any port, no prompt), with the File System
  // Access API as the fallback.
  if (!window.devFiles) {
    console.warn('[portfolio-toggle] dev-files.js not loaded — toggle disabled.');
    return;
  }

  // --------------------------------------------------------------------
  // YAML edits for portfolio.yml.
  // --------------------------------------------------------------------

  function parsePortfolioPaths(yamlText) {
    var paths = new Set();
    var lines = yamlText.split('\n');
    for (var i = 0; i < lines.length; i++) {
      var m = lines[i].match(/^-\s+path:\s*(.+?)\s*$/);
      if (m) paths.add(stripQuotes(m[1].trim()));
    }
    return paths;
  }

  function stripQuotes(s) {
    return s.replace(/^["']|["']$/g, '');
  }

  // Remove the entry whose `path:` matches `path`. An entry is the run of
  // lines from the `- path:` line through the indented properties up to
  // the next entry start (`- `), the next comment (`#`), or a blank line.
  // Trailing blank line that separated this entry from the next is also
  // collapsed to keep the file tidy.
  function removePortfolioEntry(yamlText, path) {
    var lines = yamlText.split('\n');
    var out = [];
    var removing = false;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (removing) {
        if (/^- /.test(line) || /^#/.test(line)) {
          removing = false;
          out.push(line);
          continue;
        }
        if (line.trim() === '') {
          // Drop the trailing blank that belonged to this entry; the next
          // entry's preceding blank is preserved by virtue of being there
          // before this one's `- path:` line.
          removing = false;
          continue;
        }
        // Indented property line — skip.
        continue;
      }
      var m = line.match(/^-\s+path:\s*(.+?)\s*$/);
      if (m && stripQuotes(m[1].trim()) === path) {
        removing = true;
        // Keep the preceding blank line as the separator between the
        // previous and next entries; the trailing blank gets dropped
        // inside the `if (removing)` branch above. Net result: one
        // blank line still separates whoever was before from whoever
        // is after — same shape as the rest of the file.
        continue;
      }
      out.push(line);
    }
    return out.join('\n');
  }

  function addPortfolioEntry(yamlText, entry) {
    var text = yamlText.replace(/\n+$/, '');
    text += '\n\n';
    text += '- path: ' + entry.path + '\n';
    text += '  title: ' + (entry.title || entry.place || '') + '\n';
    text += '  place: ' + (entry.place || '') + '\n';
    text += '  location: ' + (entry.location || '') + '\n';
    text += '  country: ' + (entry.country || '') + '\n';
    return text;
  }

  // --------------------------------------------------------------------
  // UI: inject toggle buttons.
  // --------------------------------------------------------------------

  // The portfolio page wraps its grid in .portfolio-wrapper (see
  // _layouts/portfolio.html); use that as our detector.
  var isPortfolioPage = !!document.querySelector('.portfolio-wrapper .portfolio-grid');

  // Initial portfolio set rendered server-side in head.html.
  var portfolioPaths =
    (window.__portfolioPaths instanceof Set) ? new Set(window.__portfolioPaths) :
    Array.isArray(window.__portfolioPaths) ? new Set(window.__portfolioPaths) :
    new Set();

  var CHECKMARK_SVG =
    '<svg viewBox="0 0 16 16" aria-hidden="true">' +
    '<polyline points="3,8 7,12 13,4"/></svg>';

  var ENLARGE_SVG =
    '<svg viewBox="0 0 16 16" aria-hidden="true">' +
    '<path d="M5.5 1.5h-4v4M10.5 1.5h4v4M5.5 14.5h-4v-4M10.5 14.5h4v-4"/></svg>';

  var SHRINK_SVG =
    '<svg viewBox="0 0 16 16" aria-hidden="true">' +
    '<path d="M1.5 5.5h4v-4M14.5 5.5h-4v-4M1.5 10.5h4v4M14.5 10.5h-4v4"/></svg>';

  function attachToggle(tile) {
    if (tile.querySelector(':scope > .pt-toggle')) return; // already wired

    var path = tile.dataset.photoPath;
    if (!path) return;

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pt-toggle';
    btn.innerHTML = CHECKMARK_SVG;
    updateAria(btn, portfolioPaths.has(path));

    if (portfolioPaths.has(path)) tile.classList.add('in-portfolio');

    // Stop the click from triggering the tile's openModal.
    btn.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      togglePath(tile, btn);
    });

    tile.appendChild(btn);
  }

  function updateAria(btn, isIn) {
    btn.setAttribute(
      'aria-label',
      isIn ? 'Remove from portfolio' : 'Add to portfolio'
    );
    btn.setAttribute('aria-pressed', isIn ? 'true' : 'false');
  }

  function attachToAll() {
    document.querySelectorAll('.photo-tile[data-photo-path]').forEach(attachToggle);
    // "Enlarge in grid" only means something on the home page's own grid —
    // that's the only place tile size is actually laid out (see
    // curated-grid.js). Elsewhere a tile's grid isn't the curated one.
    if (isPortfolioPage) {
      document.querySelectorAll('.photo-tile[data-photo-path]').forEach(attachSizeToggle);
    }
  }

  // --------------------------------------------------------------------
  // Size (enlarge/shrink) toggle — home page only.
  // --------------------------------------------------------------------

  function attachSizeToggle(tile) {
    if (tile.querySelector(':scope > .pt-size-toggle')) return; // already wired
    var path = tile.dataset.photoPath;
    if (!path) return;

    var isLarge = tile.classList.contains('photo-tile--large');
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pt-size-toggle';
    btn.innerHTML = isLarge ? SHRINK_SVG : ENLARGE_SVG;
    updateSizeAria(btn, isLarge);

    btn.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      toggleSize(tile, btn);
    });

    tile.appendChild(btn);
  }

  function updateSizeAria(btn, isLarge) {
    btn.setAttribute('aria-label', isLarge ? 'Shrink to regular size' : 'Enlarge in grid');
    btn.setAttribute('aria-pressed', isLarge ? 'true' : 'false');
  }

  function setSizeVisual(tile, btn, isLarge) {
    tile.classList.toggle('photo-tile--large', isLarge);
    btn.innerHTML = isLarge ? SHRINK_SVG : ENLARGE_SVG;
    updateSizeAria(btn, isLarge);

    // Enlarged tiles are shown at up to 2x the usual width — swap to the
    // full-resolution image so they don't look soft.
    var thumb = tile.querySelector('.thumb');
    var path = tile.dataset.photoPath;
    if (thumb && path) {
      thumb.src = '/images/' + (isLarge ? 'full' : 'thumb') + '/' + path;
    }
  }

  function toggleSize(tile, btn) {
    var path = tile.dataset.photoPath;
    var wasLarge = tile.classList.contains('photo-tile--large');
    var makeLarge = !wasLarge;

    btn.dataset.pending = '1';
    btn.disabled = true;

    // Optimistic: flip immediately and re-layout in real time, then persist
    // in the background. Revert both on write failure.
    setSizeVisual(tile, btn, makeLarge);
    tile.classList.add('pt-size-pulse');
    setTimeout(function () { tile.classList.remove('pt-size-pulse'); }, 300);
    if (typeof window.__refreshGridLayout === 'function') window.__refreshGridLayout();

    writeSizeToggle(path, makeLarge)
      .then(function () {
        btn.disabled = false;
        delete btn.dataset.pending;
      })
      .catch(function (err) {
        console.error('[portfolio-toggle]', err);
        setSizeVisual(tile, btn, wasLarge);
        if (typeof window.__refreshGridLayout === 'function') window.__refreshGridLayout();
        btn.disabled = false;
        delete btn.dataset.pending;
        alert('Could not update portfolio.yml:\n' + (err && err.message ? err.message : err));
      });
  }

  // Add/remove a trailing `large: true` line within the entry for `path`,
  // mirroring how `landscape: true` already appears as an optional field.
  function toggleLargeField(yamlText, path, makeLarge) {
    var lines = yamlText.split('\n');
    var out = [];
    var inEntry = false;
    var entryHasLarge = false;

    function flushBoundary(boundaryLine) {
      if (makeLarge && !entryHasLarge) out.push('  large: true');
      inEntry = false;
      if (boundaryLine !== null) out.push(boundaryLine);
    }

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var m = line.match(/^-\s+path:\s*(.+?)\s*$/);
      if (m) {
        if (inEntry) flushBoundary(null); // shouldn't normally happen before a boundary, but stay safe
        inEntry = stripQuotes(m[1].trim()) === path;
        entryHasLarge = false;
        out.push(line);
        continue;
      }
      if (inEntry && (/^- /.test(line) || /^#/.test(line) || line.trim() === '')) {
        flushBoundary(line);
        continue;
      }
      if (inEntry && /^\s*large:\s*true\s*$/.test(line)) {
        entryHasLarge = true;
        if (makeLarge) out.push(line); // keep as-is
        continue; // drop when un-enlarging
      }
      out.push(line);
    }
    if (inEntry) flushBoundary(null); // entry ran to end of file
    return out.join('\n');
  }

  function writeSizeToggle(path, makeLarge) {
    return updatePortfolioYaml(function (currentText) {
      return toggleLargeField(currentText, path, makeLarge);
    });
  }

  // --------------------------------------------------------------------
  // Toggle handler.
  // --------------------------------------------------------------------

  function togglePath(tile, btn) {
    var path = tile.dataset.photoPath;
    var wasIn = tile.classList.contains('in-portfolio');

    btn.dataset.pending = '1';
    btn.disabled = true;

    // Optimistic visual flip — except on the portfolio page when removing,
    // because there we'd rather hold the visual until the write succeeds
    // (we'll then animate the tile out).
    var doDomRemoval = isPortfolioPage && wasIn;
    if (!doDomRemoval) {
      tile.classList.toggle('in-portfolio');
      updateAria(btn, !wasIn);
    }

    writeToggle(path, wasIn, tile)
      .then(function () {
        if (wasIn) {
          portfolioPaths.delete(path);
        } else {
          portfolioPaths.add(path);
        }

        if (doDomRemoval) {
          removeFromPortfolioPage(tile);
        }

        btn.disabled = false;
        delete btn.dataset.pending;
      })
      .catch(function (err) {
        console.error('[portfolio-toggle]', err);
        // Revert optimistic flip if we did one.
        if (!doDomRemoval) {
          tile.classList.toggle('in-portfolio');
          updateAria(btn, wasIn);
        }
        btn.disabled = false;
        delete btn.dataset.pending;
        alert('Could not update portfolio.yml:\n' + (err && err.message ? err.message : err));
      });
  }

  function writeToggle(path, wasIn, tile) {
    return updatePortfolioYaml(function (currentText) {
      if (wasIn) return removePortfolioEntry(currentText, path);
      return addPortfolioEntry(currentText, {
        path: path,
        title: tile.dataset.photoPlace || '',
        place: tile.dataset.photoPlace || '',
        location: tile.dataset.photoLocation || '',
        country: tile.dataset.photoCountry || '',
      });
    });
  }

  // Reads portfolio.yml, applies `transform` to its text, writes the result
  // back, then touches portfolio.html.
  function updatePortfolioYaml(transform) {
    var file = '_data/portfolio.yml';
    return window.devFiles.read(file).then(function (currentText) {
      if (currentText === null) throw new Error(file + ' was not found.');
      return window.devFiles.write(file, transform(currentText));
    }).then(function () {
      // Nudge Jekyll into a full rebuild. Editing _data/portfolio.yml
      // alone *should* trigger a rebuild, but in practice the watcher
      // sometimes misses rapid bursts (we hit this on the upload
      // wizard too). Touching portfolio.html makes sure the portfolio
      // page gets regenerated so the user sees their toggle on next reload.
      return window.devFiles.touch('portfolio.html');
    });
  }

  // --------------------------------------------------------------------
  // Real-time DOM removal on the portfolio page.
  // --------------------------------------------------------------------

  function removeFromPortfolioPage(tile) {
    var grid = tile.closest('.portfolio-grid');
    var modal = document.getElementById('myPortfolioModal');
    if (!grid) { tile.remove(); return; }

    // Find this tile's modal-slide index (= its openModal(N) argument).
    var oc = tile.getAttribute('onclick') || '';
    var mm = oc.match(/openModal\((\d+)/);
    var slideIdx = mm ? parseInt(mm[1], 10) : -1;

    // Animate the tile out, then remove.
    tile.classList.add('is-removing');
    setTimeout(function () {
      tile.parentNode && tile.parentNode.removeChild(tile);

      // Remove the matching modal slide and renumber siblings whose
      // openModal index is greater than ours.
      if (modal && slideIdx >= 0) {
        var slides = modal.querySelectorAll('.slide');
        if (slides[slideIdx] && slides[slideIdx].parentNode) {
          slides[slideIdx].parentNode.removeChild(slides[slideIdx]);
        }
        document.querySelectorAll('.photo-tile[data-photo-path]').forEach(function (t) {
          var oc2 = t.getAttribute('onclick') || '';
          var m2 = oc2.match(/openModal\((\d+),\s*['"]myPortfolioModal['"]\)/);
          if (m2) {
            var idx = parseInt(m2[1], 10);
            if (idx > slideIdx) {
              t.setAttribute('onclick', oc2.replace(/openModal\(\d+/, 'openModal(' + (idx - 1)));
            }
          }
        });
      }

      // Tell grid-layout to redistribute now that one tile is gone.
      if (typeof window.__refreshGridLayout === 'function') {
        window.__refreshGridLayout();
      }
    }, 220);
  }

  // --------------------------------------------------------------------
  // Boot.
  // --------------------------------------------------------------------

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachToAll);
  } else {
    attachToAll();
  }

  // The portfolio page reorders tiles via portfolio-color-sort.js after
  // DOMContentLoaded; the toggle buttons we attached survive the move
  // because the tiles themselves are re-parented (not recreated). New
  // tiles ever introduced (e.g. via a re-render) are picked up via this
  // observer. grid-layout.js's distribute / rebalance passes also fire
  // many DOM mutations in a row, so debounce so we run attachToAll once
  // per burst, not once per child manipulation.
  if ('MutationObserver' in window) {
    var moTimer = null;
    var mo = new MutationObserver(function () {
      if (moTimer) clearTimeout(moTimer);
      moTimer = setTimeout(attachToAll, 60);
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }
})();
