function expandFooter () {
  document.getElementById("footer").classList.toggle('active')
  document.getElementById("footer-background").classList.toggle('visible')

  if (document.getElementById('header').style.filter == 'blur(2px)') {
    document.getElementById('header').style.filter = '';
    document.getElementById('blurable').style.filter = '';
  } else {
    document.getElementById('header').style.filter = 'blur(2px)';
    document.getElementById('blurable').style.filter = 'blur(5px)';
  }
}

function closeFooter () {
  document.getElementById("footer").classList.remove('active')
  document.getElementById("footer-background").classList.removee('visible')

  document.getElementById('header').style.filter = '';
  document.getElementById('blurable').style.filter = '';
}
