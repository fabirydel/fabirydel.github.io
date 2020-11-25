// Open the Modal
function openMapModal(index) {
  document.getElementById("gallery-body").style.top = `-${window.scrollY}px`;
  document.getElementById("gallery-body").style.position = 'fixed';
  document.getElementById("mapModal").style.display = "block";
  setTimeout(function() {
    document.getElementById("mapModal").style.visibility = "visible";
    document.getElementById("mapModal").style.opacity = "1";
  }, 10);
  blur();
}

// Close the Modal
function closeMapModal() {
  const scrollY = document.getElementById("gallery-body").style.top;
  document.getElementById("gallery-body").style.position = '';
  document.getElementById("gallery-body").style.top = '';
  if (scrollY) {
    window.scrollTo(0, parseInt(scrollY || '0') * -1);
  }
  deblur();

  document.getElementById("mapModal").style.visibility = "hidden";
  document.getElementById("mapModal").style.opacity = "0";
  setTimeout(function() { document.getElementById("mapModal").style.display = "none"; }, 250);
}

function blur() {
  document.getElementById('header').style.filter = "blur(2px)";
  document.getElementById('footer-header').style.filter = "blur(2px)";
  document.getElementById('gallery-body').style.filter = "blur(5px)";
  document.getElementById('header-img-container-outside').style.filter = 'blur(5px)';
}

function deblur() {
  document.getElementById('header').style.filter = "";
  document.getElementById('footer-header').style.filter = "";
  document.getElementById('gallery-body').style.filter = "";
  document.getElementById('header-img-container-outside').style.filter = "";
}
