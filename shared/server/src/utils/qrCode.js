// QR code maker (not used by any page yet)
const QRCode = require('qrcode');

// QR code as a data: URL for an <img>
async function generateQrCodeDataUrl(text) {
  return QRCode.toDataURL(text, { errorCorrectionLevel: 'M', margin: 1, width: 260 });
}

module.exports = { generateQrCodeDataUrl };
