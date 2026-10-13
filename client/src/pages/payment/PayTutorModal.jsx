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
import ModalClose from '../../../../shared/client/src/components/common/ModalClose';

// a blank bank details form
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

// copy btn - copies the text and shows Copied for 1.5 seconds
function CopyButton({ value }) {
  const [copied, setCopied] = useState(false);

  // copy the value to the clipboard
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

// pay a tutor pop-up - the institute's account, the tutor's bank account, then the payout form
function PayTutorModal({ tutor, options, onClose, onPaid, onBankSaved }) {
  // the tutor's bank account and the bank form
  const [account, setAccount] = useState(null);
  const [accountError, setAccountError] = useState('');
  const [isEditingBank, setIsEditingBank] = useState(!tutor.hasBankDetails);
  const [bankForm, setBankForm] = useState(EMPTY_BANK_FORM);
  const [isSavingBank, setIsSavingBank] = useState(false);
  const bankErrors = useFormErrors();

  // the payout form - how it is paid, amount, month, note and bank reference
  const [method, setMethod] = useState('BANK_TRANSFER');
  const [amount, setAmount] = useState('');
  const [periodLabel, setPeriodLabel] = useState(recentMonths()[0]);
  const [note, setNote] = useState('');
  const [bankReference, setBankReference] = useState('');
  const [transferDate, setTransferDate] = useState(todayKey());
  const [walletNumber, setWalletNumber] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { fieldErrors, formError, validate, captureError, clearFieldError } = useFormErrors();

  // load the tutor's payout account into the bank form
  const loadAccount = useCallback(() => {
    fetchTutorPayoutAccount(tutor.id)
      .then((data) => {
        setAccount(data);
        // their phone is the usual eZ Cash / mCash number
        setWalletNumber((current) => current || (data.phone || '').replace(/\s+/g, ''));
        setBankForm({
          bankName: data.bankName || '',
          accountHolder: data.accountHolder || '',
          accountNumber: data.accountNumber || '',
          branch: data.branch || '',
        });
      })
      .catch((error) => setAccountError(error.message));
  }, [tutor.id]);

  // load it when the pop-up opens
  useEffect(() => {
    loadAccount();
  }, [loadAccount]);

  const hasAccount = Boolean(account && account.accountNumber);

  // save bank details btn - update the tutor's account (the tutor is told)
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

  // pay btn - check the form, then record the tutor's payout
  async function handleSubmit(event) {
    event.preventDefault();
    const value = Number(amount);
    const isValid = validate({
      account: !isWallet && !hasAccount && 'Add the tutor\'s bank account first.',
      walletNumber:
        isWallet &&
        !/^(?:\+94|0)7\d{8}$/.test(walletNumber.trim()) &&
        `Enter the tutor's ${chosen.label} number, e.g. 0771234567.`,
      amount: !(value > 0) && 'Enter an amount greater than zero.',
      bankReference:
        isDirect &&
        bankReference.trim().length < 3 &&
        (isWallet ? 'Enter the transaction ID from the confirmation SMS.' : 'Enter the reference number the bank gave for this transfer.'),
      transferDate:
        isDirect &&
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
        bankReference: isDirect ? bankReference.trim() : undefined,
        transferDate: isDirect ? transferDate : undefined,
        walletNumber: isWallet ? walletNumber.trim() : undefined,
      });
      onPaid(result.message);
    } catch (error) {
      captureError(error);
    } finally {
      setIsSubmitting(false);
    }
  }

  // the accounts it can be paid from - main bank, plus card, eZ Cash and mCash when they are on
  const sources = (options && options.sources) || [{ value: 'BANK_TRANSFER', label: 'Main bank account', kind: 'BANK' }];
  const methods = sources.map((item) => ({ ...item }));
  if (options && options.bulkFileAvailable) methods.push({ value: 'BANK_FILE', label: 'Add to bank file', kind: 'BANK' });
  if (options && options.apiAvailable) methods.push({ value: 'PAYOUT_API', label: `Send via ${options.apiName}`, kind: 'BANK' });

  // the chosen way, and what it needs
  const chosen = methods.find((item) => item.value === method) || methods[0];
  const isWallet = chosen.kind === 'WALLET';
  const isDirect = ['BANK_TRANSFER', 'CARD_ACCOUNT', 'EZ_CASH', 'MCASH'].includes(chosen.value);

  // the institute's account the money is paid from (the bank file and payout api use the main account)
  const source = sources.find((item) => item.value === chosen.value) || sources[0];

  // the pop-up - the two accounts, then the payout form
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
        <ModalClose onClose={onClose} disabled={isSubmitting} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
          <Avatar name={tutor.fullName} pictureUrl={tutor.profilePictureUrl} size={36} />
          <h2 id="pay-title" style={{ margin: 0 }}>
            Pay {tutor.fullName}
          </h2>
        </div>
        <p className="muted" style={{ marginTop: 0 }}>{tutor.email}</p>

        {/* pay from - main bank account, card account, eZ Cash, mCash, bank file or payout api */}
        {methods.length > 1 && (
          <div className="form-field">
            <label>Pay from</label>
            <div className="period-tabs" role="radiogroup" aria-label="Pay from">
              {methods.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  role="radio"
                  aria-checked={chosen.value === item.value}
                  className={`period-tab${chosen.value === item.value ? ' active' : ''}`}
                  onClick={() => {
                    setMethod(item.value);
                    clearFieldError('account');
                    clearFieldError('bankReference');
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* from - the institute account the money leaves */}
        <div className="transfer-box soft">
          <p className="transfer-box-title">
            <span>
              <Icon name="bank" size={16} /> From: {source.label}
            </span>
          </p>
          {source.account ? (
            <p style={{ margin: 0 }}>
              <strong>{source.account}</strong>
            </p>
          ) : (
            <p className="muted" style={{ margin: 0, fontSize: '0.86rem' }}>
              The institute&apos;s bank account is not saved yet.{' '}
              <Link to="/admin/payments/settings">Add it in Payment Settings</Link>.
            </p>
          )}
        </div>

        {/* to - the tutor's wallet number, or their bank account with a change btn */}
        {isWallet ? (
          <div className="transfer-box">
            <p className="transfer-box-title">
              <span>
                <Icon name="user" size={16} /> To: {tutor.fullName}&apos;s {chosen.label}
              </span>
            </p>
            <div className="form-field" style={{ marginBottom: 0 }}>
              <label htmlFor="wallet-number">{chosen.label} number</label>
              <input
                id="wallet-number"
                type="tel"
                placeholder="07XXXXXXXX"
                value={walletNumber}
                onChange={(e) => {
                  setWalletNumber(e.target.value);
                  clearFieldError('walletNumber');
                }}
                className={fieldErrors.walletNumber ? 'input-error' : ''}
              />
              {fieldErrors.walletNumber && <p className="field-error">{fieldErrors.walletNumber}</p>}
            </div>
          </div>
        ) : (
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

          {/* bank form, a loading text, the saved account, or a no account message */}
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
        )}

        {/* payout form - amount, month, note and how it is paid */}
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

          {/* reference (or wallet transaction ID) and transfer date */}
          {isDirect && (
            <>
              <p className="field-help" style={{ marginTop: 0, marginBottom: '12px' }}>
                {isWallet
                  ? `Send the amount from the institute's ${chosen.label} to the number above, then enter the transaction ID from the confirmation SMS.`
                  : 'Send the amount to the account above from your online banking or at the bank, then enter the reference number shown on the bank\'s confirmation.'}
              </p>
              <div className="card-field-row">
                <div className="form-field">
                  <label htmlFor="bank-reference">{isWallet ? 'Transaction ID' : 'Bank reference number'}</label>
                  <input
                    id="bank-reference"
                    type="text"
                    placeholder={isWallet ? 'e.g. 9F2K7Q1X' : 'e.g. CEFT 240926001234'}
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

          {/* bank file note - download the file, upload it to the bank, then mark it paid */}
          {chosen.value === 'BANK_FILE' && (
            <p className="field-help" style={{ marginTop: 0 }}>
              The payout waits in the bank file. Download the file from this page, upload it to your
              corporate online banking, then mark it as paid.
            </p>
          )}

          <Alert type="error" message={formError} />

          {/* cancel and record payment btns */}
          <div className="flex-between" style={{ marginTop: '18px' }}>
            <button type="button" className="btn btn-secondary" disabled={isSubmitting} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting || (isEditingBank && !isWallet)}>
              {isSubmitting
                ? 'Saving...'
                : isDirect
                  ? 'Record payment'
                  : chosen.value === 'BANK_FILE'
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
