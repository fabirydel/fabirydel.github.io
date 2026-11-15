/* Explore: a 3D globe you can fly around.
 *
 * States (root[data-state]):
 *   intro   – slowly spinning globe with the title card
 *   globe   – same globe, countries rail visible, free browsing
 *   country – camera framed on one country, photo pins on its places
 *   place   – camera orbiting one location, photo panel open
 *
 * root[data-view] is 'globe' (3D) or 'flat' (mercator, a pin on every location).
 *
 * "Journey" (play) walks every place in a route ordered so each hop is to a
 * near neighbour, country by country, drawing the flight path as it goes.
 */
document.addEventListener('DOMContentLoaded', function () {
  var root = document.getElementById('explore');
  if (!root) return;

  var $ = function (id) { return document.getElementById(id); };
  var header = $('header');
  var errorEl = $('explore-error');

  function fail(message) {
    errorEl.innerHTML = message + ' <a href="/countries">Browse by country instead →</a>';
    errorEl.hidden = false;
    root.dataset.state = 'error';
  }

  function layoutRoot() {
    root.style.top = (header ? header.offsetHeight : 0) + 'px';
  }
  layoutRoot();

  if (!window.mapboxgl || !mapboxgl.supported()) {
    fail('The 3D globe needs WebGL, which this browser has switched off.');
    return;
  }

  /* ------------------------------------------------------------------ data */

  var data = JSON.parse($('explore-data').textContent);
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var isMobile = function () { return window.innerWidth <= 850; };

  var photosByPlace = {};
  data.photos.forEach(function (p) {
    var folder = p.split('/')[0];
    (photosByPlace[folder] = photosByPlace[folder] || []).push(p);
  });

  var countryByName = {};
  data.countries.forEach(function (c) { countryByName[c.n] = c; });

  var places = data.locations.map(function (l, i) {
    var photos = photosByPlace[l.n] || (l.i ? [l.i] : []);
    return { id: i, name: l.n, title: l.t, country: l.c, lat: l.ll[0], lng: l.ll[1], thumb: l.i, photos: photos };
  }).filter(function (p) { return p.photos.length && isFinite(p.lat) && isFinite(p.lng); });
  places.forEach(function (p, i) { p.id = i; });

  var placeByName = {};
  places.forEach(function (p) { placeByName[p.name] = p; });

  function countryTitle(name) {
    var c = countryByName[name];
    if (c && c.t) return c.t;
    return String(name || '').replace(/_/g, ' ').replace(/\b\w/g, function (m) { return m.toUpperCase(); });
  }

  var RAD = Math.PI / 180;
  function distanceKm(a, b) {
    var dLat = (b.lat - a.lat) * RAD, dLng = (b.lng - a.lng) * RAD;
    var h = Math.pow(Math.sin(dLat / 2), 2) + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.pow(Math.sin(dLng / 2), 2);
    return 12742 * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  function bearingBetween(a, b) {
    var y = Math.sin((b.lng - a.lng) * RAD) * Math.cos(b.lat * RAD);
    var x = Math.cos(a.lat * RAD) * Math.sin(b.lat * RAD) - Math.sin(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.cos((b.lng - a.lng) * RAD);
    return Math.atan2(y, x) / RAD;
  }

  // Group by country, then chain everything greedily by nearest neighbour.
  var groups = {};
  places.forEach(function (p) { (groups[p.country] = groups[p.country] || []).push(p); });
  var countryNames = Object.keys(groups);
  var centroids = {};
  countryNames.forEach(function (n) {
    var g = groups[n], lat = 0, lng = 0;
    g.forEach(function (p) { lat += p.lat; lng += p.lng; });
    centroids[n] = { lat: lat / g.length, lng: lng / g.length };
  });

  function nearestIndex(from, list, key) {
    var best = 0, bestD = Infinity;
    list.forEach(function (item, i) {
      var d = distanceKm(from, key ? key(item) : item);
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  }

  var route = [];
  (function buildRoute() {
    var remaining = countryNames.slice().sort(function (a, b) { return groups[b].length - groups[a].length; });
    var cursor = null;
    while (remaining.length) {
      var ci = cursor ? nearestIndex(cursor, remaining, function (n) { return centroids[n]; }) : 0;
      var pool = groups[remaining.splice(ci, 1)[0]].slice();
      if (!cursor) {
        // Start the first country at its western edge so it reads as a sweep.
        pool.sort(function (a, b) { return a.lng - b.lng; });
        cursor = pool.shift();
        route.push(cursor);
      }
      while (pool.length) {
        cursor = pool.splice(nearestIndex(cursor, pool), 1)[0];
        route.push(cursor);
      }
    }
    route.forEach(function (p, i) { p.stop = i; });
  })();

  if (!route.length) { fail('No locations found.'); return; }

  $('explore-stats').textContent =
    places.length + ' locations · ' + countryNames.length + ' countries · ' + data.photos.length.toLocaleString('en') + ' photos';

  /* ------------------------------------------------------------------- map */

  mapboxgl.accessToken = 'pk.eyJ1IjoiZmFiaXJ5ZGVsIiwiYSI6ImNrajYwcHcwbTYzZDEycWxicjFtNzdqa2kifQ.8AEeHc6W_kHGvgIZQNq2WA';

  var state = 'intro';
  var current = null;        // place shown in the panel
  var activeCountry = '';    // country filter / framing
  var playing = false;
  var flat = false;          // flat (mercator) map instead of the 3D globe

  function padding(forState) {
    var s = forState || state;
    if (isMobile()) {
      return {
        top: s === 'intro' ? 44 : 96,
        bottom: s === 'place' ? Math.round(root.clientHeight * 0.52) : (s === 'intro' ? 230 : 76),
        left: 0, right: 0
      };
    }
    return {
      top: 0,
      bottom: 64,
      left: s === 'intro' ? Math.min(root.clientWidth * 0.34, 480) : 210,
      right: s === 'place' ? 500 : 0
    };
  }
  function globeZoom() { return flat ? (isMobile() ? 0.8 : 1.9) : (isMobile() ? 0.9 : 1.7); }
  var TERRAIN = { source: 'explore-dem', exaggeration: 1.35 };

  var map;
  try {
    map = new mapboxgl.Map({
      container: 'explore-map',
      style: 'mapbox://styles/mapbox/satellite-streets-v12',
      projection: 'globe',
      center: [8, 34],
      zoom: globeZoom(),
      minZoom: 0.6,
      maxPitch: 75,
      attributionControl: false,
      logoPosition: 'bottom-left'
    });
  } catch (e) {
    fail('The 3D globe could not start.');
    return;
  }
  map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-left');
  map.setPadding(padding());
  map.dragRotate.enable();
  map.touchZoomRotate.enableRotation();

  var mapReady = false;
  map.on('error', function (e) {
    if (!mapReady && e && e.error && /401|403|token/i.test(String(e.error.message || e.error.status))) {
      fail('The map service refused to load.');
    }
  });

  var HIDE = /road|bridge|tunnel|poi|transit|ferry|aeroway|path|golf|building|natural-point|waterway-label|airport/;

  map.on('style.load', function () {
    map.setFog({
      'color': 'rgb(170, 190, 215)',
      'high-color': 'rgb(42, 92, 190)',
      'horizon-blend': 0.035,
      'space-color': 'rgb(6, 7, 10)',
      'star-intensity': 0.7
    });

    map.addSource('explore-dem', { type: 'raster-dem', url: 'mapbox://mapbox.mapbox-terrain-dem-v1', tileSize: 512, maxzoom: 14 });
    map.setTerrain(TERRAIN);

    map.getStyle().layers.forEach(function (layer) {
      if (layer.type !== 'raster' && layer.type !== 'background' && HIDE.test(layer.id)) {
        map.setLayoutProperty(layer.id, 'visibility', 'none');
      }
    });

    map.addSource('explore-trail', { type: 'geojson', data: emptyLine() });
    map.addSource('explore-arc', { type: 'geojson', data: emptyLine() });
    map.addSource('explore-places', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: places.map(function (p) {
          return { type: 'Feature', id: p.id, properties: { id: p.id, c: p.country }, geometry: { type: 'Point', coordinates: [p.lng, p.lat] } };
        })
      }
    });

    map.addLayer({
      id: 'explore-trail', type: 'line', source: 'explore-trail',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#ffd9a0', 'line-opacity': 0.28, 'line-width': 1.2, 'line-dasharray': [1, 2.5] }
    });
    map.addLayer({
      id: 'explore-arc-glow', type: 'line', source: 'explore-arc',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#ffb85c', 'line-opacity': 0.35, 'line-width': 9, 'line-blur': 8 }
    });
    map.addLayer({
      id: 'explore-arc', type: 'line', source: 'explore-arc',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#fff1d6', 'line-width': 2 }
    });

    map.addLayer({
      id: 'explore-glow', type: 'circle', source: 'explore-places',
      paint: {
        'circle-color': '#ffb85c',
        'circle-blur': 1,
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 0, 7, 4, 13, 9, 22, 13, 30],
        'circle-opacity': 0.55
      }
    });
    map.addLayer({
      id: 'explore-dots', type: 'circle', source: 'explore-places',
      paint: {
        'circle-color': '#fff4dc',
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 0, 1.6, 4, 2.8, 9, 5, 13, 6.5],
        'circle-stroke-color': 'rgba(255, 184, 92, 0.9)',
        'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 0, 0.4, 6, 1.2],
        'circle-opacity': 1
      }
    });
    // Generous invisible hit target so the dots are easy to hover and tap.
    map.addLayer({
      id: 'explore-hit', type: 'circle', source: 'explore-places',
      paint: { 'circle-radius': 14, 'circle-opacity': 0 }
    });

    paintCountryFocus();
  });

  function emptyLine() { return { type: 'FeatureCollection', features: [] }; }

  function paintCountryFocus() {
    if (!map.getLayer('explore-dots')) return;
    var inFocus = activeCountry ? ['==', ['get', 'c'], activeCountry] : true;
    map.setPaintProperty('explore-dots', 'circle-opacity', activeCountry ? ['case', inFocus, 1, 0.35] : 1);
    map.setPaintProperty('explore-glow', 'circle-opacity', activeCountry ? ['case', inFocus, 0.6, 0.12] : 0.55);
  }

  /* -------------------------------------------------------- camera motion */

  var flightToken = 0;
  var orbiting = false;
  var lastInteraction = 0;
  var lastFrame = performance.now();
  var arcAnim = null;        // { points, start, duration }
  var trail = [];

  function greatCircle(a, b, steps) {
    var lat1 = a.lat * RAD, lng1 = a.lng * RAD, lat2 = b.lat * RAD, lng2 = b.lng * RAD;
    var d = 2 * Math.asin(Math.sqrt(Math.pow(Math.sin((lat2 - lat1) / 2), 2) + Math.cos(lat1) * Math.cos(lat2) * Math.pow(Math.sin((lng2 - lng1) / 2), 2)));
    if (!d) return [[a.lng, a.lat], [b.lng, b.lat]];
    var points = [], prev = null;
    for (var i = 0; i <= steps; i++) {
      var f = i / steps;
      var A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d);
      var x = A * Math.cos(lat1) * Math.cos(lng1) + B * Math.cos(lat2) * Math.cos(lng2);
      var y = A * Math.cos(lat1) * Math.sin(lng1) + B * Math.cos(lat2) * Math.sin(lng2);
      var z = A * Math.sin(lat1) + B * Math.sin(lat2);
      var lng = Math.atan2(y, x) / RAD, lat = Math.atan2(z, Math.sqrt(x * x + y * y)) / RAD;
      if (prev !== null) { while (lng - prev > 180) lng -= 360; while (prev - lng > 180) lng += 360; }
      prev = lng;
      points.push([lng, lat]);
    }
    return points;
  }

  function setLine(sourceId, lines) {
    var src = map.getSource(sourceId);
    if (!src) return;
    src.setData({
      type: 'FeatureCollection',
      features: lines.filter(function (l) { return l.length > 1; }).map(function (l) {
        return { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: l } };
      })
    });
  }

  function finishArc() {
    if (!arcAnim) return;
    trail.push(arcAnim.points);
    if (trail.length > 80) trail.shift();
    setLine('explore-trail', trail);
    setLine('explore-arc', []);
    arcAnim = null;
  }

  function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

  function frame(now) {
    var dt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;

    if (arcAnim) {
      var t = Math.min(1, (now - arcAnim.start) / arcAnim.duration);
      var n = Math.max(2, Math.ceil(easeInOut(t) * arcAnim.points.length));
      setLine('explore-arc', [arcAnim.points.slice(0, n)]);
    }

    if (!reduceMotion && !document.hidden && !viewerOpen) {
      // During the journey the collage drifts down on its own so photos
      // below the fold get seen; any scroll by the user hands it back.
      if (playing && arrived && state === 'place' && !panelTouched && ticks >= 2) {
        var maxScroll = collage.scrollHeight - collage.clientHeight;
        if (scrollPos < maxScroll) {
          scrollPos = Math.min(maxScroll, Math.max(scrollPos, collage.scrollTop) + dt * 34);
          collage.scrollTop = scrollPos;
        }
      }
      if (flat) {
        // The flat map stays still.
      } else if (orbiting && state === 'place') {
        map.setBearing(map.getBearing() + dt * 1.8);
      } else if ((state === 'intro' || state === 'globe') && !map.isMoving() && map.getZoom() < 4 && now - lastInteraction > 4000) {
        var c = map.getCenter();
        map.setCenter([c.lng - dt * 2.4, c.lat]);
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  function userTookOver() {
    lastInteraction = performance.now();
    orbiting = false;
    flightToken++;
    if (arcAnim) finishArc();
    if (playing) setPlaying(false);
  }
  ['mousedown', 'touchstart', 'wheel'].forEach(function (evt) { map.on(evt, userTookOver); });

  function flyCamera(options, onArrive) {
    var token = ++flightToken;
    orbiting = false;
    if (reduceMotion) {
      map.jumpTo(options);
      if (onArrive) onArrive();
      return;
    }
    map.flyTo(Object.assign({ essential: true, curve: 1.42 }, options));
    map.once('moveend', function () {
      if (token === flightToken && onArrive) onArrive();
    });
  }

  function frameCountry(name) {
    var g = groups[name];
    if (!g) return;
    var minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
    g.forEach(function (p) {
      minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat);
      minLng = Math.min(minLng, p.lng); maxLng = Math.max(maxLng, p.lng);
    });
    var pad = padding('country');
    var w = Math.max(200, root.clientWidth - pad.left - pad.right - 100);
    var h = Math.max(200, root.clientHeight - pad.top - pad.bottom - 90);
    var midLat = (minLat + maxLat) / 2;
    var lngSpan = Math.max(0.4, maxLng - minLng);
    var latSpan = Math.max(0.3, maxLat - minLat) / Math.cos(midLat * RAD);
    var zoom = Math.min(Math.log2((w / 512) * 360 / lngSpan), Math.log2((h / 512) * 360 / latSpan));
    flyCamera({
      center: [(minLng + maxLng) / 2, midLat],
      zoom: Math.max(2.4, Math.min(8.6, zoom)),
      pitch: flat ? 0 : 38,
      bearing: 0,
      padding: pad,
      duration: 2600
    });
  }

  /* ------------------------------------------------------------ photo pins */

  var pins = [];
  var pinsCountry = null;

  function syncPins() {
    // Flat map: a photo pin on every location (like the old Locations page).
    // Globe: pins only for the country in focus, glowing dots elsewhere.
    var wanted = flat ? '*' : activeCountry;
    if (pinsCountry !== wanted) {
      pins.forEach(function (pin) { pin.marker.remove(); });
      pins = [];
      pinsCountry = wanted;
      (flat ? places : (groups[activeCountry] || [])).forEach(function (p) {
        var el = document.createElement('button');
        el.type = 'button';
        el.className = 'explore-pin';
        el.setAttribute('aria-label', p.title);
        el.innerHTML = '<img alt="" loading="lazy" src="/images/thumb/' + p.thumb + '"><span>' + escapeHtml(p.title) + '</span>';
        el.addEventListener('click', function (e) {
          e.stopPropagation();
          selectPlace(p);
        });
        var marker = new mapboxgl.Marker({ element: el, anchor: 'center' }).setLngLat([p.lng, p.lat]).addTo(map);
        pins.push({ place: p, el: el, marker: marker });
      });
    }
    pins.forEach(function (pin) { pin.el.classList.toggle('is-active', pin.place === current); });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }

  /* ----------------------------------------------------------------- rail */

  var rail = $('explore-rail');
  countryNames.slice().sort(function (a, b) { return countryTitle(a).localeCompare(countryTitle(b)); }).forEach(function (name) {
    var c = countryByName[name] || {};
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'explore-rail__item';
    btn.dataset.country = name;
    // Circular flag; falls back to the flag's first colour if the PNG is missing.
    var fallback = (c.colors && c.colors[0]) || '#3a3d42';
    btn.innerHTML = '<span class="explore-rail__flag" aria-hidden="true" style="background-color:' + escapeHtml(fallback) + '">' +
      '<img alt="" loading="lazy" src="/images/flags/' + encodeURIComponent(name) + '.png" onerror="this.remove()"></span>' +
      '<span class="explore-rail__name">' + escapeHtml(countryTitle(name)) + '</span>' +
      '<span class="explore-rail__count">' + groups[name].length + '</span>';
    rail.appendChild(btn);
  });
  rail.addEventListener('click', function (e) {
    var btn = e.target.closest('.explore-rail__item');
    if (!btn) return;
    setPlaying(false);
    if (btn.dataset.country) showCountry(btn.dataset.country);
    else showGlobe();
  });

  function syncRail() {
    Array.prototype.forEach.call(rail.children, function (btn) {
      var on = (btn.dataset.country || '') === activeCountry;
      btn.classList.toggle('is-active', on);
      if (on && rail.scrollWidth > rail.clientWidth) {
        rail.scrollTo({ left: btn.offsetLeft - rail.clientWidth / 2 + btn.offsetWidth / 2, behavior: 'smooth' });
      } else if (on && rail.scrollHeight > rail.clientHeight) {
        var top = btn.offsetTop, bottom = top + btn.offsetHeight;
        if (top < rail.scrollTop || bottom > rail.scrollTop + rail.clientHeight) {
          rail.scrollTo({ top: top - rail.clientHeight / 2, behavior: 'smooth' });
        }
      }
    });
  }

  /* ------------------------------------------------------------ the panel */

  // The panel shows a location's photos as a justified collage: rows are
  // filled left to right and each row's height is solved so it spans the
  // panel exactly, so every photo keeps its own shape and nothing is cropped.
  // Shapes aren't known at build time, so thumbnails are probed in batches
  // (more load as you scroll) and each batch appends the rows it completes.
  var collage = $('explore-collage');
  var ratios = {};           // photo path -> width / height
  var photoIndex = 0;        // photo shown in the full-screen viewer
  var collageToken = 0;
  var known = 0;             // photos of the current place with a known shape
  var rowsRendered = 0;
  var tilesRendered = 0;
  var loadingBatch = false;
  var panelTouched = false;  // user scrolled the collage: stop auto-scrolling
  var scrollPos = 0;
  var ticker = null;
  var ticks = 0;             // seconds spent at this stop since arriving
  var arrived = false;
  var GAP = 6, BATCH = 24, DWELL_SECONDS = 11;

  function probe(paths, done) {
    var left = paths.length;
    if (!left) return done();
    paths.forEach(function (p) {
      if (ratios[p]) { if (!--left) done(); return; }
      var im = new Image();
      im.onload = im.onerror = function () {
        ratios[p] = im.naturalWidth && im.naturalHeight ? im.naturalWidth / im.naturalHeight : 1.5;
        if (!--left) done();
      };
      im.src = '/images/thumb/' + p;
    });
  }

  // Greedy justified rows over photos[0..count). Row targets cycle through a
  // few heights so the collage has some rhythm instead of even stripes.
  function buildRows(photos, count, width, complete, zoom) {
    var scale = (isMobile() ? 0.78 : 1) * (zoom || 1);
    var targets = [158, 124, 140];
    var rows = [], row = [], sum = 0;
    // The opening row is taller so the collage starts with a statement.
    function target() { return (rows.length ? targets[rows.length % targets.length] : 205) * scale; }
    for (var i = 0; i < count; i++) {
      var r = ratios[photos[i]] || 1.5;
      if (i === 0 && r >= 1.15) {
        // Lead photo: a landscape opener gets the full width to itself.
        rows.push({ h: width / r, items: [{ i: 0, w: width }], lead: true });
        continue;
      }
      var t = target();
      // Would adding this photo squeeze the row below its target height? If
      // the row is nearer the target without it, close the row first, so a
      // run of portraits never ends up as a strip of slivers.
      if (row.length) {
        var hWith = (width - GAP * row.length) / (sum + r);
        var hWithout = (width - GAP * (row.length - 1)) / sum;
        if (hWith < t && Math.abs(Math.log(hWithout / t)) < Math.abs(Math.log(hWith / t))) {
          rows.push({ h: hWithout, items: row.map(function (x) { return { i: x.i, w: x.r * hWithout }; }) });
          row = []; sum = 0;
          t = target();
        }
      }
      row.push({ i: i, r: r });
      sum += r;
      var inner = width - GAP * (row.length - 1);
      if (sum * t >= inner) {
        var h = inner / sum;
        rows.push({ h: h, items: row.map(function (x) { return { i: x.i, w: x.r * h }; }) });
        row = []; sum = 0;
      }
    }
    if (row.length && complete) {
      var lastH = Math.min(target() * 1.25, (width - GAP * (row.length - 1)) / sum);
      rows.push({ h: lastH, items: row.map(function (t) { return { i: t.i, w: t.r * lastH }; }) });
    }
    return rows;
  }

  // With only a handful of photos the default row heights leave half the
  // panel empty, so grow the rows until the collage fills the height. Tries
  // progressively larger rows and keeps the one that lands closest to full;
  // a small overflow (which just scrolls) beats a big gap.
  var collageZoom = 1;

  function fitZoom(photos, width) {
    var avail = collage.clientHeight - 30;
    if (avail <= 0) return 1;
    var best = 1, bestScore = Infinity;
    for (var z = 1; z <= 6.01; z += 0.1) {
      var rows = buildRows(photos, photos.length, width, true, z);
      var total = GAP * (rows.length - 1);
      rows.forEach(function (r) { total += r.h; });
      var fill = total / avail;
      // Under-filling costs its gap; overflowing costs more, and past 30% is out.
      var score = fill <= 1 ? 1 - fill : (fill <= 1.3 ? (fill - 1) * 1.6 : Infinity);
      if (score < bestScore) { bestScore = score; best = z; }
    }
    return best;
  }

  // For a small set, try every way of splitting the photos (in order) into
  // rows. Each row is justified to the full width, so there is never a ragged
  // edge; the split whose total height best matches the panel wins.
  var SMALL_SET = 12, MIN_ROW = 120;

  function fitSplit(photos, width) {
    var n = photos.length;
    var avail = collage.clientHeight - 30;
    if (avail <= 0) return null;
    var r = photos.map(function (p) { return ratios[p] || 1.5; });
    var best = null, bestFill = 0, bestScore = Infinity;
    for (var mask = 0; mask < (1 << (n - 1)); mask++) {
      var rows = [], start = 0, total = 0, minH = Infinity, maxH = 0;
      for (var i = 0; i < n; i++) {
        if (i === n - 1 || (mask >> i) & 1) {
          var sum = 0;
          for (var k = start; k <= i; k++) sum += r[k];
          // A row is justified to the width unless that would make it taller
          // than the panel (a lone portrait); then it is capped and centred.
          var h = Math.min((width - GAP * (i - start)) / sum, n === 1 ? avail : avail * 0.8);
          var items = [];
          for (k = start; k <= i; k++) items.push({ i: k, w: r[k] * h });
          rows.push({ h: h, items: items });
          total += h;
          minH = Math.min(minH, h); maxH = Math.max(maxH, h);
          start = i + 1;
        }
      }
      total += GAP * (rows.length - 1);
      var fill = total / avail;
      var score = fill <= 1 ? 1 - fill : (fill <= 1.35 ? (fill - 1) * 1.6 : 10 + fill);
      // Rows of similar height read as a collage; one giant photo over a
      // strip of tiny ones does not. Penalise imbalance, and penalise hard
      // any row too short to see the photos in it.
      score += 0.12 * (maxH / minH - 1);
      if (minH < MIN_ROW) score += 3 * (MIN_ROW - minH) / MIN_ROW;
      if (score < bestScore) { bestScore = score; best = rows; bestFill = fill; }
    }
    return { rows: best, fill: bestFill };
  }

  function renderRows() {
    if (!current) return;
    var width = collage.clientWidth;
    if (!width) return;
    var photos = current.photos;
    // Only sets that arrive in one batch are fitted; longer ones scroll anyway.
    if (rowsRendered === 0) collageZoom = known >= photos.length ? fitZoom(photos, width) : 1;
    var rows = buildRows(photos, known, width, known >= photos.length, collageZoom);
    if (rowsRendered === 0 && known >= photos.length && photos.length <= SMALL_SET) {
      // If no clean split comes close (say a landscape plus a portrait), keep
      // the enlarged rows instead: the short last row is centred by CSS.
      var split = fitSplit(photos, width);
      if (split && split.fill >= 0.72) rows = split.rows;
    }
    var html = '';
    for (var r = rowsRendered; r < rows.length; r++) {
      var row = rows[r];
      html += '<div class="explore-collage__row" style="height:' + row.h.toFixed(2) + 'px">';
      row.items.forEach(function (t) {
        var path = photos[t.i];
        // Big tiles get the full-size file; small ones stay on thumbnails.
        var size = t.w > 300 ? 'full' : 'thumb';
        html += '<button type="button" class="explore-tile" data-index="' + t.i + '" aria-label="Photo ' + (t.i + 1) + ' of ' + photos.length + '"' +
          ' style="width:' + t.w.toFixed(2) + 'px;--i:' + (tilesRendered % BATCH) + ';background-image:url(&quot;/images/blur/' + path + '&quot;)">' +
          '<img alt="" loading="lazy" decoding="async" src="/images/' + size + '/' + path + '"></button>';
        tilesRendered++;
      });
      html += '</div>';
    }
    rowsRendered = rows.length;
    if (html) collage.insertAdjacentHTML('beforeend', html);
  }

  function loadMore() {
    if (!current || loadingBatch || known >= current.photos.length) return;
    loadingBatch = true;
    var token = collageToken;
    var upTo = Math.min(current.photos.length, known + BATCH);
    probe(current.photos.slice(known, upTo), function () {
      if (token !== collageToken) return;
      loadingBatch = false;
      known = upTo;
      renderRows();
      fillIfShort();
    });
  }

  function fillIfShort() {
    if (collage.scrollHeight - collage.scrollTop - collage.clientHeight < 400) loadMore();
  }

  function resetCollage() {
    collageToken++;
    loadingBatch = false;
    known = rowsRendered = tilesRendered = 0;
    collage.innerHTML = '';
    collage.scrollTop = scrollPos = 0;
  }

  collage.addEventListener('scroll', fillIfShort, { passive: true });
  ['wheel', 'touchstart', 'pointerdown', 'keydown'].forEach(function (evt) {
    collage.addEventListener(evt, function () { panelTouched = true; }, { passive: true });
  });
  collage.addEventListener('click', function (e) {
    var t = e.target.closest('.explore-tile');
    if (t) openViewer(Number(t.dataset.index));
  });

  function showPhoto(index) {
    if (!current) return;
    var n = current.photos.length;
    photoIndex = ((index % n) + n) % n;
    if (viewerOpen) paintViewer();
  }

  // One-second heartbeat: counts time at a stop and moves the journey on.
  function restartTicker() {
    clearInterval(ticker);
    ticks = 0;
    ticker = setInterval(function () {
      if (!current || viewerOpen || document.hidden || !playing || !arrived) return;
      if (++ticks >= DWELL_SECONDS) step(1);
    }, 1000);
  }

  function fillPanel(place) {
    var n = place.photos.length;
    $('explore-panel-country').textContent = countryTitle(place.country);
    $('explore-panel-title').textContent = place.title;
    $('explore-panel-meta').textContent = n + (n === 1 ? ' photo' : ' photos');
    $('explore-country-link').href = '/countries/' + place.country + '#chapter-' + place.name;
    $('explore-country-link').textContent = 'Open the ' + countryTitle(place.country) + ' gallery →';

    panelTouched = false;
    resetCollage();
    loadMore();
    restartTicker();
  }

  /* --------------------------------------------------------------- states */

  function setState(next) {
    state = next;
    root.dataset.state = next;
  }

  function syncTransport() {
    var label = $('explore-stop-label');
    if (current) {
      label.textContent = 'Stop ' + (current.stop + 1) + ' of ' + route.length;
      $('explore-progress').style.width = ((current.stop + 1) / route.length * 100) + '%';
    } else {
      label.textContent = activeCountry ? countryTitle(activeCountry) + ' · ' + groups[activeCountry].length + ' locations' : route.length + ' stops';
      $('explore-progress').style.width = '0%';
    }
  }

  function setHash(value) {
    try { history.replaceState(null, '', value ? '#' + value : location.pathname); } catch (e) {}
  }

  function selectPlace(place, opts) {
    opts = opts || {};
    var from = current;
    if (place === current && state === 'place') return;

    current = place;
    activeCountry = place.country;
    arrived = false;
    setState('place');
    fillPanel(place);
    syncPins();
    syncRail();
    syncTransport();
    paintCountryFocus();
    setHash(place.name);

    if (arcAnim) finishArc();
    var km = from ? distanceKm(from, place) : 0;
    var duration = from ? Math.max(3200, Math.min(9500, 3000 + km * 2.4)) : 6000;
    if (from && km > 0.5 && !reduceMotion) {
      arcAnim = { points: greatCircle(from, place, 72), start: performance.now(), duration: duration * 0.92 };
    }

    flyCamera(placeCamera(place, from && km > 0.5 ? bearingBetween(from, place) : -20, duration), function () {
      finishArc();
      arrived = true;
      ticks = 0;
      orbiting = true;
    });
  }

  function placeCamera(place, bearing, duration) {
    return {
      center: [place.lng, place.lat],
      zoom: flat ? 11 : 12.3,
      pitch: flat ? 0 : 64,
      bearing: flat ? 0 : bearing,
      padding: padding('place'),
      duration: duration
    };
  }

  function worldCamera(duration) {
    var c = map.getCenter();
    return { center: [flat ? 8 : c.lng, flat ? 38 : 30], zoom: globeZoom(), pitch: 0, bearing: 0, padding: padding('globe'), duration: duration };
  }

  // Switch between the 3D globe and the flat map. Mapbox can't tween between
  // projections, so the map fades out, swaps, re-frames and fades back in.
  var viewSwitch = $('explore-view');
  var switching = false;

  function setFlat(on) {
    if (on === flat || switching || !mapReady) return;
    switching = true;
    flat = on;
    setPlaying(false);
    orbiting = false;
    flightToken++;
    if (arcAnim) finishArc();
    root.dataset.view = on ? 'flat' : 'globe';
    Array.prototype.forEach.call(viewSwitch.children, function (b) {
      b.setAttribute('aria-pressed', (b.dataset.view === 'flat') === on ? 'true' : 'false');
    });
    if (state === 'intro') { setState('globe'); syncRail(); syncTransport(); }
    root.classList.add('is-switching');

    setTimeout(function () {
      map.stop();
      map.setProjection(on ? 'mercator' : 'globe');
      map.setTerrain(on ? null : TERRAIN);
      ['explore-glow', 'explore-dots', 'explore-hit'].forEach(function (id) {
        map.setLayoutProperty(id, 'visibility', on ? 'none' : 'visible');
      });
      syncPins();
      if (state === 'place' && current) map.jumpTo(placeCamera(current, -20));
      else if (state === 'country' && activeCountry) map.jumpTo(Object.assign(worldCamera(), { zoom: 3 }));
      else map.jumpTo(worldCamera());
      root.classList.remove('is-switching');
      switching = false;
      lastInteraction = performance.now();
      if (state === 'country' && activeCountry) frameCountry(activeCountry);
      if (state === 'place') { arrived = true; orbiting = !on; }
    }, 420);
  }

  viewSwitch.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (b) setFlat(b.dataset.view === 'flat');
  });

  function showCountry(name) {
    activeCountry = name;
    current = null;
    clearInterval(ticker);
    setState('country');
    syncPins();
    syncRail();
    syncTransport();
    paintCountryFocus();
    setHash('');
    if (arcAnim) finishArc();
    frameCountry(name);
  }

  function showGlobe() {
    activeCountry = '';
    current = null;
    clearInterval(ticker);
    setState('globe');
    syncPins();
    syncRail();
    syncTransport();
    paintCountryFocus();
    setHash('');
    if (arcAnim) finishArc();
    lastInteraction = 0;
    flyCamera(worldCamera(3000));
  }

  function step(delta) {
    var index;
    if (current) index = (current.stop + delta + route.length) % route.length;
    else if (activeCountry) index = Math.min.apply(null, groups[activeCountry].map(function (p) { return p.stop; }));
    else index = 0;
    selectPlace(route[index]);
  }

  function setPlaying(on) {
    playing = on;
    root.dataset.playing = on ? 'true' : 'false';
    var btn = $('explore-play');
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.setAttribute('aria-label', on ? 'Pause the journey' : 'Play the journey');
    if (on) {
      if (!current) step(1);
      else { ticks = 0; orbiting = arrived; }
    }
  }

  $('explore-begin').addEventListener('click', function () { setPlaying(true); });
  $('explore-play').addEventListener('click', function () { setPlaying(!playing); });
  $('explore-next').addEventListener('click', function () { step(1); });
  $('explore-prev').addEventListener('click', function () { step(-1); });
  $('explore-close').addEventListener('click', function () {
    setPlaying(false);
    if (activeCountry) showCountry(activeCountry); else showGlobe();
  });

  /* ---------------------------------------------------- hover + click dots */

  var hover = $('explore-hover');
  var hoverId = null;

  map.on('mousemove', 'explore-hit', function (e) {
    var f = e.features && e.features[0];
    if (!f) return;
    var place = places[f.properties.id];
    if (!place) return;
    map.getCanvas().style.cursor = 'pointer';
    if (hoverId !== place.id) {
      hoverId = place.id;
      $('explore-hover-img').src = '/images/thumb/' + place.thumb;
      $('explore-hover-title').textContent = place.title;
      $('explore-hover-country').textContent = countryTitle(place.country) + ' · ' + place.photos.length + (place.photos.length === 1 ? ' photo' : ' photos');
    }
    var x = Math.min(e.point.x + 18, root.clientWidth - 250);
    var y = Math.max(e.point.y - 96, 8);
    hover.style.transform = 'translate(' + x + 'px,' + y + 'px)';
    hover.classList.add('is-visible');
  });
  map.on('mouseleave', 'explore-hit', function () {
    map.getCanvas().style.cursor = '';
    hover.classList.remove('is-visible');
    hoverId = null;
  });
  map.on('click', 'explore-hit', function (e) {
    var f = e.features && e.features[0];
    if (!f) return;
    hover.classList.remove('is-visible');
    var place = places[f.properties.id];
    if (place) selectPlace(place);
  });

  /* --------------------------------------------------------------- viewer */

  var viewer = $('explore-viewer');
  var viewerOpen = false;

  function paintViewer() {
    if (!current) return;
    $('explore-viewer-img').src = '/images/full/' + current.photos[photoIndex];
    $('explore-viewer-caption').textContent = current.title + ', ' + countryTitle(current.country) + ' · ' + (photoIndex + 1) + ' / ' + current.photos.length;
  }
  function openViewer(index) {
    if (!current) return;
    photoIndex = index || 0;
    viewerOpen = true;
    viewer.hidden = false;
    paintViewer();
    $('explore-viewer-close').focus();
  }
  function closeViewer() {
    viewerOpen = false;
    viewer.hidden = true;
    restartTicker();
    var tile = collage.querySelector('.explore-tile[data-index="' + photoIndex + '"]');
    if (tile) tile.focus({ preventScroll: true });
  }
  $('explore-viewer-close').addEventListener('click', closeViewer);
  $('explore-viewer-prev').addEventListener('click', function () { showPhoto(photoIndex - 1); });
  $('explore-viewer-next').addEventListener('click', function () { showPhoto(photoIndex + 1); });
  viewer.addEventListener('click', function (e) { if (e.target === viewer) closeViewer(); });

  /* ------------------------------------------------------------- keyboard */

  document.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;

    if (viewerOpen) {
      if (e.key === 'Escape') closeViewer();
      else if (e.key === 'ArrowRight') showPhoto(photoIndex + 1);
      else if (e.key === 'ArrowLeft') showPhoto(photoIndex - 1);
      else return;
      e.preventDefault();
      return;
    }
    if (e.key === 'ArrowRight') step(1);
    else if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === ' ' && tag !== 'button' && tag !== 'a') setPlaying(!playing);
    else if (e.key === 'Escape' && state === 'place') $('explore-close').click();
    else return;
    e.preventDefault();
  });

  /* ----------------------------------------------------------------- boot */

  window.addEventListener('resize', function () {
    layoutRoot();
    map.resize();
    if (current) {
      // Row geometry depends on the panel width: re-flow what is loaded.
      var keep = known;
      collage.innerHTML = '';
      rowsRendered = tilesRendered = 0;
      known = keep;
      renderRows();
    }
  });

  window.addEventListener('hashchange', function () {
    var wanted = placeByName[decodeURIComponent(location.hash.slice(1))];
    if (wanted && wanted !== current) { setPlaying(false); selectPlace(wanted); }
  });

  // Reveal as soon as the style is in (tiles keep streaming in afterwards)
  // rather than waiting for the full 'load', which can take several seconds.
  map.once('style.load', function () {
    mapReady = true;
    root.classList.add('is-ready');
    syncRail();
    syncTransport();
    var wanted = placeByName[decodeURIComponent(location.hash.slice(1))];
    if (wanted) selectPlace(wanted);
    else if (location.hash === '#flat') { setHash(''); setFlat(true); }
  });
});
