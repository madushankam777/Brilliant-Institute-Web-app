// Admin: record a cash or bank-slip payment made at the office
import { useEffect, useState } from 'react';
import { recordOfficePayment, searchStudentsForPayment } from '../../api/paymentApi';
import Alert from '../../../../shared/client/src/components/common/Alert';
import Icon from '../../../../shared/client/src/components/common/Icon';
import NumberInput from '../../../../shared/client/src/components/common/NumberInput';

// the ways a payment is made at the office
const METHODS = [
  { value: 'CASH', label: 'Cash' },
  { value: 'BANK_DEPOSIT', label: 'Bank deposit slip' },
];

// a number as LKR money
function formatCurrency(amount) {
  return new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' }).format(amount);
}

// record a payment card - find the student, choose the class, then save a cash or bank slip payment
function RecordPaymentCard({ onRecorded }) {
  // the student search, the chosen student and the form fields
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [student, setStudent] = useState(null);
  const [enrollmentId, setEnrollmentId] = useState(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('CASH');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // search as the admin types (registration number or name)
  useEffect(() => {
    const term = search.trim();
    if (student || term.length < 2) {
      setResults([]);
      return undefined;
    }
    let isCurrent = true;
    setIsSearching(true);
    const timer = setTimeout(() => {
      searchStudentsForPayment(term)
        .then((list) => {
          if (isCurrent) setResults(list);
        })
        .catch(() => {
          if (isCurrent) setResults([]);
        })
        .finally(() => {
          if (isCurrent) setIsSearching(false);
        });
    }, 250);
    return () => {
      isCurrent = false;
      clearTimeout(timer);
    };
  }, [search, student]);

  // the class being paid for
  const enrollment = student ? student.enrollments.find((item) => item.enrollmentId === enrollmentId) : null;

  // pick a student - the first class with a balance is chosen
  function pickStudent(picked) {
    setStudent(picked);
    setSuccess('');
    setFormError('');
    setErrors({});
    const firstOwing = picked.enrollments.find((item) => item.balance > 0) || picked.enrollments[0];
    setEnrollmentId(firstOwing ? firstOwing.enrollmentId : null);
    setAmount(firstOwing && firstOwing.balance > 0 ? String(firstOwing.balance) : '');
  }

  // pick a class - the amount becomes its balance
  function pickEnrollment(item) {
    setEnrollmentId(item.enrollmentId);
    setAmount(item.balance > 0 ? String(item.balance) : '');
    setErrors({});
  }

  // change student btn - clear the form
  function reset() {
    setStudent(null);
    setSearch('');
    setEnrollmentId(null);
    setAmount('');
    setMethod('CASH');
    setReference('');
    setNote('');
    setErrors({});
    setFormError('');
  }

  // record btn - check the fields, then record the office payment
  async function handleSubmit(event) {
    event.preventDefault();
    const paid = Number(amount);
    const found = {};
    if (!enrollment) found.enrollment = 'Choose the class being paid for.';
    else if (enrollment.balance <= 0) found.enrollment = 'Nothing is owed for this class.';
    if (!(paid > 0)) found.amount = 'Enter the amount the student paid.';
    else if (enrollment && paid > enrollment.balance) found.amount = `Can't be more than the balance of ${formatCurrency(enrollment.balance)}.`;
    if (reference.trim() && !/^[A-Za-z0-9 \-/]{1,40}$/.test(reference.trim())) {
      found.reference = 'Use letters, numbers, spaces, hyphens and slashes only.';
    }
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setIsSaving(true);
    setFormError('');
    try {
      const result = await recordOfficePayment({
        enrollmentId: enrollment.enrollmentId,
        amount: paid,
        method,
        reference: reference.trim(),
        note: note.trim(),
      });
      setSuccess(
        `${result.message} ${student.fullName} (${student.studentCode}) now owes ${formatCurrency(result.data.balanceAfter)} for ${result.data.subject}.`
      );
      reset();
      if (onRecorded) onRecorded();
    } catch (error) {
      setFormError(error.message);
    } finally {
      setIsSaving(false);
    }
  }

  // the card - title, messages, then the student search or the payment form
  return (
    <div className="card">
      <h2>Record a payment</h2>
      <p className="muted" style={{ marginTop: '-4px' }}>
        For cash or bank deposit slips handed in at the office. Find the student by registration number or name.
      </p>
      <Alert type="success" message={success} />
      <Alert type="error" message={formError} />

      {/* step 1 - search for the student; step 2 - the payment form */}
      {!student ? (
        <div className="record-search">
          <div className="form-field" style={{ marginBottom: 0 }}>
            <label htmlFor="record-search">Registration number or name</label>
            <input
              id="record-search"
              type="search"
              placeholder="e.g. ST0000002 or Demo Student"
              value={search}
              autoComplete="off"
              onChange={(e) => {
                setSearch(e.target.value);
                setSuccess('');
              }}
            />
          </div>
          {/* search results - searching, no match, or the matching students */}
          {search.trim().length >= 2 && (
            <div className="record-results">
              {isSearching ? (
                <p className="muted record-empty">Searching...</p>
              ) : results.length === 0 ? (
                <p className="muted record-empty">No active student matches &ldquo;{search.trim()}&rdquo;.</p>
              ) : (
                results.map((item) => (
                  <button key={item.id} type="button" className="record-result" onClick={() => pickStudent(item)}>
                    <span>
                      <strong>{item.fullName}</strong>
                      <span className="order-line-sub">
                        {[item.grade, `${item.enrollments.length} class${item.enrollments.length === 1 ? '' : 'es'}`].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <span className="reg-no">{item.studentCode}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate>
          {/* the chosen student with a Change student btn */}
          <div className="record-student">
            <span>
              <strong>{student.fullName}</strong> <span className="reg-no">{student.studentCode}</span>
              <span className="order-line-sub">{[student.grade, student.email].filter(Boolean).join(' · ')}</span>
            </span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={reset}>
              Change student
            </button>
          </div>

          {/* the student's classes, or a message when they have none */}
          {student.enrollments.length === 0 ? (
            <p className="muted">This student is not enrolled in any class.</p>
          ) : (
            <>
              {/* pick the class being paid for */}
              <div className="form-field">
                <label>Class</label>
                <div className="choice-group" role="radiogroup">
                  {student.enrollments.map((item) => (
                    <label
                      key={item.enrollmentId}
                      className={`choice-pill${item.enrollmentId === enrollmentId ? ' is-checked' : ''}`}
                    >
                      <input
                        type="radio"
                        name="record-class"
                        checked={item.enrollmentId === enrollmentId}
                        onChange={() => pickEnrollment(item)}
                      />
                      {item.subject} - {formatCurrency(item.balance)} due
                    </label>
                  ))}
                </div>
                {errors.enrollment && <p className="field-error">{errors.enrollment}</p>}
              </div>

              {/* amount and how it was paid */}
              <div className="card-field-row">
                <div className="form-field">
                  <label htmlFor="record-amount">Amount paid (LKR)</label>
                  <NumberInput
                    id="record-amount"
                    decimals={2}
                    maxLength={12}
                    placeholder="0.00"
                    value={amount}
                    className={errors.amount ? 'input-error' : ''}
                    onChange={(value) => {
                      setAmount(value);
                      setErrors((prev) => ({ ...prev, amount: undefined }));
                    }}
                  />
                  {errors.amount && <p className="field-error">{errors.amount}</p>}
                </div>
                <div className="form-field">
                  <label>Paid by</label>
                  <div className="choice-group" role="radiogroup">
                    {METHODS.map((item) => (
                      <label key={item.value} className={`choice-pill${method === item.value ? ' is-checked' : ''}`}>
                        <input
                          type="radio"
                          name="record-method"
                          checked={method === item.value}
                          onChange={() => setMethod(item.value)}
                        />
                        {item.label}
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {/* receipt book number or slip reference, and a note */}
              <div className="card-field-row">
                <div className="form-field">
                  <label htmlFor="record-reference">
                    {method === 'BANK_DEPOSIT' ? 'Slip / reference number' : 'Receipt book number (optional)'}
                  </label>
                  <input
                    id="record-reference"
                    maxLength={40}
                    value={reference}
                    className={errors.reference ? 'input-error' : ''}
                    onChange={(e) => setReference(e.target.value)}
                  />
                  {errors.reference && <p className="field-error">{errors.reference}</p>}
                </div>
                <div className="form-field">
                  <label htmlFor="record-note">Note (optional)</label>
                  <input id="record-note" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
                </div>
              </div>

              {/* record btn */}
              <button type="submit" className="btn btn-primary" disabled={isSaving}>
                <Icon name="checkCircle" size={16} /> {isSaving ? 'Recording...' : `Record ${amount ? formatCurrency(Number(amount)) : 'payment'}`}
              </button>
            </>
          )}
        </form>
      )}
    </div>
  );
}

export default RecordPaymentCard;
