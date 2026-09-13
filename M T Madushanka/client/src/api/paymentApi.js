import httpClient from '../../../../shared/client/src/api/httpClient';

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

// check if bank transfer is open this month
export async function fetchBankTransferAvailability() {
  const response = await httpClient.get('/payments/bank-transfer/availability');
  return response.data.data;
}

// bank transfer form - upload receipt
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

// edit btn - correct reference/receipt on a pending bank transfer
export async function editBankTransferPayment(paymentId, { bankReference, receiptFile }) {
  const formData = new FormData();
  if (bankReference) formData.append('bankReference', bankReference);
  if (receiptFile) formData.append('receiptImage', receiptFile);

  const response = await httpClient.patch(`/payments/${paymentId}/bank-transfer`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data.data.payment;
}

// view receipt image link
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

// pay tutor btn
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
