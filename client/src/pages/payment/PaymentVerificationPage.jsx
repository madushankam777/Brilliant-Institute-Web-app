// Admin: check bank slips uploaded by students
import { useCallback, useEffect, useState } from 'react';
import {
  fetchPendingBankTransfers,
  approveBankTransfer,
  rejectBankTransfer,
  getReceiptImageUrl,
} from '../../api/paymentApi';
import LoadingSpinner from '../../../../shared/client/src/components/common/LoadingSpinner';
import Alert from '../../../../shared/client/src/components/common/Alert';
import PortalShell from '../../../../shared/client/src/components/layout/PortalShell';
import { getNavItems } from '../../../../shared/client/src/components/layout/navItems';
import NumberInput from '../../../../shared/client/src/components/common/NumberInput';
import RecordPaymentCard from './RecordPaymentCard';
import ModalClose from '../../../../shared/client/src/components/common/ModalClose';

const NAV_ITEMS = getNavItems('ADMIN');

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' }).format(amount);
}

function formatDateTime(value) {
  return new Date(String(value).replace(' ', 'T')).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function PaymentVerificationPage() {
  const [payments, setPayments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const [target, setTarget] = useState(null); // { payment, action: 'approve' | 'reject' }
  const [receivedAmount, setReceivedAmount] = useState('');
  const [amountError, setAmountError] = useState('');
  const [slipFailed, setSlipFailed] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState('');

  const load = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      setPayments(await fetchPendingBankTransfers());
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openModal(payment, action) {
    setTarget({ payment, action });
    setReceivedAmount(String(payment.amount));
    setAmountError('');
    setConfirmError('');
    setSlipFailed(false);
    setSuccessMessage('');
  }

  function closeModal() {
    if (isConfirming) return;
    setTarget(null);
  }

  async function handleConfirm() {
    const { payment, action } = target;
    setConfirmError('');

    if (action === 'approve') {
      const amount = Number(receivedAmount);
      if (!(amount > 0)) {
        setAmountError('Enter the amount shown on the bank slip.');
        return;
      }
      if (amount > payment.outstandingBalance) {
        setAmountError(`This is more than the outstanding balance of ${formatCurrency(payment.outstandingBalance)}.`);
        return;
      }
    }

    setIsConfirming(true);
    try {
      if (action === 'approve') {
        const amount = Number(receivedAmount);
        await approveBankTransfer(payment.id, amount);
        setSuccessMessage(
          `Approved ${formatCurrency(amount)} from ${payment.studentName}. It is now included in revenue.`
        );
      } else {
        await rejectBankTransfer(payment.id);
        setSuccessMessage(`Rejected the slip from ${payment.studentName}. They have been asked to resubmit.`);
      }
      setTarget(null);
      await load();
    } catch (error) {
      setConfirmError(error.message);
    } finally {
      setIsConfirming(false);
    }
  }

  const received = Number(receivedAmount);
  const differsFromClaim = target && target.action === 'approve' && received > 0 && received !== target.payment.amount;

  return (
    <PortalShell navItems={NAV_ITEMS}>
      <div className="page">
        <div className="page-header">
          <h1>Payment Verification</h1>
          <p className="muted">
            Record payments made at the office, and check bank slips students upload. Each payment updates the
            student&apos;s balance, issues a receipt and adds the amount to revenue.
          </p>
        </div>

        <RecordPaymentCard onRecorded={load} />

        <h2 className="section-title">Bank slips waiting for verification</h2>
        <Alert type="error" message={errorMessage} />
        <Alert type="success" message={successMessage} />

        {isLoading ? (
          <LoadingSpinner label="Loading bank slips..." />
        ) : payments.length === 0 ? (
          <div className="card">
            <p className="muted" style={{ margin: 0 }}>No bank slips are waiting for verification.</p>
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
                    <th>Amount entered</th>
                    <th>Bank reference</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment) => (
                    <tr key={payment.id}>
                      <td>{formatDateTime(payment.createdAt)}</td>
                      <td>
                        <div className="order-line-title">{payment.studentName}</div>
                        {payment.studentCode && <span className="reg-no">{payment.studentCode}</span>}
                        <div className="order-line-sub">{payment.studentEmail}</div>
                      </td>
                      <td>{payment.subject}</td>
                      <td>{formatCurrency(payment.amount)}</td>
                      <td>{payment.bankReference}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                          <button type="button" className="btn btn-primary btn-sm" onClick={() => openModal(payment, 'approve')}>
                            Verify
                          </button>
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => openModal(payment, 'reject')}>
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

      {target && (
        <div className="modal-overlay" onClick={closeModal}>
          <div
            className="modal-dialog"
            style={{ maxWidth: target.action === 'approve' ? '560px' : '440px' }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="verify-title"
          >
            <ModalClose onClose={closeModal} disabled={isConfirming} />
            <h2 id="verify-title">{target.action === 'approve' ? 'Verify bank slip' : 'Reject bank slip'}</h2>

            <dl className="detail-grid" style={{ marginBottom: '14px' }}>
              <div>
                <dt>Student</dt>
                <dd>
                  {target.payment.studentName} {target.payment.studentCode && <span className="reg-no">{target.payment.studentCode}</span>}
                </dd>
              </div>
              <div>
                <dt>Class</dt>
                <dd>{target.payment.subject}</dd>
              </div>
              <div>
                <dt>Bank reference</dt>
                <dd>{target.payment.bankReference || '-'}</dd>
              </div>
              <div>
                <dt>Outstanding balance</dt>
                <dd>{formatCurrency(target.payment.outstandingBalance)}</dd>
              </div>
            </dl>

            {target.payment.hasReceiptImage && (
              <div className="transfer-box soft" style={{ textAlign: 'center' }}>
                {slipFailed ? (
                  <p className="muted" style={{ margin: 0 }}>The slip could not be previewed here.</p>
                ) : (
                  <img
                    src={getReceiptImageUrl(target.payment.id)}
                    alt={`Bank slip from ${target.payment.studentName}`}
                    style={{ maxHeight: '260px', margin: '0 auto', borderRadius: '8px' }}
                    onError={() => setSlipFailed(true)}
                  />
                )}
                <a
                  href={getReceiptImageUrl(target.payment.id)}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-ghost btn-sm"
                  style={{ marginTop: '8px' }}
                >
                  Open full size
                </a>
              </div>
            )}

            {target.action === 'approve' ? (
              <div className="form-field">
                <label htmlFor="received-amount">Amount received (LKR)</label>
                <NumberInput
                  id="received-amount"
                  decimals={2}
                  value={receivedAmount}
                  onChange={(value) => {
                    setReceivedAmount(value);
                    setAmountError('');
                  }}
                  className={amountError ? 'input-error' : ''}
                  autoFocus
                />
                {amountError ? (
                  <p className="field-error">{amountError}</p>
                ) : (
                  <p className="field-help">
                    The student entered {formatCurrency(target.payment.amount)}. Enter the amount the slip
                    actually shows.
                    {differsFromClaim && ' The student will be told about the difference.'}
                  </p>
                )}
              </div>
            ) : (
              <p className="muted">
                The student will be asked to check their reference and slip, then submit it again.
              </p>
            )}

            <Alert type="error" message={confirmError} />

            <div className="flex-between" style={{ marginTop: '18px' }}>
              <button type="button" className="btn btn-secondary" disabled={isConfirming} onClick={closeModal}>
                Cancel
              </button>
              <button
                type="button"
                className={target.action === 'approve' ? 'btn btn-primary' : 'btn btn-danger'}
                disabled={isConfirming}
                onClick={handleConfirm}
              >
                {isConfirming
                  ? 'Please wait...'
                  : target.action === 'approve'
                    ? `Approve ${received > 0 ? formatCurrency(received) : ''}`.trim()
                    : 'Reject slip'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PortalShell>
  );
}

export default PaymentVerificationPage;
