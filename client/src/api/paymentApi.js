import httpClient from '../../../shared/client/src/api/httpClient';

export async function fetchMyBalances() {
  const response = await httpClient.get('/payments/balance');
  return response.data.data.balances;
}

export async function makePayment({ enrollmentId, amount, paymentMethod, paymentDetails }) {
  const response = await httpClient.post('/payments', {
    enrollmentId,
    amount,
    paymentMethod,
    paymentDetails,
  });
  return response.data.data.payment;
}

export async function retryPayment(paymentId) {
  const response = await httpClient.patch(`/payments/${paymentId}/retry`);
  return response.data.data.payment;
}

export async function fetchMyPaymentHistory() {
  const response = await httpClient.get('/payments/history');
  return response.data.data.payments;
}

// Bank transfer closes on the last day of every month (an Admin needs at
// least a day to verify it before the new month starts) - this lets the
// checkout form disable the tab before the student fills anything in.
export async function fetchBankTransferAvailability() {
  const response = await httpClient.get('/payments/bank-transfer/availability');
  return response.data.data;
}

// Bank transfer never goes through the instant gateway - it's a receipt
// upload that sits PENDING until an Admin reviews and approves it.
export async function payByBankTransfer({ enrollmentId, amount, bankReference, receiptFile }) {
  const formData = new FormData();
  formData.append('enrollmentId', enrollmentId);
  formData.append('amount', amount);
  formData.append('bankReference', bankReference);
  formData.append('receiptImage', receiptFile);

  const response = await httpClient.post('/payments/bank-transfer', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data.data.payment;
}

// Returns a plain URL (not an axios call) for <a target="_blank"> - the
// session cookie still goes with it since the API origin is same-site.
export function getReceiptImageUrl(paymentId) {
  const base = (httpClient.defaults.baseURL || '').replace(/\/$/, '');
  return `${base}/payments/${paymentId}/receipt-image`;
}

export async function fetchPendingBankTransfers() {
  const response = await httpClient.get('/payments/admin/pending-bank-transfers');
  return response.data.data.payments;
}

export async function approveBankTransfer(paymentId) {
  const response = await httpClient.patch(`/payments/admin/${paymentId}/approve`);
  return response.data.data.payment;
}

export async function rejectBankTransfer(paymentId) {
  const response = await httpClient.patch(`/payments/admin/${paymentId}/reject`);
  return response.data.data.payment;
}

// --- Admin: pay Tutors (a manual payout ledger, not automatic payroll) ---

export async function fetchTutorPayouts() {
  const response = await httpClient.get('/payments/admin/tutor-payouts');
  return response.data.data;
}

export async function payTutor({ tutorId, amount, note, periodLabel }) {
  const response = await httpClient.post('/payments/admin/tutor-payouts', {
    tutorId,
    amount,
    note,
    periodLabel,
  });
  return response.data.data.payout;
}
