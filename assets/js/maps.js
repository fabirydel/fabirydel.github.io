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
      let marker = L.marker(locationLatLng, { riseOnHover: true, path: `/locations/${locationPath}`, namePath: locationPath, icon: myIcon });
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
});
