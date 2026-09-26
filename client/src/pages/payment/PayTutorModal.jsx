// "Pay a tutor" dialog
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchTutorPayoutAccount, payTutor, updateTutorBankDetailsAsAdmin } from '../../api/paymentApi';
import Alert from '../../../../shared/client/src/components/common/Alert';
import Avatar from '../../../../shared/client/src/components/common/Avatar';
import Icon from '../../../../shared/client/src/components/common/Icon';
import useFormErrors from '../../../../shared/client/src/hooks/useFormErrors';
import { todayKey } from '../../../../shared/client/src/utils/schedule';
import NumberInput from '../../../../shared/client/src/components/common/NumberInput';

const EMPTY_BANK_FORM = { bankName: '', accountHolder: '', accountNumber: '', branch: '' };

// this month and the 11 before it, e.g. "September 2026"
function recentMonths() {
  const now = new Date();
  const months = [];
  for (let offset = 0; offset < 12; offset += 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    months.push(date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }));
  }
  return months;
}

function CopyButton({ value }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button type="button" className="copy-btn" onClick={copy} aria-label={`Copy ${value}`}>
      <Icon name={copied ? 'checkCircle' : 'copy'} size={12} /> {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function PayTutorModal({ tutor, options, onClose, onPaid, onBankSaved }) {
  const [account, setAccount] = useState(null);
  const [accountError, setAccountError] = useState('');
  const [isEditingBank, setIsEditingBank] = useState(!tutor.hasBankDetails);
  const [bankForm, setBankForm] = useState(EMPTY_BANK_FORM);
  const [isSavingBank, setIsSavingBank] = useState(false);
  const bankErrors = useFormErrors();

  const [method, setMethod] = useState('BANK_TRANSFER');
  const [amount, setAmount] = useState('');
  const [periodLabel, setPeriodLabel] = useState(recentMonths()[0]);
  const [note, setNote] = useState('');
  const [bankReference, setBankReference] = useState('');
  const [transferDate, setTransferDate] = useState(todayKey());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { fieldErrors, formError, validate, captureError, clearFieldError } = useFormErrors();

  const loadAccount = useCallback(() => {
    fetchTutorPayoutAccount(tutor.id)
      .then((data) => {
        setAccount(data);
        setBankForm({
          bankName: data.bankName || '',
          accountHolder: data.accountHolder || '',
          accountNumber: data.accountNumber || '',
          branch: data.branch || '',
        });
      })
      .catch((error) => setAccountError(error.message));
  }, [tutor.id]);

  useEffect(() => {
    loadAccount();
  }, [loadAccount]);

  const hasAccount = Boolean(account && account.accountNumber);

  async function handleSaveBank() {
    const isValid = bankErrors.validate({
      bankName: !bankForm.bankName.trim() && 'Enter the bank name.',
      accountNumber: !bankForm.accountNumber.trim() && 'Enter the account number.',
    });
    if (!isValid) return;

    setIsSavingBank(true);
    try {
      const saved = await updateTutorBankDetailsAsAdmin(tutor.id, {
        bankName: bankForm.bankName.trim(),
        accountHolder: bankForm.accountHolder.trim(),
        accountNumber: bankForm.accountNumber.trim(),
        branch: bankForm.branch.trim(),
      });
      onBankSaved(tutor.id, saved);
      setIsEditingBank(false);
      loadAccount();
    } catch (error) {
      bankErrors.captureError(error);
    } finally {
      setIsSavingBank(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const value = Number(amount);
    const isValid = validate({
      account: !hasAccount && 'Add the tutor\'s bank account first.',
      amount: !(value > 0) && 'Enter an amount greater than zero.',
      bankReference:
        method === 'BANK_TRANSFER' &&
        bankReference.trim().length < 3 &&
        'Enter the reference number the bank gave for this transfer.',
      transferDate:
        method === 'BANK_TRANSFER' &&
        ((!transferDate && 'Pick the date of the transfer.') ||
          (transferDate > todayKey() && 'The transfer date cannot be in the future.')),
    });
    if (!isValid) return;

    setIsSubmitting(true);
    try {
      const result = await payTutor({
        tutorId: tutor.id,
        amount: value,
        periodLabel,
        note: note.trim(),
        method,
        bankReference: method === 'BANK_TRANSFER' ? bankReference.trim() : undefined,
        transferDate: method === 'BANK_TRANSFER' ? transferDate : undefined,
      });
      onPaid(result.message);
    } catch (error) {
      captureError(error);
    } finally {
      setIsSubmitting(false);
    }
  }

  const methods = [{ value: 'BANK_TRANSFER', label: 'Paid by bank transfer' }];
  if (options && options.bulkFileAvailable) methods.push({ value: 'BANK_FILE', label: 'Add to bank file' });
  if (options && options.apiAvailable) methods.push({ value: 'PAYOUT_API', label: `Send via ${options.apiName}` });

  const source = options ? options.sourceAccount : null;

  return (
    <div className="modal-overlay" onClick={() => !isSubmitting && onClose()}>
      <div
        className="modal-dialog"
        style={{ maxWidth: '600px' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pay-title"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
          <Avatar name={tutor.fullName} pictureUrl={tutor.profilePictureUrl} size={36} />
          <h2 id="pay-title" style={{ margin: 0 }}>
            Pay {tutor.fullName}
          </h2>
        </div>
        <p className="muted" style={{ marginTop: 0 }}>{tutor.email}</p>

        <div className="transfer-box soft">
          <p className="transfer-box-title">
            <span>
              <Icon name="bank" size={16} /> From: institute account
            </span>
          </p>
          {source ? (
            <dl className="detail-grid">
              <div>
                <dt>Bank</dt>
                <dd>{source.bankName || '-'}</dd>
              </div>
              <div>
                <dt>Account</dt>
                <dd>
                  {source.accountNumber}
                  {source.accountName ? ` · ${source.accountName}` : ''}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="muted" style={{ margin: 0, fontSize: '0.86rem' }}>
              The institute&apos;s bank account is not saved yet.{' '}
              <Link to="/admin/payments/settings">Add it in Payment Settings</Link>.
            </p>
          )}
        </div>

        <div className="transfer-box">
          <p className="transfer-box-title">
            <span>
              <Icon name="user" size={16} /> To: {tutor.fullName}
            </span>
            {!isEditingBank && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setIsEditingBank(true)}>
                {hasAccount ? 'Change' : 'Add details'}
              </button>
            )}
          </p>

          <Alert type="error" message={accountError} />

          {isEditingBank ? (
            <>
              <p className="muted" style={{ fontSize: '0.84rem', marginTop: 0 }}>
                Saving updates the tutor&apos;s payout account and lets them know it changed.
              </p>
              <div className="card-field-row">
                <div className="form-field">
                  <label htmlFor="bank-name">Bank name</label>
                  <input
                    id="bank-name"
                    type="text"
                    placeholder="e.g. Bank of Ceylon"
                    value={bankForm.bankName}
                    onChange={(e) => setBankForm((prev) => ({ ...prev, bankName: e.target.value }))}
                    className={bankErrors.fieldErrors.bankName ? 'input-error' : ''}
                  />
                  {bankErrors.fieldErrors.bankName && <p className="field-error">{bankErrors.fieldErrors.bankName}</p>}
                </div>
                <div className="form-field">
                  <label htmlFor="bank-holder">Account holder</label>
                  <input
                    id="bank-holder"
                    type="text"
                    placeholder="Name as on the account"
                    value={bankForm.accountHolder}
                    onChange={(e) => setBankForm((prev) => ({ ...prev, accountHolder: e.target.value }))}
                    className={bankErrors.fieldErrors.accountHolder ? 'input-error' : ''}
                  />
                  {bankErrors.fieldErrors.accountHolder && (
                    <p className="field-error">{bankErrors.fieldErrors.accountHolder}</p>
                  )}
                </div>
              </div>
              <div className="card-field-row">
                <div className="form-field">
                  <label htmlFor="bank-account">Account number</label>
                  <input
                    id="bank-account"
                    type="text"
                    inputMode="numeric"
                    placeholder="e.g. 8001234567"
                    value={bankForm.accountNumber}
                    onChange={(e) =>
                      setBankForm((prev) => ({ ...prev, accountNumber: e.target.value.replace(/[^\d -]/g, '') }))
                    }
                    className={bankErrors.fieldErrors.accountNumber ? 'input-error' : ''}
                  />
                  {bankErrors.fieldErrors.accountNumber && (
                    <p className="field-error">{bankErrors.fieldErrors.accountNumber}</p>
                  )}
                </div>
                <div className="form-field">
                  <label htmlFor="bank-branch">Branch</label>
                  <input
                    id="bank-branch"
                    type="text"
                    placeholder="e.g. Kandy"
                    value={bankForm.branch}
                    onChange={(e) => setBankForm((prev) => ({ ...prev, branch: e.target.value }))}
                    className={bankErrors.fieldErrors.branch ? 'input-error' : ''}
                  />
                  {bankErrors.fieldErrors.branch && <p className="field-error">{bankErrors.fieldErrors.branch}</p>}
                </div>
              </div>
              <Alert type="error" message={bankErrors.formError} />
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" className="btn btn-primary btn-sm" disabled={isSavingBank} onClick={handleSaveBank}>
                  {isSavingBank ? 'Saving...' : 'Save bank details'}
                </button>
                {hasAccount && (
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
          ) : !account ? (
            <p className="muted" style={{ margin: 0 }}>Loading account...</p>
          ) : hasAccount ? (
            <dl className="detail-grid">
              <div>
                <dt>Bank</dt>
                <dd>{account.bankName || '-'}</dd>
              </div>
              <div>
                <dt>Branch</dt>
                <dd>{account.branch || '-'}</dd>
              </div>
              <div>
                <dt>Account holder</dt>
                <dd>{account.accountHolder || tutor.fullName}</dd>
              </div>
              <div>
                <dt>Account number</dt>
                <dd>
                  {account.accountNumber}
                  <CopyButton value={account.accountNumber} />
                </dd>
              </div>
            </dl>
          ) : (
            <p className="muted" style={{ margin: 0 }}>This tutor has no bank account on file yet.</p>
          )}
          {fieldErrors.account && <p className="field-error">{fieldErrors.account}</p>}
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="card-field-row">
            <div className="form-field">
              <label htmlFor="payout-amount">Amount (LKR)</label>
              <NumberInput
                id="payout-amount"
                decimals={2}
                placeholder="e.g. 25000"
                value={amount}
                onChange={(value) => {
                  setAmount(value);
                  clearFieldError('amount');
                }}
                className={fieldErrors.amount ? 'input-error' : ''}
              />
              {fieldErrors.amount && <p className="field-error">{fieldErrors.amount}</p>}
            </div>
            <div className="form-field">
              <label htmlFor="payout-period">For the month of</label>
              <select id="payout-period" value={periodLabel} onChange={(e) => setPeriodLabel(e.target.value)}>
                {recentMonths().map((month) => (
                  <option key={month} value={month}>
                    {month}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-field">
            <label htmlFor="payout-note">Note (optional)</label>
            <input
              id="payout-note"
              type="text"
              maxLength={200}
              placeholder="e.g. Grade 11 Maths - class fees share"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          {methods.length > 1 && (
            <div className="form-field">
              <label>How is it being paid?</label>
              <div className="period-tabs" role="radiogroup" aria-label="Payment method">
                {methods.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    role="radio"
                    aria-checked={method === item.value}
                    className={`period-tab${method === item.value ? ' active' : ''}`}
                    onClick={() => setMethod(item.value)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {method === 'BANK_TRANSFER' && (
            <>
              <p className="field-help" style={{ marginTop: 0, marginBottom: '12px' }}>
                Send the amount to the account above from your online banking or at the bank, then
                enter the reference number shown on the bank&apos;s confirmation.
              </p>
              <div className="card-field-row">
                <div className="form-field">
                  <label htmlFor="bank-reference">Bank reference number</label>
                  <input
                    id="bank-reference"
                    type="text"
                    placeholder="e.g. CEFT 240926001234"
                    maxLength={60}
                    value={bankReference}
                    onChange={(e) => {
                      setBankReference(e.target.value);
                      clearFieldError('bankReference');
                    }}
                    className={fieldErrors.bankReference ? 'input-error' : ''}
                  />
                  {fieldErrors.bankReference && <p className="field-error">{fieldErrors.bankReference}</p>}
                </div>
                <div className="form-field">
                  <label htmlFor="transfer-date">Transfer date</label>
                  <input
                    id="transfer-date"
                    type="date"
                    max={todayKey()}
                    value={transferDate}
                    onChange={(e) => {
                      setTransferDate(e.target.value);
                      clearFieldError('transferDate');
                    }}
                    className={fieldErrors.transferDate ? 'input-error' : ''}
                  />
                  {fieldErrors.transferDate && <p className="field-error">{fieldErrors.transferDate}</p>}
                </div>
              </div>
            </>
          )}

          {method === 'BANK_FILE' && (
            <p className="field-help" style={{ marginTop: 0 }}>
              The payout waits in the bank file. Download the file from this page, upload it to your
              corporate online banking, then mark it as paid.
            </p>
          )}

          <Alert type="error" message={formError} />

          <div className="flex-between" style={{ marginTop: '18px' }}>
            <button type="button" className="btn btn-secondary" disabled={isSubmitting} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting || isEditingBank}>
              {isSubmitting
                ? 'Saving...'
                : method === 'BANK_TRANSFER'
                  ? 'Record payment'
                  : method === 'BANK_FILE'
                    ? 'Add to bank file'
                    : 'Send payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default PayTutorModal;
