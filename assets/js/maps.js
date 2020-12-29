document.addEventListener("DOMContentLoaded", function() {
  country = document.getElementById('country-map');
  if (!country) return

  var mapboxAttribution = 'Map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, Imagery © <a href="https://www.mapbox.com/">Mapbox</a>'
  var mapBoxUrl = 'https://api.mapbox.com/styles/v1/{id}/tiles/{z}/{x}/{y}?access_token={accessToken}'
  var accessToken = 'pk.eyJ1IjoiZmFiaXJ5ZGVsIiwiYSI6ImNrajYwcHcwbTYzZDEycWxicjFtNzdqa2kifQ.8AEeHc6W_kHGvgIZQNq2WA'

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
    maxBounds: JSON.parse(country.dataset.bounds),
    layers: [satellite]
  }).setView(JSON.parse(country.dataset.latlng), country.dataset.zoom);

  L.control.layers(baseMaps).addTo(countryMap);

  for (i = 1; i <= country.dataset.cities; i++) {
    cityImg = country.dataset[`img-${i}`]
    cityTitle = country.dataset[`title-${i}`]
    cityLatLng = JSON.parse(country.dataset[`latlng-${i}`])
    cityPath = country.dataset[`path-${i}`]

    var myIcon = L.divIcon({
      iconSize: [30, 30],
      html: `
      <img class="map-image" src="../images/thumb/${cityImg}">
      <span class="map-image-title">${cityTitle}</span>
      `,
      iconAnchor: [20, 40],
      className: 'my-div-icon bounce'
    });

    let marker = L.marker(cityLatLng, { riseOnHover: true, path: `/cities/${cityPath}`, icon: myIcon })
    marker.addTo(countryMap).on('click', () =>
      setTimeout(function() {
        window.location.href = marker.options.path;
      }, 0)
    );
  }
});
