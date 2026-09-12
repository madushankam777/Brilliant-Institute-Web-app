// Student: scanning the Tutor's QR code lands here and self-checks-in -
// A/L classes only, and only for today's session (see attendance.service.js).
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { checkInWithQr } from '../../api/attendanceApi';
import Icon from '../../../../../shared/client/src/components/common/Icon';
import LoadingSpinner from '../../../../../shared/client/src/components/common/LoadingSpinner';
import PortalShell from '../../../../../shared/client/src/components/layout/PortalShell';
import { getNavItems } from '../../../../../shared/client/src/components/layout/navItems';
import { useAuth } from '../../context/AuthContext';

function CheckInPage() {
  const { sessionId } = useParams();
  const { user } = useAuth();
  const NAV_ITEMS = getNavItems(user.role);

  const [status, setStatus] = useState('loading'); // loading | success | error
  const [message, setMessage] = useState('');

  useEffect(() => {
    let isMounted = true;
    checkInWithQr(sessionId)
      .then((response) => {
        if (!isMounted) return;
        setStatus('success');
        setMessage(response.message);
      })
      .catch((error) => {
        if (!isMounted) return;
        setStatus('error');
        setMessage(error.message);
      });
    return () => {
      isMounted = false;
    };
  }, [sessionId]);

  return (
    <PortalShell navItems={NAV_ITEMS}>
      <div className="page">
        <div className="card auth-result" style={{ maxWidth: '440px', margin: '40px auto' }}>
          {status === 'loading' && <LoadingSpinner label="Checking you in..." />}

          {status === 'success' && (
            <>
              <div className="auth-result-icon">
                <Icon name="checkCircle" size={30} />
              </div>
              <h2>You&apos;re Checked In</h2>
              <p className="muted">{message}</p>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="auth-result-icon" style={{ background: 'var(--color-danger-bg)', color: 'var(--color-danger)' }}>
                <Icon name="xCircle" size={30} />
              </div>
              <h2>Check-In Failed</h2>
              <p className="muted">{message}</p>
            </>
          )}

          <div className="result-actions">
            <Link to="/" className="btn btn-primary btn-block">
              Back to Dashboard
            </Link>
          </div>
        </div>
      </div>
    </PortalShell>
  );
}

export default CheckInPage;
