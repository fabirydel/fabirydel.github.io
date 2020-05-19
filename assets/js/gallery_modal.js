// Open the Modal
function openModal(index) {
  document.getElementById("myModal").style.display = "block";
  setTimeout(function() {
    document.getElementById("myModal").style.visibility = "visible";
    document.getElementById("myModal").style.opacity = "1";
  }, 10);

  currentSlide(index)
}

// Close the Modal
function closeModal() {
  document.getElementById("myModal").style.visibility = "hidden";
  document.getElementById("myModal").style.opacity = "0";
  setTimeout(function() { document.getElementById("myModal").style.display = "none"; }, 250);
}

function ignore(e) {
  e.stopPropagation();
}

var slideIndex = 1;
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
  if (n > slides.length) {slideIndex = 1}
  if (n < 1) {slideIndex = slides.length}
  for (i = 0; i < slides.length; i++) {
    slides[i].style.display = "none";
  }
  if (slides[slideIndex-1]) slides[slideIndex-1].style.display = "block";
  if (dots[slideIndex-1]) {
    dots[slideIndex-1].className += " active";
    captionText.innerHTML = dots[slideIndex-1].alt;
  }
}
