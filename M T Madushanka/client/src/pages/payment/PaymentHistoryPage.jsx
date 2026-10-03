// Student/Parent: payment history, retry pending
import { useCallback, useEffect, useState } from 'react';
import {
  fetchMyPaymentHistory,
  retryPayment,
  getReceiptImageUrl,
  editBankTransferPayment,
} from '../../api/paymentApi';
import LoadingSpinner from '../../../../../shared/client/src/components/common/LoadingSpinner';
import Alert from '../../../../../shared/client/src/components/common/Alert';
import PortalShell from '../../../../../shared/client/src/components/layout/PortalShell';
import { getNavItems } from '../../components/layout/navItems';

const NAV_ITEMS = getNavItems("STUDENT_PARENT");

// Letters, numbers, spaces, hyphens, and slashes
const BANK_REFERENCE_REGEX = /^[A-Za-z0-9 \-/]+$/;

// a number as LKR money
function formatCurrency(amount) {
  return new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' }).format(amount);
}

// badge colour for Successful, Pending or Failed
function statusBadgeClass(status) {
  if (status === 'SUCCESSFUL') return 'badge badge-success';
  if (status === 'PENDING') return 'badge badge-warning';
  return 'badge badge-danger';
}

// the status words - a pending bank transfer shows as Awaiting Verification
function statusLabel(payment) {
  if (payment.status === 'PENDING' && payment.paymentMethod === 'BANK_TRANSFER') {
    return 'Awaiting Verification';
  }
  return payment.status;
}

// the words shown for each payment method
const METHOD_LABELS = {
  CARD: 'Card',
  EZ_CASH: 'eZ Cash',
  MCASH: 'mCash',
  BANK_TRANSFER: 'Bank Transfer',
  // An online payment the payer never finished
  ONLINE: 'Online Payment',
};

// The one non-sensitive detail worth showing per method
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

// payment history - my payments and receipts; retry a pending one or fix a pending bank transfer
function PaymentHistoryPage() {
  const [payments, setPayments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [retryingId, setRetryingId] = useState(null);

  // the edit pop-up - the payment being fixed and its fields
  const [editTarget, setEditTarget] = useState(null);
  const [editReference, setEditReference] = useState('');
  const [editReceiptFile, setEditReceiptFile] = useState(null);
  const [editError, setEditError] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // load my payments
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
    // fail silently, not critical
    }
  }, []);

  // load them when the page opens
  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // retry btn - try a pending payment again
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

  // edit btn - open modal pre-filled with the current reference
  function openEditModal(payment) {
    setEditTarget(payment);
    setEditReference((payment.paymentDetails && payment.paymentDetails.bankReference) || '');
    setEditReceiptFile(null);
    setEditError('');
  }

  // close the edit pop-up and clear it
  function closeEditModal() {
    setEditTarget(null);
    setEditReference('');
    setEditReceiptFile(null);
    setEditError('');
  }

  // save changes btn - fix the reference or replace the receipt of a pending bank transfer
  async function handleSaveEdit(event) {
    event.preventDefault();
    setEditError('');

    if (editReference.trim().length < 4) {
      setEditError('Enter your bank account number or transfer reference.');
      return;
    }
    if (!BANK_REFERENCE_REGEX.test(editReference.trim())) {
      setEditError('Reference can only contain letters, numbers, spaces, hyphens, and slashes - no other symbols.');
      return;
    }

    setIsSavingEdit(true);
    try {
      await editBankTransferPayment(editTarget.id, {
        bankReference: editReference.trim(),
        receiptFile: editReceiptFile,
      });
      closeEditModal();
      await loadHistory();
    } catch (error) {
      setEditError(error.message);
    } finally {
      setIsSavingEdit(false);
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

        {/* a spinner, an empty message, or the payments table */}
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
                        {/* pending bank transfer - view the receipt or edit the submission */}
                        {payment.status === 'PENDING' && payment.paymentMethod === 'BANK_TRANSFER' && (
                          <div style={{ display: 'flex', gap: '6px' }}>
                            {/* view receipt link - opens the receipt photo */}
                            <a
                              href={getReceiptImageUrl(payment.id)}
                              target="_blank"
                              rel="noreferrer"
                              className="btn btn-secondary btn-sm"
                            >
                              View Receipt
                            </a>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => openEditModal(payment)}
                            >
                              Edit
                            </button>
                          </div>
                        )}
                        {/* pending card, wallet or online payment - retry btn */}
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

      {/* edit pop-up - the reference and receipt of a pending bank transfer */}
      {editTarget && (
        <div className="modal-overlay" onClick={() => !isSavingEdit && closeEditModal()}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <h2>Edit Bank Transfer Submission</h2>
            <p className="muted">
              Correct your reference number or replace the receipt image before an Administrator
              reviews it. This is only available while your submission is still pending.
            </p>

            <Alert type="error" message={editError} />

            <form onSubmit={handleSaveEdit} noValidate>
              <div className="form-field">
                <label htmlFor="editBankReference">Your Bank Account Number / Reference</label>
                <input
                  id="editBankReference"
                  type="text"
                  placeholder="e.g. 8001234567"
                  value={editReference}
                  onChange={(e) => setEditReference(e.target.value)}
                />
              </div>
              <div className="form-field">
                <label htmlFor="editReceiptFile">Replace Receipt (optional)</label>
                <input
                  id="editReceiptFile"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => setEditReceiptFile(e.target.files[0] || null)}
                />
                <p className="field-help">Leave this empty to keep your current receipt image.</p>
              </div>

              <div className="flex-between" style={{ marginTop: '18px' }}>
                <button type="button" className="btn btn-secondary" disabled={isSavingEdit} onClick={closeEditModal}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSavingEdit}>
                  {isSavingEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PortalShell>
  );
}

export default PaymentHistoryPage;
