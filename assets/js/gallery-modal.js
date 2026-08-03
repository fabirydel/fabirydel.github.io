// Modal navigation state
var slideIndex = 0;
var currentModalId = null;

// Re-entrancy guard. The X button and the modal backdrop both have
// onclick="closeModal(id)" — clicking the X bubbles, so closeModal fires
// twice in one event loop tick. Without this, the second call would also
// run history.back, sending the user to the previous page.
var isClosing = false;

// Touch tracking (set on touchstart, read on touchend).
var touchStartX = 0;
var touchStartY = 0;

// ===== Public API (called from inline onclick handlers) =====

function openModal(index, id) {
  performOpen(index, id);
  // Add a history entry so the browser back button (and Android system back)
  // closes the modal instead of navigating away from the page.
  if (!history.state || history.state.modalId !== id) {
    history.pushState({ modalId: id }, '');
  }
}

function closeModal(id) {
  if (isClosing) return;
  isClosing = true;
  setTimeout(function () { isClosing = false; }, 100);

  // Close immediately (no async wait), then quietly pop the pushed history
  // entry so the next browser back goes to the actual previous page rather
  // than to a stale modal-state. By the time popstate fires from history.back
  // currentModalId is null, so the popstate handler is a no-op.
  performClose(id);
  if (history.state && history.state.modalId === id) {
    history.back();
  }
}

// ===== Internals =====

function performOpen(index, id) {
  document.getElementById("header").classList.add("freeze");

  var galleryBody = document.getElementById("gallery-body");

  // Snapshot the element's exact viewport position before making it fixed
  // so no layout shift occurs regardless of what elements sit above it.
  var currentTop = galleryBody.getBoundingClientRect().top;
  galleryBody.dataset.savedScroll = window.scrollY;
  galleryBody.style.top = currentTop + 'px';
  galleryBody.style.position = "fixed";

  // Legacy: some older page variants use a .country-wrapper whose margin
  // must be pulled up to avoid a gap while the modal is open.
  // IMPORTANT: only read offsetHeight when the element exists — reading it
  // unconditionally after position:fixed forces a reflow that resets
  // window.scrollY to 0 before history.pushState runs, so back() restores 0.
  var countryWrapper = document.querySelector('.country-wrapper');
  if (countryWrapper) {
    var mapHeight = countryWrapper.offsetHeight;
    var headerHeight = document.querySelector('#header').offsetHeight;
    if (mapHeight + headerHeight > window.scrollY) {
      countryWrapper.style.marginTop = (-window.scrollY) + 'px';
    }
  }

  var modal = document.getElementById(id);
  modal.style.display = "block";
  setTimeout(function () {
    modal.classList.add("open");
  }, 10);
  blur();

  currentSlide(index);
  currentModalId = id;
  attachTouchHandlers(modal);
}

function performClose(id) {
  var modal = document.getElementById(id);
  // Idempotent: if the modal is already closing/closed, don't run scroll
  // restoration or other side effects again.
  if (!modal || !modal.classList.contains("open")) {
    currentModalId = null;
    return;
  }

  document.getElementById("header").classList.remove("freeze");
  var galleryBody = document.getElementById("gallery-body");
  var savedScroll = parseInt(galleryBody.dataset.savedScroll || '0');

  if (document.querySelector('.country-wrapper')) document.querySelector('.country-wrapper').style.marginTop = '';
  galleryBody.style.position = '';
  galleryBody.style.top = '';
  delete galleryBody.dataset.savedScroll;
  // Read offsetHeight to force a synchronous reflow so the document regains
  // its full height before scrollTo — otherwise the scroll gets clamped to 0.
  void galleryBody.offsetHeight;
  window.scrollTo(0, savedScroll);

  deblur();

  modal.classList.remove("open");
  setTimeout(function () {
    modal.style.display = "none";
  }, 250);

  detachTouchHandlers(modal);
  currentModalId = null;
}

function blur() {
  document.getElementById('header').style.filter = 'blur(4px)';
  document.getElementById('footer-header').style.filter = 'blur(4px)';
  document.getElementById('gallery-body').style.filter = 'blur(4px)';
  if (document.querySelector('.country-wrapper')) document.querySelector('.country-wrapper').style.filter = 'blur(4px)';
  if (document.getElementById('header-img-container-outside')) document.getElementById('header-img-container-outside').style.filter = 'blur(4px)';
  if (document.getElementById('country-map-banner-wrapper')) document.getElementById('country-map-banner-wrapper').style.filter = 'blur(4px)';
  if (document.getElementById('country-map-bubble')) document.getElementById('country-map-bubble').style.filter = 'blur(4px)';
}

