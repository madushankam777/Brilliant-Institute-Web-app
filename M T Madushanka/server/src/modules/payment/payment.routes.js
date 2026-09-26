const express = require('express');
const authenticate = require('../../../../../shared/server/src/middleware/authenticate');
const authorize = require('../../../../../shared/server/src/middleware/authorize');
const validateRequest = require('../../../../../shared/server/src/middleware/validateRequest');
const { paymentReceiptUpload } = require('../../../../../shared/server/src/middleware/upload');
const { ROLES } = require('../../../../../shared/server/src/config/roles');
const controller = require('./payment.controller');
const {
  makePaymentRules,
  onlineCheckoutRules,
  bankTransferRules,
  editBankTransferRules,
  paymentIdParamRules,
  approveBankTransferRules,
  tutorIdParamRules,
  payTutorRules,
  confirmPayoutRules,
  failPayoutRules,
  bankDetailsRules,
  paymentSettingsRules,
  studentSearchRules,
  recordPaymentRules,
} = require('./payment.validation');

const router = express.Router();

router.use(authenticate);

// --- Tutor: manage their own payout bank details ---
router.get('/me/bank-details', authorize(ROLES.TUTOR), controller.getMyBankDetails);
router.put(
  '/me/bank-details',
  authorize(ROLES.TUTOR),
  bankDetailsRules,
  validateRequest,
  controller.updateMyBankDetails
);

// --- Checkout: the institute's own receiving details - any logged-in role
// can read them (shown at checkout), only Admin can change them ---
router.get('/settings', controller.getPaymentSettings);
router.put(
  '/admin/settings',
  authorize(ROLES.ADMIN),
  paymentSettingsRules,
  validateRequest,
  controller.updatePaymentSettings
);

router.get('/balance', authorize(ROLES.STUDENT_PARENT), controller.getMyBalances);
router.get('/history', authorize(ROLES.STUDENT_PARENT), controller.getMyPaymentHistory);
router.post('/', authorize(ROLES.STUDENT_PARENT), makePaymentRules, validateRequest, controller.makePayment);

// real online payment (PayHere)
router.post(
  '/checkout/online',
  authorize(ROLES.STUDENT_PARENT),
  onlineCheckoutRules,
  validateRequest,
  controller.startOnlineCheckout
);
router.get(
  '/:paymentId/status',
  authorize(ROLES.STUDENT_PARENT),
  paymentIdParamRules,
  validateRequest,
  controller.getMyPaymentStatus
);
router.patch(
  '/:paymentId/retry',
  authorize(ROLES.STUDENT_PARENT),
  paymentIdParamRules,
  validateRequest,
  controller.retryPendingPayment
);
router.get(
  '/bank-transfer/availability',
  authorize(ROLES.STUDENT_PARENT),
  controller.getBankTransferAvailability
);
router.post(
  '/bank-transfer',
  authorize(ROLES.STUDENT_PARENT),
  paymentReceiptUpload,
  bankTransferRules,
  validateRequest,
  controller.submitBankTransferPayment
);
router.patch(
  '/:paymentId/bank-transfer',
  authorize(ROLES.STUDENT_PARENT),
  paymentReceiptUpload,
  editBankTransferRules,
  validateRequest,
  controller.editBankTransferPayment
);

// admin - record a cash / bank-slip payment at the office
router.get(
  '/admin/students',
  authorize(ROLES.ADMIN),
  studentSearchRules,
  validateRequest,
  controller.searchStudentsForPayment
);
router.post(
  '/admin/record-payment',
  authorize(ROLES.ADMIN),
  recordPaymentRules,
  validateRequest,
  controller.recordOfficePayment
);

router.get(
  '/admin/pending-bank-transfers',
  authorize(ROLES.ADMIN),
  controller.listPendingBankTransfers
);
router.get(
  '/admin/recent-payments',
  authorize(ROLES.ADMIN),
  controller.listRecentPayments
);
router.patch(
  '/admin/:paymentId/approve',
  authorize(ROLES.ADMIN),
  approveBankTransferRules,
  validateRequest,
  controller.approveBankTransferPayment
);
router.patch(
  '/admin/:paymentId/reject',
  authorize(ROLES.ADMIN),
  paymentIdParamRules,
  validateRequest,
  controller.rejectBankTransferPayment
);

// Any authenticated Student/Parent or Admin can request a receipt image
router.get(
  '/:paymentId/receipt-image',
  authorize(ROLES.STUDENT_PARENT, ROLES.ADMIN),
  paymentIdParamRules,
  validateRequest,
  controller.getReceiptImage
);

router.get('/admin/tutors', authorize(ROLES.ADMIN), controller.listActiveTutors);
// full account number for making the transfer - every request is audit-logged
router.get(
  '/admin/tutors/:tutorId/payout-account',
  authorize(ROLES.ADMIN),
  tutorIdParamRules,
  validateRequest,
  controller.getTutorPayoutAccount
);
router.put(
  '/admin/tutors/:tutorId/bank-details',
  authorize(ROLES.ADMIN),
  bankDetailsRules,
  validateRequest,
  controller.updateTutorBankDetailsAsAdmin
);
router.get('/admin/tutor-payouts', authorize(ROLES.ADMIN), controller.listTutorPayouts);
router.post(
  '/admin/tutor-payouts',
  authorize(ROLES.ADMIN),
  payTutorRules,
  validateRequest,
  controller.payTutor
);

// --- Admin: paying tutors from the institute's bank ---
router.get('/admin/payouts/options', authorize(ROLES.ADMIN), controller.getPayoutOptions);
router.get('/admin/payouts/batch', authorize(ROLES.ADMIN), controller.getPayoutBatch);
router.post('/admin/payouts/export', authorize(ROLES.ADMIN), controller.exportPayoutFile);
router.patch(
  '/admin/payouts/:payoutId/settled',
  authorize(ROLES.ADMIN),
  confirmPayoutRules,
  validateRequest,
  controller.confirmPayoutSettled
);
router.patch(
  '/admin/payouts/:payoutId/failed',
  authorize(ROLES.ADMIN),
  failPayoutRules,
  validateRequest,
  controller.markPayoutFailed
);

module.exports = router;
