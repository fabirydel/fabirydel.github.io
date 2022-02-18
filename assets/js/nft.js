document.addEventListener("DOMContentLoaded", function() {
  if (document.querySelector('#nft-image-container')) document.querySelector('#nft-image-container').addEventListener('mouseenter', startInteraction);
  if (document.querySelector('#nft-image-container')) document.querySelector('#nft-image-container').addEventListener('mouseleave', stopInteraction);

  const nftHeight = document.querySelector('.for-display .cube').offsetHeight
  document.querySelector('.for-display').style.height = `${nftHeight}px`;
});

function interact(event) {
  if (!event) return null;

  const x = event.touches ? event.touches[0].clientX : event.clientX;
  const y = event.touches ? -event.touches[0].clientY : -event.clientY;

  const midX = (x - window.innerWidth / 2) * 0.2;
  const midY = (y + window.innerHeight / 2) * 0.2;

  const cube = document.querySelector('.modal-cube');
  const valY = midY > 0 ? Math.min(midY, 30) : Math.max(midY, -30)
  const valX = midX > 0 ? Math.min(midX, 30) : Math.max(midX, -30)

  cube.style.transform = `rotateX(${valY}deg) rotateY(${valX}deg) translate(-50%, -50%)`;
}

function startInteraction() {
  document.addEventListener('mousemove', interact);
}

function stopInteraction() {
  document.removeEventListener('mousemove', interact);
}

function flattenAndOrExapand() {
  const cube = document.querySelector('.modal-cube');

  if (!cube.classList.contains('active')) {
    cube.classList.add('flattened');
    flatten()
  } else if (cube.classList.contains('active') && cube.classList.contains('flattened') && !cube.classList.contains('expanded')) {
    cube.classList.add('expanded');
    expand();
  } else if (cube.classList.contains('active') && cube.classList.contains('flattened') && cube.classList.contains('expanded') && !cube.classList.contains('finished')) {
    cube.classList.add('finished');
    expand();
  } else  if (cube.classList.contains('active') && cube.classList.contains('flattened') && cube.classList.contains('expanded') && cube.classList.contains('finished')) {
    cube.classList.remove('finished');
    cube.classList.remove('expanded');
    cube.classList.remove('flattened');
    flatten();
  }
}

function flatten() {
  const sides = document.getElementsByClassName('modal-face');
  const cube = document.getElementsByClassName('modal-cube');

  document.querySelector('.trigger-animation').disabled = true;
  if (cube[0].classList.contains('expand')) {
    expand();
  }

  sides[0].classList.toggle('flat-side-height'); // top face
  sides[2].classList.toggle('flat-side-width'); // side face
  sides[4].classList.toggle('flat-side-width'); // side face
  sides[5].classList.toggle('flat-side-height'); // bottom face

  cube[0].classList.toggle('flat-front');
  cube[0].classList.toggle('animate');

  // front face
  if (sides[1].classList.contains('flat-hide')) {
    sides[1].classList.remove('flat-hide');
    sides[1].classList.add('just-removed');
  }

  setTimeout(function() {
    // front face
    if (!sides[1].classList.contains('just-removed')) {
      sides[1].classList.add('flat-hide');
    } else {
      sides[1].classList.remove('just-removed');
    }

    cube[0].classList.toggle('animate');
    cube[0].classList.toggle('active');
    if (document.querySelector('#nft-modal .cube').classList.contains('animation-done')) {
      document.querySelector('.trigger-animation').disabled = false;
    }
  }, 750);
}

function expand() {
  const cube = document.getElementsByClassName('modal-cube');

  cube[0].classList.toggle('expand')
}

/////////////////////// MODAL STUF ///////////////////////

// Open the Modal
function openNftModal() {
  document.querySelector("body").classList.add("nft-body");
  document.querySelector('.for-display').classList.add('hide');

  let blurable = document.getElementById("blurable");
  blurable.style.top = `-${window.scrollY}px`;
  blurable.style.position = 'fixed';
  blurable.style.width = '100%';
  document.getElementById("nft-modal").style.display = "block";
  setTimeout(function() {
    document.getElementById("nft-modal").style.visibility = "visible";
    document.getElementById("nft-modal").style.opacity = "1";
  }, 10);
  blurEverything();

  if (!document.querySelector('#nft-modal .cube').classList.contains('animation-done')) {
    setTimeout(function() {
      flatten();
    }, 1000);

    setTimeout(function() {
      expand();
    }, 2000);

    setTimeout(function() {
      expand();
    }, 3000);

    setTimeout(function() {
      flatten();
      document.querySelector('#nft-modal .cube').classList.add('animation-done');
      document.querySelector('.trigger-animation').classList.remove('invisible');
    }, 4000);
  }
}

// Close the Modal
function closeNftModal() {
  document.querySelector("body").classList.remove("nft-body");
  document.querySelector('.for-display').classList.remove('hide');

  let blurable = document.getElementById("blurable");
  const scrollY = blurable.style.top;
  blurable.style.position = '';
  blurable.style.top = '';
  if (scrollY) {
    window.scrollTo(0, parseInt(scrollY || '0') * -1);
  }
  deblurEverything();

  document.getElementById("nft-modal").style.visibility = "hidden";
  document.getElementById("nft-modal").style.opacity = "0";
  setTimeout(function() {
    document.getElementById("nft-modal").style.display = "none";
  }, 250);
}

function blurEverything() {
  let blurable = document.getElementById("blurable")
  document.getElementById('header').style.filter = 'blur(8px)';
  document.getElementById('footer-header').style.filter = 'blur(8px)';
  blurable.style.filter = 'blur(8px)';
}

function deblurEverything() {
  let blurable = document.getElementById("blurable")
  document.getElementById('header').style.filter = '';
  document.getElementById('footer-header').style.filter = '';
  if (blurable) blurable.style.filter = '';
}

function ignore(e) {
  e.stopPropagation();
}


function openNftImageModal(event) {
  let blurable = document.getElementById("blurable");
  blurable.style.top = `-${window.scrollY}px`;
  blurable.style.position = 'fixed';
  blurable.style.width = '100%';

  document.getElementById('replace-me').src = event.src;

  document.getElementById("nftImageModal").style.display = "block";
  setTimeout(function() {
    document.getElementById("nftImageModal").style.visibility = "visible";
    document.getElementById("nftImageModal").style.opacity = "1";
  }, 10);
  blurEverything();
}

function closeNftImageModal() {
  let blurable = document.getElementById("blurable");
  const scrollY = blurable.style.top;
  blurable.style.position = '';
  blurable.style.top = '';
  if (scrollY) {
    window.scrollTo(0, parseInt(scrollY || '0') * -1);
  }
  deblurEverything();

  document.getElementById("nftImageModal").style.visibility = "hidden";
  document.getElementById("nftImageModal").style.opacity = "0";
  setTimeout(function() {
    document.getElementById("nftImageModal").style.display = "none";
  }, 250);
}

