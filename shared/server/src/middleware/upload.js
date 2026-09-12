const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const ApiError = require('../utils/ApiError');

const UPLOADS_ROOT_DIR = path.join(__dirname, '..', '..', 'uploads');
const PROFILE_PICTURES_DIR = path.join(UPLOADS_ROOT_DIR, 'profile-pictures');
const TUTOR_DOCUMENTS_DIR = path.join(UPLOADS_ROOT_DIR, 'tutor-documents');
const PAYMENT_RECEIPTS_DIR = path.join(UPLOADS_ROOT_DIR, 'payment-receipts');

for (const dir of [UPLOADS_ROOT_DIR, PROFILE_PICTURES_DIR, TUTOR_DOCUMENTS_DIR, PAYMENT_RECEIPTS_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const DOCUMENT_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

function safeExtension(originalName, fallback) {
  const ext = path.extname(originalName).toLowerCase();
  const allowed = new Set(['.jpg', '.jpeg', '.png', '.webp', '.pdf']);
  return allowed.has(ext) ? ext : fallback;
}

function randomFileName(originalName, fallbackExt) {
  const ext = safeExtension(originalName, fallbackExt);
  return `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
}

function makeStorage(destinationDir, fallbackExt) {
  return multer.diskStorage({
    destination(req, file, cb) {
      cb(null, destinationDir);
    },
    filename(req, file, cb) {
      cb(null, randomFileName(file.originalname, fallbackExt));
    },
  });
}

function imageFileFilter(req, file, cb) {
  if (!IMAGE_MIME_TYPES.has(file.mimetype)) {
    cb(ApiError.badRequest('Only JPG, PNG, or WEBP images are allowed.'));
    return;
  }
  cb(null, true);
}

function documentFileFilter(req, file, cb) {
  if (!DOCUMENT_MIME_TYPES.has(file.mimetype)) {
    cb(ApiError.badRequest('Only PDF, JPG, PNG, or WEBP files are allowed.'));
    return;
  }
  cb(null, true);
}

const profilePictureUpload = multer({
  storage: makeStorage(PROFILE_PICTURES_DIR, '.jpg'),
  fileFilter: imageFileFilter,
  limits: { fileSize: 3 * 1024 * 1024, files: 1 },
}).single('profilePicture');

const tutorDocumentsUpload = multer({
  storage: makeStorage(TUTOR_DOCUMENTS_DIR, '.pdf'),
  fileFilter: documentFileFilter,
  limits: { fileSize: 5 * 1024 * 1024, files: 6 },
}).fields([
  { name: 'cv', maxCount: 1 },
  { name: 'certificates', maxCount: 5 },
]);

const paymentReceiptUpload = multer({
  storage: makeStorage(PAYMENT_RECEIPTS_DIR, '.jpg'),
  fileFilter: imageFileFilter,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
}).single('receiptImage');

function wrapUpload(uploadMiddleware) {
  return function handleUpload(req, res, next) {
    uploadMiddleware(req, res, (error) => {
      if (!error) {
        next();
        return;
      }
      if (error instanceof multer.MulterError) {
        next(ApiError.badRequest(`Upload failed: ${error.message}`));
        return;
      }
      next(error);
    });
  };
}

function toPublicUploadPath(absoluteFilePath) {
  const relative = path.relative(UPLOADS_ROOT_DIR, absoluteFilePath).split(path.sep).join('/');
  return `/uploads/${relative}`;
}

module.exports = {
  UPLOADS_ROOT_DIR,
  profilePictureUpload: wrapUpload(profilePictureUpload),
  tutorDocumentsUpload: wrapUpload(tutorDocumentsUpload),
  paymentReceiptUpload: wrapUpload(paymentReceiptUpload),
  toPublicUploadPath,
};
