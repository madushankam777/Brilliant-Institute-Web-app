// file uploads - kept in memory, checked, then saved to MySQL by the controller
const multer = require('multer');
const ApiError = require('../utils/ApiError');

// file types allowed for pictures
const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
// file types allowed for documents
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

// all files in this request, however multer stored them
function uploadedFiles(req) {
  if (req.file) return [req.file];
  if (req.files && !Array.isArray(req.files)) return Object.values(req.files).flat();
  return req.files || [];
}

// refuse a file whose declared type is not in the allowed list
function typeFilter(allowed, message) {
  return (req, file, cb) => {
    if (!allowed.has(file.mimetype)) {
      cb(ApiError.badRequest(message));
      return;
    }
    cb(null, true);
  };
}

// filters - pictures only, and pictures or PDF
const imageFilter = typeFilter(IMAGE_MIME_TYPES, 'Only JPG, PNG, or WEBP images are allowed.');
const documentFilter = typeFilter(DOCUMENT_MIME_TYPES, 'Only PDF, JPG, PNG, or WEBP files are allowed.');

// profile picture - one image, up to 3 MB
const profilePictureUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: imageFilter,
  limits: { fileSize: 3 * 1024 * 1024, files: 1 },
}).single('profilePicture');

// tutor documents - one CV and up to 5 certificates, 5 MB each
const tutorDocumentsUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: documentFilter,
  limits: { fileSize: 5 * 1024 * 1024, files: 6 },
}).fields([
  { name: 'cv', maxCount: 1 },
  { name: 'certificates', maxCount: 5 },
]);

// bank transfer receipt - one image, up to 5 MB
const paymentReceiptUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: imageFilter,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
}).single('receiptImage');

// runs an upload, turns upload errors into 400 replies and rejects files that only pretend to be images
function wrapUpload(uploadMiddleware) {
  return function handleUpload(req, res, next) {
    uploadMiddleware(req, res, (error) => {
      if (error) {
        next(error instanceof multer.MulterError ? ApiError.badRequest(`Upload failed: ${error.message}`) : error);
        return;
      }
      // every file must really be what it says it is
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
