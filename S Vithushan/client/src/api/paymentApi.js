import httpClient from '../../../../shared/client/src/api/httpClient';

// admin dashboard - a real ledger of individual payments, any method/status
// (owned by M T Madushanka's payment module, queried directly here the same
// way this module already reaches across for revenue figures)
export async function fetchRecentPayments() {
  const response = await httpClient.get('/payments/admin/recent-payments');
  return response.data.data.payments;
}
