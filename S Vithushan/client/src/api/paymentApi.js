import httpClient from '../../../../shared/client/src/api/httpClient';

// admin dashboard - recent payments
export async function fetchRecentPayments() {
  const response = await httpClient.get('/payments/admin/recent-payments');
  return response.data.data.payments;
}
