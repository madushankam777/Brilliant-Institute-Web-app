// Admin: pay tutors and keep a record
import { useCallback, useEffect, useState } from 'react';
import {
  fetchTutorPayouts,
  fetchAllTutors,
  fetchPayoutOptions,
  fetchPayoutBatch,
  exportPayoutFile,
  confirmPayoutSettled,
  markPayoutFailed,
} from '../../api/paymentApi';
import LoadingSpinner from '../../../../shared/client/src/components/common/LoadingSpinner';
import Alert from '../../../../shared/client/src/components/common/Alert';
import Avatar from '../../../../shared/client/src/components/common/Avatar';
import Icon from '../../../../shared/client/src/components/common/Icon';
import StatCard from '../../../../shared/client/src/components/common/StatCard';
import PortalShell from '../../../../shared/client/src/components/layout/PortalShell';
import { getNavItems } from '../../../../shared/client/src/components/layout/navItems';
import { todayKey } from '../../../../shared/client/src/utils/schedule';
import PayTutorModal from './PayTutorModal';

const NAV_ITEMS = getNavItems('ADMIN');

const STATUS_LABELS = {
  RECORDED: { label: 'Recorded', badge: 'badge-neutral' },
  QUEUED: { label: 'In bank file', badge: 'badge-warning' },
  SENT: { label: 'Paid', badge: 'badge-success' },
  FAILED: { label: 'Failed', badge: 'badge-danger' },
};

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' }).format(amount);
}

