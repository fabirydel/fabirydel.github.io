// Open the Modal
function openPorfolioModal(index, id) {
  let porfolioGallery = document.getElementById("blurable")
  porfolioGallery.style.top = `-${window.scrollY}px`;
  porfolioGallery.style.position = 'fixed';
  porfolioGallery.style.width = '100%';
  document.getElementById(id).style.display = "block";
  setTimeout(function() {
    document.getElementById(id).style.visibility = "visible";
    document.getElementById(id).style.opacity = "1";
  }, 10);
  blurPortfolio();

  currentSlide(index)

  document.onkeydown = function(e) {
    switch (e.keyCode) {
      case 37:
        plusSlides(e, -1)
        break;
      case 39:
        plusSlides(e, 1)
        break;
    }
  };
}

// Close the Modal
function closePortfolioModal(id) {
  let porfolioGallery = document.getElementById("blurable")
  const scrollY = porfolioGallery.style.top;
  porfolioGallery.style.position = '';
  porfolioGallery.style.top = '';
  if (scrollY) {
    window.scrollTo(0, parseInt(scrollY || '0') * -1);
  }
  deblurPortfolio();

  document.getElementById(id).style.visibility = "hidden";
  document.getElementById(id).style.opacity = "0";
  setTimeout(function() {
    document.getElementById(id).style.display = "none";
  }, 250);
}

function blurPortfolio() {
  let porfolioGallery = document.getElementById("blurable")
  document.getElementById('header').style.filter = 'blur(2px)';
  document.getElementById('footer-header').style.filter = 'blur(2px)';
  porfolioGallery.style.filter = 'blur(5px)';
}

function deblurPortfolio() {
  let porfolioGallery = document.getElementById("blurable")
  document.getElementById('header').style.filter = '';
  document.getElementById('footer-header').style.filter = '';
  porfolioGallery.style.filter = '';
}

function ignore(e) {
  e.stopPropagation();
}

var slideIndex = 0
showSlides(slideIndex);

// Next/previous controls
function plusSlides(event, n) {
  showSlides(slideIndex += n);
  ignore(event)
}

// Thumbnail image controls
function currentSlide(n) {
  showSlides(slideIndex = n);
}

function showSlides(n) {
  var i;
  var slides = document.getElementsByClassName("slide");
  var dots = document.getElementsByClassName("demo");
  var captionText = document.getElementById("caption");
  if (n >= slides.length) {slideIndex = 0}
  if (n < 0) {slideIndex = slides.length - 1}
  for (i = 0; i < slides.length; i++) {
    slides[i].style.display = "none";
  }
  if (slides[slideIndex]) slides[slideIndex].style.display = "block";
  if (dots[slideIndex]) {
    dots[slideIndex].className += " active";
    captionText.innerHTML = dots[slideIndex].alt;
  }
}
