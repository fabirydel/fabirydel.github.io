// Trips: the index (a satellite map of each route) and a single trip (an
// animated route on a flat Mapbox map). A trip is an ordered list of
// locations; the order comes from the date set on each stop.
//
// Data is inlined by the layouts as JSON (#tr-data). Styles: _sass/trips.scss.

(function () {
  'use strict';

  var TOKEN = 'pk.eyJ1IjoiZmFiaXJ5ZGVsIiwiYSI6ImNrajYwcHcwbTYzZDEycWxicjFtNzdqa2kifQ.8AEeHc6W_kHGvgIZQNq2WA';
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host.endsWith('.local')) {
    document.documentElement.classList.add('tr-dev');
  }

  // ------------------------------------------------------------------
  // Shared helpers
  // ------------------------------------------------------------------
  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function prettyName(slug) {
    return String(slug || '').replace(/_/g, ' ').replace(/\b\w/g, function (m) { return m.toUpperCase(); });
  }

  function parseDate(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }

  function fmtDate(d) { return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear(); }

  function fmtRange(a, b) {
    if (!a) return '';
    if (!b || a.getTime() === b.getTime()) return fmtDate(a);
    if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()) {
      return a.getDate() + '–' + b.getDate() + ' ' + MONTHS[a.getMonth()] + ' ' + a.getFullYear();
    }
    if (a.getFullYear() === b.getFullYear()) {
      return a.getDate() + ' ' + MONTHS[a.getMonth()] + ' – ' + b.getDate() + ' ' + MONTHS[b.getMonth()] + ' ' + a.getFullYear();
    }
    return fmtDate(a) + ' – ' + fmtDate(b);
  }

  function dayDiff(a, b) { return Math.round((b - a) / 86400000); }

  function km(a, b) {
    var R = 6371, rad = Math.PI / 180;
    var dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  function fmtKm(n) {
    n = Math.round(n);
    return (n >= 1000 ? n.toLocaleString('en-US') : String(n)) + ' km';
  }

  // Stops come out of Liquid in file order; the order of a trip is by date.
  function cleanStops(raw) {
    var list = (raw || []).filter(Boolean).map(function (s, i) {
      // A stop can pick which of the place's photos belong to this trip.
      var pics = Array.isArray(s.p) && s.p.length ? s.p : null;
      return {
        name: s.n, title: s.t, country: s.c, thumb: pics ? pics[0] : s.i, pics: pics,
        lat: +s.ll[0], lng: +s.ll[1], date: parseDate(s.d), dateStr: s.d, mode: s.m || '', _i: i
      };
    }).filter(function (s) { return isFinite(s.lat) && isFinite(s.lng); });
    list.sort(function (a, b) {
      var ta = a.date ? a.date.getTime() : Infinity, tb = b.date ? b.date.getTime() : Infinity;
      return ta - tb || a._i - b._i;
    });
    list.forEach(function (s, i) {
      s.index = i;
      s.legKm = i ? km(list[i - 1], s) : 0;
    });
    return list;
  }

  function summarise(stops) {
    var countries = {}, places = {}, total = 0;
    stops.forEach(function (s) { countries[s.country] = 1; places[s.name] = 1; total += s.legKm; });
    var first = stops.length && stops[0].date, last = stops.length && stops[stops.length - 1].date;
    return {
      stops: stops.length,
      places: Object.keys(places).length,
      countries: Object.keys(countries).length,
      km: total,
      days: first && last ? dayDiff(first, last) + 1 : 0,
      range: first ? fmtRange(first, last) : ''
    };
  }

  function statLine(sum) {
    var bits = [];
    bits.push(sum.places + (sum.places === 1 ? ' location' : ' locations'));
    if (sum.countries) bits.push(sum.countries + (sum.countries === 1 ? ' country' : ' countries'));
    if (sum.km >= 1) bits.push(fmtKm(sum.km));
    if (sum.days > 1) bits.push(sum.days + ' days');
    return bits.join(' · ');
  }

  // Small round country flags for a trip, in order of first visit. One flag
  // stands alone, several overlap like a hand of cards, and past MAX_FLAGS
  // the rest collapse into a "+N" badge (its tooltip lists them).
  var MAX_FLAGS = 4;
  function flagsHtml(stops) {
    var seen = {}, names = [];
    stops.forEach(function (s) { if (s.country && !seen[s.country]) { seen[s.country] = 1; names.push(s.country); } });
    if (!names.length) return '';
    var shown = names.length > MAX_FLAGS ? names.slice(0, MAX_FLAGS - 1) : names;
    var rest = names.slice(shown.length);
    var html = shown.map(function (n) {
      return '<span class="tr-flag" title="' + esc(prettyName(n)) + '"><img alt="' + esc(prettyName(n)) +
        '" loading="lazy" src="/images/flags/' + encodeURIComponent(n) + '.png" onerror="this.remove()"></span>';
    }).join('');
    if (rest.length) {
      html += '<span class="tr-flag tr-flag--more" title="' + esc(rest.map(prettyName).join(', ')) + '">+' + rest.length + '</span>';
    }
    return '<span class="tr-flags" data-count="' + names.length + '" aria-label="' + esc(names.map(prettyName).join(', ')) + '">' + html + '</span>';
  }

  // Trip page: what and where on the first line, when and how far on the second.
  function statHtml(sum) {
    var one = [sum.places + (sum.places === 1 ? ' location' : ' locations')];
    if (sum.countries) one.push(sum.countries + (sum.countries === 1 ? ' country' : ' countries'));
    var two = [];
    if (sum.range) two.push(sum.range);
    if (sum.km >= 1) two.push(fmtKm(sum.km));
    if (sum.days > 1) two.push(sum.days + ' days');
    return '<span>' + esc(one.join(' · ')) + '</span>' + (two.length ? '<span>' + esc(two.join(' · ')) + '</span>' : '');
  }

  // Web Mercator in "world units" (0..1 across the whole world).
  function mx(lng) { return (lng + 180) / 360; }
  function my(lat) {
    var s = Math.sin(lat * Math.PI / 180);
    s = Math.max(-0.9999, Math.min(0.9999, s));
    return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
  }
  function unmy(y) {
    var n = Math.PI - 2 * Math.PI * y;
    return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  }

  // ------------------------------------------------------------------
  // Index
  // ------------------------------------------------------------------
  var CARD_W = 640, CARD_H = 400;

  // A viewport (center + zoom) that fits every stop, in the same maths the
  // Mapbox static image API uses, so the SVG route lines up with the image.
  function cardView(stops) {
    var minX = 1, maxX = 0, minY = 1, maxY = 0;
    stops.forEach(function (s) {
      var x = mx(s.lng), y = my(s.lat);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    });
    var pad = 78;
    var dx = Math.max(maxX - minX, 1e-9), dy = Math.max(maxY - minY, 1e-9);
    var world = Math.min((CARD_W - pad * 2) / dx, (CARD_H - pad * 2) / dy);
    var zoom = Math.log2(world / 512);
    zoom = Math.floor(Math.max(0.4, Math.min(10.5, zoom)) * 100) / 100;
    var cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    return { zoom: zoom, world: 512 * Math.pow(2, zoom), cx: cx, cy: cy, lng: cx * 360 - 180, lat: unmy(cy) };
  }

  function cardImageUrl(v) {
    return 'https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static/' +
      v.lng.toFixed(5) + ',' + v.lat.toFixed(5) + ',' + v.zoom + ',0/' + CARD_W + 'x' + CARD_H +
      '@2x?logo=false&attribution=false&access_token=' + TOKEN;
  }

  function cardMapHtml(stops) {
    if (!stops.length) return '<div class="tr-card__map tr-card__map--empty"></div>';
    var v = cardView(stops);
    var pts = stops.map(function (s) {
      return {
        x: CARD_W / 2 + (mx(s.lng) - v.cx) * v.world,
        y: CARD_H / 2 + (my(s.lat) - v.cy) * v.world
      };
    });
    var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1); }).join(' ');
    var dots = pts.map(function (p, i) {
      var cls = i === 0 ? ' tr-dot--start' : (i === pts.length - 1 ? ' tr-dot--end' : '');
      return '<circle class="tr-dot' + cls + '" cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="' +
        (i === 0 || i === pts.length - 1 ? 7 : 4.5) + '" style="--d:' + (i / Math.max(1, pts.length - 1)).toFixed(3) + '"/>';
    }).join('');
    return '<div class="tr-card__map">' +
      '<img src="' + cardImageUrl(v) + '" alt="" loading="lazy" decoding="async" onerror="this.remove()">' +
      '<svg viewBox="0 0 ' + CARD_W + ' ' + CARD_H + '" preserveAspectRatio="xMidYMid slice" aria-hidden="true">' +
      (pts.length > 1
        ? '<path class="tr-route tr-route--glow" pathLength="1" d="' + d + '"/><path class="tr-route" pathLength="1" d="' + d + '"/>'
        : '') +
      dots + '</svg></div>';
  }

  function initIndex() {
    var grid = $('tr-grid');
    var dataEl = $('tr-data');
    if (!grid || !dataEl) return;
    var data = JSON.parse(dataEl.textContent);

    var trips = data.trips.map(function (t) {
      var stops = cleanStops(t.stops);
      return { slug: t.slug, title: t.title, description: t.description, stops: stops, sum: summarise(stops) };
    });
    // Newest trip first; undated ones last.
    trips.sort(function (a, b) {
      var ta = a.stops.length && a.stops[0].date ? a.stops[0].date.getTime() : -Infinity;
      var tb = b.stops.length && b.stops[0].date ? b.stops[0].date.getTime() : -Infinity;
      return tb - ta;
    });

    var html = trips.map(function (t, i) {
      return '<a class="tr-card" href="/trips/' + esc(t.slug) + '" style="--i:' + i + '">' +
        cardMapHtml(t.stops) +
        '<span class="tr-card__label"><span class="tr-card__head"><strong>' + esc(t.title) + '</strong>' + flagsHtml(t.stops) + '</span>' +
        (t.sum.range ? '<em>' + esc(t.sum.range) + '</em>' : '') +
        '<small>' + esc(statLine(t.sum)) + '</small></span></a>';
    }).join('');
    grid.innerHTML = html;

    var devCard = document.querySelector('.tr-card--new');
    if (devCard) grid.appendChild(devCard);
    if (!trips.length && !devCard) grid.innerHTML = '<p class="tr-empty">No trips yet.</p>';

    var cards = Array.prototype.slice.call(grid.querySelectorAll('.tr-card'));
    function draw(card) {
      card.classList.remove('is-in');
      void card.offsetWidth;
      card.classList.add('is-in');
    }
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) { draw(e.target); io.unobserve(e.target); }
        });
      }, { threshold: 0.35 });
      cards.forEach(function (c) { io.observe(c); });
    } else {
      cards.forEach(function (c) { c.classList.add('is-in'); });
    }
    cards.forEach(function (c) {
      c.addEventListener('mouseenter', function () { if (!reduceMotion) draw(c); });
    });
  }

  // ------------------------------------------------------------------
  // A single trip
  // ------------------------------------------------------------------

  // Points along the great circle between two stops, longitudes unwrapped
  // against `prevLng` so the line never jumps across the antimeridian.
  function leg(a, b, prevLng) {
    var d = km(a, b);
    var steps = d < 250 ? 1 : Math.min(120, Math.ceil(d / 60));
    var rad = Math.PI / 180, deg = 180 / Math.PI;
    var la1 = a.lat * rad, lo1 = a.lng * rad, la2 = b.lat * rad, lo2 = b.lng * rad;
    var delta = d / 6371 || 1e-9;
    var out = [];
    for (var i = 1; i <= steps; i++) {
      var f = i / steps, lat, lng;
      if (steps === 1) {
        lat = b.lat; lng = b.lng;
      } else {
        var A = Math.sin((1 - f) * delta) / Math.sin(delta), B = Math.sin(f * delta) / Math.sin(delta);
        var x = A * Math.cos(la1) * Math.cos(lo1) + B * Math.cos(la2) * Math.cos(lo2);
        var y = A * Math.cos(la1) * Math.sin(lo1) + B * Math.cos(la2) * Math.sin(lo2);
        var z = A * Math.sin(la1) + B * Math.sin(la2);
        lat = Math.atan2(z, Math.sqrt(x * x + y * y)) * deg;
        lng = Math.atan2(y, x) * deg;
      }
      while (lng - prevLng > 180) lng -= 360;
      while (lng - prevLng < -180) lng += 360;
      out.push([lng, lat]);
      prevLng = lng;
    }
    return out;
  }

  function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

  function initTrip() {
    var root = $('tr-trip');
    var dataEl = $('tr-data');
    if (!root || !dataEl) return;

    var data = JSON.parse(dataEl.textContent);
    var stops = cleanStops(data.stops);
    var sum = summarise(stops);
    var errorEl = $('tr-error');

    function fail(msg) {
      errorEl.textContent = msg;
      errorEl.hidden = false;
    }

    $('tr-stats').innerHTML = statHtml(sum);
    $('tr-flags').innerHTML = flagsHtml(stops);
    renderStopsList();

    if (!stops.length) { fail('This trip has no stops yet.'); return; }
    if (!window.mapboxgl || !mapboxgl.supported()) { fail('The map needs WebGL, which this browser does not support.'); return; }

    // The shared location panel (same component as the Explore page).
    var panel = PlacePanel({ countryTitle: prettyName, isMobile: function () { return window.innerWidth <= 850; } });
    var transport = $('place-transport');

    function placeFor(s) {
      var photos = s.pics || (data.photos && data.photos[s.name]);
      return { name: s.name, title: s.title, country: s.country, photos: photos && photos.length ? photos : [s.thumb] };
    }

    // ---- geometry -----------------------------------------------------
    // The route is a list of points through every stop. Legs are straight
    // great-circle arcs until the road routes arrive (see fetchRoads); then
    // each driven leg follows the road. State is rebuilt by buildGeometry.
    var coords, cum, totalLen, stopDist;

    function buildGeometry(roads) {
      coords = [[stops[0].lng, stops[0].lat]];
      var stopAt = [0];
      for (var i = 1; i < stops.length; i++) {
        var s = stops[i], pts;
        if (roads && roads[i]) {
          pts = roads[i].concat([[s.lng, s.lat]]);
        } else {
          pts = leg(stops[i - 1], s, coords[coords.length - 1][0]);
        }
        pts.forEach(function (p) { coords.push(p); });
        stopAt.push(coords.length - 1);
      }
      cum = [0];
      for (var k = 1; k < coords.length; k++) {
        cum.push(cum[k - 1] + km({ lat: coords[k - 1][1], lng: coords[k - 1][0] }, { lat: coords[k][1], lng: coords[k][0] }));
      }
      totalLen = cum[cum.length - 1] || 1;
      stopDist = stopAt.map(function (ix) { return cum[ix]; });
      for (var j = 1; j < stops.length; j++) stops[j].legKm = stopDist[j] - stopDist[j - 1];
    }

    function partial(dist) {
      if (dist <= 0) return [coords[0]];
      if (dist >= totalLen) return coords.slice();
      var lo = 0, hi = cum.length - 1;
      while (hi - lo > 1) {
        var mid = (lo + hi) >> 1;
        if (cum[mid] <= dist) lo = mid; else hi = mid;
      }
      var f = (dist - cum[lo]) / ((cum[hi] - cum[lo]) || 1);
      var a = coords[lo], b = coords[hi];
      return coords.slice(0, hi).concat([[a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]]);
    }

    function lineData(c) {
      return { type: 'Feature', geometry: { type: 'LineString', coordinates: c.length > 1 ? c : [c[0], c[0]] } };
    }

    // Driving directions between consecutive stops (Mapbox Directions API),
    // so the line follows the roads. Legs marked "straight" (flights, ferries)
    // and legs with no road route keep the straight arc. Results are cached
    // in localStorage, so each leg is only requested once per browser.
    function fetchLeg(a, b) {
      var key = 'tr-road:' + [a.lng, a.lat, b.lng, b.lat].map(function (n) { return n.toFixed(4); }).join(',');
      try {
        var hit = localStorage.getItem(key);
        if (hit) return Promise.resolve(JSON.parse(hit));
      } catch (e) { /* no storage */ }
      var url = 'https://api.mapbox.com/directions/v5/mapbox/driving/' + a.lng + ',' + a.lat + ';' + b.lng + ',' + b.lat +
        '?geometries=geojson&overview=full&access_token=' + TOKEN;
      return fetch(url).then(function (r) { return r.json(); }).then(function (d) {
        var r = d && d.routes && d.routes[0];
        if (!r || d.code !== 'Ok') return null;
        // A road route that is wildly longer than the crow-flies line is a
        // detour round water; the arc is the more honest picture.
        if (r.distance / 1000 > Math.max(40, km(a, b) * 4)) return null;
        var pts = r.geometry.coordinates.map(function (c) { return [+c[0].toFixed(5), +c[1].toFixed(5)]; });
        try { localStorage.setItem(key, JSON.stringify(pts)); } catch (e) { /* full */ }
        return pts;
      }).catch(function () { return null; });
    }

    function fetchRoads() {
      var jobs = stops.map(function (s, i) {
        if (!i || s.mode === 'straight' || km(stops[i - 1], s) > 1800) return Promise.resolve(null);
        return fetchLeg(stops[i - 1], s);
      });
      return Promise.all(jobs).then(function (list) {
        return list.some(Boolean) ? list : null;
      });
    }

    buildGeometry(null);
    var roadsPromise = fetchRoads();

    // ---- map ------------------------------------------------------------
    mapboxgl.accessToken = TOKEN;
    var isMobile = function () { return window.innerWidth <= 850; };
    var selected = -1;          // stop shown in the panel (-1: none)

    // Room for the stop list on the left and, when open, the place panel.
    function padding() {
      if (isMobile()) {
        return { top: 70, bottom: selected >= 0 ? Math.round(window.innerHeight * 0.55) : Math.round(window.innerHeight * 0.46), left: 36, right: 36 };
      }
      return { top: 80, bottom: 80, left: 440, right: selected >= 0 ? 530 : 90 };
    }

    var bounds = new mapboxgl.LngLatBounds();
    function computeBounds() {
      bounds = new mapboxgl.LngLatBounds();
      coords.forEach(function (c) { bounds.extend(c); });
    }
    computeBounds();

    var map = new mapboxgl.Map({
      container: 'tr-map',
      style: 'mapbox://styles/mapbox/satellite-streets-v12',
      projection: 'mercator',
      bounds: bounds,
      fitBoundsOptions: { padding: padding(), maxZoom: 9 },
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      renderWorldCopies: true
    });
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-left');
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
    map.touchZoomRotate.disableRotation();

    map.on('error', function (e) {
      var m = e && e.error && e.error.message;
      if (m && /access token|401|403/i.test(m)) fail('The map could not be loaded (Mapbox refused the request).');
    });

    // ---- markers ----------------------------------------------------------
    var markers = stops.map(function (s) {
      var el = document.createElement('button');
      el.type = 'button';
      el.className = 'tr-pin is-hidden';
      el.setAttribute('aria-label', (s.index + 1) + '. ' + s.title);
      el.innerHTML = '<img alt="" src="/images/thumb/' + esc(s.thumb) + '"><b>' + (s.index + 1) + '</b><span>' + esc(s.title) + '</span>';
      el.addEventListener('click', function (e) { e.stopPropagation(); goTo(s.index); });
      var m = new mapboxgl.Marker({ element: el, anchor: 'center' }).setLngLat([s.lng, s.lat]).addTo(map);
      return { el: el, marker: m };
    });

    function showMarker(i, on) { markers[i].el.classList.toggle('is-hidden', !on); }

    // ---- state ------------------------------------------------------------
    var ready = false;
    var journey = false;        // stepping through the trip with the arrows
    var token = 0;              // bumped to cancel a running animation
    var introDone = false, introRunning = false;
    var head = 0;               // how far along the route the line is drawn (km)
    var playBtn = $('tr-play');
    var fitBtn = $('tr-fit');

    function reveal(dist) {
      head = dist;
      for (var i = 0; i < stops.length; i++) showMarker(i, stopDist[i] <= dist + 1e-6);
      map.getSource('tr-progress').setData(lineData(partial(dist)));
    }

    function revealAll() { reveal(totalLen); }

    function animate(from, to, ms, run, myToken) {
      return new Promise(function (resolve) {
        if (reduceMotion || ms <= 0 || from === to) { run(to); resolve(true); return; }
        var start = null;
        function frame(now) {
          if (myToken !== token) { resolve(false); return; }
          if (start === null) start = now;
          var t = Math.min(1, (now - start) / ms);
          run(from + (to - from) * easeInOut(t));
          if (t < 1) requestAnimationFrame(frame); else resolve(true);
        }
        requestAnimationFrame(frame);
      });
    }

    function fitAll(duration) {
      map.fitBounds(bounds, { padding: padding(), maxZoom: 9, duration: duration });
    }

    function frameStops(list, maxZoom, duration) {
      var lb = new mapboxgl.LngLatBounds([list[0].lng, list[0].lat], [list[0].lng, list[0].lat]);
      list.forEach(function (s) { lb.extend([s.lng, s.lat]); });
      map.fitBounds(lb, { padding: padding(), maxZoom: maxZoom, duration: reduceMotion ? 0 : duration });
    }

    // The intro: draw the whole route once, markers popping in as the line
    // reaches them.
    async function intro() {
      var my = ++token;
      introRunning = true;
      reveal(0);
      var ms = Math.max(2600, Math.min(6500, totalLen * 5));
      var ok = await animate(0, totalLen, ms, reveal, my);
      if (ok) { revealAll(); introDone = true; introRunning = false; }
    }

    // ---- the panel and the stop list ------------------------------------------
    function highlight(i) {
      markers.forEach(function (m, j) { m.el.classList.toggle('is-active', j === i); });
      Array.prototype.forEach.call($('tr-stops').querySelectorAll('button'), function (b) {
        var on = +b.dataset.i === i;
        b.classList.toggle('is-active', on);
        if (on && b.scrollIntoView) b.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      });
    }

    function syncTransport() {
      $('place-stop-label').textContent = 'Stop ' + (selected + 1) + ' of ' + stops.length;
      $('place-progress').style.width = ((selected + 1) / stops.length * 100) + '%';
      $('place-prev').disabled = selected <= 0;
      $('place-next').disabled = selected >= stops.length - 1;
    }

    function openPlace(i) {
      selected = i;
      panel.fill(placeFor(stops[i]));
      panel.open();
      root.classList.add('has-panel');
      transport.classList.remove('is-hidden');
      highlight(i);
      syncTransport();
    }

    function closePlace() {
      selected = -1;
      panel.close();
      root.classList.remove('has-panel');
      transport.classList.add('is-hidden');
      highlight(-1);
    }

    // Select a stop. In a journey the line is drawn (or rewound) to it.
    async function goTo(i) {
      if (!ready || i < 0 || i >= stops.length) return;
      var prev = selected;
      var my = ++token;
      openPlace(i);

      if (!journey) {
        frameStops([stops[i]], Math.max(9, Math.min(11, map.getZoom() + 1)), 1100);
        return;
      }

      var from = head, to = stopDist[i];
      var neighbours = prev >= 0 && Math.abs(prev - i) === 1;
      var ms = Math.max(1400, Math.min(3600, Math.abs(to - from) * 9));
      if (neighbours) frameStops([stops[prev], stops[i]], 10, ms);
      else frameStops([stops[i]], 10, 1300);
      await animate(from, to, ms, reveal, my);
    }

    function step(delta) {
      if (selected < 0) return;
      goTo(selected + delta);
    }

    // Play: the route starts over at the first stop; the arrows move on.
    function startJourney() {
      if (!ready) return;
      token++;
      journey = true;
      root.classList.add('is-journey');
      playBtn.hidden = true;
      fitBtn.hidden = false;
      reveal(0);
      selected = -1;
      goTo(0);
    }

    function endJourney() {
      token++;
      journey = false;
      root.classList.remove('is-journey');
      playBtn.hidden = false;
      fitBtn.hidden = true;
      closePlace();
      revealAll();
      fitAll(1200);
    }

    function dismiss() {
      if (journey) { endJourney(); return; }
      if (selected >= 0) { closePlace(); fitAll(1000); }
    }

    function renderStopsList() {
      var ol = $('tr-stops');
      ol.innerHTML = stops.map(function (s, i) {
        var gap = '';
        if (i) {
          gap = '<i class="tr-gap">' + fmtKm(s.legKm) + '</i>';
        }
        return '<li>' + gap + '<button type="button" data-i="' + i + '">' +
          '<img alt="" loading="lazy" src="/images/thumb/' + esc(s.thumb) + '">' +
          '<span class="tr-stops__n">' + (i + 1) + '</span>' +
          '<span class="tr-stops__t"><strong>' + esc(s.title) + '</strong><em>' + esc(prettyName(s.country)) +
          (s.date ? ' · ' + esc(fmtDate(s.date)) : '') + '</em></span></button></li>';
      }).join('');
    }

    $('tr-stops').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-i]');
      if (b) goTo(+b.dataset.i);
    });

    // ---- controls ---------------------------------------------------------------
    playBtn.addEventListener('click', startJourney);
    fitBtn.addEventListener('click', function () { if (ready) fitAll(1200); });
    $('place-close').addEventListener('click', dismiss);
    $('place-prev').addEventListener('click', function () { step(-1); });
    $('place-next').addEventListener('click', function () { step(1); });

    document.addEventListener('keydown', function (e) {
      if (e.metaKey || e.ctrlKey || e.altKey || panel.viewerOpen()) return;
      var tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === 'Escape') dismiss();
      else return;
      e.preventDefault();
    });

    // ---- layers -------------------------------------------------------------
    map.on('style.load', async function () {
      var arrow = document.createElement('canvas');
      arrow.width = arrow.height = 32;
      var g = arrow.getContext('2d');
      g.strokeStyle = '#ffffff';
      g.lineWidth = 4.5;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.beginPath();
      g.moveTo(10, 8);
      g.lineTo(21, 16);
      g.lineTo(10, 24);
      g.stroke();
      if (!map.hasImage('tr-arrow')) map.addImage('tr-arrow', g.getImageData(0, 0, 32, 32));

      map.addSource('tr-route', { type: 'geojson', data: lineData(coords) });
      map.addSource('tr-progress', { type: 'geojson', data: lineData([coords[0]]) });

      map.addLayer({
        id: 'tr-route-ghost', type: 'line', source: 'tr-route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#ffffff', 'line-opacity': 0.22, 'line-width': 1.6, 'line-dasharray': [1, 2.5] }
      });
      map.addLayer({
        id: 'tr-progress-glow', type: 'line', source: 'tr-progress',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#2f9bff', 'line-opacity': 0.55, 'line-width': 12, 'line-blur': 9 }
      });
      map.addLayer({
        id: 'tr-progress-line', type: 'line', source: 'tr-progress',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 3, 2.2, 10, 4] }
      });
      map.addLayer({
        id: 'tr-progress-arrows', type: 'symbol', source: 'tr-progress',
        layout: {
          'symbol-placement': 'line',
          'symbol-spacing': 110,
          'icon-image': 'tr-arrow',
          'icon-size': 0.55,
          'icon-rotation-alignment': 'map',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true
        }
      });

      ready = true;
      root.classList.add('is-ready');

      // Give the road routes a moment so the intro draws the final line.
      var roads = await Promise.race([roadsPromise, new Promise(function (r) { setTimeout(function () { r(undefined); }, 3000); })]);
      if (roads) applyRoads(roads);
      else roadsPromise.then(function (late) { if (late) applyRoads(late); });

      if (stops.length > 1) {
        if (!introDone) intro();
      } else {
        revealAll();
        playBtn.hidden = true;
        goTo(0);
      }
    });

    // The roads are in: swap them for the arcs and redraw where we are.
    function applyRoads(roads) {
      var restart = introRunning && !introDone;
      buildGeometry(roads);
      computeBounds();
      map.getSource('tr-route').setData(lineData(coords));
      sum = summarise(stops);
      $('tr-stats').innerHTML = statHtml(sum);
      renderStopsList();
      highlight(selected);
      token++; // cancels an intro still drawing the old line
      if (restart) intro();
      else if (selected >= 0 && journey) reveal(stopDist[selected]);
      else if (introDone || selected >= 0 || head > 0) revealAll();
      if (selected < 0 && !journey && !restart) fitAll(0);
    }

    window.addEventListener('resize', function () {
      panel.relayout();
      if (ready && !journey && selected < 0) fitAll(0);
    });
  }

  function init() {
    if (document.getElementById('tr-grid')) initIndex();
    if (document.getElementById('tr-trip')) initTrip();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
