// Admin: institute bank / wallet details for checkout
import { useEffect, useState } from 'react';
import { fetchPaymentSettings, updatePaymentSettings } from '../../api/paymentApi';
import LoadingSpinner from '../../../../shared/client/src/components/common/LoadingSpinner';
import Alert from '../../../../shared/client/src/components/common/Alert';
import FormField from '../../../../shared/client/src/components/common/FormField';
import PortalShell from '../../../../shared/client/src/components/layout/PortalShell';
import { getNavItems } from '../../../../shared/client/src/components/layout/navItems';
import useFormErrors from '../../../../shared/client/src/hooks/useFormErrors';
import ModalClose from '../../../../shared/client/src/components/common/ModalClose';
import ReportLink from '../../../../shared/client/src/components/common/ReportLink';

// the side menu for an admin
const NAV_ITEMS = getNavItems('ADMIN');

// payment methods the admin can switch on or off
const METHOD_OPTIONS = [
  { value: 'BANK_TRANSFER', label: 'Bank transfer', help: 'Students upload a slip and you check it on Payment Verification.' },
  { value: 'CARD', label: 'Card', help: 'Visa / Mastercard at checkout.' },
  { value: 'EZ_CASH', label: 'eZ Cash', help: 'Dialog eZ Cash mobile wallet.' },
  { value: 'MCASH', label: 'mCash', help: 'Mobitel mCash mobile wallet.' },
  {
    value: 'PAYPAL',
    label: 'PayPal',
    help: 'PayPal balance or any debit / credit card.',
  },
];

// a blank settings form
const EMPTY_FORM = {
  bankName: '',
  bankAccountName: '',
  bankAccountNumber: '',
  bankBranch: '',
  bankSwift: '',
  ezCashNumber: '',
  mcashNumber: '',
};

