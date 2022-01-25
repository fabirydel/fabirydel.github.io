// Open the Modal
function openCategoriesModal() {
  let blurable = document.getElementById("blurable")
  blurable.style.top = `-${window.scrollY}px`;
  blurable.style.position = 'fixed';
  blurable.style.width = '100%';
  document.getElementById("categories-modal").style.display = "block";
  setTimeout(function() {
    document.getElementById("categories-modal").style.visibility = "visible";
    document.getElementById("categories-modal").style.opacity = "1";
  }, 10);
  blurPortfolio();
}

// Close the Modal
function closeCategoriesModal() {
  let blurable = document.getElementById("blurable")
  const scrollY = blurable.style.top;
  blurable.style.position = '';
  blurable.style.top = '';
  if (scrollY) {
    window.scrollTo(0, parseInt(scrollY || '0') * -1);
  }
  deblurPortfolio();

  document.getElementById("categories-modal").style.visibility = "hidden";
  document.getElementById("categories-modal").style.opacity = "0";
  setTimeout(function() {
    document.getElementById("categories-modal").style.display = "none";
  }, 250);
}

function blurPortfolio() {
  let blurable = document.getElementById("blurable")
  document.getElementById('header').style.filter = 'blur(2px)';
  document.getElementById('footer-header').style.filter = 'blur(2px)';
  blurable.style.filter = 'blur(5px)';
}

function deblurPortfolio() {
  let blurable = document.getElementById("blurable")
  document.getElementById('header').style.filter = '';
  document.getElementById('footer-header').style.filter = '';
  if (blurable) blurable.style.filter = '';
}

function ignore(e) {
  e.stopPropagation();
}

