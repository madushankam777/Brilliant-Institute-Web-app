// Student: type the key the tutor gave in class to mark yourself Present -
// see attendance.service.js for the key's rules (only works if you're
// enrolled in that class, expires after a short while).
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { selfCheckIn } from '../../api/attendanceApi';
import Alert from '../../../../shared/client/src/components/common/Alert';
import PortalShell from '../../../../shared/client/src/components/layout/PortalShell';
import { getNavItems } from '../../../../shared/client/src/components/layout/navItems';
import { useAuth } from '../../context/AuthContext';

function SelfCheckInPage() {
  const { user } = useAuth();
  const NAV_ITEMS = getNavItems(user.role);

  const [code, setCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [codeError, setCodeError] = useState('');
  const [result, setResult] = useState(null); // { success, message }

  async function handleSubmit(event) {
    event.preventDefault();
    setResult(null);

    const entered = code.trim();
    if (!entered) {
      setCodeError('Enter the 6-digit key your tutor showed you.');
      return;
    }
    if (!/^\d{6}$/.test(entered)) {
      setCodeError('The key is exactly 6 digits, numbers only.');
      return;
    }
    setCodeError('');

    setIsSubmitting(true);
    try {
      const response = await selfCheckIn(code);
      setResult({ success: true, message: response.message });
      setCode('');
    } catch (error) {
      const details = Array.isArray(error.details) ? error.details : [];
      const codeDetail = details.find((d) => d.field === 'code');
      if (codeDetail) setCodeError(codeDetail.message);
      else setResult({ success: false, message: error.message });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <PortalShell navItems={NAV_ITEMS}>
      <div className="page">
        <div className="card" style={{ maxWidth: '420px', margin: '40px auto', textAlign: 'center' }}>
          <h1>Mark My Attendance</h1>
          <p className="muted">Ask your tutor for today&apos;s attendance key and enter it below.</p>

          {result && <Alert type={result.success ? 'success' : 'error'} message={result.message} />}

          <form onSubmit={handleSubmit} noValidate>
            <div className="form-field">
            <label htmlFor="checkinCode">Attendance key</label>
            <input
              id="checkinCode"
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) => {
                setCode(e.target.value.replace(/\D/g, ''));
                setCodeError('');
              }}
              aria-invalid={Boolean(codeError)}
              style={{
                fontSize: '1.8rem',
                textAlign: 'center',
                letterSpacing: '8px',
                width: '100%',
                margin: '14px 0',
              }}
            />
            {codeError ? (
              <p className="field-error">{codeError}</p>
            ) : (
              <p className="field-help">{code.length}/6 digits entered.</p>
            )}
            </div>
            <button
              type="submit"
              className="btn btn-primary btn-block"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Checking in...' : 'Check In'}
            </button>
          </form>

          <p className="auth-footer-note">
            <Link to="/">Back to Dashboard</Link>
          </p>
        </div>
      </div>
    </PortalShell>
  );
}

export default SelfCheckInPage;
