// Student: type today's class code to self check-in - A/L classes only,
// see attendance.service.js for the code's rules (today only, expires fast).
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { selfCheckIn } from '../../api/attendanceApi';
import Alert from '../../../../../shared/client/src/components/common/Alert';
import PortalShell from '../../../../../shared/client/src/components/layout/PortalShell';
import { getNavItems } from '../../components/layout/navItems';
import { useAuth } from '../../context/AuthContext';

function SelfCheckInPage() {
  const { user } = useAuth();
  const NAV_ITEMS = getNavItems(user.role);

  const [code, setCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState(null); // { success, message }

  async function handleSubmit(event) {
    event.preventDefault();
    setIsSubmitting(true);
    setResult(null);
    try {
      const response = await selfCheckIn(code);
      setResult({ success: true, message: response.message });
      setCode('');
    } catch (error) {
      setResult({ success: false, message: error.message });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <PortalShell navItems={NAV_ITEMS}>
      <div className="page">
        <div className="card" style={{ maxWidth: '420px', margin: '40px auto', textAlign: 'center' }}>
          <h1>Mark My Attendance</h1>
          <p className="muted">Ask your tutor for today&apos;s class code and enter it below.</p>

          {result && <Alert type={result.success ? 'success' : 'error'} message={result.message} />}

          <form onSubmit={handleSubmit}>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              style={{
                fontSize: '1.8rem',
                textAlign: 'center',
                letterSpacing: '8px',
                width: '100%',
                margin: '14px 0',
              }}
              required
            />
            <button
              type="submit"
              className="btn btn-primary btn-block"
              disabled={isSubmitting || code.length !== 6}
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
