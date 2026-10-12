// Admin: institute bank / wallet details for checkout
import { useEffect, useState } from 'react';
import { fetchPaymentSettings, updatePaymentSettings } from '../../api/paymentApi';
import LoadingSpinner from '../../../../../shared/client/src/components/common/LoadingSpinner';
import Alert from '../../../../../shared/client/src/components/common/Alert';
import FormField from '../../../../../shared/client/src/components/common/FormField';
import PortalShell from '../../../../../shared/client/src/components/layout/PortalShell';
import { getNavItems } from '../../components/layout/navItems';

const NAV_ITEMS = getNavItems('ADMIN');

const ACCOUNT_NUMBER_REGEX = /^[0-9 -]{4,34}$/;
const WALLET_PHONE_REGEX = /^(?:\+94|0)7\d{8}$/;

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

// payment settings
function PaymentSettingsPage() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

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

  function updateField(field, value) {
    setForm((previous) => ({ ...previous, [field]: value }));
  }

  function validate() {
    const errors = {};
    if (form.bankAccountNumber.trim() && !ACCOUNT_NUMBER_REGEX.test(form.bankAccountNumber.trim())) {
      errors.bankAccountNumber = 'Enter a valid account number (digits, spaces, and dashes only).';
    }
    if (form.ezCashNumber.trim() && !WALLET_PHONE_REGEX.test(form.ezCashNumber.trim())) {
      errors.ezCashNumber = 'Enter a valid eZ Cash mobile number (e.g. 0771234567).';
    }
    if (form.mcashNumber.trim() && !WALLET_PHONE_REGEX.test(form.mcashNumber.trim())) {
      errors.mcashNumber = 'Enter a valid mCash mobile number (e.g. 0771234567).';
    }
    return errors;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaveError('');
    setSaveMessage('');

    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setSaveError('Please fix the highlighted fields.');
      return;
    }

    setIsSaving(true);
    try {
      await updatePaymentSettings(form);
      setSaveMessage('Payment settings saved. Students will see the updated details at checkout.');
    } catch (error) {
      setSaveError(error.message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <PortalShell navItems={NAV_ITEMS}>
      <div className="page">
        <div className="page-header">
          <h1>Payment Settings</h1>
          <p className="muted">
            Where student payments go. These details show up on the Bank Transfer, eZ Cash, and mCash
            tabs at checkout.
          </p>
        </div>

        <Alert type="error" message={loadError} />

        {isLoading ? (
          <LoadingSpinner label="Loading payment settings..." />
        ) : (
          <div className="card">
            <Alert type="success" message={saveMessage} />
            <Alert type="error" message={saveError} />

            <form onSubmit={handleSubmit} noValidate>
              <h2 style={{ fontSize: '0.95rem' }}>Bank transfer</h2>
              <FormField
                id="bankName"
                label="Bank name"
                placeholder="e.g. People's Bank"
                value={form.bankName}
                onChange={(e) => updateField('bankName', e.target.value)}
              />
              <FormField
                id="bankAccountName"
                label="Account name"
                placeholder="e.g. Brilliant Institute (Pvt) Ltd"
                value={form.bankAccountName}
                onChange={(e) => updateField('bankAccountName', e.target.value)}
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
                />
                <FormField
                  id="bankSwift"
                  label="SWIFT code (optional)"
                  placeholder="e.g. PSBKLKLX"
                  value={form.bankSwift}
                  onChange={(e) => updateField('bankSwift', e.target.value)}
                />
              </div>

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

              <button type="submit" className="btn btn-primary" disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save payment settings'}
              </button>
            </form>
          </div>
        )}
      </div>
    </PortalShell>
  );
}

export default PaymentSettingsPage;
