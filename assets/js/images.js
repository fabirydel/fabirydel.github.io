document.addEventListener("DOMContentLoaded", function() {

    var pictures = document.querySelectorAll(".active-picture");

    pictures.forEach(function(largePicture) {
      // Load large image
      var imgLarge = new Image();
      imgLarge.src = largePicture.dataset.large;
      imgLarge.onload = function () {
        imgLarge.classList.add('loaded');
      };
      imgLarge.classList.add('picture');
      largePicture.appendChild(imgLarge);
      // largePicture.firstElementChild.remove();
    })

    if ("IntersectionObserver" in window) {
      lazyloadImages = document.querySelectorAll(".lazy-picture");
      var imageObserver = new IntersectionObserver(function(entries, observer) {
        entries.forEach(function(entry) {
          if (entry.isIntersecting) {
            var imgBlur = entry.target;
            var imgLarge = new Image();
            imgBlur.classList.remove("lazy-picture");
            imgLarge.src = imgBlur.dataset.large;
            imgLarge.onload = function () {
              imgLarge.classList.add('loaded');
            };
            imgLarge.classList.add('picture');
            entry.target.appendChild(imgLarge);
            // imgBlur.firstElementChild.remove();
            imageObserver.unobserve(imgBlur);
          }
        });
      });

      lazyloadImages.forEach(function(image) {
        imageObserver.observe(image);
      });
    } else {
      var lazyloadThrottleTimeout;
      lazyloadImages = document.querySelectorAll(".lazy-picture");

      function lazyload () {
        if(lazyloadThrottleTimeout) {
          clearTimeout(lazyloadThrottleTimeout);
        }

        lazyloadThrottleTimeout = setTimeout(function() {
          var scrollTop = window.pageYOffset;
          lazyloadImages.forEach(function(entry) {
              if(img.offsetTop < (window.innerHeight + scrollTop)) {
                var imgBlur = entry.target;
                var imgLarge = new Image();
                imgBlur.classList.remove("lazy-picture");
                imgLarge.src = imgBlur.dataset.large;
                imgLarge.onload = function () {
                  imgLarge.classList.add('loaded');
                };
                imgLarge.classList.add('picture');
                entry.target.appendChild(imgLarge);
                imageObserver.unobserve(imgBlur);
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
    }




  // var photos = document.querySelectorAll(".photo-invisible");

  //   photos.forEach(function(photo) {
  //     photo.onload = function (photo) {
  //       photo.target.style.width = photo.target.naturalWidth
  //       photo.currentTarget.classList.remove('photo-invisible')
  //       photo.currentTarget.classList.add('photo-final-loaded')
  //       document.querySelectorAll(`[data-to-remove="${photo.currentTarget.dataset.blurSrc}"]`).forEach(function(elem) {
  //         elem.remove();
  //       });
  //       photo.currentTarget.classList.remove('photo-final')
  //     }
  //   });

  // var lazyloadImages;

  // if ("IntersectionObserver" in window) {
  //   lazyloadImages = document.querySelectorAll(".lazy");
  //   var imageObserver = new IntersectionObserver(function(entries, observer) {
  //     entries.forEach(function(entry) {
  //       if (entry.isIntersecting) {
  //         var image = entry.target;
  //         image.src = image.dataset.src;
  //         image.classList.remove("lazy");
  //         imageObserver.unobserve(image);
  //       }
  //     });
  //   });

  //   lazyloadImages.forEach(function(image) {
  //     imageObserver.observe(image);
  //   });
  // } else {
  //   var lazyloadThrottleTimeout;
  //   lazyloadImages = document.querySelectorAll(".lazy");

  //   function lazyload () {
  //     if(lazyloadThrottleTimeout) {
  //       clearTimeout(lazyloadThrottleTimeout);
  //     }

  //     lazyloadThrottleTimeout = setTimeout(function() {
  //       var scrollTop = window.pageYOffset;
  //       lazyloadImages.forEach(function(img) {
  //           if(img.offsetTop < (window.innerHeight + scrollTop)) {
  //             img.src = img.dataset.src;
  //             img.classList.remove('lazy');
  //           }
  //       });
  //       if(lazyloadImages.length == 0) {
  //         document.removeEventListener("scroll", lazyload);
  //         window.removeEventListener("resize", lazyload);
  //         window.removeEventListener("orientationChange", lazyload);
  //       }
  //     }, 20);
  //   }

  //   document.addEventListener("scroll", lazyload);
  //   window.addEventListener("resize", lazyload);
  //   window.addEventListener("orientationChange", lazyload);
  // }
})
