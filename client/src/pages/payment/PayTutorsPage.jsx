// Admin: pay Tutors - a manual payout ledger, not automatic payroll.
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchTutorPayouts,
  fetchAllTutors,
  payTutor,
  updateTutorBankDetailsAsAdmin,
} from '../../api/paymentApi';
import LoadingSpinner from '../../../../shared/client/src/components/common/LoadingSpinner';
import Alert from '../../../../shared/client/src/components/common/Alert';
import Avatar from '../../../../shared/client/src/components/common/Avatar';
import PortalShell from '../../../../shared/client/src/components/layout/PortalShell';
import { getNavItems } from '../../../../shared/client/src/components/layout/navItems';
import TutorPicker from '../../../../shared/client/src/components/common/TutorPicker';

const NAV_ITEMS = getNavItems('ADMIN');

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' }).format(amount);
}

const EMPTY_PAYOUT_FORM = { amount: '', note: '', periodLabel: '' };
const EMPTY_BANK_FORM = { bankName: '', accountHolder: '', accountNumber: '', branch: '' };

function PayTutorsPage() {
  const [tutors, setTutors] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [totalsByTutor, setTotalsByTutor] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [selectedTutorId, setSelectedTutorId] = useState(null);
  const [payingTutor, setPayingTutor] = useState(null); // the tutor the modal is open for
  const [form, setForm] = useState(EMPTY_PAYOUT_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // admin filling in / correcting the tutor's payout account
  const [isEditingBank, setIsEditingBank] = useState(false);
  const [bankForm, setBankForm] = useState(EMPTY_BANK_FORM);
  const [isSavingBank, setIsSavingBank] = useState(false);
  const [bankError, setBankError] = useState('');

  const selectedTutor = useMemo(
    () => tutors.find((tutor) => tutor.id === selectedTutorId) || null,
    [tutors, selectedTutorId]
  );

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const [tutorList, payoutData] = await Promise.all([fetchAllTutors(), fetchTutorPayouts()]);
      setTutors(tutorList);
      setPayouts(payoutData.payouts);
      setTotalsByTutor(payoutData.totalsByTutor || {});
    } catch (error) {
      setLoadError(error.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openPayModal(tutor) {
    setPayingTutor(tutor);
    setForm(EMPTY_PAYOUT_FORM);
    setFormError('');
    setSuccessMessage('');
    setBankError('');
    setBankForm({
      bankName: tutor.bankName || '',
      accountHolder: tutor.bankAccountHolder || '',
      accountNumber: '',
      branch: tutor.bankBranch || '',
    });
    // no account on file yet - open straight into the form so the payout
    // isn't recorded against a tutor nobody can actually pay
    setIsEditingBank(!tutor.hasBankDetails);
  }

  async function handleSaveBankDetails(event) {
    event.preventDefault();
    setBankError('');

    if (!bankForm.bankName.trim() || !bankForm.accountNumber.trim()) {
      setBankError('Bank name and account number are both required.');
      return;
    }

    setIsSavingBank(true);
    try {
      const saved = await updateTutorBankDetailsAsAdmin(payingTutor.id, {
        bankName: bankForm.bankName.trim(),
        accountHolder: bankForm.accountHolder.trim(),
        accountNumber: bankForm.accountNumber.trim(),
        branch: bankForm.branch.trim(),
      });
      const updatedTutor = { ...payingTutor, ...saved };
      setPayingTutor(updatedTutor);
      setTutors((prev) => prev.map((t) => (t.id === updatedTutor.id ? { ...t, ...saved } : t)));
      setIsEditingBank(false);
    } catch (error) {
      setBankError(error.message);
    } finally {
      setIsSavingBank(false);
    }
  }

  function closePayModal() {
    if (isSubmitting) return;
    setPayingTutor(null);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setFormError('');

    const amountValue = Number(form.amount);
    if (!(amountValue > 0)) {
      setFormError('Enter a payout amount greater than zero.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payout = await payTutor({
        tutorId: payingTutor.id,
        amount: amountValue,
        note: form.note.trim(),
        periodLabel: form.periodLabel.trim(),
      });
      setPayingTutor(null);
      setSuccessMessage(`Payout of ${formatCurrency(payout.amount)} recorded for ${payout.tutorName}.`);
      await load();
    } catch (error) {
      setFormError(error.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <PortalShell navItems={NAV_ITEMS}>
      <div className="page">
        <div className="page-header">
          <h1>Pay Tutors</h1>
          <p className="muted">
            Record a payout to a Tutor. This is a manual ledger for keeping track of what each Tutor
            has been paid - pick a Tutor, then Pay to open their payout form.
          </p>
        </div>

        <div className="card">
          <Alert type="error" message={loadError} />
          <Alert type="success" message={successMessage} />

          {isLoading ? (
            <LoadingSpinner label="Loading tutors..." />
          ) : (
            <>
              <div className="form-field">
                <label>Tutor</label>
                <TutorPicker
                  tutors={tutors}
                  value={selectedTutorId}
                  onChange={setSelectedTutorId}
                  emptyMessage="No active tutors found."
                />
              </div>

              <button
                type="button"
                className="btn btn-primary"
                disabled={!selectedTutor}
                onClick={() => openPayModal(selectedTutor)}
              >
                {selectedTutor ? `Pay ${selectedTutor.fullName}` : 'Select a Tutor to pay'}
              </button>

              {payouts.length > 0 && (
                <div className="table-scroll" style={{ marginTop: '20px' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Paid At</th>
                        <th>Tutor</th>
                        <th>Amount</th>
                        <th>Period</th>
                        <th>Note</th>
                        <th>Paid By</th>
                        <th>Total Paid To Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payouts.map((payout) => (
                        <tr key={payout.id}>
                          <td>{payout.paidAt}</td>
                          <td>{payout.tutorName}</td>
                          <td>{formatCurrency(payout.amount)}</td>
                          <td>{payout.periodLabel || '-'}</td>
                          <td>{payout.note || '-'}</td>
                          <td>{payout.paidByName}</td>
                          <td>{formatCurrency(totalsByTutor[payout.tutorId] || payout.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {payingTutor && (
        <div className="modal-overlay" onClick={closePayModal}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
              <Avatar name={payingTutor.fullName} pictureUrl={payingTutor.profilePictureUrl} size={36} />
              <h2 style={{ margin: 0 }}>Pay {payingTutor.fullName}</h2>
            </div>
            <p className="muted" style={{ marginTop: 0 }}>{payingTutor.email}</p>

            <div className="card" style={{ background: 'var(--color-bg-soft)', marginBottom: '16px' }}>
              <div className="flex-between">
                <h3 style={{ margin: 0, fontSize: '0.95rem' }}>Banking information</h3>
                {!isEditingBank && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setBankError('');
                      setIsEditingBank(true);
                    }}
                  >
                    {payingTutor.hasBankDetails ? 'Change' : 'Add details'}
                  </button>
                )}
              </div>

              {isEditingBank ? (
                <>
                  <p className="muted" style={{ fontSize: '0.84rem' }}>
                    Saving this updates the Tutor&apos;s payout account and notifies them of the change.
                  </p>
                  <div className="card-field-row">
                    <div className="form-field">
                      <label htmlFor="admin-bank-name">Bank name</label>
                      <input
                        id="admin-bank-name"
                        type="text"
                        placeholder="e.g. People's Bank"
                        value={bankForm.bankName}
                        onChange={(e) => setBankForm((prev) => ({ ...prev, bankName: e.target.value }))}
                      />
                    </div>
                    <div className="form-field">
                      <label htmlFor="admin-bank-holder">Account holder</label>
                      <input
                        id="admin-bank-holder"
                        type="text"
                        placeholder="Name exactly as on the account"
                        value={bankForm.accountHolder}
                        onChange={(e) => setBankForm((prev) => ({ ...prev, accountHolder: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="card-field-row">
                    <div className="form-field">
                      <label htmlFor="admin-bank-account">Account number</label>
                      <input
                        id="admin-bank-account"
                        type="text"
                        placeholder="e.g. 8001234567"
                        value={bankForm.accountNumber}
                        onChange={(e) => setBankForm((prev) => ({ ...prev, accountNumber: e.target.value }))}
                      />
                    </div>
                    <div className="form-field">
                      <label htmlFor="admin-bank-branch">Branch</label>
                      <input
                        id="admin-bank-branch"
                        type="text"
                        placeholder="e.g. Colombo 07"
                        value={bankForm.branch}
                        onChange={(e) => setBankForm((prev) => ({ ...prev, branch: e.target.value }))}
                      />
                    </div>
                  </div>

                  <Alert type="error" message={bankError} />

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={isSavingBank}
                      onClick={handleSaveBankDetails}
                    >
                      {isSavingBank ? 'Saving...' : 'Save banking details'}
                    </button>
                    {payingTutor.hasBankDetails && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={isSavingBank}
                        onClick={() => setIsEditingBank(false)}
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </>
              ) : payingTutor.hasBankDetails ? (
                <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
                  <div>
                    <dt className="muted" style={{ fontSize: '0.78rem' }}>Bank</dt>
                    <dd style={{ margin: 0 }}>{payingTutor.bankName || '-'}</dd>
                  </div>
                  <div>
                    <dt className="muted" style={{ fontSize: '0.78rem' }}>Account holder</dt>
                    <dd style={{ margin: 0 }}>{payingTutor.bankAccountHolder || '-'}</dd>
                  </div>
                  <div>
                    <dt className="muted" style={{ fontSize: '0.78rem' }}>Account number</dt>
                    <dd style={{ margin: 0 }}>{payingTutor.maskedAccountNumber || '-'}</dd>
                  </div>
                  <div>
                    <dt className="muted" style={{ fontSize: '0.78rem' }}>Branch</dt>
                    <dd style={{ margin: 0 }}>{payingTutor.bankBranch || '-'}</dd>
                  </div>
                </dl>
              ) : (
                <p className="muted" style={{ margin: 0, fontSize: '0.88rem' }}>
                  This Tutor hasn&apos;t added their banking details yet - add them here, or ask the Tutor
                  to add them from their own profile.
                </p>
              )}
            </div>

            <form onSubmit={handleSubmit} noValidate>
              <div className="card-field-row">
                <div className="form-field">
                  <label htmlFor="payout-amount">Amount (LKR)</label>
                  <input
                    id="payout-amount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={form.amount}
                    onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))}
                    placeholder="e.g. 25000"
                    autoFocus
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="payout-period">Period (optional)</label>
                  <input
                    id="payout-period"
                    type="text"
                    value={form.periodLabel}
                    onChange={(e) => setForm((prev) => ({ ...prev, periodLabel: e.target.value }))}
                    placeholder="e.g. September 2026"
                  />
                </div>
              </div>

              <div className="form-field">
                <label htmlFor="payout-note">Note (optional)</label>
                <input
                  id="payout-note"
                  type="text"
                  value={form.note}
                  onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))}
                  placeholder="e.g. Grade 11 Maths - Sept share"
                />
              </div>

              <Alert type="error" message={formError} />

              <div className="flex-between" style={{ marginTop: '18px' }}>
                <button type="button" className="btn btn-secondary" disabled={isSubmitting} onClick={closePayModal}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                  {isSubmitting ? 'Recording...' : 'Record Payout'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PortalShell>
  );
}

export default PayTutorsPage;
