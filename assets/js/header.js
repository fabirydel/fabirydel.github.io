function toggleDropdown (name) {
  document.getElementById(`dropdown-${name}`).classList.toggle("invisible")
}

function toggleNighttime () {
  document.getElementById("blurable").classList.toggle("nighttime")
  document.getElementById("header").classList.toggle("nighttime")
  document.getElementById("footer").classList.toggle("nighttime")
  document.getElementById("footer-header").classList.toggle("nighttime")
}

function toggleTheme () {
  if (localStorage.getItem("theme") == "light") {
    localStorage.setItem("theme", "dark")
  } else {
    localStorage.setItem("theme", "light")
  }

  toggleNighttime();
}

document.addEventListener("DOMContentLoaded", function() {
  if (localStorage.getItem("theme") == "dark") {
    toggleNighttime();
  }

  var doc = document.documentElement;
  var w = window;

  var prevScroll = w.scrollY || doc.scrollTop;
  var currentScroll;
  var direction = 0;
  var prevDirection = 0;

  var header = document.getElementById("header");
  var headerLabels = document.getElementsByClassName("header-label");

  var checkScroll = function() {
    currentScroll = w.scrollY || doc.scrollTop;
    if (currentScroll > prevScroll) {
      //scrolled up
      direction = 2;
    }
    else if (currentScroll < prevScroll) {
      //scrolled down
      direction = 1;
    }

    if (direction !== prevDirection) {
      toggleHeader(direction, currentScroll);
    }

    prevScroll = currentScroll;
  };

  var toggleHeader = function(direction, currentScroll) {
    if (!header.classList.contains("freeze")) {
      let diff = screen.width > 850 ? 72 : 63;

      if (direction === 2 && currentScroll > diff) {

        //replace 52 with the height of your header in px

        header.classList.add("hide");
        if (headerLabels) {
          for (i = 0; i < headerLabels.length; i++) {
            console.log()
            headerLabels[i].classList.add("hide");
          }
        }
        prevDirection = direction;
      }
      else if (direction === 1) {
        header.classList.remove("hide");
        if (headerLabels) {
          for (i = 0; i < headerLabels.length; i++) {
            headerLabels[i].classList.remove("hide");
          }
        }
        prevDirection = direction;
      }
    }
  };

  window.addEventListener("scroll", checkScroll);

});
