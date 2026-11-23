// Dev-only: choose a location's cover image from any of its photos.
//
// Every photo tile on a country page (the chapters, one per location) gets a
// small star in its top-left corner. Clicking it makes that photo the cover of its place:
// it rewrites `indexImagePath:` in _locations/<place>.html through
// window.devFiles (assets/js/dev-files.js). A filled star marks the photo
// that is the cover now.
//
// The current covers are inlined by head.html as window.__covers. Jekyll
// takes a few seconds to rebuild, so pins and cards on already-open pages
// only update after a reload.
//
// Loaded only on dev builds, and only active on localhost.

(function () {
  'use strict';

  var h = window.location.hostname;
  var isLocal = h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0' || h.endsWith('.local');
  if (!isLocal || !window.devFiles) return;

  var covers = window.__covers || {};
  var TILE_SELECTOR = '.country-chapter .photo-tile[data-photo-path]';
  var STAR = '<svg viewBox="0 0 16 16" aria-hidden="true">' +
    '<path d="M8 1.8l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6z"/></svg>';

  // "bariloche/IMG_1.jpg"
  function pathOf(tile) { return tile.dataset.photoPath || ''; }
  function placeOf(path) { return path.split('/')[0]; }

  // ------------------------------------------------------------------
  // Editing the front matter
  // ------------------------------------------------------------------
  function quote(s) {
    return /[:#'"{}\[\],&*!|>%@`]|^\s|\s$/.test(s) ? JSON.stringify(s) : s;
  }

  function withCover(text, path) {
    var lines = text.split('\n');
    if (lines[0].trim() !== '---') return null;
    var end = -1;
    for (var i = 1; i < lines.length; i++) {
      if (lines[i].trim() === '---') { end = i; break; }
    }
    if (end === -1) return null;
    var value = 'indexImagePath: ' + quote(path);
    for (var k = 1; k < end; k++) {
      if (/^indexImagePath:/.test(lines[k])) { lines[k] = value; return lines.join('\n'); }
    }
    var after = 1;
    for (var j = 1; j < end; j++) if (/^namePath:/.test(lines[j])) after = j + 1;
    lines.splice(after, 0, value);
    return lines.join('\n');
  }

  // ------------------------------------------------------------------
  // Feedback
  // ------------------------------------------------------------------
  var toast = null, toastTimer = 0;
  function say(msg, bad) {
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'cv-toast';
      toast.setAttribute('role', 'status');
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.toggle('is-bad', !!bad);
    toast.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove('is-on'); }, bad ? 6000 : 3200);
  }

  // ------------------------------------------------------------------
  // Buttons
  // ------------------------------------------------------------------
  function paint(tile) {
    var btn = tile.querySelector(':scope > .cv-toggle');
    if (!btn) return;
    var path = pathOf(tile);
    var isCover = !!path && covers[placeOf(path)] === path;
    btn.classList.toggle('is-cover', isCover);
    btn.setAttribute('aria-pressed', isCover ? 'true' : 'false');
    var label = isCover ? 'This is the cover image' : 'Use as the cover image';
    btn.setAttribute('aria-label', label);
    btn.title = label;
  }

  function paintAll() {
    document.querySelectorAll(TILE_SELECTOR).forEach(paint);
  }

  async function setCover(tile) {
    var path = pathOf(tile);
    var place = placeOf(path);
    if (!path || covers[place] === path) return;
    var file = '_locations/' + place + '.html';
    try {
      var text = await window.devFiles.read(file);
      if (text === null) throw new Error(file + ' was not found');
      var next = withCover(text, path);
      if (next === null) throw new Error('No front matter in ' + file);
      if (next !== text) await window.devFiles.write(file, next);
      covers[place] = path;
      paintAll();
      say('Cover of ' + place.replace(/_/g, ' ') + ' set. Reload in a few seconds to see it on the pins.');
    } catch (err) {
      say('Could not set the cover: ' + (err && err.message || err), true);
    }
  }

  function attach(tile) {
    if (tile.querySelector(':scope > .cv-toggle')) return;
    if (!pathOf(tile)) return;
    // A span, not a button: the tiles themselves are buttons.
    var btn = document.createElement('span');
    btn.className = 'cv-toggle';
    btn.setAttribute('role', 'button');
    btn.setAttribute('tabindex', '0');
    btn.innerHTML = STAR;
    ['mousedown', 'pointerdown', 'touchstart'].forEach(function (type) {
      btn.addEventListener(type, function (e) { e.stopPropagation(); }, { passive: true });
    });
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      setCover(tile);
    });
    btn.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      e.stopPropagation();
      setCover(tile);
    });
    tile.appendChild(btn);
    paint(tile);
  }

  function attachAll(root) {
    if (root.matches && root.matches(TILE_SELECTOR)) attach(root);
    if (root.querySelectorAll) root.querySelectorAll(TILE_SELECTOR).forEach(attach);
  }

  attachAll(document);
  new MutationObserver(function (records) {
    records.forEach(function (rec) {
      rec.addedNodes.forEach(function (node) {
        if (node.nodeType === 1) attachAll(node);
      });
    });
  }).observe(document.body, { childList: true, subtree: true });
})();
