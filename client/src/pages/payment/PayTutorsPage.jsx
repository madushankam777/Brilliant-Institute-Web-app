// Admin: pay Tutors - a manual payout ledger, not automatic payroll.
import { useCallback, useEffect, useState } from 'react';
import { fetchTutorPayouts, payTutor } from '../../api/paymentApi';
import { fetchAllTutors } from '../../api/courseApi';
import LoadingSpinner from '../../../../shared/client/src/components/common/LoadingSpinner';
import Alert from '../../../../shared/client/src/components/common/Alert';
import PortalShell from '../../../../shared/client/src/components/layout/PortalShell';
import { getNavItems } from '../../../../shared/client/src/components/layout/navItems';
import TutorPicker from '../../../../shared/client/src/components/common/TutorPicker';

const NAV_ITEMS = getNavItems('ADMIN');

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' }).format(amount);
}

const EMPTY_PAYOUT_FORM = { tutorId: null, amount: '', note: '', periodLabel: '' };

function PayTutorsPage() {
  const [tutors, setTutors] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [totalsByTutor, setTotalsByTutor] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [form, setForm] = useState(EMPTY_PAYOUT_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

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

  async function handleSubmit(event) {
    event.preventDefault();
    setFormError('');
    setSuccessMessage('');

    if (!form.tutorId) {
      setFormError('Please select a Tutor to pay.');
      return;
    }
    const amountValue = Number(form.amount);
    if (!(amountValue > 0)) {
      setFormError('Enter a payout amount greater than zero.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payout = await payTutor({
        tutorId: form.tutorId,
        amount: amountValue,
        note: form.note.trim(),
        periodLabel: form.periodLabel.trim(),
      });
      setSuccessMessage(`Payout of ${formatCurrency(payout.amount)} recorded for ${payout.tutorName}.`);
      setForm(EMPTY_PAYOUT_FORM);
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
            has been paid - enter the amount you&apos;re sending them.
          </p>
        </div>

        <div className="card">
          <Alert type="error" message={loadError} />

          {isLoading ? (
            <LoadingSpinner label="Loading tutors..." />
          ) : (
            <>
              <form onSubmit={handleSubmit} noValidate>
                <div className="form-field">
                  <label>Tutor</label>
                  <TutorPicker
                    tutors={tutors}
                    value={form.tutorId}
                    onChange={(tutorId) => setForm((prev) => ({ ...prev, tutorId }))}
                    emptyMessage="No active tutors found."
                  />
                </div>

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
                <Alert type="success" message={successMessage} />

                <div>
                  <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                    {isSubmitting ? 'Recording...' : 'Record Payout'}
                  </button>
                </div>
              </form>

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
    </PortalShell>
  );
}

export default PayTutorsPage;
