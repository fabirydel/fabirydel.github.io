function hoverDecrypt() {
  document.querySelector('.decrypt').classList.add('decrypt-hovered');
}

function leaveDecrypt() {
  document.querySelector('.decrypt').classList.remove('decrypt-hovered');
}

function showError() {
  document.querySelector('.error').classList.add('visible');
  document.querySelector('#decrypt-text').classList.add('disabled');
  document.querySelector('#decrypt-text').disabled = true;
  document.querySelector('#decrypt-text').value = 'Reload page to try again';
}

function decrypt() {
  let passphrase = document.querySelector('#decrypt-text').value;
  const elements = document.querySelectorAll('.encrypt');
  const images = document.querySelectorAll('.encrypt-image');
  const downloadBtn = document.querySelector('#download-btn');
  const cubeFaces = document.querySelectorAll('.face');
  const flatFaces = document.querySelectorAll('.flat-face');
  const glitches = document.querySelectorAll('.story-glitch');
  const glitchContainers = document.querySelectorAll('.encrypted-image-container');

  for (i = 0; i < cubeFaces.length; i++) {
    try {
      cubeFaces[i].style.backgroundImage = decryptWithAES(cubeFaces[i].id, passphrase);
    } catch (error) {
      showError();
    }
  }

  for (i = 0; i < flatFaces.length; i++) {
    try {
      flatFaces[i].style.backgroundImage = decryptWithAES(flatFaces[i].id, passphrase);
    } catch (error) {
      showError();
    }
  }

  for (i = 0; i < elements.length; i++) {
    try {
      elements[i].textContent = decryptWithAES(elements[i].textContent, passphrase);
    } catch (error) {
      showError();
    }
  }

  for (i = 0; i < images.length; i++) {
    try {
      images[i].setAttribute('src', decryptWithAES(images[i].getAttribute('src'), passphrase));
      images[i].classList.remove('encrypted-image')
    } catch (error) {
      showError();
    }
  }

  downloadBtn.setAttribute('onclick', decryptWithAES(downloadBtn.getAttribute('onclick'), passphrase));
  if (downloadBtn.getAttribute('onclick')) {
    // Put here anything that needs successful decryption

    closeDecryptModal();
    document.querySelector('.glitch').classList.add('invisible');
    document.querySelector('.fake-cube').classList.add('invisible');
    document.querySelector('.decrypt').classList.add('invisible');
    document.querySelector('.for-display').style.pointerEvents = 'initial';

    for (i = 0; i < glitches.length; i++) {
      try {
        glitches[i].remove()
      } catch (error) {
        console.log(error)
      }
    }

    for (i = 0; i < glitchContainers.length; i++) {
      try {
        glitchContainers[i].classList.remove('encrypted-image-container')
      } catch (error) {
        console.log(error)
      }
    }
  }
}

function closeDecryptModal() {
  let blurable = document.getElementById("blurable")
  const scrollY = blurable.style.top;
  blurable.style.position = '';
  blurable.style.top = '';
  if (scrollY) {
    window.scrollTo(0, parseInt(scrollY || '0') * -1);
  }
  deblurEverything();

  document.getElementById("decrypt-modal").style.visibility = "hidden";
  document.getElementById("decrypt-modal").style.opacity = "0";
  setTimeout(function() {
    document.getElementById("decrypt-modal").style.display = "none";
  }, 250);
}

function openDecryptModal() {
  let blurable = document.getElementById("blurable");
  blurable.style.top = `-${window.scrollY}px`;
  blurable.style.position = 'fixed';
  blurable.style.width = '100%';
  document.getElementById("decrypt-modal").style.display = "block";
  setTimeout(function() {
    document.getElementById("decrypt-modal").style.visibility = "visible";
    document.getElementById("decrypt-modal").style.opacity = "1";
  }, 10);
  blurEverything();
}

function decryptWithAES(ciphertext, passphrase)  {
  const bytes = CryptoJS.AES.decrypt(ciphertext, passphrase);
  const originalText = bytes.toString(CryptoJS.enc.Utf8);
  return originalText;
};
