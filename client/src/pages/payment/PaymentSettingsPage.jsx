// Admin: the institute's own receiving details, shown to students at checkout
// on the Bank Transfer / eZ Cash / mCash tabs.
import { useEffect, useState } from 'react';
import { fetchPaymentSettings, updatePaymentSettings } from '../../api/paymentApi';
import LoadingSpinner from '../../../../shared/client/src/components/common/LoadingSpinner';
import Alert from '../../../../shared/client/src/components/common/Alert';
import FormField from '../../../../shared/client/src/components/common/FormField';
import PortalShell from '../../../../shared/client/src/components/layout/PortalShell';
import { getNavItems } from '../../../../shared/client/src/components/layout/navItems';
import useFormErrors from '../../../../shared/client/src/hooks/useFormErrors';

const NAV_ITEMS = getNavItems('ADMIN');

const EMPTY_FORM = {
  bankName: '',
  bankAccountName: '',
  bankAccountNumber: '',
  bankBranch: '',
  bankSwift: '',
  ezCashNumber: '',
  mcashNumber: '',
};

function PaymentSettingsPage() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const { fieldErrors, formError, validate, captureError, clearFieldError } = useFormErrors();
  const [saveMessage, setSaveMessage] = useState('');

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
    clearFieldError(field);
  }

  // Same shapes the server checks for, so a typo is caught here first.
  const ACCOUNT_PATTERN = /^[0-9 -]{4,34}$/;
  const WALLET_PATTERN = /^(?:\+94|0)7\d{8}$/;

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

  async function handleSubmit(event) {
    event.preventDefault();
    setSaveMessage('');
    if (!validateSettings()) return;

    setIsSaving(true);
    try {
      await updatePaymentSettings(form);
      setSaveMessage('Payment settings saved. Students will see the updated details at checkout.');
    } catch (error) {
      captureError(error);
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
            The account students send money to. These details appear on the Bank Transfer, eZ Cash,
            and mCash tabs at checkout, and every student sees the change immediately after you save.
          </p>
        </div>

        <div className="callout">
          <span>
            <strong>Card payments don&apos;t come here.</strong> Card, eZ Cash, and mCash paid online go
            through PayHere first, and PayHere settles them into the bank account registered on your
            PayHere merchant account - changing the number below does not redirect card money. To
            change where card money lands, update the bank account in your PayHere dashboard. The
            account below is what students use for <strong>manual bank transfers</strong>.
          </span>
        </div>

        <Alert type="error" message={loadError} />

        {isLoading ? (
          <LoadingSpinner label="Loading payment settings..." />
        ) : (
          <div className="card">
            <Alert type="success" message={saveMessage} />
            <Alert type="error" message={formError} />

            <form onSubmit={handleSubmit} noValidate>
              <h2 style={{ fontSize: '0.95rem' }}>Bank transfer</h2>
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
