document.addEventListener("DOMContentLoaded", function() {
  if (document.querySelector('.cube')) document.querySelector('.cube').addEventListener('mouseenter', startInteraction);
  if (document.querySelector('.cube')) document.querySelector('.cube').addEventListener('mouseleave', stopInteraction);
});


const FACE_POS = [
  "rotateX(-90deg)",
  "translateZ(0px)",
  "rotateY(90deg)",
];

function interact(e) {
  const x = e.pageX;
  const y = -e.pageY;

  const midX = (x - window.innerWidth / 2) * 0.5;
  const midY = (y + window.innerHeight / 2) * 0.5;

  const cube = document.querySelector('.cube');
  console.log(midY);
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

function selectSide(e) {
  const faceId = e.target.innerText;
  const facePos = window.getComputedStyle(e.target).transform;

  document.querySelectorAll('.cube .face').forEach(
  face => face.classList.remove('active'))

  e.target.classList.add('active');

  document.querySelector('.cube').style.transform = FACE_POS[faceId-1];
}


