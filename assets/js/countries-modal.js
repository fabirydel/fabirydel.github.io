// Open the Modal
function openCountriesModal() {
  let blurable = document.getElementById("blurable")
  blurable.style.top = `-${window.scrollY}px`;
  blurable.style.position = 'fixed';
  blurable.style.width = '100%';
  document.getElementById("countries-modal").style.display = "block";
  setTimeout(function() {
    document.getElementById("countries-modal").style.visibility = "visible";
    document.getElementById("countries-modal").style.opacity = "1";
  }, 10);
  blurEverything();
}

// Close the Modal
function closeCountriesModal() {
  let blurable = document.getElementById("blurable")
  const scrollY = blurable.style.top;
  blurable.style.position = '';
  blurable.style.top = '';
  if (scrollY) {
    window.scrollTo(0, parseInt(scrollY || '0') * -1);
  }
  deblurEverything();

  document.getElementById("countries-modal").style.visibility = "hidden";
  document.getElementById("countries-modal").style.opacity = "0";
  setTimeout(function() {
    document.getElementById("countries-modal").style.display = "none";
  }, 250);
}

function blurEverything() {
  let blurable = document.getElementById("blurable")
  document.getElementById('header').style.filter = 'blur(2px)';
  document.getElementById('footer-header').style.filter = 'blur(2px)';
  blurable.style.filter = 'blur(5px)';
}

function deblurEverything() {
  let blurable = document.getElementById("blurable")
  document.getElementById('header').style.filter = '';
  document.getElementById('footer-header').style.filter = '';
  if (blurable) blurable.style.filter = '';
}

function ignore(e) {
  e.stopPropagation();
}

