// Local-only trip editor (/trips/edit/). Creates, edits and deletes the files
// in _trips/. A trip is a name, a description and a list of stops (a location
// and a date); the dates set the order. Files are written through
// window.devFiles (assets/js/dev-files.js).

(function () {
  'use strict';

  var h = window.location.hostname;
  var isLocal = h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0' || h.endsWith('.local');
  var root = document.getElementById('te');
  if (!root) return;
  if (!isLocal || !window.devFiles) {
    root.innerHTML = '<p style="padding:3rem 1rem;text-align:center">The trip editor only works on localhost.</p>';
    return;
  }

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }
  function prettyName(slug) {
    return String(slug || '').replace(/_/g, ' ').replace(/\b\w/g, function (m) { return m.toUpperCase(); });
  }
  function slugify(s) {
    return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }
  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }

  var D = JSON.parse($('te-data').textContent);
  var countryTitle = {};
  D.countries.forEach(function (c) { countryTitle[c.n] = c.t; });
  var locByName = {};
  D.locations.forEach(function (l) { locByName[l.n] = l; });
  // Every photo of each place (paths look like "<place>/<file>.jpg").
  var photosByLoc = {};
  (D.photos || []).forEach(function (p) {
    var k = p.split('/')[0];
    (photosByLoc[k] = photosByLoc[k] || []).push(p);
  });

  var pick = $('te-pick'), nameEl = $('te-name'), slugEl = $('te-slug'), slugHint = $('te-slug-hint');
  var descEl = $('te-desc'), stopsEl = $('te-stops'), countEl = $('te-count'), rangeEl = $('te-range');
  var statusEl = $('te-status'), previewEl = $('te-preview'), folderEl = $('te-folder');
  var saveBtn = $('te-save'), deleteBtn = $('te-delete');
  var libraryEl = $('te-library'), searchEl = $('te-search'), countrySel = $('te-country'), onlyEl = $('te-only-selected');

  // ------------------------------------------------------------------
  // State
  // ------------------------------------------------------------------
  var seq = 0;
  var state = blank();
  var snapshot = '';
  var slugTouched = false;

  function blank() { return { existing: null, title: '', slug: '', description: '', stops: [] }; }

  function newStop(loc, date, straight, images) {
    return { id: ++seq, loc: loc, date: date || '', straight: !!straight, images: images || [], open: false, anchor: '' };
  }

  function sortedStops() {
    return state.stops.slice().sort(function (a, b) {
      var da = a.date || '9999-99-99', db = b.date || '9999-99-99';
      return da < db ? -1 : da > db ? 1 : a.id - b.id;
    });
  }

  function serialise() {
    return JSON.stringify([state.title, state.slug, state.description,
      sortedStops().map(function (s) { return [s.loc, s.date, s.straight, s.images]; })]);
  }
  function isDirty() { return serialise() !== snapshot; }
  function markClean() { snapshot = serialise(); }

  function setStatus(msg, kind) {
    statusEl.innerHTML = msg || '';
    statusEl.dataset.kind = kind || '';
  }

  function buildFile() {
    var q = JSON.stringify;
    var lines = ['---', 'layout: trip', 'title: ' + q(state.title.trim())];
    if (state.description.trim()) lines.push('description: ' + q(state.description.trim()));
    lines.push('stops:');
    sortedStops().forEach(function (s, i) {
      lines.push('  - location: ' + s.loc);
      if (s.date) lines.push('    date: ' + q(s.date));
      if (s.straight && i > 0) lines.push('    travel: straight');
      if (s.images.length) {
        lines.push('    images:');
        s.images.forEach(function (p) { lines.push('      - ' + q(p)); });
      }
    });
    lines.push('---', '');
    return lines.join('\n');
  }

  function problems() {
    var out = [];
    if (!state.title.trim()) out.push('Give the trip a name.');
    if (!state.slug) out.push('The file name is empty.');
    else if (!/^[a-z0-9_]+$/.test(state.slug)) out.push('The file name can only use a-z, 0-9 and _.');
    else if (state.slug === 'edit' || state.slug === 'index') out.push('"' + state.slug + '" is reserved; pick another file name.');
    else if (!state.existing && D.trips.some(function (t) { return t.slug === state.slug; })) {
      out.push('A trip called "' + state.slug + '" already exists. Pick it from the list to edit it.');
    }
    if (!state.stops.length) out.push('Add at least one place.');
    return out;
  }

  // ------------------------------------------------------------------
  // Rendering
  // ------------------------------------------------------------------
  function renderPick() {
    pick.innerHTML = '<option value="">+ New trip</option>' + D.trips.map(function (t) {
      return '<option value="' + esc(t.slug) + '">' + esc(t.title) + ' (' + t.stops.length + ')</option>';
    }).join('');
    pick.value = state.existing || '';
  }

  function fmtShort(d) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || '');
    if (!m) return '';
    return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+m[2] - 1] + ' ' + (+m[3]) + ', ' + m[1];
  }

  // Is the neighbouring stop (dir -1 / +1) on the same day, so they can swap?
  function sameDay(list, i, dir) {
    var o = list[i + dir];
    return !!o && !!list[i].date && o.date === list[i].date;
  }

  function photosLabel(s) {
    var all = (photosByLoc[s.loc] || []).length;
    return s.images.length ? 'Photos: ' + s.images.length + ' of ' + all : 'Photos: all' + (all ? ' ' + all : '');
  }

  // The photos of a place as a grid of thumbnails; click to pick the ones
  // that belong to this trip. None picked means every photo of the place.
  function photoPicker(s) {
    var all = photosByLoc[s.loc] || [];
    var on = new Set(s.images);
    if (!all.length) return '<div class="te-stop__picker"><p class="te-stop__hint">No photos found for this place.</p></div>';
    return '<div class="te-stop__picker">' +
      '<p class="te-stop__hint">' + (s.images.length
        ? s.images.length + ' picked. Only these show for this stop.'
        : 'Click the photos from this trip (shift-click for a range). None picked shows them all.') +
      (s.images.length ? ' <button type="button" data-photos-all>Show all</button>' : '') + '</p>' +
      '<div class="te-stop__grid">' + all.map(function (p) {
        return '<button type="button" class="te-stop__ph' + (on.has(p) ? ' is-on' : '') + '" data-photo="' + esc(p) + '" aria-pressed="' + on.has(p) + '">' +
          '<img src="/images/thumb/' + encodeURI(p) + '" alt="" loading="lazy" decoding="async"></button>';
      }).join('') + '</div></div>';
  }

  function renderStops() {
    var list = sortedStops();
    countEl.textContent = list.length;
    var dated = list.filter(function (s) { return s.date; });
    rangeEl.textContent = dated.length
      ? '· ' + fmtShort(dated[0].date) + (dated.length > 1 ? ' – ' + fmtShort(dated[dated.length - 1].date) : '')
      : '';
    if (!list.length) {
      stopsEl.innerHTML = '<li class="te-empty">No stops yet.</li>';
      return;
    }
    stopsEl.innerHTML = list.map(function (s, i) {
      var l = locByName[s.loc] || { t: s.loc, c: '', i: '' };
      return '<li class="te-stop" data-id="' + s.id + '">' +
        '<span class="te-stop__n">' + (i + 1) + '</span>' +
        (l.i ? '<img alt="" src="/images/thumb/' + esc(l.i) + '">' : '<span></span>') +
        '<span class="te-stop__t"><strong>' + esc(l.t) + '</strong><em>' + esc(countryTitle[l.c] || prettyName(l.c)) + '</em></span>' +
        '<span class="te-stop__row2"><input type="date" value="' + esc(s.date) + '" aria-label="Date at ' + esc(l.t) + '">' +
        (i > 0 ? '<button type="button" class="te-stop__straight' + (s.straight ? ' is-on' : '') + '" data-straight aria-pressed="' + !!s.straight +
          '" title="Draw the line from the previous stop straight (flight, ferry) instead of along the roads">' + (s.straight ? 'Straight line' : 'By road') + '</button>' : '') +
        '<button type="button" class="te-stop__photos-btn' + (s.images.length ? ' is-on' : '') + '" data-photos aria-expanded="' + s.open +
          '" title="Choose which photos of this place show in the trip">' + photosLabel(s) + '</button>' +
        '<span class="te-stop__move" title="Same-day stops: set which comes first">' +
        '<button type="button" data-move="-1" aria-label="Move ' + esc(l.t) + ' earlier"' + (sameDay(list, i, -1) ? '' : ' disabled') + '>▲</button>' +
        '<button type="button" data-move="1" aria-label="Move ' + esc(l.t) + ' later"' + (sameDay(list, i, 1) ? '' : ' disabled') + '>▼</button></span></span>' +
        '<button type="button" class="te-stop__x" aria-label="Remove ' + esc(l.t) + '">×</button>' +
        (s.open ? photoPicker(s) : '') + '</li>';
    }).join('');
  }

  var groups = (function () {
    var by = {};
    D.locations.forEach(function (l) { (by[l.c] = by[l.c] || []).push(l); });
    return Object.keys(by).map(function (c) {
      by[c].sort(function (a, b) { return a.t.localeCompare(b.t); });
      return { country: c, title: countryTitle[c] || prettyName(c), places: by[c] };
    }).sort(function (a, b) { return a.title.localeCompare(b.title); });
  })();

  D.countries.slice().sort(function (a, b) { return a.t.localeCompare(b.t); }).forEach(function (c) {
    var o = document.createElement('option');
    o.value = c.n;
    o.textContent = c.t;
    countrySel.appendChild(o);
  });

  function counts() {
    var by = {};
    state.stops.forEach(function (s) { by[s.loc] = (by[s.loc] || 0) + 1; });
    return by;
  }

  function renderLibrary() {
    var q = searchEl.value.trim().toLowerCase();
    var country = countrySel.value;
    var only = onlyEl.checked;
    var by = counts();
    var html = groups.map(function (g) {
      if (country && g.country !== country) return '';
      var places = g.places.filter(function (l) {
        if (only && !by[l.n]) return false;
        if (!q) return true;
        return l.t.toLowerCase().indexOf(q) !== -1 || g.title.toLowerCase().indexOf(q) !== -1;
      });
      if (!places.length) return '';
      return '<section class="te-country"><h2>' + esc(g.title) + '<span>' + places.length + '</span></h2><div class="te-places">' +
        places.map(function (l) {
          return '<button type="button" class="te-place' + (by[l.n] ? ' is-in' : '') + '" data-n="' + esc(l.n) + '" title="Add ' + esc(l.t) + '">' +
            '<img alt="" loading="lazy" src="/images/thumb/' + esc(l.i) + '"><span>' + esc(l.t) + '</span>' +
            (by[l.n] ? '<b>' + (by[l.n] > 1 ? by[l.n] + '×' : '✓') + '</b>' : '') + '</button>';
        }).join('') + '</div></section>';
    }).join('');
    libraryEl.innerHTML = html || '<p class="te-empty">No places match.</p>';
  }

  function renderPreview() {
    previewEl.textContent = buildFile();
    var errs = problems();
    saveBtn.disabled = errs.length > 0;
    saveBtn.title = errs.join('\n');
  }

  function renderAll() {
    renderPick();
    nameEl.value = state.title;
    slugEl.value = state.slug;
    slugEl.readOnly = !!state.existing;
    slugHint.textContent = state.existing ? '(fixed once saved)' : '';
    descEl.value = state.description;
    deleteBtn.hidden = !state.existing;
    renderStops();
    renderLibrary();
    renderPreview();
  }

  function refreshStops() {
    renderStops();
    renderLibrary();
    renderPreview();
  }

  // ------------------------------------------------------------------
  // Loading a trip
  // ------------------------------------------------------------------
  function load(slug) {
    var t = D.trips.filter(function (x) { return x.slug === slug; })[0];
    if (!t) {
      state = blank();
      slugTouched = false;
    } else {
      state = {
        existing: t.slug, title: t.title || '', slug: t.slug, description: t.description || '',
        stops: (t.stops || []).filter(function (s) { return locByName[s.l]; }).map(function (s) {
          return newStop(s.l, s.d, s.m === 'straight', s.p);
        })
      };
      slugTouched = true;
    }
    markClean();
    setStatus('');
    renderAll();
    try {
      var u = new URL(window.location.href);
      if (slug) u.searchParams.set('t', slug); else u.searchParams.delete('t');
      history.replaceState(null, '', u);
    } catch (e) { /* not important */ }
  }

  // ------------------------------------------------------------------
  // In-page confirmation (native confirm() is blocked in some browsers)
  // ------------------------------------------------------------------
  var confirmBox = $('te-confirm'), confirmYes = $('te-confirm-yes'), confirmNo = $('te-confirm-no');
  var confirmResolve = null;

  function askConfirm(html, yesLabel) {
    if (confirmResolve) confirmResolve(false);
    $('te-confirm-text').innerHTML = html;
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
  confirmBox.addEventListener('keydown', function (e) { if (e.key === 'Escape') answerConfirm(false); });

  // ------------------------------------------------------------------
  // Events
  // ------------------------------------------------------------------
  pick.addEventListener('change', function () {
    var target = pick.value;
    if (!isDirty()) { load(target); return; }
    pick.value = state.existing || '';
    askConfirm('Discard the unsaved changes to this trip?', 'Discard').then(function (yes) {
      if (yes) load(target);
    });
  });

  nameEl.addEventListener('input', function () {
    state.title = nameEl.value;
    if (!state.existing && !slugTouched) {
      state.slug = slugify(state.title);
      slugEl.value = state.slug;
    }
    renderPreview();
  });
  slugEl.addEventListener('input', function () {
    slugTouched = true;
    state.slug = slugEl.value.trim();
    renderPreview();
  });
  descEl.addEventListener('input', function () {
    state.description = descEl.value;
    renderPreview();
  });

  libraryEl.addEventListener('click', function (e) {
    var b = e.target.closest('.te-place');
    if (!b) return;
    var dated = sortedStops().filter(function (s) { return s.date; });
    var date = dated.length ? dated[dated.length - 1].date : today();
    state.stops.push(newStop(b.dataset.n, date));
    refreshStops();
    stopsEl.lastElementChild && stopsEl.lastElementChild.scrollIntoView({ block: 'nearest' });
  });

  stopsEl.addEventListener('change', function (e) {
    var input = e.target.closest('input[type="date"]');
    if (!input) return;
    var id = +input.closest('.te-stop').dataset.id;
    state.stops.forEach(function (s) { if (s.id === id) s.date = input.value; });
    refreshStops(); // the order may have changed
  });
  stopsEl.addEventListener('click', function (e) {
    var stopOf = function (el) {
      var id = +el.closest('.te-stop').dataset.id;
      return state.stops.filter(function (s) { return s.id === id; })[0];
    };
    var pb = e.target.closest('[data-photos]');
    if (pb) { var ps = stopOf(pb); ps.open = !ps.open; refreshStops(); return; }
    var ph = e.target.closest('[data-photo]');
    if (ph) {
      var st = stopOf(ph), p = ph.dataset.photo, at = st.images.indexOf(p);
      var order = photosByLoc[st.loc] || [];
      var turnOn = at === -1;
      if (e.shiftKey && st.anchor && st.anchor !== p && order.indexOf(st.anchor) !== -1) {
        // Shift-click: every photo from the last one clicked to this one
        // takes on the state this click gives it (all picked, or all cleared).
        var from = order.indexOf(st.anchor), to = order.indexOf(p);
        var range = order.slice(Math.min(from, to), Math.max(from, to) + 1);
        st.images = st.images.filter(function (x) { return range.indexOf(x) === -1; });
        if (turnOn) st.images = st.images.concat(range);
      } else if (turnOn) {
        st.images.push(p);
      } else {
        st.images.splice(at, 1);
      }
      st.anchor = p;
      // keep the file in the place's own photo order
      st.images.sort(function (a, b) { return order.indexOf(a) - order.indexOf(b); });
      var sc = stopsEl.scrollTop, gridEl = ph.closest('.te-stop__grid'), gs = gridEl.scrollTop;
      refreshStops();
      var ng = stopsEl.querySelector('.te-stop[data-id="' + st.id + '"] .te-stop__grid');
      if (ng) ng.scrollTop = gs;
      stopsEl.scrollTop = sc;
      return;
    }
    var pa = e.target.closest('[data-photos-all]');
    if (pa) { stopOf(pa).images = []; refreshStops(); return; }
    var tg = e.target.closest('[data-straight]');
    if (tg) {
      var tid = +tg.closest('.te-stop').dataset.id;
      state.stops.forEach(function (s) { if (s.id === tid) s.straight = !s.straight; });
      refreshStops();
      return;
    }
    var mv = e.target.closest('[data-move]');
    if (mv && !mv.disabled) {
      var list = sortedStops();
      var at = list.findIndex(function (s) { return s.id === +mv.closest('.te-stop').dataset.id; });
      var dir = +mv.dataset.move;
      if (sameDay(list, at, dir)) {
        // The order within a day is the order in the file: swap their ranks.
        var a = list[at], b = list[at + dir], t = a.id;
        a.id = b.id;
        b.id = t;
        refreshStops();
      }
      return;
    }
    var x = e.target.closest('.te-stop__x');
    if (!x) return;
    var id = +x.closest('.te-stop').dataset.id;
    state.stops = state.stops.filter(function (s) { return s.id !== id; });
    refreshStops();
  });
  $('te-clear').addEventListener('click', function () {
    state.stops = [];
    refreshStops();
  });

  var searchTimer = null;
  searchEl.addEventListener('input', function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(renderLibrary, 120);
  });
  countrySel.addEventListener('change', renderLibrary);
  onlyEl.addEventListener('change', renderLibrary);

  // ------------------------------------------------------------------
  // Saving and deleting
  // ------------------------------------------------------------------
  function showFolder(info) {
    if (info.mode === 'server') {
      folderEl.innerHTML = 'Saves straight into <strong>' + esc(info.folder) + '/_trips/</strong>, the folder this server runs from.';
    } else if (info.mode === 'folder' && info.folder) {
      folderEl.innerHTML = 'Saves into <strong>' + esc(info.folder) + '/_trips/</strong>. ' +
        '<button type="button" class="ce-link" id="te-change-folder">Change folder</button>';
    } else if (info.mode === 'folder') {
      folderEl.textContent = 'The first save asks for the site folder (the one this server runs from). It is remembered afterwards.';
    } else {
      folderEl.textContent = 'This browser cannot save files directly. Run `bundle install`, restart `jekyll serve` and reload.';
    }
  }
  window.devFiles.info().then(showFolder, function () {});
  folderEl.addEventListener('click', function (e) {
    if (!e.target.closest('#te-change-folder')) return;
    window.devFiles.pickFolder().then(showFolder, function (err) {
      if (err && err.name !== 'AbortError') setStatus(esc(err.message), 'error');
    });
  });

  saveBtn.addEventListener('click', async function () {
    var errs = problems();
    if (errs.length) { setStatus(errs.map(esc).join('<br>'), 'error'); return; }
    saveBtn.disabled = true;
    try {
      var path = '_trips/' + state.slug + '.html';
      await window.devFiles.write(path, buildFile());
      var record = {
        slug: state.slug, title: state.title.trim(), description: state.description.trim(),
        stops: sortedStops().map(function (s) { return { l: s.loc, d: s.date, m: s.straight ? 'straight' : '', p: s.images.length ? s.images.slice() : null }; })
      };
      var i = D.trips.findIndex(function (t) { return t.slug === record.slug; });
      if (i === -1) D.trips.push(record); else D.trips[i] = record;
      D.trips.sort(function (a, b) { return a.title.localeCompare(b.title); });
      state.existing = state.slug;
      markClean();
      renderAll();
      setStatus('Saved <code>' + esc(path) + '</code>. Jekyll rebuilds in a few seconds. <a href="/trips/' + esc(state.slug) + '">Open the trip</a>', 'ok');
    } catch (err) {
      console.error(err);
      setStatus('Could not save: ' + esc(err && err.message ? err.message : err), 'error');
    } finally {
      renderPreview();
    }
  });

  deleteBtn.addEventListener('click', async function () {
    var slug = state.existing;
    if (!slug) return;
    var yes = await askConfirm('Delete <strong>' + esc(state.title) + '</strong>? This removes <code>_trips/' + esc(slug) +
      '.html</code> and cannot be undone.', 'Delete');
    if (!yes) return;
    try {
      await window.devFiles.remove('_trips/' + slug + '.html');
      D.trips = D.trips.filter(function (t) { return t.slug !== slug; });
      load('');
      setStatus('Deleted <code>_trips/' + esc(slug) + '.html</code>.', 'ok');
    } catch (err) {
      console.error(err);
      setStatus('Could not delete: ' + esc(err && err.message ? err.message : err), 'error');
    }
  });

  window.addEventListener('beforeunload', function (e) {
    if (isDirty()) { e.preventDefault(); e.returnValue = ''; }
  });

  // ------------------------------------------------------------------
  // Boot
  // ------------------------------------------------------------------
  var want = new URLSearchParams(window.location.search).get('t') || '';
  load(want);
})();
