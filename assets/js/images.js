// Phase 1: native `loading="lazy"` on the markup handles deferred fetching.
// This script just adds a `.loaded` class once the thumbnail finishes loading
// so we can fade it in over the blur placeholder via CSS.
document.addEventListener("DOMContentLoaded", function () {
  var thumbs = document.querySelectorAll('img.thumb');
  thumbs.forEach(function (img) {
    if (img.complete && img.naturalHeight !== 0) {
      img.classList.add('loaded');
    } else {
      img.addEventListener('load', function () {
        img.classList.add('loaded');
      }, { once: true });
      img.addEventListener('error', function () {
        // If the thumbnail fails, leave the blur visible rather than hide everything.
        img.classList.add('failed');
      }, { once: true });
    }
  });
});
