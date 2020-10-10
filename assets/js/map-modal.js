// Open the Modal
function openMapModal(index) {
  document.body.style.top = `-${window.scrollY}px`;
  document.body.style.position = 'fixed';
  document.getElementById("mapModal").style.display = "block";
  setTimeout(function() {
    document.getElementById("mapModal").style.visibility = "visible";
    document.getElementById("mapModal").style.opacity = "1";
  }, 10);

}

// Close the Modal
function closeMapModal() {
  const scrollY = document.body.style.top;
  document.body.style.position = '';
  document.body.style.top = '';
  if (scrollY) {
    window.scrollTo(0, parseInt(scrollY || '0') * -1);
  }

  document.getElementById("mapModal").style.visibility = "hidden";
  document.getElementById("mapModal").style.opacity = "0";
  setTimeout(function() { document.getElementById("mapModal").style.display = "none"; }, 250);
}
