// Admin: review bank-transfer receipts submitted by students and either
// approve (moves the balance, issues a receipt) or reject them.
import { useCallback, useEffect, useState } from 'react';
import {
  fetchPendingBankTransfers,
  approveBankTransfer,
  rejectBankTransfer,
  getReceiptImageUrl,
} from '../../api/paymentApi';
import LoadingSpinner from '../../../../../shared/client/src/components/common/LoadingSpinner';
import Alert from '../../../../../shared/client/src/components/common/Alert';
import PortalShell from '../../../../../shared/client/src/components/layout/PortalShell';
import { getNavItems } from '../../../../../shared/client/src/components/layout/navItems';

const NAV_ITEMS = getNavItems('ADMIN');

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' }).format(amount);
}

function PaymentVerificationPage() {
  const [payments, setPayments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  const [confirmTarget, setConfirmTarget] = useState(null); // { payment, action: 'approve' | 'reject' }
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState('');

  const load = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const data = await fetchPendingBankTransfers();
      setPayments(data);
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function closeConfirmModal() {
    setConfirmTarget(null);
    setConfirmError('');
  }

  async function handleConfirm() {
    if (!confirmTarget) return;
    setIsConfirming(true);
    setConfirmError('');
    try {
      if (confirmTarget.action === 'approve') {
        await approveBankTransfer(confirmTarget.payment.id);
      } else {
        await rejectBankTransfer(confirmTarget.payment.id);
      }
      closeConfirmModal();
      await load();
    } catch (error) {
      setConfirmError(error.message);
    } finally {
      setIsConfirming(false);
    }
  }

  return (
    <PortalShell navItems={NAV_ITEMS}>
      <div className="page">
        <div className="page-header">
          <h1>Payment Verification</h1>
          <p className="muted">
            Bank transfer receipts awaiting review. Approving moves the balance and issues a receipt;
            rejecting lets the student re-submit.
          </p>
        </div>

        <Alert type="error" message={errorMessage} />

        {isLoading ? (
          <LoadingSpinner label="Loading pending transfers..." />
        ) : payments.length === 0 ? (
          <div className="card">
            <p className="muted">No bank transfers are waiting for verification right now.</p>
          </div>
        ) : (
          <div className="card">
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Submitted</th>
                    <th>Student</th>
                    <th>Class</th>
                    <th>Amount</th>
                    <th>Bank Reference</th>
                    <th>Receipt</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment) => (
                    <tr key={payment.id}>
                      <td>{payment.createdAt}</td>
                      <td>
                        <div className="order-line-title">{payment.studentName}</div>
                        <div className="order-line-sub">{payment.studentEmail}</div>
                      </td>
                      <td>{payment.subject}</td>
                      <td>{formatCurrency(payment.amount)}</td>
                      <td>{payment.bankReference}</td>
                      <td>
                        {payment.hasReceiptImage ? (
                          <a
                            href={getReceiptImageUrl(payment.id)}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn-ghost btn-sm"
                          >
                            View
                          </a>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => setConfirmTarget({ payment, action: 'approve' })}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            onClick={() => setConfirmTarget({ payment, action: 'reject' })}
                          >
                            Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {confirmTarget && (
        <div className="modal-overlay" onClick={() => !isConfirming && closeConfirmModal()}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <h2>{confirmTarget.action === 'approve' ? 'Approve Bank Transfer' : 'Reject Bank Transfer'}</h2>
            <p className="muted">
              {confirmTarget.action === 'approve' ? (
                <>
                  Approve <strong>{formatCurrency(confirmTarget.payment.amount)}</strong> from{' '}
                  <strong>{confirmTarget.payment.studentName}</strong>? Their balance will update and a
                  receipt will be issued immediately.
                </>
              ) : (
                <>
                  Reject this transfer from <strong>{confirmTarget.payment.studentName}</strong>? They will
                  need to submit a new receipt.
                </>
              )}
            </p>

            <Alert type="error" message={confirmError} />

            <div className="flex-between" style={{ marginTop: '18px' }}>
              <button type="button" className="btn btn-secondary" disabled={isConfirming} onClick={closeConfirmModal}>
                Cancel
              </button>
              <button
                type="button"
                className={confirmTarget.action === 'approve' ? 'btn btn-primary' : 'btn btn-danger'}
                disabled={isConfirming}
                onClick={handleConfirm}
              >
                {isConfirming
                  ? 'Please wait...'
                  : confirmTarget.action === 'approve'
                    ? 'Confirm Approve'
                    : 'Confirm Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PortalShell>
  );
}

export default PaymentVerificationPage;
