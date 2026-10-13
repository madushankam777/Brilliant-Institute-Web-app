// payment API calls - fees, online and bank-transfer payments, office payments and tutor payouts
import httpClient from '../../../shared/client/src/api/httpClient';

// what I still owe on each class
export async function fetchMyBalances() {
  const response = await httpClient.get('/payments/balance');
  return response.data.data.balances;
}

// pay btn - instant payment through the payment simulator (used when PayHere is off)
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

// pay with PayPal btn - makes the PayPal order and returns the link to approve it
export async function startPayPalCheckout({ enrollmentId, amount }) {
  const response = await httpClient.post('/payments/checkout/paypal', { enrollmentId, amount });
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

// retry btn - try a pending payment again
export async function retryPayment(paymentId) {
  const response = await httpClient.patch(`/payments/${paymentId}/retry`);
  return response.data.data.payment;
}

// my payments with receipt numbers
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

// the address of a bank slip image
export function getReceiptImageUrl(paymentId) {
  const base = (httpClient.defaults.baseURL || '').replace(/\/$/, '');
  return `${base}/payments/${paymentId}/receipt-image`;
}

// admin - bank transfers waiting for approval
export async function fetchPendingBankTransfers() {
  const response = await httpClient.get('/payments/admin/pending-bank-transfers');
  return response.data.data.payments;
}

// admin dashboard - a real ledger of individual payments, any method/status
export async function fetchRecentPayments() {
  const response = await httpClient.get('/payments/admin/recent-payments');
  return response.data.data.payments;
}

// amount = what the slip actually shows; this is what goes into revenue
export async function approveBankTransfer(paymentId, amount) {
  const response = await httpClient.patch(`/payments/admin/${paymentId}/approve`, { amount });
  return response.data.data.payment;
}

// reject btn - refuse a bank transfer
export async function rejectBankTransfer(paymentId) {
  const response = await httpClient.patch(`/payments/admin/${paymentId}/reject`);
  return response.data.data.payment;
}

// admin filling in a tutor's payout account from the Pay Tutors screen
export async function updateTutorBankDetailsAsAdmin(tutorId, details) {
  const response = await httpClient.put(`/payments/admin/tutors/${tutorId}/bank-details`, details);
  return response.data.data.bankDetails;
}

// tutors with masked bank details (admin only)
export async function fetchAllTutors() {
  const response = await httpClient.get('/payments/admin/tutors');
  return response.data.data.tutors;
}

// the full account number, needed to make the transfer (audit-logged)
export async function fetchTutorPayoutAccount(tutorId) {
  const response = await httpClient.get(`/payments/admin/tutors/${tutorId}/payout-account`);
  return response.data.data.account;
}

// all tutor payouts with totals
export async function fetchTutorPayouts() {
  const response = await httpClient.get('/payments/admin/tutor-payouts');
  return response.data.data;
}

// method: BANK_TRANSFER (needs bankReference) | BANK_FILE | PAYOUT_API
export async function payTutor(payload) {
  const response = await httpClient.post('/payments/admin/tutor-payouts', payload);
  return { payout: response.data.data.payout, message: response.data.message };
}

// tutor's own profile - payout bank details
export async function fetchMyBankDetails() {
  const response = await httpClient.get('/payments/me/bank-details');
  return response.data.data.bankDetails;
}

// tutor - save my payout bank details
export async function updateMyBankDetails({ bankName, accountHolder, accountNumber, branch }) {
  const response = await httpClient.put('/payments/me/bank-details', {
    bankName,
    accountHolder,
    accountNumber,
    branch,
  });
  return response.data.data.bankDetails;
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

// admin only - turn payment methods on or off straight away
export async function updatePaymentMethods(payload) {
  const response = await httpClient.put('/payments/admin/methods', payload);
  return response.data.data.settings;
}

// --- Tutor payouts ---
// { bulkFileAvailable, apiAvailable, apiName, sourceAccount }
export async function fetchPayoutOptions() {
  const response = await httpClient.get('/payments/admin/payouts/options');
  return response.data.data.options;
}

// payouts waiting for the next bank file
export async function fetchPayoutBatch() {
  const response = await httpClient.get('/payments/admin/payouts/batch');
  return response.data.data.batch;
}

// Comes back as a CSV file, not JSON
export async function exportPayoutFile() {
  const response = await httpClient.post('/payments/admin/payouts/export', null, {
    responseType: 'blob',
  });
  const disposition = response.headers['content-disposition'] || '';
  const match = disposition.match(/filename="?([^";]+)"?/);
  return {
    blob: response.data,
    filename: match ? match[1] : 'tutor-payouts.csv',
    count: Number(response.headers['x-payout-count'] || 0),
    total: Number(response.headers['x-payout-total'] || 0),
  };
}

// paid btn - the bank confirmed this payout
export async function confirmPayoutSettled(payoutId, { providerReference, transferDate }) {
  const response = await httpClient.patch(`/payments/admin/payouts/${payoutId}/settled`, {
    providerReference,
    transferDate,
  });
  return response.data.data.result;
}

// failed btn - the payout did not go through
export async function markPayoutFailed(payoutId, reason) {
  const response = await httpClient.patch(`/payments/admin/payouts/${payoutId}/failed`, { reason });
  return response.data.data.result;
}

// record payment - find students by registration number or name
export async function searchStudentsForPayment(search) {
  const response = await httpClient.get('/payments/admin/students', { params: { search } });
  return response.data.data.students;
}

// record payment btn - { enrollmentId, amount, method, reference, note }
export async function recordOfficePayment(payload) {
  const response = await httpClient.post('/payments/admin/record-payment', payload);
  return response.data;
}
