// payment routes - fees, online and bank transfers, office payments and tutor payouts (/api/payments)
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

// every payment route needs a logged-in user
router.use(authenticate);

// --- Tutor: manage their own payout bank details ---
router.get('/me/bank-details', authorize(ROLES.TUTOR), controller.getMyBankDetails);
// tutor - save my payout bank details
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
// admin - save the institute's receiving details
router.put(
  '/admin/settings',
  authorize(ROLES.ADMIN),
  paymentSettingsRules,
  validateRequest,
  controller.updatePaymentSettings
);

// student - what I still owe on each class
router.get('/balance', authorize(ROLES.STUDENT_PARENT), controller.getMyBalances);
// student - my payment history
router.get('/history', authorize(ROLES.STUDENT_PARENT), controller.getMyPaymentHistory);
// pay btn - instant payment through the payment simulator (used when PayHere is off)
router.post('/', authorize(ROLES.STUDENT_PARENT), makePaymentRules, validateRequest, controller.makePayment);

// real online payment (PayHere)
router.post(
  '/checkout/online',
  authorize(ROLES.STUDENT_PARENT),
  onlineCheckoutRules,
  validateRequest,
  controller.startOnlineCheckout
);
// student - status of one payment (the return page checks it after PayHere)
router.get(
  '/:paymentId/status',
  authorize(ROLES.STUDENT_PARENT),
  paymentIdParamRules,
  validateRequest,
  controller.getMyPaymentStatus
);
// retry btn - try a pending payment again
router.patch(
  '/:paymentId/retry',
  authorize(ROLES.STUDENT_PARENT),
  paymentIdParamRules,
  validateRequest,
  controller.retryPendingPayment
);
// is bank transfer open today?
router.get(
  '/bank-transfer/availability',
  authorize(ROLES.STUDENT_PARENT),
  controller.getBankTransferAvailability
);
// bank transfer btn - send the bank reference and receipt image (waits for admin approval)
router.post(
  '/bank-transfer',
  authorize(ROLES.STUDENT_PARENT),
  paymentReceiptUpload,
  bankTransferRules,
  validateRequest,
  controller.submitBankTransferPayment
);
// edit btn - correct a pending bank transfer
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
// record payment btn - admin records a cash or bank slip payment
router.post(
  '/admin/record-payment',
  authorize(ROLES.ADMIN),
  recordPaymentRules,
  validateRequest,
  controller.recordOfficePayment
);

// admin - bank transfers waiting for approval
router.get(
  '/admin/pending-bank-transfers',
  authorize(ROLES.ADMIN),
  controller.listPendingBankTransfers
);
// admin - the most recent payments
router.get(
  '/admin/recent-payments',
  authorize(ROLES.ADMIN),
  controller.listRecentPayments
);
// approve btn - confirm the amount shown on the slip
router.patch(
  '/admin/:paymentId/approve',
  authorize(ROLES.ADMIN),
  approveBankTransferRules,
  validateRequest,
  controller.approveBankTransferPayment
);
// reject btn - refuse the bank transfer
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

// Pay Tutors page - the active tutors with their account number masked
router.get('/admin/tutors', authorize(ROLES.ADMIN), controller.listActiveTutors);
// full account number for making the transfer - every request is audit-logged
router.get(
  '/admin/tutors/:tutorId/payout-account',
  authorize(ROLES.ADMIN),
  tutorIdParamRules,
  validateRequest,
  controller.getTutorPayoutAccount
);
// admin - save a tutor's bank details
router.put(
  '/admin/tutors/:tutorId/bank-details',
  authorize(ROLES.ADMIN),
  bankDetailsRules,
  validateRequest,
  controller.updateTutorBankDetailsAsAdmin
);
// all tutor payouts
router.get('/admin/tutor-payouts', authorize(ROLES.ADMIN), controller.listTutorPayouts);
// pay btn - pay a tutor (bank transfer, bank file or payout API)
router.post(
  '/admin/tutor-payouts',
  authorize(ROLES.ADMIN),
  payTutorRules,
  validateRequest,
  controller.payTutor
);

// --- Admin: paying tutors from the institute's bank ---
router.get('/admin/payouts/options', authorize(ROLES.ADMIN), controller.getPayoutOptions);
// payouts waiting for the next bank file
router.get('/admin/payouts/batch', authorize(ROLES.ADMIN), controller.getPayoutBatch);
// export btn - download the bank file (CSV)
router.post('/admin/payouts/export', authorize(ROLES.ADMIN), controller.exportPayoutFile);
// paid btn - the bank confirmed this payout
router.patch(
  '/admin/payouts/:payoutId/settled',
  authorize(ROLES.ADMIN),
  confirmPayoutRules,
  validateRequest,
  controller.confirmPayoutSettled
);
// failed btn - the payout did not go through
router.patch(
  '/admin/payouts/:payoutId/failed',
  authorize(ROLES.ADMIN),
  failPayoutRules,
  validateRequest,
  controller.markPayoutFailed
);

module.exports = router;
