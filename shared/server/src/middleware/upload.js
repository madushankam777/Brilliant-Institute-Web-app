// file uploads - kept in memory, checked, then saved to MySQL by the controller
const multer = require('multer');
const ApiError = require('../utils/ApiError');

const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const DOCUMENT_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

// check the real file type from its first bytes
function hasRealFileSignature(buffer, mimeType) {
  const head = buffer.subarray(0, 12);
  if (head.length < 4) return false;
  if (mimeType === 'image/jpeg') return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
  if (mimeType === 'image/png') return head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mimeType === 'image/webp') return head.toString('latin1', 0, 4) === 'RIFF' && head.toString('latin1', 8, 12) === 'WEBP';
  if (mimeType === 'application/pdf') return head.toString('latin1', 0, 5) === '%PDF-';
  return false;
}

function uploadedFiles(req) {
  if (req.file) return [req.file];
  if (req.files && !Array.isArray(req.files)) return Object.values(req.files).flat();
  return req.files || [];
}

function typeFilter(allowed, message) {
  return (req, file, cb) => {
    if (!allowed.has(file.mimetype)) {
      cb(ApiError.badRequest(message));
      return;
    }
    cb(null, true);
  };
}

const imageFilter = typeFilter(IMAGE_MIME_TYPES, 'Only JPG, PNG, or WEBP images are allowed.');
const documentFilter = typeFilter(DOCUMENT_MIME_TYPES, 'Only PDF, JPG, PNG, or WEBP files are allowed.');

const profilePictureUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: imageFilter,
  limits: { fileSize: 3 * 1024 * 1024, files: 1 },
}).single('profilePicture');

const tutorDocumentsUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: documentFilter,
  limits: { fileSize: 5 * 1024 * 1024, files: 6 },
}).fields([
  { name: 'cv', maxCount: 1 },
  { name: 'certificates', maxCount: 5 },
]);

const paymentReceiptUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: imageFilter,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
}).single('receiptImage');

function wrapUpload(uploadMiddleware) {
  return function handleUpload(req, res, next) {
    uploadMiddleware(req, res, (error) => {
      if (error) {
        next(error instanceof multer.MulterError ? ApiError.badRequest(`Upload failed: ${error.message}`) : error);
        return;
      }
      const files = uploadedFiles(req);
      if (!files.every((file) => hasRealFileSignature(file.buffer, file.mimetype))) {
        next(ApiError.badRequest('That file is not a real JPG, PNG, WEBP or PDF. Please choose another file.'));
        return;
      }
      next();
    });
  };
}

module.exports = {
  profilePictureUpload: wrapUpload(profilePictureUpload),
  tutorDocumentsUpload: wrapUpload(tutorDocumentsUpload),
  paymentReceiptUpload: wrapUpload(paymentReceiptUpload),
};
