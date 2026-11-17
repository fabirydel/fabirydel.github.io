// Dev-only: add or remove a photo from collections, straight from any
// photo on the site.
//
// Every photo tile (.photo-tile[data-photo-path], and the prints on a
// collection page) gets a small "collections" button next to the portfolio
// checkbox. Clicking it opens a menu listing every collection, ticked where
// the photo already belongs; clicking a row adds or removes the photo, and
// "Remove from all" clears it everywhere. Each change edits the `images:`
// list of _collections/<name>.html in place through window.devFiles
// (assets/js/dev-files.js).
//
// The list of collections (and which photos they hold) is inlined by
// head.html as window.__collections. Because Jekyll takes a while to
// rebuild, the menu re-reads the actual files every time it opens.
//
// Loaded only on dev builds, and only active on localhost.

(function () {
  'use strict';

  var h = window.location.hostname;
  var isLocal = h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0' || h.endsWith('.local');
  if (!isLocal || !window.devFiles || !Array.isArray(window.__collections)) return;

  var current = window.__currentCollection || null;
  var collections = window.__collections.map(function (c) {
    return { slug: c.slug, title: c.title || c.slug, images: new Set(c.images || []) };
  });
  // The collection being viewed goes first.
  collections.sort(function (a, b) {
    return (b.slug === current) - (a.slug === current) || a.title.localeCompare(b.title);
  });

  var TILE_SELECTOR = '.photo-tile[data-photo-path], .cx-photo[data-photo-path]';
  var ICON =
    '<svg viewBox="0 0 16 16" aria-hidden="true">' +
    '<rect x="2" y="5.5" width="9" height="8" rx="1.2"/>' +
    '<path d="M5 3h8a1 1 0 0 1 1 1v7"/></svg>';

  function fileOf(slug) { return '_collections/' + slug + '.html'; }

  function memberships(path) {
    return collections.filter(function (c) { return c.images.has(path); });
  }

  // ------------------------------------------------------------------
  // Editing the `images:` list of a collection file
  // ------------------------------------------------------------------
  function unquote(s) {
    var m = s.match(/^(["'])(.*)\1$/);
    return m ? m[2] : s;
  }

  // -> { lines, end, start, items: [{ line, path }] }; start is -1 when the
  // front matter has no `images:` key. Null if there is no front matter.
  function parse(text) {
    var lines = text.split('\n');
    if (lines[0].trim() !== '---') return null;
    var end = -1;
    for (var i = 1; i < lines.length; i++) {
      if (lines[i].trim() === '---') { end = i; break; }
    }
    if (end === -1) return null;
    var out = { lines: lines, end: end, start: -1, items: [] };
    for (var k = 1; k < end; k++) {
      if (/^images:\s*$/.test(lines[k])) {
        out.start = k;
        for (var j = k + 1; j < end; j++) {
          var m = lines[j].match(/^\s+-\s+(.*?)\s*$/);
          if (!m) break;
          out.items.push({ line: j, path: unquote(m[1]) });
        }
        break;
      }
    }
    return out;
  }

  function imagesIn(text) {
    var p = parse(text);
    return new Set(p ? p.items.map(function (it) { return it.path; }) : []);
  }

  function addImage(text, path) {
    var p = parse(text);
    if (!p) throw new Error('The collection file has no front matter.');
    if (p.items.some(function (it) { return it.path === path; })) return text;
    var entry = '  - ' + JSON.stringify(path);
    if (p.start === -1) p.lines.splice(p.end, 0, 'images:', entry);
    else p.lines.splice(p.items.length ? p.items[p.items.length - 1].line + 1 : p.start + 1, 0, entry);
    return p.lines.join('\n');
  }

  function removeImage(text, path) {
    var p = parse(text);
    if (!p) throw new Error('The collection file has no front matter.');
    var drop = p.items.filter(function (it) { return it.path === path; }).map(function (it) { return it.line; });
    if (!drop.length) return text;
    return p.lines.filter(function (_, i) { return drop.indexOf(i) === -1; }).join('\n');
  }

  // One write at a time, so quick clicks cannot interleave.
  var queue = Promise.resolve();

  function setMembership(col, path, want) {
    var run = function () {
      return window.devFiles.read(fileOf(col.slug)).then(function (text) {
        if (text === null) throw new Error(fileOf(col.slug) + ' was not found.');
        var next = want ? addImage(text, path) : removeImage(text, path);
        col.images = imagesIn(next);
        if (next !== text) return window.devFiles.write(fileOf(col.slug), next);
      });
    };
    queue = queue.then(run, run);
    return queue;
  }

  // Bring the in-memory lists in line with the files on disk.
  function refreshFromDisk() {
    return Promise.all(collections.map(function (c) {
      return window.devFiles.read(fileOf(c.slug)).then(function (text) {
        if (text !== null) c.images = imagesIn(text);
      });
    }));
  }

  // ------------------------------------------------------------------
  // Buttons on the tiles
  // ------------------------------------------------------------------
  function updateButton(tile) {
    var btn = tile.querySelector(':scope > .ct-toggle');
    if (!btn) return;
    var path = tile.dataset.photoPath;
    var count = memberships(path).length;
    btn.classList.toggle('is-in', count > 0);
    btn.setAttribute('aria-label', count ? 'In ' + count + ' collection' + (count > 1 ? 's' : '') + ' (change)' : 'Add to a collection');
    btn.title = btn.getAttribute('aria-label');
    if (current) {
      var col = collections.filter(function (c) { return c.slug === current; })[0];
      tile.classList.toggle('ct-removed', !!col && !col.images.has(path));
    }
  }

  function updateAllFor(path) {
    document.querySelectorAll(TILE_SELECTOR).forEach(function (tile) {
      if (tile.dataset.photoPath === path) updateButton(tile);
    });
  }

  function attach(tile) {
    if (tile.querySelector(':scope > .ct-toggle')) return;
    if (!tile.dataset.photoPath) return;

    // A span, not a button: the tiles themselves are buttons.
    var btn = document.createElement('span');
    btn.className = 'ct-toggle';
    btn.setAttribute('role', 'button');
    btn.setAttribute('tabindex', '0');
    btn.setAttribute('aria-haspopup', 'menu');
    btn.innerHTML = ICON;

    // Keep the tile from opening the photo (or starting a drag).
    ['mousedown', 'pointerdown', 'touchstart'].forEach(function (type) {
      btn.addEventListener(type, function (e) { e.stopPropagation(); }, { passive: true });
    });
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (menu && menuFor === btn) closeMenu();
      else openMenu(btn, tile);
    });
    btn.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      e.stopPropagation();
      openMenu(btn, tile);
    });

    tile.appendChild(btn);
    updateButton(tile);
  }

  function attachAll(root) {
    if (root.matches && root.matches(TILE_SELECTOR)) attach(root);
    if (root.querySelectorAll) root.querySelectorAll(TILE_SELECTOR).forEach(attach);
  }

  // ------------------------------------------------------------------
  // The menu
  // ------------------------------------------------------------------
  var menu = null;
  var menuFor = null;
  var menuTile = null;

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function renderMenu() {
    if (!menu) return;
    var path = menuTile.dataset.photoPath;
    var inAny = memberships(path).length > 0;
    var rows = collections.map(function (c) {
      var on = c.images.has(path);
      return '<button type="button" class="ct-menu__item" role="menuitemcheckbox" aria-checked="' + on +
        '" data-slug="' + esc(c.slug) + '"><span class="ct-menu__check" aria-hidden="true"></span>' +
        '<span class="ct-menu__name">' + esc(c.title) + '</span>' +
        (c.slug === current ? '<em>this page</em>' : '') + '</button>';
    }).join('');
    menu.innerHTML =
      '<div class="ct-menu__head">Collections</div>' +
      '<div class="ct-menu__list">' + (rows || '<p class="ct-menu__empty">No collections yet.</p>') + '</div>' +
      '<div class="ct-menu__foot">' +
      '<button type="button" class="ct-menu__action" data-remove-all' + (inAny ? '' : ' disabled') + '>Remove from all</button>' +
      '<a class="ct-menu__action" href="/collections/edit/">New collection…</a></div>';
  }

  function placeMenu() {
    if (!menu || !menuFor) return;
    var r = menuFor.getBoundingClientRect();
    var mw = menu.offsetWidth;
    var mh = menu.offsetHeight;
    var left = Math.min(Math.max(8, r.right - mw), window.innerWidth - mw - 8);
    var top = r.bottom + 6;
    if (top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 6);
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
  }

  function openMenu(btn, tile) {
    closeMenu();
    menuFor = btn;
    menuTile = tile;
    menu = document.createElement('div');
    menu.className = 'ct-menu';
    menu.setAttribute('role', 'menu');
    document.body.appendChild(menu);
    btn.classList.add('is-open');
    renderMenu();
    placeMenu();

    menu.addEventListener('click', onMenuClick);

    // The page may be older than the files: check the real lists.
    var mine = menu;
    refreshFromDisk().then(function () {
      if (menu !== mine) return;
      renderMenu();
      placeMenu();
      updateAllFor(tile.dataset.photoPath);
    }, function (err) {
      console.warn('[collection-toggle] could not read the collection files', err);
    });
  }

  function closeMenu() {
    if (!menu) return;
    menu.remove();
    if (menuFor) menuFor.classList.remove('is-open');
    menu = null;
    menuFor = null;
    menuTile = null;
  }

  function fail(err) {
    console.error('[collection-toggle]', err);
    // Shown in the menu itself: native alert() is disabled in some browsers.
    var msg = 'Could not update the collection: ' + (err && err.message ? err.message : err);
    if (menu) {
      var box = document.createElement('p');
      box.className = 'ct-menu__error';
      box.textContent = msg;
      menu.appendChild(box);
      placeMenu();
    } else {
      alert(msg);
    }
  }

  function onMenuClick(e) {
    e.stopPropagation();
    var path = menuTile.dataset.photoPath;
    var mine = menu;

    function done() {
      updateAllFor(path);
      if (menu === mine) { renderMenu(); placeMenu(); }
    }

    var item = e.target.closest('.ct-menu__item');
    if (item) {
      var col = collections.filter(function (c) { return c.slug === item.dataset.slug; })[0];
      if (!col || item.dataset.pending) return;
      item.dataset.pending = '1';
      setMembership(col, path, !col.images.has(path)).then(done, function (err) { done(); fail(err); });
      return;
    }

    var all = e.target.closest('[data-remove-all]');
    if (all && !all.disabled) {
      all.disabled = true;
      Promise.all(memberships(path).map(function (c) { return setMembership(c, path, false); }))
        .then(done, function (err) { done(); fail(err); });
    }
  }

  document.addEventListener('pointerdown', function (e) {
    if (!menu) return;
    if (menu.contains(e.target) || (menuFor && menuFor.contains(e.target))) return;
    closeMenu();
  }, true);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && menu) { e.stopPropagation(); closeMenu(); }
  }, true);
  window.addEventListener('scroll', function () { if (menu) placeMenu(); }, { passive: true });
  window.addEventListener('resize', closeMenu);

  // ------------------------------------------------------------------
  // Boot: existing tiles now, later ones (the collection page builds its
  // prints in JS) as they appear.
  // ------------------------------------------------------------------
  attachAll(document);
  new MutationObserver(function (records) {
    records.forEach(function (rec) {
      rec.addedNodes.forEach(function (node) {
        if (node.nodeType === 1) attachAll(node);
      });
    });
  }).observe(document.body, { childList: true, subtree: true });
})();
