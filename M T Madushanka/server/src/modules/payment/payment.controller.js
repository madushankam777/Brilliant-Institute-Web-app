// HTTP layer for payment routes
const path = require('path');
const asyncHandler = require('../../../../../shared/server/src/utils/asyncHandler');
const { UPLOADS_ROOT_DIR, toPublicUploadPath } = require('../../../../../shared/server/src/middleware/upload');
const service = require('./payment.service');

const getMyBalances = asyncHandler(async (req, res) => {
  const balances = await service.getMyBalances(req.user);
  res.status(200).json({ success: true, data: { balances } });
});

const makePayment = asyncHandler(async (req, res) => {
  const { enrollmentId, amount, paymentMethod, paymentDetails } = req.body;
  const result = await service.makePayment(req.user, {
    enrollmentId,
    amount,
    paymentMethod,
    paymentDetails,
  });

  if (result.pending) {
    // SRS ATP-UC-02 exception path: gateway timeout - the payment is
    // safely stored as PENDING and can be retried shortly.
    return res.status(202).json({
      success: true,
      message:
        'The payment gateway did not respond in time. Your payment is pending - please check ' +
        'back shortly or retry it from your payment history.',
      data: { payment: result.payment },
    });
  }

  res.status(201).json({
    success: true,
    message: 'Payment completed successfully. A receipt has been generated.',
    data: { payment: result.payment },
  });
});

const retryPendingPayment = asyncHandler(async (req, res) => {
  const paymentId = Number(req.params.paymentId);
  const result = await service.retryPendingPayment(req.user, paymentId);

  if (result.pending) {
    return res.status(202).json({
      success: true,
      message: 'Still processing. Please try again shortly.',
      data: { payment: result.payment },
    });
  }

  res.status(200).json({
    success: true,
    message: 'Payment completed successfully. A receipt has been generated.',
    data: { payment: result.payment },
  });
});

const getMyPaymentHistory = asyncHandler(async (req, res) => {
  const payments = await service.getMyPaymentHistory(req.user);
  res.status(200).json({ success: true, data: { payments } });
});

// GET /api/payments/bank-transfer/availability - lets the client show/hide
// the Bank Transfer option before the student fills out the whole form.
const getBankTransferAvailability = asyncHandler(async (req, res) => {
  const availability = service.getBankTransferAvailability();
  res.status(200).json({ success: true, data: availability });
});

// POST /api/payments/bank-transfer - the receipt image has already been
// validated/saved by the upload middleware ahead of this handler.
const submitBankTransferPayment = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'Please attach your transfer receipt.' });
  }
  const { enrollmentId, amount, bankReference } = req.body;
  const result = await service.submitBankTransferPayment(req.user, {
    enrollmentId,
    amount,
    bankReference,
    receiptImagePath: toPublicUploadPath(req.file.path),
  });
  res.status(202).json({
    success: true,
    message: 'Your bank transfer receipt has been submitted and is awaiting verification by an Administrator.',
    data: { payment: result.payment },
  });
});

// edit btn - correct reference/receipt on a pending bank transfer
const editBankTransferPayment = asyncHandler(async (req, res) => {
  const paymentId = Number(req.params.paymentId);
  const { bankReference } = req.body;
  const receiptImagePath = req.file ? toPublicUploadPath(req.file.path) : undefined;
  const payment = await service.editBankTransferPayment(req.user, paymentId, {
    bankReference,
    receiptImagePath,
  });
  res.status(200).json({
    success: true,
    message: 'Your bank transfer submission has been updated.',
    data: { payment },
  });
});

const listPendingBankTransfers = asyncHandler(async (req, res) => {
  const payments = await service.listPendingBankTransfers();
  res.status(200).json({ success: true, data: { payments } });
});

const approveBankTransferPayment = asyncHandler(async (req, res) => {
  const paymentId = Number(req.params.paymentId);
  const payment = await service.approveBankTransferPayment(req.user, paymentId);
  res.status(200).json({ success: true, message: 'Bank transfer approved.', data: { payment } });
});

const rejectBankTransferPayment = asyncHandler(async (req, res) => {
  const paymentId = Number(req.params.paymentId);
  const payment = await service.rejectBankTransferPayment(req.user, paymentId);
  res.status(200).json({ success: true, message: 'Bank transfer rejected.', data: { payment } });
});

const getReceiptImage = asyncHandler(async (req, res) => {
  const paymentId = Number(req.params.paymentId);
  const publicPath = await service.getReceiptImagePath(req.user, paymentId);
  const absolutePath = path.join(UPLOADS_ROOT_DIR, publicPath.replace(/^\/uploads\//, ''));
  res.sendFile(absolutePath);
});

// tutor picker list
const listActiveTutors = asyncHandler(async (req, res) => {
  const tutors = await service.listActiveTutors();
  res.status(200).json({ success: true, data: { tutors } });
});

const payTutor = asyncHandler(async (req, res) => {
  const { tutorId, amount, note, periodLabel } = req.body;
  const payout = await service.payTutor(req.user, { tutorId, amount, note, periodLabel });
  res.status(201).json({
    success: true,
    message: `Payout recorded for ${payout.tutorName}.`,
    data: { payout },
  });
});

const listTutorPayouts = asyncHandler(async (req, res) => {
  const data = await service.listTutorPayouts();
  res.status(200).json({ success: true, data });
});

module.exports = {
  getMyBalances,
  makePayment,
  retryPendingPayment,
  getMyPaymentHistory,
  getBankTransferAvailability,
  submitBankTransferPayment,
  editBankTransferPayment,
  listPendingBankTransfers,
  approveBankTransferPayment,
  rejectBankTransferPayment,
  getReceiptImage,
  listActiveTutors,
  payTutor,
  listTutorPayouts,
};
