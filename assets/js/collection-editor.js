// Local-only collection editor (/collections/edit/).
//
// Pick an existing collection or start a new one, give it a name, then click
// photos in the library (every photo on the site, grouped by place) to add
// or remove them. The tray on the left shows the collection in order: drag
// to reorder, star to set the cover. "Save" writes _collections/<file>.html
// through window.devFiles (assets/js/dev-files.js). "Download file" is
// there as a manual fallback.

(function () {
  'use strict';

  var dataEl = document.getElementById('ce-data');
  if (!dataEl) return;
  var D = JSON.parse(dataEl.textContent);

  function $(id) { return document.getElementById(id); }
  var pick = $('ce-pick');
  var nameIn = $('ce-name');
  var slugIn = $('ce-slug');
  var slugHint = $('ce-slug-hint');
  var descIn = $('ce-desc');
  var tray = $('ce-tray');
  var countEl = $('ce-count');
  var statusEl = $('ce-status');
  var previewEl = $('ce-preview');
  var library = $('ce-library');
  var searchIn = $('ce-search');
  var countrySel = $('ce-country');
  var onlySelected = $('ce-only-selected');

  // ------------------------------------------------------------------
  // Library index: photos grouped by location folder
  // ------------------------------------------------------------------
  var locMeta = {};
  D.locations.forEach(function (l) { locMeta[l.n] = l; });
  var countryTitle = {};
  D.countries.forEach(function (c) { countryTitle[c.n] = c.t; });

  function pretty(slug) {
    var s = String(slug || '').replace(/_/g, ' ');
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  var groups = {};
  D.photos.forEach(function (p) {
    var loc = p.split('/')[0];
    (groups[loc] = groups[loc] || []).push(p);
  });
  var allPhotos = new Set(D.photos);

  var locs = Object.keys(groups).map(function (n) {
    var meta = locMeta[n] || {};
    var country = meta.c || '';
    return {
      n: n,
      title: meta.t || pretty(n),
      country: country,
      countryTitle: countryTitle[country] || pretty(country) || 'Other',
      photos: groups[n]
    };
  }).sort(function (a, b) {
    return a.countryTitle.localeCompare(b.countryTitle) || a.title.localeCompare(b.title);
  });

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  // ------------------------------------------------------------------
  // State
  // ------------------------------------------------------------------
  var state = { existing: null, title: '', slug: '', description: '', cover: '', images: [] };
  var slugTouched = false;
  var dirty = false;
  var thumbEls = {};

  function slugify(s) {
    return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }

  function setStatus(msg, kind) {
    statusEl.innerHTML = msg || '';
    statusEl.dataset.kind = kind || '';
  }

  function buildFile() {
    var q = JSON.stringify;
    var lines = ['---', 'layout: collection', 'title: ' + q(state.title.trim()), 'name: ' + state.slug];
    if (state.description.trim()) lines.push('description: ' + q(state.description.trim()));
    lines.push('cover: ' + q(state.cover || state.images[0] || ''));
    lines.push('images:');
    state.images.forEach(function (p) { lines.push('  - ' + q(p)); });
    lines.push('---', '');
    return lines.join('\n');
  }

  function problems() {
    var out = [];
    if (!state.title.trim()) out.push('Give the collection a name.');
    if (!state.slug) out.push('The file name is empty.');
    else if (!/^[a-z0-9_]+$/.test(state.slug)) out.push('The file name can only use a-z, 0-9 and _.');
    else if (state.slug === 'edit' || state.slug === 'index') out.push('"' + state.slug + '" is reserved; pick another file name.');
    else if (!state.existing && D.collections.some(function (c) { return c.slug === state.slug; })) {
      out.push('A collection called "' + state.slug + '" already exists. Pick it from the list to edit it.');
    }
    if (!state.images.length) out.push('Add at least one photo.');
    return out;
  }

  // ------------------------------------------------------------------
  // Rendering
  // ------------------------------------------------------------------
  function renderPick() {
    pick.innerHTML = '<option value="">+ New collection</option>' + D.collections.map(function (c) {
      return '<option value="' + esc(c.slug) + '">' + esc(c.title) + ' (' + c.images.length + ')</option>';
    }).join('');
    pick.value = state.existing || '';
  }

  function renderLibrary() {
    var html = locs.map(function (l) {
      return '<section class="ce-loc" data-loc="' + esc(l.n) + '" data-country="' + esc(l.country) + '"' +
        ' data-search="' + esc((l.title + ' ' + l.n + ' ' + l.countryTitle).toLowerCase()) + '">' +
        '<header><h2>' + esc(l.title) + ' <span>' + esc(l.countryTitle) + ' · ' + l.photos.length + '</span></h2>' +
        '<button type="button" class="ce-link" data-add-all="' + esc(l.n) + '">Add all</button></header>' +
        '<div class="ce-grid">' + l.photos.map(function (p) {
          return '<button type="button" class="ce-thumb" data-path="' + esc(p) + '" title="' + esc(p) + '">' +
            '<img src="/images/thumb/' + encodeURI(p) + '" alt="" loading="lazy" decoding="async"></button>';
        }).join('') + '</div></section>';
    }).join('');
    library.innerHTML = html;
    Array.prototype.forEach.call(library.querySelectorAll('.ce-thumb'), function (el) {
      thumbEls[el.dataset.path] = el;
    });

    var seen = {};
    locs.forEach(function (l) {
      if (!l.country || seen[l.country]) return;
      seen[l.country] = true;
      var o = document.createElement('option');
      o.value = l.country;
      o.textContent = l.countryTitle;
      countrySel.appendChild(o);
    });
  }

  function syncThumbs() {
    var inSet = new Set(state.images);
    Object.keys(thumbEls).forEach(function (p) {
      thumbEls[p].classList.toggle('is-in', inSet.has(p));
    });
  }

  function renderTray() {
    countEl.textContent = state.images.length;
    tray.innerHTML = state.images.map(function (p, i) {
      var missing = !allPhotos.has(p);
      return '<div class="ce-item' + (p === state.cover ? ' is-cover' : '') + (missing ? ' is-missing' : '') +
        '" draggable="true" data-i="' + i + '" title="' + esc(p) + (missing ? ' (file not found)' : '') + '">' +
        '<img src="/images/thumb/' + encodeURI(p) + '" alt="" loading="lazy" draggable="false">' +
        '<button type="button" class="ce-star" data-cover="' + i + '" aria-label="Use as cover">★</button>' +
        '<button type="button" class="ce-x" data-remove="' + i + '" aria-label="Remove">×</button></div>';
    }).join('') || '<p class="ce-empty">Click photos on the right to add them.</p>';
  }

  function refresh(opts) {
    if (!state.images.length) state.cover = '';
    else if (state.images.indexOf(state.cover) === -1) state.cover = state.images[0];
    renderTray();
    syncThumbs();
    previewEl.textContent = buildFile();
    slugIn.readOnly = !!state.existing;
    $('ce-delete').hidden = !state.existing;
    slugHint.textContent = state.existing ? 'fixed for an existing collection' : '_collections/' + (state.slug || '…') + '.html';
    if (onlySelected.checked) applyFilters();
    if (!opts || !opts.keepStatus) setStatus('');
  }

  function applyFilters() {
    var q = searchIn.value.trim().toLowerCase();
    var country = countrySel.value;
    var only = onlySelected.checked;
    var inLocs = {};
    if (only) state.images.forEach(function (p) { inLocs[p.split('/')[0]] = true; });
    Array.prototype.forEach.call(library.children, function (sec) {
      var show = (!q || sec.dataset.search.indexOf(q) !== -1) &&
        (!country || sec.dataset.country === country) &&
        (!only || inLocs[sec.dataset.loc]);
      sec.hidden = !show;
    });
  }

  // ------------------------------------------------------------------
  // Loading a collection into the form
  // ------------------------------------------------------------------
  function load(slug) {
    var c = D.collections.filter(function (x) { return x.slug === slug; })[0];
    if (c) {
      state = {
        existing: c.slug,
        title: c.title || '',
        slug: c.slug,
        description: c.description || '',
        cover: c.cover || '',
        images: c.images.slice()
      };
    } else {
      state = { existing: null, title: '', slug: '', description: '', cover: '', images: [] };
    }
    slugTouched = false;
    dirty = false;
    nameIn.value = state.title;
    slugIn.value = state.slug;
    descIn.value = state.description;
    pick.value = state.existing || '';
    refresh();
  }

  function toggle(path) {
    var i = state.images.indexOf(path);
    if (i === -1) state.images.push(path);
    else state.images.splice(i, 1);
    dirty = true;
    refresh();
  }

  // In-page confirmation. Native confirm() is disabled in some browsers
  // (it silently answers "no"), so ask inline instead.
  var confirmBox = $('ce-confirm');
  var confirmYes = $('ce-confirm-yes');
  var confirmNo = $('ce-confirm-no');
  var confirmResolve = null;

  function askConfirm(html, yesLabel) {
    if (confirmResolve) confirmResolve(false);
    $('ce-confirm-text').innerHTML = html;
    confirmYes.textContent = yesLabel;
    confirmBox.hidden = false;
    confirmBox.scrollIntoView({ block: 'nearest' });
    confirmNo.focus();
    return new Promise(function (resolve) { confirmResolve = resolve; });
  }

  function answerConfirm(yes) {
    if (!confirmResolve) return;
    var r = confirmResolve;
    confirmResolve = null;
    confirmBox.hidden = true;
    r(yes);
  }

  confirmYes.addEventListener('click', function () { answerConfirm(true); });
  confirmNo.addEventListener('click', function () { answerConfirm(false); });
  confirmBox.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') answerConfirm(false);
  });

  // ------------------------------------------------------------------
  // Events
  // ------------------------------------------------------------------
  pick.addEventListener('change', function () {
    var target = pick.value;
    if (!dirty) return load(target);
    pick.value = state.existing || '';
    askConfirm('Discard the unsaved changes to this collection?', 'Discard').then(function (yes) {
      if (yes) load(target);
    });
  });

  nameIn.addEventListener('input', function () {
    state.title = nameIn.value;
    if (!state.existing && !slugTouched) {
      state.slug = slugify(nameIn.value);
      slugIn.value = state.slug;
    }
    dirty = true;
    refresh();
  });

  slugIn.addEventListener('input', function () {
    if (state.existing) return;
    slugTouched = true;
    state.slug = slugIn.value.trim();
    dirty = true;
    refresh();
  });

  descIn.addEventListener('input', function () {
    state.description = descIn.value;
    dirty = true;
    refresh();
  });

  library.addEventListener('click', function (e) {
    var all = e.target.closest('[data-add-all]');
    if (all) {
      var inSet = new Set(state.images);
      var photos = groups[all.dataset.addAll] || [];
      var missing = photos.filter(function (p) { return !inSet.has(p); });
      if (missing.length) state.images = state.images.concat(missing);
      else state.images = state.images.filter(function (p) { return photos.indexOf(p) === -1; });
      dirty = true;
      refresh();
      return;
    }
    var thumb = e.target.closest('.ce-thumb');
    if (thumb) toggle(thumb.dataset.path);
  });

  tray.addEventListener('click', function (e) {
    var star = e.target.closest('[data-cover]');
    if (star) {
      state.cover = state.images[+star.dataset.cover];
      dirty = true;
      refresh();
      return;
    }
    var x = e.target.closest('[data-remove]');
    if (x) {
      state.images.splice(+x.dataset.remove, 1);
      dirty = true;
      refresh();
    }
  });

  // Drag to reorder.
  var dragFrom = null;
  tray.addEventListener('dragstart', function (e) {
    var item = e.target.closest('.ce-item');
    if (!item) return;
    dragFrom = +item.dataset.i;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(dragFrom));
    item.classList.add('is-dragging');
  });
  tray.addEventListener('dragover', function (e) {
    if (dragFrom === null) return;
    e.preventDefault();
    var item = e.target.closest('.ce-item');
    Array.prototype.forEach.call(tray.children, function (el) { el.classList.toggle('is-over', el === item); });
  });
  tray.addEventListener('drop', function (e) {
    if (dragFrom === null) return;
    e.preventDefault();
    var item = e.target.closest('.ce-item');
    var to = item ? +item.dataset.i : state.images.length - 1;
    var moved = state.images.splice(dragFrom, 1)[0];
    state.images.splice(to, 0, moved);
    dragFrom = null;
    dirty = true;
    refresh();
  });
  tray.addEventListener('dragend', function () {
    dragFrom = null;
    Array.prototype.forEach.call(tray.children, function (el) { el.classList.remove('is-over', 'is-dragging'); });
  });

  $('ce-clear').addEventListener('click', function () {
    if (!state.images.length) return;
    state.images = [];
    dirty = true;
    refresh();
  });

  searchIn.addEventListener('input', applyFilters);
  countrySel.addEventListener('change', applyFilters);
  onlySelected.addEventListener('change', applyFilters);

  window.addEventListener('beforeunload', function (e) {
    if (dirty) { e.preventDefault(); e.returnValue = ''; }
  });

  // ------------------------------------------------------------------
  // Saving
  // ------------------------------------------------------------------
  // Files are written through window.devFiles (assets/js/dev-files.js):
  // by the dev server itself when it can, which works on any port without
  // a prompt, otherwise through the browser's folder access.
  var folderEl = $('ce-folder');

  function showFolder(info) {
    if (!folderEl) return;
    if (info.mode === 'server') {
      folderEl.innerHTML = 'Saves straight into <strong>' + esc(info.folder) + '/_collections/</strong>, the folder this server runs from.';
    } else if (info.mode === 'folder' && info.folder) {
      folderEl.innerHTML = 'Saves into <strong>' + esc(info.folder) + '/_collections/</strong>. ' +
        '<button type="button" class="ce-link" id="ce-change-folder">Change folder</button>';
    } else if (info.mode === 'folder') {
      folderEl.textContent = 'The first save asks for the site folder (the one this server runs from). It is remembered afterwards.';
    } else {
      folderEl.textContent = 'This browser cannot save directly; use "Download file".';
    }
  }

  if (folderEl && window.devFiles) {
    folderEl.addEventListener('click', function (e) {
      if (!e.target.closest('#ce-change-folder')) return;
      window.devFiles.pickFolder().then(showFolder, function (err) {
        if (err && err.name === 'AbortError') return;
        setStatus('Could not use that folder: ' + esc(err && err.message ? err.message : err), 'err');
      });
    });
    window.devFiles.info().then(showFolder);
  }

  function afterSave() {
    var entry = {
      slug: state.slug,
      title: state.title.trim(),
      description: state.description.trim(),
      cover: state.cover,
      images: state.images.slice()
    };
    var i = D.collections.findIndex(function (c) { return c.slug === entry.slug; });
    if (i === -1) D.collections.push(entry); else D.collections[i] = entry;
    D.collections.sort(function (a, b) { return a.title.localeCompare(b.title); });
    state.existing = entry.slug;
    dirty = false;
    renderPick();
    refresh({ keepStatus: true });
  }

  $('ce-save').addEventListener('click', async function () {
    var errs = problems();
    if (errs.length) return setStatus(errs.map(esc).join('<br>'), 'err');
    try {
      await window.devFiles.write('_collections/' + state.slug + '.html', buildFile());
      afterSave();
      window.devFiles.info().then(showFolder);
      setStatus('Saved <code>_collections/' + esc(state.slug) + '.html</code>. Jekyll needs a moment to rebuild, then ' +
        '<a href="/collections/' + esc(state.slug) + '">open the collection</a>.', 'ok');
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      setStatus('Could not save: ' + esc(err && err.message ? err.message : err), 'err');
    }
  });

  $('ce-delete').addEventListener('click', async function () {
    if (!state.existing) return;
    var slug = state.existing;
    var c = D.collections.filter(function (x) { return x.slug === slug; })[0];
    var title = c ? c.title : slug;
    var yes = await askConfirm('Delete <strong>' + esc(title) + '</strong>? This removes <code>_collections/' + esc(slug) +
      '.html</code>. The photos are not touched; only git can bring it back.', 'Delete');
    if (!yes) return;
    try {
      await window.devFiles.remove('_collections/' + slug + '.html');
      D.collections = D.collections.filter(function (x) { return x.slug !== slug; });
      load('');
      renderPick();
      setStatus('Deleted <code>_collections/' + esc(slug) + '.html</code>.', 'ok');
    } catch (err) {
      setStatus('Could not delete: ' + esc(err && err.message ? err.message : err), 'err');
    }
  });

  $('ce-download').addEventListener('click', function () {
    var errs = problems();
    if (errs.length) return setStatus(errs.map(esc).join('<br>'), 'err');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([buildFile()], { type: 'text/html' }));
    a.download = state.slug + '.html';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    setStatus('Downloaded. Move <code>' + esc(state.slug) + '.html</code> into <code>_collections/</code>.', 'ok');
  });

  // ------------------------------------------------------------------
  // Boot
  // ------------------------------------------------------------------
  renderPick();
  renderLibrary();
  var wanted = new URLSearchParams(window.location.search).get('c');
  load(wanted && D.collections.some(function (c) { return c.slug === wanted; }) ? wanted : '');
})();
