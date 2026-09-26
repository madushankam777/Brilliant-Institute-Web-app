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

// pay online btn
export async function startOnlineCheckout({ enrollmentId, amount }) {
  const response = await httpClient.post('/payments/checkout/online', { enrollmentId, amount });
  return response.data.data.checkout;
}

// Polled on the way back from the gateway
export async function fetchPaymentStatus(paymentId) {
  const response = await httpClient.get(`/payments/${paymentId}/status`);
  return response.data.data.payment;
}

// Leaves the SPA for the gateway's hosted payment page
export function redirectToGateway({ actionUrl, fields }) {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = actionUrl;
  form.style.display = 'none';

  Object.entries(fields).forEach(([name, value]) => {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value == null ? '' : String(value);
    form.appendChild(input);
  });

  document.body.appendChild(form);
  form.submit();
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

export function getReceiptImageUrl(paymentId) {
  const base = (httpClient.defaults.baseURL || '').replace(/\/$/, '');
  return `${base}/payments/${paymentId}/receipt-image`;
}

export async function fetchPendingBankTransfers() {
  const response = await httpClient.get('/payments/admin/pending-bank-transfers');
  return response.data.data.payments;
}

// admin dashboard - a real ledger of individual payments, any method/status
export async function fetchRecentPayments() {
  const response = await httpClient.get('/payments/admin/recent-payments');
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

// checkout - the institute's own receiving details (any logged-in role can read)
export async function fetchPaymentSettings() {
  const response = await httpClient.get('/payments/settings');
  return response.data.data.settings;
}

// admin only - edit the institute's receiving details
export async function updatePaymentSettings(payload) {
  const response = await httpClient.put('/payments/admin/settings', payload);
  return response.data.data.settings;
}