function deblur() {
  document.getElementById('header').style.filter = '';
  document.getElementById('footer-header').style.filter = '';
  document.getElementById('gallery-body').style.filter = '';
  if (document.querySelector('.country-wrapper')) document.querySelector('.country-wrapper').style.filter = '';
  if (document.getElementById('header-img-container-outside')) document.getElementById('header-img-container-outside').style.filter = '';
  if (document.getElementById('country-map-banner-wrapper')) document.getElementById('country-map-banner-wrapper').style.filter = '';
  if (document.getElementById('country-map-bubble')) document.getElementById('country-map-bubble').style.filter = '';
}

function ignore(e) {
  if (e && e.stopPropagation) e.stopPropagation();
}

// Lazy-load only the visible slide and its immediate neighbors from data-src
// so we don't fetch all full-res images on page load.
function preloadAroundSlide(n) {
  var slides = document.getElementsByClassName("slide");
  if (!slides.length) return;
  var len = slides.length;
  var indices = [n - 1, n, n + 1].map(function (i) {
    return ((i % len) + len) % len;
  });
  indices.forEach(function (i) {
    var img = slides[i] && slides[i].querySelector('img[data-src]');
    if (img && !img.src) {
      img.src = img.dataset.src;
    }
  });
}

function plusSlides(event, n) {
  showSlides(slideIndex += n);
  if (event && event.stopPropagation) event.stopPropagation();
}

function currentSlide(n) {
  showSlides(slideIndex = n);
}

function showSlides(n) {
  var slides = document.getElementsByClassName("slide");
  var dots = document.getElementsByClassName("demo");
  var captionText = document.getElementById("caption");
  if (n >= slides.length) { slideIndex = 0; }
  if (n < 0) { slideIndex = slides.length - 1; }
  for (var i = 0; i < slides.length; i++) {
    slides[i].classList.remove("active-slide");
  }
  if (slides[slideIndex]) {
    slides[slideIndex].classList.add("active-slide");
    // Defensive: even if preloadAroundSlide missed for any reason, make sure
    // the slide the user is looking at always has its src set.
    var visibleImg = slides[slideIndex].querySelector('img[data-src]');
    if (visibleImg && !visibleImg.src) {
      visibleImg.src = visibleImg.dataset.src;
    }
  }
  preloadAroundSlide(slideIndex);
  if (dots[slideIndex]) {
    dots[slideIndex].className += " active";
    if (captionText) captionText.innerHTML = dots[slideIndex].alt;
  }
}

// ===== Touch swipe (active only while a modal is open) =====

function onTouchStart(e) {
  if (!e.touches || !e.touches[0]) return;
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
}

function onTouchEnd(e) {
  if (!e.changedTouches || !e.changedTouches[0]) return;
  var dx = e.changedTouches[0].clientX - touchStartX;
  var dy = e.changedTouches[0].clientY - touchStartY;
  // Only react to horizontal swipes; ignore mostly-vertical gestures so the
  // user can scroll within the modal.
  if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.2) {
    plusSlides(null, dx > 0 ? -1 : 1);
  }
}

function attachTouchHandlers(modal) {
  modal.addEventListener('touchstart', onTouchStart, { passive: true });
  modal.addEventListener('touchend', onTouchEnd, { passive: true });
}

function detachTouchHandlers(modal) {
  modal.removeEventListener('touchstart', onTouchStart);
  modal.removeEventListener('touchend', onTouchEnd);
}

// ===== Global keyboard shortcuts (active only while a modal is open) =====

document.addEventListener('keydown', function (e) {
  if (!currentModalId) return;
  switch (e.key) {
    case 'ArrowLeft':
      plusSlides(e, -1);
      break;
    case 'ArrowRight':
      plusSlides(e, 1);
      break;
    case 'Escape':
      closeModal(currentModalId);
      break;
  }
});

// ===== History (browser back closes the modal) =====

window.addEventListener('popstate', function () {
  if (currentModalId) {
    performClose(currentModalId);
  }
});
