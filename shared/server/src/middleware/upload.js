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

// The saved extension follows the checked file type, never the uploaded name.
const EXTENSION_FOR_TYPE = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};

function randomFileName(mimeType) {
  return `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${EXTENSION_FOR_TYPE[mimeType] || '.bin'}`;
}

function makeStorage(destinationDir) {
  return multer.diskStorage({
    destination(req, file, cb) {
      cb(null, destinationDir);
    },
    filename(req, file, cb) {
      cb(null, randomFileName(file.mimetype));
    },
  });
}

// check the real file type from its first bytes
function hasRealFileSignature(filePath, mimeType) {
  const head = Buffer.alloc(12);
  let fd;
  try {
    fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, head, 0, 12, 0);
  } catch {
    return false;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
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
  storage: makeStorage(PROFILE_PICTURES_DIR),
  fileFilter: imageFileFilter,
  limits: { fileSize: 3 * 1024 * 1024, files: 1 },
}).single('profilePicture');

const tutorDocumentsUpload = multer({
  storage: makeStorage(TUTOR_DOCUMENTS_DIR),
  fileFilter: documentFileFilter,
  limits: { fileSize: 5 * 1024 * 1024, files: 6 },
}).fields([
  { name: 'cv', maxCount: 1 },
  { name: 'certificates', maxCount: 5 },
]);

const paymentReceiptUpload = multer({
  storage: makeStorage(PAYMENT_RECEIPTS_DIR),
  fileFilter: imageFileFilter,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
}).single('receiptImage');

function wrapUpload(uploadMiddleware) {
  return function handleUpload(req, res, next) {
    uploadMiddleware(req, res, (error) => {
      if (!error) {
        const files = uploadedFiles(req);
        if (files.every((file) => hasRealFileSignature(file.path, file.mimetype))) {
          next();
          return;
        }
        files.forEach((file) => fs.unlink(file.path, () => {}));
        next(ApiError.badRequest('That file is not a real JPG, PNG, WEBP or PDF. Please choose another file.'));
        return;
      }
      // don't leave half-saved files behind
      uploadedFiles(req).forEach((file) => fs.unlink(file.path, () => {}));
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
