function toggleFooter () {
  document.getElementById("footer").classList.toggle('active')
  document.getElementById("footer-background").classList.toggle('visible')

  if (document.getElementById('header').style.filter == 'blur(2px)') {
    document.getElementById("header").classList.remove("freeze")
    const scrollY = document.getElementById("blurable").style.top;
    document.getElementById('header').style.filter = '';
    document.getElementById('blurable').style.filter = '';
    document.getElementById("blurable").style.position = '';
    if (scrollY) {
      window.scrollTo(0, parseInt(scrollY || '0') * -1);
    }
  } else {
    document.getElementById("header").classList.add("freeze")
    document.getElementById("blurable").style.top = `-${window.scrollY}px`;
    document.getElementById("blurable").style.width = '100%';
    document.getElementById("blurable").style.position = 'fixed';
    document.getElementById('header').style.filter = 'blur(2px)';
    document.getElementById('blurable').style.filter = 'blur(5px)';
  }
}

function submitForm () {
  submitted = true;
  document.getElementById('confirmation').style.opacity = '1'
}

var submitted = false;

function inputUpdated () {
  if (document.getElementById('entry.1666646602').value != '' &&
    document.getElementById('entry.739886106').value != '' &&
    document.getElementById('entry.628106078').value != '') {
    document.getElementById("submit").disabled = false;
  } else {
    document.getElementById("submit").disabled = true;
  }
}