// payment settings - the bank and wallet details students see at checkout, and which methods are on
function PaymentSettingsPage() {
  // the settings form and the page state
  const [form, setForm] = useState(EMPTY_FORM);
  const [enabledMethods, setEnabledMethods] = useState(['BANK_TRANSFER']);
  // turning a method off - admin must type REMOVE
  const [pendingRemove, setPendingRemove] = useState(null);
  const [removeText, setRemoveText] = useState('');
  const [removeConfirmed, setRemoveConfirmed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const { fieldErrors, formError, validate, captureError, clearFieldError } = useFormErrors();
  const [saveMessage, setSaveMessage] = useState('');

  // load the saved settings when the page opens
  useEffect(() => {
    let isMounted = true;
    fetchPaymentSettings()
      .then((settings) => {
        if (!isMounted) return;
        setForm({
          bankName: settings.bankName || '',
          bankAccountName: settings.bankAccountName || '',
          bankAccountNumber: settings.bankAccountNumber || '',
          bankBranch: settings.bankBranch || '',
          bankSwift: settings.bankSwift || '',
          ezCashNumber: settings.ezCashNumber || '',
          mcashNumber: settings.mcashNumber || '',
        });
        setEnabledMethods(settings.enabledMethods || ['BANK_TRANSFER']);
      })
      .catch((error) => {
        if (isMounted) setLoadError(error.message);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  // change one field and clear its error
  function updateField(field, value) {
    setForm((previous) => ({ ...previous, [field]: value }));
    clearFieldError(field);
  }

  // Same shapes the server checks for, so a typo is caught here first.
  const ACCOUNT_PATTERN = /^[0-9 -]{4,34}$/;
  const WALLET_PATTERN = /^(?:\+94|0)7\d{8}$/;

  // check the bank and wallet fields before saving
  function validateSettings() {
    return validate({
      bankName: form.bankName.length > 100 && 'Bank name must be 100 characters or fewer.',
      bankAccountName: form.bankAccountName.length > 150 && 'Account name must be 150 characters or fewer.',
      bankAccountNumber:
        form.bankAccountNumber.trim() &&
        !ACCOUNT_PATTERN.test(form.bankAccountNumber.trim()) &&
        'Use 4-34 digits, spaces or dashes only.',
      bankBranch: form.bankBranch.length > 100 && 'Branch must be 100 characters or fewer.',
      bankSwift: form.bankSwift.length > 20 && 'SWIFT code must be 20 characters or fewer.',
      ezCashNumber:
        form.ezCashNumber.trim() &&
        !WALLET_PATTERN.test(form.ezCashNumber.trim()) &&
        'Enter a valid mobile number, e.g. 0771234567.',
      mcashNumber:
        form.mcashNumber.trim() &&
        !WALLET_PATTERN.test(form.mcashNumber.trim()) &&
        'Enter a valid mobile number, e.g. 0771234567.',
    });
  }

  // switch a method on, or ask to confirm before turning it off
  function toggleMethod(value) {
    setSaveMessage('');
    if (enabledMethods.includes(value)) {
      setPendingRemove(METHOD_OPTIONS.find((option) => option.value === value));
      setRemoveText('');
      return;
    }
    setEnabledMethods((current) => [...current, value]);
  }

  // confirm remove btn
  function confirmRemove() {
    setEnabledMethods((current) => current.filter((item) => item !== pendingRemove.value));
    setRemoveConfirmed(true);
    setPendingRemove(null);
  }

  // save payment settings btn - check the fields, then save
  async function handleSubmit(event) {
    event.preventDefault();
    setSaveMessage('');
    if (!validateSettings()) return;

    setIsSaving(true);
    try {
      await updatePaymentSettings({ ...form, enabledMethods, confirmText: removeConfirmed ? 'REMOVE' : undefined });
      setRemoveConfirmed(false);
      setSaveMessage('Payment settings saved. Students will see the updated details at checkout.');
    } catch (error) {
      captureError(error);
    } finally {
      setIsSaving(false);
    }
  }

  // the page - title, the settings form and the turn off pop-up
  return (
    <PortalShell navItems={NAV_ITEMS}>
      <div className="page">
        <div className="flex-between page-header">
          <div>
            <h1>Payment Settings</h1>
            <p className="muted">
              Choose how students can pay, and the account they send money to. Students see changes as soon as you
              save.
            </p>
          </div>
          <ReportLink type="finance" label="Payments report" />
        </div>

        <Alert type="error" message={loadError} />

        {/* a spinner, or the settings form */}
        {isLoading ? (
          <LoadingSpinner label="Loading payment settings..." />
        ) : (
          <div className="card">
            <Alert type="success" message={saveMessage} />
            <Alert type="error" message={formError} />

            <form onSubmit={handleSubmit} noValidate>
              {/* payment methods on / off */}
              <h2 style={{ fontSize: '0.95rem' }}>Payment methods students can use</h2>
              <div className="method-switches">
                {METHOD_OPTIONS.map((option) => {
                  const isOn = enabledMethods.includes(option.value);
                  return (
                    <label key={option.value} className={`method-switch${isOn ? ' is-on' : ''}`}>
                      <span>
                        <strong>{option.label}</strong>
                        <span className="order-line-sub">{option.help}</span>
                      </span>
                      <input
                        type="checkbox"
                        role="switch"
                        className="switch"
                        checked={isOn}
                        onChange={() => toggleMethod(option.value)}
                        aria-label={`${option.label} ${isOn ? 'on' : 'off'}`}
                      />
                    </label>
                  );
                })}
              </div>
              {/* warning - with every method off students can only pay at the office */}
              {enabledMethods.length === 0 && (
                <p className="field-error">With every method off, students can only pay at the office.</p>
              )}

              {/* bank transfer details - the account students send money to */}
              <h2 style={{ fontSize: '0.95rem', marginTop: '24px' }}>Bank transfer</h2>
              <FormField
                id="bankName"
                label="Bank name"
                placeholder="e.g. People's Bank"
                value={form.bankName}
                onChange={(e) => updateField('bankName', e.target.value)}
                error={fieldErrors.bankName}
              />
              <FormField
                id="bankAccountName"
                label="Account name"
                placeholder="e.g. Brilliant Institute (Pvt) Ltd"
                value={form.bankAccountName}
                onChange={(e) => updateField('bankAccountName', e.target.value)}
                error={fieldErrors.bankAccountName}
              />
              <FormField
                id="bankAccountNumber"
                label="Account number"
                placeholder="e.g. 100-2-001-5-0123456"
                value={form.bankAccountNumber}
                onChange={(e) => updateField('bankAccountNumber', e.target.value)}
                error={fieldErrors.bankAccountNumber}
              />
              <div className="card-field-row">
                <FormField
                  id="bankBranch"
                  label="Branch"
                  placeholder="e.g. Colombo 07"
                  value={form.bankBranch}
                  onChange={(e) => updateField('bankBranch', e.target.value)}
                error={fieldErrors.bankBranch}
                />
                <FormField
                  id="bankSwift"
                  label="SWIFT code (optional)"
                  placeholder="e.g. PSBKLKLX"
                  value={form.bankSwift}
                  onChange={(e) => updateField('bankSwift', e.target.value)}
                error={fieldErrors.bankSwift}
                />
              </div>

              {/* mobile wallet numbers - eZ Cash and mCash */}
              <h2 style={{ fontSize: '0.95rem', marginTop: '24px' }}>Mobile wallets</h2>
              <p className="field-help" style={{ marginTop: '-8px' }}>
                Shown to students so they know which number to send their eZ Cash / mCash payment to.
                Leave blank to hide that tab&apos;s callout.
              </p>
              <div className="card-field-row">
                <FormField
                  id="ezCashNumber"
                  label="eZ Cash number"
                  type="tel"
                  placeholder="07XXXXXXXX"
                  value={form.ezCashNumber}
                  onChange={(e) => updateField('ezCashNumber', e.target.value)}
                error={fieldErrors.ezCashNumber}
                />
                <FormField
                  id="mcashNumber"
                  label="mCash number"
                  type="tel"
                  placeholder="07XXXXXXXX"
                  value={form.mcashNumber}
                  onChange={(e) => updateField('mcashNumber', e.target.value)}
                error={fieldErrors.mcashNumber}
                />
              </div>

              {/* save btn */}
              <button type="submit" className="btn btn-primary" disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save payment settings'}
              </button>
            </form>
          </div>
        )}
      </div>

      {/* turn off pop-up - REMOVE must be typed to confirm */}
      {pendingRemove && (
        <div className="modal-overlay" onClick={() => setPendingRemove(null)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <ModalClose onClose={() => setPendingRemove(null)} />
            <h2>Turn off {pendingRemove.label}?</h2>
            <p className="muted">
              Students will no longer see <strong>{pendingRemove.label}</strong> at checkout. Type{' '}
              <strong>REMOVE</strong> to confirm.
            </p>
            <div className="form-field">
              <label htmlFor="remove-confirm">Type REMOVE</label>
              <input
                id="remove-confirm"
                value={removeText}
                autoComplete="off"
                placeholder="REMOVE"
                onChange={(e) => setRemoveText(e.target.value)}
                autoFocus
              />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setPendingRemove(null)}>
                Keep it on
              </button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={removeText.trim().toUpperCase() !== 'REMOVE'}
                onClick={confirmRemove}
              >
                Turn off
              </button>
            </div>
            <p className="field-help" style={{ marginBottom: 0 }}>Click Save payment settings afterwards to apply it.</p>
          </div>
        </div>
      )}
    </PortalShell>
  );
}

export default PaymentSettingsPage;
