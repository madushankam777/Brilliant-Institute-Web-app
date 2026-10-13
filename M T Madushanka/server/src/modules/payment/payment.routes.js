// payment routes
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
  paymentMethodsRules,
  studentSearchRules,
  recordPaymentRules,
} = require('./payment.validation');

const router = express.Router();

router.use(authenticate);

router.get('/me/bank-details', authorize(ROLES.TUTOR), controller.getMyBankDetails);
// tutor saves own bank account
router.put(
  '/me/bank-details',
  authorize(ROLES.TUTOR),
  bankDetailsRules,
  validateRequest,
  controller.updateMyBankDetails
);

router.get('/settings', controller.getPaymentSettings);
// save payment details
router.put(
  '/admin/settings',
  authorize(ROLES.ADMIN),
  paymentSettingsRules,
  validateRequest,
  controller.updatePaymentSettings
);
// payment method switch - turn one on or off straight away
router.put(
  '/admin/methods',
  authorize(ROLES.ADMIN),
  paymentMethodsRules,
  validateRequest,
  controller.updatePaymentMethods
);

// my fee balances
router.get('/balance', authorize(ROLES.STUDENT_PARENT), controller.getMyBalances);
// my payment history
router.get('/history', authorize(ROLES.STUDENT_PARENT), controller.getMyPaymentHistory);
// pay now (card / wallet)
router.post('/', authorize(ROLES.STUDENT_PARENT), makePaymentRules, validateRequest, controller.makePayment);

// start a PayHere payment
router.post(
  '/checkout/online',
  authorize(ROLES.STUDENT_PARENT),
  onlineCheckoutRules,
  validateRequest,
  controller.startOnlineCheckout
);
// start a PayPal payment
router.post(
  '/checkout/paypal',
  authorize(ROLES.STUDENT_PARENT),
  onlineCheckoutRules,
  validateRequest,
  controller.startPayPalCheckout
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
// bank transfer btn
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

router.get(
  '/admin/students',
  authorize(ROLES.ADMIN),
  studentSearchRules,
  validateRequest,
  controller.searchStudentsForPayment
);
// record a payment at the office
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
// approve a bank slip
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
// pay a tutor
router.post(
  '/admin/tutor-payouts',
  authorize(ROLES.ADMIN),
  payTutorRules,
  validateRequest,
  controller.payTutor
);

router.get('/admin/payouts/options', authorize(ROLES.ADMIN), controller.getPayoutOptions);
router.get('/admin/payouts/batch', authorize(ROLES.ADMIN), controller.getPayoutBatch);
// download the bank file
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
