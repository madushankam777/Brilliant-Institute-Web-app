// HTTP layer for payment routes
const asyncHandler = require('../../utils/asyncHandler');
const service = require('./payment.service');

const getMyBalances = asyncHandler(async (req, res) => {
  const balances = await service.getMyBalances(req.user);
  res.status(200).json({ success: true, data: { balances } });
});

const makePayment = asyncHandler(async (req, res) => {
  const { enrollmentId, amount, paymentMethod } = req.body;
  const result = await service.makePayment(req.user, { enrollmentId, amount, paymentMethod });

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

module.exports = { getMyBalances, makePayment, retryPendingPayment, getMyPaymentHistory };