function formatDate(value) {
  if (!value) return '-';
  return new Date(String(value).replace(' ', 'T')).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

// "Mark paid" for a payout that went out in the bank file
function MarkPaidModal({ payout, onClose, onDone }) {
  const [reference, setReference] = useState('');
  const [transferDate, setTransferDate] = useState(todayKey());
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    if (reference.trim().length < 3) {
      setError('Enter the reference number the bank gave for this transfer.');
      return;
    }
    setIsSaving(true);
    try {
      await confirmPayoutSettled(payout.id, { providerReference: reference.trim(), transferDate });
      onDone(`Payout to ${payout.tutorName} marked as paid. They have been notified.`);
    } catch (saveError) {
      setError(saveError.message);
      setIsSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={() => !isSaving && onClose()}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <h2>Mark as paid</h2>
        <p className="muted">
          {formatCurrency(payout.amount)} to {payout.tutorName}. Enter the reference from the bank&apos;s
          confirmation.
        </p>
        <form onSubmit={handleSubmit} noValidate>
          <div className="form-field">
            <label htmlFor="settle-reference">Bank reference number</label>
            <input
              id="settle-reference"
              type="text"
              maxLength={60}
              value={reference}
              onChange={(e) => {
                setReference(e.target.value);
                setError('');
              }}
              autoFocus
            />
          </div>
          <div className="form-field">
            <label htmlFor="settle-date">Transfer date</label>
            <input
              id="settle-date"
              type="date"
              max={todayKey()}
              value={transferDate}
              onChange={(e) => setTransferDate(e.target.value)}
            />
          </div>
          <Alert type="error" message={error} />
          <div className="flex-between">
            <button type="button" className="btn btn-secondary" disabled={isSaving} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Mark as paid'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// "Failed" for a bank-file payout the bank rejected
function MarkFailedModal({ payout, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!reason.trim()) {
      setError('Say why the transfer failed.');
      return;
    }
    setIsSaving(true);
    try {
      await markPayoutFailed(payout.id, reason.trim());
      onDone(`Payout to ${payout.tutorName} marked as failed.`);
    } catch (saveError) {
      setError(saveError.message);
      setIsSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={() => !isSaving && onClose()}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <h2>Transfer failed</h2>
        <p className="muted">
          {formatCurrency(payout.amount)} to {payout.tutorName}.
        </p>
        <form onSubmit={handleSubmit} noValidate>
          <div className="form-field">
            <label htmlFor="fail-reason">What did the bank say?</label>
            <textarea
              id="fail-reason"
              maxLength={255}
              placeholder="e.g. Account number does not match the name"
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setError('');
              }}
              autoFocus
            />
          </div>
          <Alert type="error" message={error} />
          <div className="flex-between">
            <button type="button" className="btn btn-secondary" disabled={isSaving} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-danger" disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Mark as failed'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PayTutorsPage() {
  const [tutors, setTutors] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [summaryByTutor, setSummaryByTutor] = useState({});
  const [options, setOptions] = useState(null);
  const [batch, setBatch] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const [search, setSearch] = useState('');

  const [payingTutor, setPayingTutor] = useState(null);
  const [settleTarget, setSettleTarget] = useState(null);
  const [failTarget, setFailTarget] = useState(null);
  const [isExporting, setIsExporting] = useState(false);

  const load = useCallback(async () => {
    setLoadError('');
    // loaded independently, so one failing request doesn't empty the rest
    const [tutorList, payoutData, optionData, batchData] = await Promise.allSettled([
      fetchAllTutors(),
      fetchTutorPayouts(),
      fetchPayoutOptions(),
      fetchPayoutBatch(),
    ]);
    if (tutorList.status === 'fulfilled') setTutors(tutorList.value);
    if (payoutData.status === 'fulfilled') {
      setPayouts(payoutData.value.payouts);
      setSummaryByTutor(payoutData.value.summaryByTutor || {});
    }
    if (optionData.status === 'fulfilled') setOptions(optionData.value);
    if (batchData.status === 'fulfilled') setBatch(batchData.value);
    const failed = [tutorList, payoutData, optionData, batchData].find((result) => result.status === 'rejected');
    if (failed) setLoadError(failed.reason.message);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function finishAction(message) {
    setPayingTutor(null);
    setSettleTarget(null);
    setFailTarget(null);
    setActionError('');
    setSuccessMessage(message);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    load();
  }

  // keeps the tutor list in step after bank details are edited in the dialog
  function handleBankSaved(tutorId, saved) {
    setTutors((previous) => previous.map((tutor) => (tutor.id === tutorId ? { ...tutor, ...saved } : tutor)));
  }

  async function handleExportFile() {
    setActionError('');
    setSuccessMessage('');
    setIsExporting(true);
    try {
      const file = await exportPayoutFile();
      const url = URL.createObjectURL(file.blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setSuccessMessage(
        `${file.filename} downloaded - ${file.count} transfer(s), ${formatCurrency(file.total)}. ` +
          'Upload it to your online banking, then mark each payout as paid.'
      );
      await load();
    } catch (error) {
      setActionError(error.message);
    } finally {
      setIsExporting(false);
    }
  }

  const term = search.trim().toLowerCase();
  const visibleTutors = tutors.filter((tutor) =>
    [tutor.fullName, tutor.email, tutor.bankName].filter(Boolean).some((value) => value.toLowerCase().includes(term))
  );
  const summaries = Object.values(summaryByTutor);
  const paidThisMonth = summaries.reduce((sum, item) => sum + item.paidThisMonth, 0);
  const tutorsPaidThisMonth = summaries.filter((item) => item.paidThisMonth > 0).length;
  const missingBankDetails = tutors.filter((tutor) => !tutor.hasBankDetails).length;
  const waitingCount = batch ? batch.count : 0;

  return (
    <PortalShell navItems={NAV_ITEMS}>
      <div className="page">
        <div className="page-header">
          <h1>Pay Tutors</h1>
          <p className="muted">
            Pay tutors from the institute&apos;s bank account and keep a record of every transfer. Each
            tutor is notified when their payment is recorded.
          </p>
        </div>

        <Alert type="error" message={loadError} />
        <Alert type="error" message={actionError} />
        <Alert type="success" message={successMessage} />

        {isLoading ? (
          <LoadingSpinner label="Loading tutors..." />
        ) : (
          <>
            <div className="stat-grid">
              <StatCard icon="wallet" label="Paid This Month" value={formatCurrency(paidThisMonth)} tone="success" />
              <StatCard icon="users" label="Tutors Paid This Month" value={`${tutorsPaidThisMonth} of ${tutors.length}`} />
              <StatCard
                icon="download"
                label="Waiting In Bank File"
                value={waitingCount}
                tone={waitingCount > 0 ? 'warning' : 'default'}
              />
              <StatCard
                icon="alertTriangle"
                label="Missing Bank Details"
                value={missingBankDetails}
                tone={missingBankDetails > 0 ? 'warning' : 'success'}
              />
            </div>

            <div className="card">
              <div className="flex-between" style={{ marginBottom: '12px' }}>
                <h2 style={{ margin: 0 }}>Tutors</h2>
                <div className="search-input" style={{ margin: 0, minWidth: '240px' }}>
                  <span className="input-icon">
                    <Icon name="search" size={16} />
                  </span>
                  <input
                    type="search"
                    placeholder="Search tutors..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    aria-label="Search tutors"
                  />
                </div>
              </div>

              {visibleTutors.length === 0 ? (
                <p className="muted" style={{ margin: 0 }}>
                  {tutors.length === 0 ? 'No active tutors yet.' : 'No tutors match your search.'}
                </p>
              ) : (
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Tutor</th>
                        <th>Bank account</th>
                        <th>Paid this month</th>
                        <th>Last paid</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {visibleTutors.map((tutor) => {
                        const summary = summaryByTutor[tutor.id];
                        return (
                          <tr key={tutor.id}>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <Avatar name={tutor.fullName} pictureUrl={tutor.profilePictureUrl} size={32} />
                                <div>
                                  <div className="order-line-title">{tutor.fullName}</div>
                                  <div className="order-line-sub">{tutor.email}</div>
                                </div>
                              </div>
                            </td>
                            <td>
                              {tutor.hasBankDetails ? (
                                `${tutor.bankName || 'Bank'} ${tutor.maskedAccountNumber || ''}`
                              ) : (
                                <span className="badge badge-warning">No bank details</span>
                              )}
                            </td>
                            <td>{summary && summary.paidThisMonth > 0 ? formatCurrency(summary.paidThisMonth) : '-'}</td>
                            <td>{summary ? formatDate(summary.lastPaidAt) : '-'}</td>
                            <td style={{ textAlign: 'right' }}>
                              <button
                                type="button"
                                className="btn btn-primary btn-sm"
                                onClick={() => {
                                  setSuccessMessage('');
                                  setPayingTutor(tutor);
                                }}
                              >
                                Pay
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {batch && batch.count > 0 && (
              <div className="card">
                <div className="flex-between" style={{ marginBottom: '8px' }}>
                  <h2 style={{ margin: 0 }}>Waiting in the bank file</h2>
                  <button type="button" className="btn btn-primary btn-sm" onClick={handleExportFile} disabled={isExporting}>
                    <Icon name="download" size={14} /> {isExporting ? 'Preparing...' : 'Download bank file'}
                  </button>
                </div>
                <p className="muted" style={{ fontSize: '0.86rem' }}>
                  {batch.count} payout(s), {formatCurrency(batch.total)}. Upload the file to your
                  corporate online banking, then mark each one as paid once the bank confirms it.
                </p>
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Tutor</th>
                        <th>Amount</th>
                        <th>Account</th>
                        <th>File</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {batch.payouts.map((item) => (
                        <tr key={item.id}>
                          <td>{item.tutorName}</td>
                          <td>{formatCurrency(item.amount)}</td>
                          <td>
                            {item.hasAccount ? (
                              `${item.bankName || 'Bank'} •••• ${item.accountLast4}`
                            ) : (
                              <span className="badge badge-danger">No account on file</span>
                            )}
                          </td>
                          <td>{item.exportedAt ? 'Downloaded' : 'Not yet'}</td>
                          <td>
                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                              <button type="button" className="btn btn-primary btn-sm" onClick={() => setSettleTarget(item)}>
                                Mark paid
                              </button>
                              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setFailTarget(item)}>
                                Failed
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

            <div className="card">
              <h2>Payment history</h2>
              {payouts.length === 0 ? (
                <p className="muted" style={{ margin: 0 }}>No payments recorded yet.</p>
              ) : (
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Tutor</th>
                        <th>Amount</th>
                        <th>For</th>
                        <th>Paid to</th>
                        <th>Reference / note</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payouts.map((payout) => {
                        const status = STATUS_LABELS[payout.status] || STATUS_LABELS.RECORDED;
                        return (
                          <tr key={payout.id}>
                            <td>{formatDate(payout.settledAt || payout.paidAt)}</td>
                            <td>{payout.tutorName}</td>
                            <td>{formatCurrency(payout.amount)}</td>
                            <td>{payout.periodLabel || '-'}</td>
                            <td>
                              {payout.accountLast4 ? `${payout.bankName || 'Bank'} •••• ${payout.accountLast4}` : '-'}
                            </td>
                            <td>
                              {payout.providerReference && <div>Ref {payout.providerReference}</div>}
                              {payout.note && <div className="muted" style={{ fontSize: '0.8rem' }}>{payout.note}</div>}
                              {!payout.providerReference && !payout.note && '-'}
                            </td>
                            <td>
                              <span className={`badge ${status.badge}`}>{status.label}</span>
                              {payout.failureReason && (
                                <div className="muted" style={{ fontSize: '0.76rem', marginTop: '2px' }}>
                                  {payout.failureReason}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {payingTutor && (
        <PayTutorModal
          tutor={payingTutor}
          options={options}
          onClose={() => setPayingTutor(null)}
          onPaid={finishAction}
          onBankSaved={handleBankSaved}
        />
      )}
      {settleTarget && (
        <MarkPaidModal payout={settleTarget} onClose={() => setSettleTarget(null)} onDone={finishAction} />
      )}
      {failTarget && <MarkFailedModal payout={failTarget} onClose={() => setFailTarget(null)} onDone={finishAction} />}
    </PortalShell>
  );
}

export default PayTutorsPage;
