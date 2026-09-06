// Student/Parent: payment history, retry pending
import { useCallback, useEffect, useState } from 'react';
import { fetchMyPaymentHistory, retryPayment } from '../../api/paymentApi';
import LoadingSpinner from '../../../../../shared/client/src/components/common/LoadingSpinner';
import Alert from '../../../../../shared/client/src/components/common/Alert';

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' }).format(amount);
}

function statusBadgeClass(status) {
  if (status === 'SUCCESSFUL') return 'badge badge-success';
  if (status === 'PENDING') return 'badge badge-warning';
  return 'badge badge-danger';
}

function PaymentHistoryPage() {
  const [payments, setPayments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [retryingId, setRetryingId] = useState(null);

  const loadHistory = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const data = await fetchMyPaymentHistory();
      setPayments(data);
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  async function handleRetry(paymentId) {
    setRetryingId(paymentId);
    setErrorMessage('');
    try {
      await retryPayment(paymentId);
      await loadHistory();
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setRetryingId(null);
    }
  }

  if (isLoading) return <LoadingSpinner label="Loading payment history..." />;

  return (
    <div className="page">
      <h1>Payment History</h1>
      <Alert type="error" message={errorMessage} />

      {payments.length === 0 ? (
        <p className="muted">You have not made any payments yet.</p>
      ) : (
        <div className="card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Class</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Receipt</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => (
                <tr key={payment.id}>
                  <td>{payment.createdAt}</td>
                  <td>{payment.subject}</td>
                  <td>{formatCurrency(payment.amount)}</td>
                  <td>
                    <span className={statusBadgeClass(payment.status)}>{payment.status}</span>
                  </td>
                  <td>{payment.receiptNumber || '-'}</td>
                  <td>
                    {payment.status === 'PENDING' && (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={retryingId === payment.id}
                        onClick={() => handleRetry(payment.id)}
                      >
                        {retryingId === payment.id ? 'Retrying...' : 'Retry payment'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default PaymentHistoryPage;
