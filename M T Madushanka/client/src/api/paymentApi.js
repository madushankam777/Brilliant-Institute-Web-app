// Frontend API client for the payment endpoints
import httpClient from '../../../../shared/client/src/api/httpClient';

export async function fetchMyBalances() {
  const response = await httpClient.get('/payments/balance');
  return response.data.data.balances;
}

export async function makePayment({ enrollmentId, amount, paymentMethod }) {
  const response = await httpClient.post('/payments', { enrollmentId, amount, paymentMethod });
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
