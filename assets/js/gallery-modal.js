// Open the Modal
function openModal(index, id) {
  document.body.style.top = `-${window.scrollY}px`;
  document.body.style.position = 'fixed';
  document.getElementById(id).style.display = "block";
  setTimeout(function() {
    document.getElementById(id).style.visibility = "visible";
    document.getElementById(id).style.opacity = "1";
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
function closeModal(id) {
  const scrollY = document.body.style.top;
  document.body.style.position = '';
  document.body.style.top = '';
  if (scrollY) {
    window.scrollTo(0, parseInt(scrollY || '0') * -1);
  }

  document.getElementById(id).style.visibility = "hidden";
  document.getElementById(id).style.opacity = "0";
  setTimeout(function() { document.getElementById(id).style.display = "none"; }, 250);
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



document.addEventListener("DOMContentLoaded", function() {
  var lazyloadImages = document.querySelectorAll("img.lazy");
  var lazyloadThrottleTimeout;

  function lazyload () {
    if(lazyloadThrottleTimeout) {
      clearTimeout(lazyloadThrottleTimeout);
    }

    lazyloadThrottleTimeout = setTimeout(function() {
        var scrollTop = window.pageYOffset;
        lazyloadImages.forEach(function(img) {
            if(img.offsetTop < (window.innerHeight + scrollTop)) {
              img.src = img.dataset.src;
              img.classList.remove('lazy');
            }
        });
        if(lazyloadImages.length == 0) {
          document.removeEventListener("scroll", lazyload);
          window.removeEventListener("resize", lazyload);
          window.removeEventListener("orientationChange", lazyload);
        }
    }, 20);
  }

  document.addEventListener("scroll", lazyload);
  window.addEventListener("resize", lazyload);
  window.addEventListener("orientationChange", lazyload);
});
