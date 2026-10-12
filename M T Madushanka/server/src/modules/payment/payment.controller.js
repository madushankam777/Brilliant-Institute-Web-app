// HTTP layer for payment routes
const asyncHandler = require('../../../../../shared/server/src/utils/asyncHandler');
const config = require('../../../../../shared/server/src/config/env');
const { saveUpload, deleteUpload, sendUpload } = require('../../../../../shared/server/src/utils/fileStore');
const service = require('./payment.service');

const getMyBalances = asyncHandler(async (req, res) => {
  const balances = await service.getMyBalances(req.user);
  res.status(200).json({ success: true, data: { balances } });
});

// POST /api/payments
const makePayment = asyncHandler(async (req, res) => {
  const { enrollmentId, amount, paymentMethod, paymentDetails } = req.body;
  const result = await service.makePayment(req.user, {
    enrollmentId,
    amount: Number(amount),
    paymentMethod,
    paymentDetails,
  });

  if (result.pending) {
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

const getBankTransferAvailability = asyncHandler(async (req, res) => {
  const availability = service.getBankTransferAvailability();
  res.status(200).json({ success: true, data: availability });
});

// POST /api/payments/bank-transfer
const submitBankTransferPayment = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'Please attach your transfer receipt.' });
  }
  const { enrollmentId, amount, bankReference } = req.body;
  const receiptImagePath = await saveUpload(req.file, 'PAYMENT_RECEIPT', req.user.id);
  let result;
  try {
    result = await service.submitBankTransferPayment(req.user, {
      enrollmentId,
      amount: Number(amount),
      bankReference,
      receiptImagePath,
    });
  } catch (error) {
    await deleteUpload(receiptImagePath);
    throw error;
  }
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
  const receiptImagePath = req.file ? await saveUpload(req.file, 'PAYMENT_RECEIPT', req.user.id) : undefined;
  let payment;
  try {
    payment = await service.editBankTransferPayment(req.user, paymentId, {
      bankReference,
      receiptImagePath,
    });
  } catch (error) {
    if (receiptImagePath) await deleteUpload(receiptImagePath);
    throw error;
  }
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

const listRecentPayments = asyncHandler(async (req, res) => {
  const payments = await service.listRecentPayments();
  res.status(200).json({ success: true, data: { payments } });
});

const approveBankTransferPayment = asyncHandler(async (req, res) => {
  const paymentId = Number(req.params.paymentId);
  const payment = await service.approveBankTransferPayment(req.user, paymentId, { amount: req.body.amount });
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
  await sendUpload(res, publicPath, 'PAYMENT_RECEIPT');
});

const getPaymentSettings = asyncHandler(async (req, res) => {
  const settings = await service.getPaymentSettings();
  res.status(200).json({ success: true, data: { settings } });
});

const updatePaymentSettings = asyncHandler(async (req, res) => {
  const { bankName, bankAccountName, bankAccountNumber, bankBranch, bankSwift, ezCashNumber, mcashNumber, enabledMethods, confirmText } =
    req.body;
  const settings = await service.updatePaymentSettings(req.user, {
    enabledMethods,
    confirmText,
    bankName,
    bankAccountName,
    bankAccountNumber,
    bankBranch,
    bankSwift,
    ezCashNumber,
    mcashNumber,
  });
  res.status(200).json({ success: true, message: 'Payment settings saved.', data: { settings } });
});

const listActiveTutors = asyncHandler(async (req, res) => {
  const tutors = await service.listActiveTutors();
  res.status(200).json({ success: true, data: { tutors } });
});

const getMyBankDetails = asyncHandler(async (req, res) => {
  const bankDetails = await service.getMyBankDetails(req.user);
  res.status(200).json({ success: true, data: { bankDetails } });
});

const updateMyBankDetails = asyncHandler(async (req, res) => {
  const { bankName, accountHolder, accountNumber, branch } = req.body;
  const bankDetails = await service.updateMyBankDetails(req.user, {
    bankName,
    accountHolder,
    accountNumber,
    branch,
  });
  res.status(200).json({
    success: true,
    message: 'Banking information saved.',
    data: { bankDetails },
  });
});

// POST /admin/tutor-payouts - pay a tutor and notify them
const payTutor = asyncHandler(async (req, res) => {
  const { tutorId, amount, note, periodLabel, method, bankReference, transferDate } = req.body;
  const payout = await service.payTutor(req.user, {
    tutorId,
    amount: Number(amount),
    note,
    periodLabel,
    method,
    bankReference,
    transferDate,
  });
  const outcome = {
    SENT: `Payment to ${payout.tutorName} recorded. They have been notified.`,
    QUEUED: `Payout for ${payout.tutorName} added to the next bank file.`,
    FAILED: `The transfer to ${payout.tutorName} failed: ${payout.failureReason}`,
  };
  res.status(201).json({
    success: true,
    message: outcome[payout.status] || `Payment to ${payout.tutorName} recorded.`,
    data: { payout },
  });
});

const getPayoutOptions = asyncHandler(async (req, res) => {
  res.status(200).json({ success: true, data: { options: await service.getPayoutOptions() } });
});

const getTutorPayoutAccount = asyncHandler(async (req, res) => {
  const account = await service.getTutorPayoutAccount(req.user, Number(req.params.tutorId));
  res.status(200).json({ success: true, data: { account } });
});

const getPayoutBatch = asyncHandler(async (req, res) => {
  const batch = await service.getPayoutBatch();
  res.status(200).json({ success: true, data: { batch } });
});

const exportPayoutFile = asyncHandler(async (req, res) => {
  const file = await service.exportPayoutFile(req.user);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
  res.setHeader('X-Payout-Count', String(file.rowCount));
  res.setHeader('X-Payout-Total', file.total.toFixed(2));
  res.status(200).send(file.csv);
});

