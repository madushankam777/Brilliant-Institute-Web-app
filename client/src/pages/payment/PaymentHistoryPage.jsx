// Student/Parent: payment history, retry pending
import { useCallback, useEffect, useState } from 'react';
import { fetchMyPaymentHistory, retryPayment, getReceiptImageUrl } from '../../api/paymentApi';
import LoadingSpinner from '../../../../shared/client/src/components/common/LoadingSpinner';
import Alert from '../../../../shared/client/src/components/common/Alert';
import PortalShell from '../../../../shared/client/src/components/layout/PortalShell';
import { getNavItems } from '../../../../shared/client/src/components/layout/navItems';

const NAV_ITEMS = getNavItems("STUDENT_PARENT");

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' }).format(amount);
}

function statusBadgeClass(status) {
  if (status === 'SUCCESSFUL') return 'badge badge-success';
  if (status === 'PENDING') return 'badge badge-warning';
  return 'badge badge-danger';
}

function statusLabel(payment) {
  if (payment.status === 'PENDING' && payment.paymentMethod === 'BANK_TRANSFER') {
    return 'Awaiting Verification';
  }
  return payment.status;
}

const METHOD_LABELS = {
  CARD: 'Card',
  EZ_CASH: 'eZ Cash',
  MCASH: 'mCash',
  BANK_TRANSFER: 'Bank Transfer',
};

// The one non-sensitive detail worth showing per method - never a full
// card number, always just what a real receipt would show.
function paymentMethodSummary(payment) {
  const details = payment.paymentDetails;
  if (payment.paymentMethod === 'CARD' && details?.cardLast4) {
    return `${details.cardBrand || 'Card'} •••• ${details.cardLast4}`;
  }
  if ((payment.paymentMethod === 'EZ_CASH' || payment.paymentMethod === 'MCASH') && details?.walletPhone) {
    return `${METHOD_LABELS[payment.paymentMethod]} • ${details.walletPhone}`;
  }
  if (payment.paymentMethod === 'BANK_TRANSFER' && details?.bankReference) {
    return `Bank Transfer • ${details.bankReference}`;
  }
  return METHOD_LABELS[payment.paymentMethod] || payment.paymentMethod;
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

  return (
    <PortalShell navItems={NAV_ITEMS}>
      <div className="page">
        <div className="page-header">
          <h1>Payment History</h1>
          <p className="muted">Review past payments, receipts, and retry anything still pending.</p>
        </div>

        <Alert type="error" message={errorMessage} />

        {isLoading ? (
          <LoadingSpinner label="Loading payment history..." />
        ) : payments.length === 0 ? (
          <p className="muted">You have not made any payments yet.</p>
        ) : (
          <div className="card">
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Class</th>
                    <th>Amount</th>
                    <th>Method</th>
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
                      <td>{paymentMethodSummary(payment)}</td>
                      <td>
                        <span className={statusBadgeClass(payment.status)}>{statusLabel(payment)}</span>
                      </td>
                      <td>{payment.receiptNumber || '-'}</td>
                      <td>
                        {payment.status === 'PENDING' && payment.paymentMethod === 'BANK_TRANSFER' && (
                          <a
                            href={getReceiptImageUrl(payment.id)}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn-secondary btn-sm"
                          >
                            View Receipt
                          </a>
                        )}
                        {payment.status === 'PENDING' && payment.paymentMethod !== 'BANK_TRANSFER' && (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
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
          </div>
        )}
      </div>
    </PortalShell>
  );
}

export default PaymentHistoryPage;
