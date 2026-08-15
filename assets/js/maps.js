document.addEventListener("DOMContentLoaded", function() {
  var country = document.getElementById('country-map');
  if (!country) return;

  var mapboxAttribution = 'Map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, Imagery © <a href="https://www.mapbox.com/">Mapbox</a>';
  var mapBoxUrl = 'https://api.mapbox.com/styles/v1/{id}/tiles/{z}/{x}/{y}?access_token={accessToken}';
  var accessToken = 'pk.eyJ1IjoiZmFiaXJ5ZGVsIiwiYSI6ImNrajYwcHcwbTYzZDEycWxicjFtNzdqa2kifQ.8AEeHc6W_kHGvgIZQNq2WA';

  var outdoors = L.tileLayer(mapBoxUrl, {
    attribution: mapboxAttribution,
    minZoom: country.dataset.zoom,
    id: 'mapbox/outdoors-v11',
    tileSize: 512,
    zoomOffset: -1,
    accessToken: accessToken
  });
  var satellite = L.tileLayer(mapBoxUrl, {
    attribution: mapboxAttribution,
    minZoom: country.dataset.zoom,
    id: 'mapbox/satellite-streets-v11',
    tileSize: 512,
    zoomOffset: -1,
    accessToken: accessToken
  });

  var baseMaps = {
    'Outdoors': outdoors,
    'Satellite': satellite
  };

  var countryMap = L.map('country-map', {
    maxBounds: JSON.parse(country.dataset.bounds || '[]'),
    layers: [satellite],
    scrollWheelZoom: true,
    touchZoom: true,
    /* The redesigned country page puts the map inside a small bubble
       with its own header/footer controls — and the page auto-pans/
       zooms on scroll, so the user rarely needs to zoom by hand.
       Wheel + pinch + double-click still zoom the map. */
    zoomControl: false,
    attributionControl: false
  }).setView(JSON.parse(country.dataset.latlng), country.dataset.zoom);

  /* No layers control — satellite is the only tile layer. The outdoors
     layer + baseMaps dict are kept above in case we want to re-introduce
     the picker later. */

  // Markers indexed by location namePath so country-page.js can highlight
  // the one matching the currently-active chapter.
  var markersByName = {};

  for (var i = 1; i <= country.dataset.locations; i++) {
    var locationImg = country.dataset[`img-${i}`];
    var locationTitle = country.dataset[`title-${i}`];
    var locationLatLng = country.dataset[`latlng-${i}`] != "" ? JSON.parse(country.dataset[`latlng-${i}`]) : null;
    var locationPath = country.dataset[`path-${i}`];
    var locationCountry = country.dataset[`country-${i}`];

    var myIcon = L.divIcon({
      iconSize: [30, 30],
      html: `
      <img class="map-image" src="../images/thumb/${locationImg}">
      <span class="map-image-title">${locationTitle}</span>
      `,
      iconAnchor: [20, 40],
      className: 'my-div-icon bounce'
    });

    if (locationLatLng != null) {
      let marker = L.marker(locationLatLng, { riseOnHover: true, path: `/countries/${locationCountry}#chapter-${locationPath}`, namePath: locationPath, icon: myIcon });
      marker.addTo(countryMap).on('click', function (m) {
        return function () {
          // Prefer scrolling to the matching chapter on the current page;
          // fall back to navigating to the location page if no chapter
          // exists (e.g. when the map is embedded somewhere without
          // chapters).
          var chapter = document.getElementById('chapter-' + m.options.namePath);
          if (chapter && typeof chapter.scrollIntoView === 'function') {
            chapter.scrollIntoView({ behavior: 'smooth', block: 'start' });
          } else {
            setTimeout(function () {
              window.location.href = m.options.path;
            }, 0);
          }
        };
      }(marker));
      markersByName[locationPath] = marker;
    }
  }

  // Expose for country-page.js to drive flyTo + active marker styling.
  window.__countryMap = countryMap;
  window.__countryMarkers = markersByName;
  window.__countryDefaultView = {
    latlng: JSON.parse(country.dataset.latlng),
    zoom: Number(country.dataset.zoom)
  };
  window.dispatchEvent(new CustomEvent('country-map-ready'));

  // Banner map: full-width overview strip shown at the top of the page.
  // Click-and-drag panning and double-click-to-zoom-in are on (same as the
  // worldmap/locations page), but scroll-wheel and pinch zoom stay off —
  // and there's no zoom control — so it can't be zoomed by accident while
  // the user is just scrolling the page; zooming only happens from an
  // explicit double-click. Markers are still clickable to scroll to the
  // matching chapter.
  var bannerEl = document.getElementById('country-map-banner');
  if (bannerEl) {
    var bannerSatellite = L.tileLayer(mapBoxUrl, {
      attribution: mapboxAttribution,
      id: 'mapbox/satellite-streets-v11',
      tileSize: 512,
      zoomOffset: -1,
      accessToken: accessToken
    });

    var bannerMap = L.map('country-map-banner', {
      layers: [bannerSatellite],
      scrollWheelZoom: false,
      touchZoom: false,
      dragging: true,
      doubleClickZoom: true,
      keyboard: false,
      zoomControl: false,
      attributionControl: false
    });

    var bannerLatLngs = [];

    for (var j = 1; j <= country.dataset.locations; j++) {
      var bImg   = country.dataset['img-' + j];
      var bTitle = country.dataset['title-' + j];
      var bRaw   = country.dataset['latlng-' + j];
      var bPath  = country.dataset['path-' + j];
      var bCountry = country.dataset['country-' + j];
      var bLatLng = (bRaw && bRaw !== '') ? JSON.parse(bRaw) : null;

      if (bLatLng) {
        bannerLatLngs.push(bLatLng);
        var bIcon = L.divIcon({
          iconSize: [30, 30],
          html: '<img class="map-image" src="../images/thumb/' + bImg + '"><span class="map-image-title">' + bTitle + '</span>',
          iconAnchor: [20, 40],
          className: 'my-div-icon bounce'
        });
        let bMarker = L.marker(bLatLng, { riseOnHover: true, path: '/countries/' + bCountry + '#chapter-' + bPath, namePath: bPath, icon: bIcon });
        bMarker.addTo(bannerMap).on('click', function (m) {
          return function () {
            var chapter = document.getElementById('chapter-' + m.options.namePath);
            if (chapter && typeof chapter.scrollIntoView === 'function') {
              chapter.scrollIntoView({ behavior: 'smooth', block: 'start' });
            } else {
              setTimeout(function () { window.location.href = m.options.path; }, 0);
            }
          };
        }(bMarker));
      }
    }

    if (bannerLatLngs.length > 1) {
      bannerMap.fitBounds(bannerLatLngs, { padding: [48, 48] });
    } else if (bannerLatLngs.length === 1) {
      bannerMap.setView(bannerLatLngs[0], 10);
    } else {
      bannerMap.setView(JSON.parse(country.dataset.latlng), country.dataset.zoom);
    }

    window.__countryBannerMap = bannerMap;
  }
});
