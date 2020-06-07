// Open the Modal
function openModal(index) {
  document.body.style.top = `-${window.scrollY}px`;
  document.body.style.position = 'fixed';
  document.getElementById("myModal").style.display = "block";
  setTimeout(function() {
    document.getElementById("myModal").style.visibility = "visible";
    document.getElementById("myModal").style.opacity = "1";
  }, 10);

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
function closeModal() {
  const scrollY = document.body.style.top;
  document.body.style.position = '';
  document.body.style.top = '';
  if (scrollY) {
    window.scrollTo(0, parseInt(scrollY || '0') * -1);
  }

  document.getElementById("myModal").style.visibility = "hidden";
  document.getElementById("myModal").style.opacity = "0";
  setTimeout(function() { document.getElementById("myModal").style.display = "none"; }, 250);
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
