// Open the Modal
function openModal(index, id) {
  document.getElementById("gallery-body").style.top = `-${window.scrollY}px`;
  document.getElementById("gallery-body").style.position = 'fixed';
  document.getElementById("gallery-body").style.width = '100%';
  document.getElementById(id).style.display = "block";
  setTimeout(function() {
    document.getElementById(id).style.visibility = "visible";
    document.getElementById(id).style.opacity = "1";
  }, 10);
  blur();

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
function closeModal(id) {
  const scrollY = document.getElementById("gallery-body").style.top;
  document.getElementById("gallery-body").style.position = '';
  document.getElementById("gallery-body").style.top = '';
  if (scrollY) {
    window.scrollTo(0, parseInt(scrollY || '0') * -1);
  }
  deblur();

  document.getElementById(id).style.visibility = "hidden";
  document.getElementById(id).style.opacity = "0";
  setTimeout(function() {
    document.getElementById(id).style.display = "none";
  }, 250);
}

function blur() {
  document.getElementById('header').style.filter = 'blur(2px)';
  document.getElementById('footer-header').style.filter = 'blur(2px)';
  document.getElementById('gallery-body').style.filter = 'blur(5px)';
  document.getElementById('header-img-container-outside').style.filter = 'blur(5px)';
}

function deblur() {
  document.getElementById('header').style.filter = '';
  document.getElementById('footer-header').style.filter = '';
  document.getElementById('gallery-body').style.filter = '';
  document.getElementById('header-img-container-outside').style.filter = '';
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
