// Student: type the key the office gave you to confirm next year's place.
import { useCallback, useEffect, useState } from 'react';
import { fetchMyReregistrationStatus, redeemReregistrationKey } from '../../api/adminApi';
import LoadingSpinner from '../../../../shared/client/src/components/common/LoadingSpinner';
import Alert from '../../../../shared/client/src/components/common/Alert';
import PortalShell from '../../../../shared/client/src/components/layout/PortalShell';
import { getNavItems } from '../../../../shared/client/src/components/layout/navItems';
import useFormErrors from '../../../../shared/client/src/hooks/useFormErrors';
import { useAuth } from '../../context/AuthContext';

function ReregisterPage() {
  const { user } = useAuth();
  const NAV_ITEMS = getNavItems(user.role);

  const [status, setStatus] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [keyCode, setKeyCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const { fieldErrors, formError, validate, captureError, clearFieldError } = useFormErrors();

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      setStatus(await fetchMyReregistrationStatus());
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
    setSuccessMessage('');

    const trimmed = keyCode.trim();
    if (
      !validate({
        keyCode: !trimmed
          ? 'Enter the key the office gave you.'
          : trimmed.length < 8
            ? 'That key looks too short - check it and try again.'
            : '',
      })
    ) {
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await redeemReregistrationKey(trimmed);
      setSuccessMessage(result.message);
      setKeyCode('');
      await load();
    } catch (error) {
      captureError(error);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <PortalShell navItems={NAV_ITEMS}>
      <div className="page">
        <div className="page-header">
          <h1>Re-register</h1>
          <p className="muted">
            Confirm your place for next year. Ask the institute office for your re-registration key,
            then enter it below.
          </p>
        </div>

        <Alert type="error" message={loadError} />

        {isLoading ? (
          <LoadingSpinner label="Loading..." />
        ) : (
          <>
            <div className="card">
              <h2>Where you stand</h2>
              <p>
                You are currently in <strong>{status?.grade || 'no grade on record'}</strong>.
              </p>
              {status?.isConfirmedForNextYear ? (
                <p className="callout" style={{ background: 'var(--color-success-bg)', borderColor: '#bbf7d0' }}>
                  Your place for {status.nextYear} is confirmed. You move into{' '}
                  <strong>{status.nextGrade || 'your next grade'}</strong> on 1 January - nothing
                  else to do.
                </p>
              ) : status?.isFinalGrade ? (
                <p className="callout">
                  You are in the final grade, so you finish at the end of this year. Talk to the
                  office if you are continuing with us.
                </p>
              ) : (
                <p className="callout">
                  You have not re-registered for {status?.nextYear} yet. If you do not, your account
                  will be closed on 1 January.
                </p>
              )}
            </div>

            {status?.isOpen === false && (
              <p className="callout">Re-registration is not open yet. The office will let you know when it is.</p>
            )}

            {status?.isOpen !== false && !status?.isConfirmedForNextYear && (
              <div className="card">
                <h2>Enter your key</h2>

                <Alert type="success" message={successMessage} />
                <Alert type="error" message={formError} />

                <form onSubmit={handleSubmit} noValidate>
                  <div className="form-field">
                    <label htmlFor="keyCode">Re-registration key</label>
                    <input
                      id="keyCode"
                      type="text"
                      placeholder="REG-XXXX-XXXX-XXXX"
                      value={keyCode}
                      onChange={(e) => {
                        setKeyCode(e.target.value.toUpperCase());
                        clearFieldError('keyCode');
                      }}
                      autoComplete="off"
                      style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}
                    />
                    <p className="field-help">
                      The office gives this to you directly. It only works for your own account.
                    </p>
                    {fieldErrors.keyCode && <p className="field-error">{fieldErrors.keyCode}</p>}
                  </div>

                  <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                    {isSubmitting ? 'Checking...' : 'Confirm my place'}
                  </button>
                </form>
              </div>
            )}
          </>
        )}
      </div>
    </PortalShell>
  );
}

export default ReregisterPage;
