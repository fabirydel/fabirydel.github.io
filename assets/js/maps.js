document.addEventListener("DOMContentLoaded", function() {
  country = document.getElementById('country-map');
  if (!country) return

  var mapcountryMap = L.map('country-map').setView(JSON.parse(country.dataset.latlng), country.dataset.zoom);

  L.tileLayer('https://api.mapbox.com/styles/v1/{id}/tiles/{z}/{x}/{y}?access_token={accessToken}', {
    attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, Imagery © <a href="https://www.mapbox.com/">Mapbox</a>',
    minZoom: country.dataset.zoom,
    id: 'mapbox/outdoors-v11',
    tileSize: 512,
    zoomOffset: -1,
    accessToken: 'pk.eyJ1IjoiZmFiaXJ5ZGVsIiwiYSI6ImNrajYwcHcwbTYzZDEycWxicjFtNzdqa2kifQ.8AEeHc6W_kHGvgIZQNq2WA'
  }).addTo(mapcountryMap);

  for (i = 1; i <= country.dataset.cities; i++) {
    cityData = JSON.parse(country.dataset[`city-${i}`].replace(/\'/g, '\"'))

    let marker = L.marker(JSON.parse(cityData.latlng), { title: cityData.title, riseOnHover: true, path: cityData.path })
    marker.addTo(mapcountryMap).on('click', () =>
      setTimeout(function() {
        window.location.href = marker.options.path;
      }, 0)
    );
  }
});
