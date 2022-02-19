function hoverRedeem() {
  document.querySelector('.redeem').classList.add('redeem-hovered');
}

function leaveRedeem() {
  document.querySelector('.redeem').classList.remove('redeem-hovered');
}

function openRedeemModal() {
  let passphrase = prompt("Please enter your key", "Secret Key");
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
      console.log(error)
    }
  }

  for (i = 0; i < flatFaces.length; i++) {
    try {
      flatFaces[i].style.backgroundImage = decryptWithAES(flatFaces[i].id, passphrase);
    } catch (error) {
      console.log(error)
    }
  }

  for (i = 0; i < elements.length; i++) {
    try {
      elements[i].textContent = decryptWithAES(elements[i].textContent, passphrase);
    } catch (error) {
      console.log(error)
    }
  }

  for (i = 0; i < images.length; i++) {
    try {
      images[i].setAttribute('src', decryptWithAES(images[i].getAttribute('src'), passphrase));
      images[i].classList.remove('encrypted-image')
    } catch (error) {
      console.log(error)
    }
  }

  downloadBtn.setAttribute('onclick', decryptWithAES(downloadBtn.getAttribute('onclick'), passphrase));
  if (downloadBtn.getAttribute('onclick')) {
    // Put here anything that needs successful decryption

    document.querySelector('.glitch').classList.add('invisible');
    document.querySelector('.fake-cube').classList.add('invisible');
    document.querySelector('.redeem').classList.add('invisible');
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

function decryptWithAES(ciphertext, passphrase)  {
  const bytes = CryptoJS.AES.decrypt(ciphertext, passphrase);
  const originalText = bytes.toString(CryptoJS.enc.Utf8);
  return originalText;
};
