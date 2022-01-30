document.addEventListener("DOMContentLoaded", function() {
  if (document.querySelector('#nft-image-container')) document.querySelector('#nft-image-container').addEventListener('mouseenter', startInteraction);
  if (document.querySelector('#nft-image-container')) document.querySelector('#nft-image-container').addEventListener('mouseleave', stopInteraction);

  // document.querySelector('#nft-image-container').prepend(canvas);

  // loop();
});

function interact(event) {
  if (!event) return null;

  const x = event.touches ? event.touches[0].clientX : event.clientX;
  const y = event.touches ? -event.touches[0].clientY : -event.clientY;

  const midX = (x - window.innerWidth / 2) * 0.2;
  const midY = (y + window.innerHeight / 2) * 0.2;

  const cube = document.querySelector('.cube');
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

function flatten() {
  const sides = document.getElementsByClassName('face');
  const cube = document.getElementsByClassName('cube');


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
  }, 750);
}

// var canvas = document.createElement("canvas");
// var c = canvas.getContext("2d");
// var w = canvas.width = window.innerWidth;
// var h = canvas.height = window.innerHeight;

// var particles = {};
// var particleIndex = 0;
// var particleNum = 30;

// function particle() {
//   this.x = Math.random() * canvas.width;
//   this.y = Math.random() * canvas.height;
//   this.vx = Math.random() * 10 - 5;
//   this.vy = Math.random() * 10 - 5;
//   this.gravity = 0.1;
//   particleIndex++;
//   particles[particleIndex] = this;
//   this.id = particleIndex;
//   this.life = 0;
//   this.maxLife = Math.random() * 90;
//   this.shadeR = Math.floor(Math.random() * 255+150) + 50;
//   this.shadeG = Math.floor(Math.random() * 150) + 50;
//   this.shadeB = Math.floor(Math.random() * 0);
//   this.color = 'rgba(' + this.shadeR + ',' + this.shadeG + ',' + this.shadeB + ',' + Math.random() * 0.7 + ')';
//   this.size = Math.random() * 3;
// }
// particle.prototype.draw = function() {
//   this.x += this.vx;
//   this.y += this.vy;
//   if (Math.random() < 0.1) {
//     this.vx = Math.random() * 10 - 5;
//     this.vy = -2;
//   }

//   this.life++;
//   if (this.life >= this.maxLife) {
//     delete particles[this.id];
//   }

//   c.beginPath();
//   c.arc(this.x, this.y, this.size, 0, 2 * Math.PI, false);
//   c.fillStyle = this.color;
//   c.fill();
// };

// function drawParticle() {
//  c.clearRect(0, 0,w,h);
//   for (var i = 0; i < particleNum; i++) {
//     new particle();
//   }
//   for (var i in particles) {
//     particles[i].draw();
//   }
// }

// window.requestAnimFrame = (function() {
//   return window.requestAnimationFrame ||
//     window.webkitRequestAnimationFrame ||
//     window.mozRequestAnimationFrame ||
//     window.oRequestAnimationFrame ||
//     window.msRequestAnimationFrame ||
//     function(callback) {
//       window.setTimeout(callback, 1000 / 60);
//     };
// })();


// function loop() {

//   requestAnimFrame(loop);

//   drawParticle();
// }