const confirmPayoutSettled = asyncHandler(async (req, res) => {
  const result = await service.confirmPayoutSettled(req.user, Number(req.params.payoutId), {
    providerReference: req.body.providerReference,
    transferDate: req.body.transferDate,
  });
  res.status(200).json({ success: true, message: 'Payout marked as paid. The tutor has been notified.', data: { result } });
});

const markPayoutFailed = asyncHandler(async (req, res) => {
  const result = await service.markPayoutFailed(
    req.user,
    Number(req.params.payoutId),
    req.body.reason
  );
  res.status(200).json({ success: true, message: 'Payout marked as failed.', data: { result } });
});

const updateTutorBankDetailsAsAdmin = asyncHandler(async (req, res) => {
  const tutorId = Number(req.params.tutorId);
  const bankDetails = await service.updateTutorBankDetailsAsAdmin(req.user, tutorId, req.body);
  res.status(200).json({
    success: true,
    message: 'Banking details saved for this Tutor.',
    data: { bankDetails },
  });
});

const listTutorPayouts = asyncHandler(async (req, res) => {
  const data = await service.listTutorPayouts();
  res.status(200).json({ success: true, data });
});

const startOnlineCheckout = asyncHandler(async (req, res) => {
  const { enrollmentId, amount } = req.body;
  const checkout = await service.startOnlineCheckout(req.user, { enrollmentId, amount: Number(amount) });
  res.status(201).json({ success: true, data: { checkout } });
});

const handlePayHereNotification = asyncHandler(async (req, res) => {
  const outcome = await service.handlePayHereNotification(req.body);

  if (!outcome.handled) {
    // eslint-disable-next-line no-console
    console.warn('[payhere] ignored notification:', outcome.reason, {
      orderId: req.body && req.body.order_id,
    });
  }

  res.status(200).send('OK');
});

function isLocalHost(host) {
  const name = String(host).split(':')[0];
  return (
    name === 'localhost' ||
    name === '127.0.0.1' ||
    /^10\./.test(name) ||
    /^192\.168\./.test(name) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(name)
  );
}

function siteAddressOf(req) {
  const origin = req.headers.origin;
  if (origin && config.clientOrigins.includes(origin)) return origin;

  const host = req.get('host');
  if (host) {
    const sameOrigin = `${req.protocol}://${host}`;
    if (config.clientOrigins.includes(sameOrigin) || isLocalHost(host)) return sameOrigin;
  }

  return config.paypal.publicBaseUrl;
}

const startPayPalCheckout = asyncHandler(async (req, res) => {
  const { enrollmentId, amount } = req.body;
  const checkout = await service.startPayPalCheckout(
    req.user,
    { enrollmentId, amount: Number(amount) },
    siteAddressOf(req)
  );
  res.status(201).json({ success: true, data: { checkout } });
});

// where PayPal sends the payer back
const payPalReturn = asyncHandler(async (req, res) => {
  const paymentId = Number(req.query.payment);
  if (!Number.isInteger(paymentId) || paymentId < 1) {
    return res.redirect(302, '/payments');
  }

  const outcome = await service.completePayPalCheckout(paymentId);
  if (!outcome.handled) {
    // eslint-disable-next-line no-console
    console.warn('[paypal] payment not completed:', outcome.reason, { paymentId });
  }

  return res.redirect(302, `/payments/return?payment=${paymentId}`);
});

const payPalCancel = asyncHandler(async (req, res) => {
  const paymentId = Number(req.query.payment);
  if (Number.isInteger(paymentId) && paymentId > 0) {
    await service.cancelPayPalCheckout(paymentId);
    return res.redirect(302, `/payments/return?payment=${paymentId}&cancelled=1`);
  }
  return res.redirect(302, '/payments');
});

const getMyPaymentStatus = asyncHandler(async (req, res) => {
  const payment = await service.getMyPaymentStatus(req.user, Number(req.params.paymentId));
  res.status(200).json({ success: true, data: { payment } });
});

const searchStudentsForPayment = asyncHandler(async (req, res) => {
  const students = await service.searchStudentsForPayment(req.query.search);
  res.status(200).json({ success: true, data: { students } });
});

const recordOfficePayment = asyncHandler(async (req, res) => {
  const { enrollmentId, amount, method, reference, note } = req.body;
  const data = await service.recordOfficePayment(req.user, {
    enrollmentId: Number(enrollmentId),
    amount,
    method,
    reference,
    note,
  });
  res.status(201).json({ success: true, message: `Payment recorded. Receipt: ${data.receiptNumber}.`, data });
});

module.exports = {
  searchStudentsForPayment,
  recordOfficePayment,
  getMyBalances,
  makePayment,
  retryPendingPayment,
  startOnlineCheckout,
  handlePayHereNotification,
  startPayPalCheckout,
  payPalReturn,
  payPalCancel,
  getMyPaymentStatus,
  getMyPaymentHistory,
  getBankTransferAvailability,
  submitBankTransferPayment,
  editBankTransferPayment,
  listPendingBankTransfers,
  listRecentPayments,
  approveBankTransferPayment,
  rejectBankTransferPayment,
  getReceiptImage,
  listActiveTutors,
  getMyBankDetails,
  updateMyBankDetails,
  getPaymentSettings,
  updatePaymentSettings,
  payTutor,
  listTutorPayouts,
  getPayoutOptions,
  getTutorPayoutAccount,
  getPayoutBatch,
  exportPayoutFile,
  confirmPayoutSettled,
  markPayoutFailed,
  updateTutorBankDetailsAsAdmin,
};
