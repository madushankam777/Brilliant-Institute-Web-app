const QRCode = require('qrcode');

// Renders straight to a data: URL so the client can just drop it into an
// <img src>, with nothing to host or clean up on disk.
async function generateQrCodeDataUrl(text) {
  return QRCode.toDataURL(text, { errorCorrectionLevel: 'M', margin: 1, width: 260 });
}

module.exports = { generateQrCodeDataUrl };
