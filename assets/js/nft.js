document.addEventListener("DOMContentLoaded", function() {
  if (document.querySelector('#nft-image-container')) document.querySelector('#nft-image-container').addEventListener('mouseenter', startInteraction);
  if (document.querySelector('#nft-image-container')) document.querySelector('#nft-image-container').addEventListener('mouseleave', stopInteraction);
});

function interact(e) {
  const x = e.clientX;
  const y = -e.clientY;

  const midX = (x - window.innerWidth / 2) * 0.2;
  const midY = (y + window.innerHeight / 2) * 0.2;

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


