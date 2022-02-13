// document.addEventListener("DOMContentLoaded", function() {
//   const encryptWithAES = (text, passphrase) => {
//     return CryptoJS.AES.encrypt(text, passphrase).toString();
//   };

//   const elements = document.querySelectorAll('.encrypt');
//   const images = document.querySelectorAll('.encrypt-image');
//   const downloadBtn = document.querySelector('#download-btn');

//   const passphraseElement = document.querySelector('#secret-key');
//   const passphrase = passphraseElement.textContent;

//   for (i = 0; i < elements.length; i++) {
//     elements[i].textContent = encryptWithAES(elements[i].textContent, passphrase);
//   }

//   for (i = 0; i < images.length; i++) {
//     images[i].src = encryptWithAES(images[i].src, passphrase);
//   }

//   downloadBtn.setAttribute('onclick', encryptWithAES(downloadBtn.getAttribute('onclick'), passphrase));
//   passphraseElement.remove();
// });

document.addEventListener("DOMContentLoaded", function() {
  setTimeout(function() {
    let passphrase = prompt("Please enter your key", "Secret Key");
    const elements = document.querySelectorAll('.encrypt');
    const images = document.querySelectorAll('.encrypt-image');
    const downloadBtn = document.querySelector('#download-btn');
    const cubeFaces = document.querySelectorAll('.face');
    const flatFaces = document.querySelectorAll('.flat-face');

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
      } catch (error) {
        console.log(error)
      }
    }

    downloadBtn.setAttribute('onclick', decryptWithAES(downloadBtn.getAttribute('onclick'), passphrase));
    if (downloadBtn.getAttribute('onclick')) {
      document.querySelector('.glitch').remove();
      document.querySelector('.for-display').style.pointerEvents = 'initial';
    }
  }, 1000);
});

function decryptWithAES(ciphertext, passphrase)  {
  const bytes = CryptoJS.AES.decrypt(ciphertext, passphrase);
  const originalText = bytes.toString(CryptoJS.enc.Utf8);
  return originalText;
};
