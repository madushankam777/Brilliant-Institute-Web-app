// payment return page - shows the result, never decides it
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { fetchPaymentStatus } from '../../api/paymentApi';
import LoadingSpinner from '../../../../../shared/client/src/components/common/LoadingSpinner';
import Alert from '../../../../../shared/client/src/components/common/Alert';
import Icon from '../../../../../shared/client/src/components/common/Icon';
import PortalShell from '../../../../../shared/client/src/components/layout/PortalShell';
import { getNavItems } from '../../components/layout/navItems';

// the side menu for a student
const NAV_ITEMS = getNavItems('STUDENT_PARENT');

// ask the server for the payment status every 2 seconds
const POLL_INTERVAL_MS = 2000;
const MAX_POLLS = 15; // ~30s, then stop and let them check their history

// a number as LKR money
function formatCurrency(amount) {
  return new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' }).format(amount);
}

// payment return page - where PayHere sends the student back; it only shows the result
function PaymentReturnPage() {
  const [searchParams] = useSearchParams();
  const paymentId = searchParams.get('payment');
  const wasCancelled = searchParams.get('cancelled') === '1';

  const [payment, setPayment] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [stillWaiting, setStillWaiting] = useState(true);
  const pollCountRef = useRef(0);

  // ask the server for the payment status (only the server decides the result)
  const load = useCallback(async () => {
    if (!paymentId) {
      setErrorMessage('No payment reference was supplied.');
      setStillWaiting(false);
      return true;
    }
    try {
      const latest = await fetchPaymentStatus(paymentId);
      setPayment(latest);
      // PENDING means the gateway's confirmation hasn't reached us yet.
      if (latest.status !== 'PENDING') {
        setStillWaiting(false);
        return true;
      }
    } catch (error) {
      setErrorMessage(error.message);
      setStillWaiting(false);
      return true;
    }
    return false;
  }, [paymentId]);

  // keep checking while the payment is still pending (about 30 seconds)
  useEffect(() => {
    let timerId;
    let cancelled = false;

    // check once, then again after 2 seconds until it is settled
    async function poll() {
      const done = await load();
      if (cancelled || done) return;

      pollCountRef.current += 1;
      if (pollCountRef.current >= MAX_POLLS) {
        setStillWaiting(false);
        return;
      }
      timerId = setTimeout(poll, POLL_INTERVAL_MS);
    }

    poll();
    return () => {
      cancelled = true;
      if (timerId) clearTimeout(timerId);
    };
  }, [load]);

  const status = payment ? payment.status : null;

  return (
    <PortalShell navItems={NAV_ITEMS}>
      <div className="page">
        <div className="card" style={{ maxWidth: '520px', margin: '32px auto', textAlign: 'center' }}>
          <Alert type="error" message={errorMessage} />

          {/* waiting - a spinner while the payment is confirmed */}
          {stillWaiting && (
            <>
              <LoadingSpinner label="Confirming your payment with the bank..." />
              <p className="muted">
                Please don&apos;t close this page - this usually takes a few seconds.
              </p>
            </>
          )}

          {/* successful - class, amount and receipt number */}
          {!stillWaiting && status === 'SUCCESSFUL' && (
            <>
              <div className="auth-result-icon">
                <Icon name="checkCircle" size={30} />
              </div>
              <h1>Payment Successful</h1>
              <p className="muted">Your balance has been updated.</p>

              <div className="card" style={{ background: 'var(--color-bg)', textAlign: 'left', boxShadow: 'none' }}>
                <div className="order-line">
                  <span className="order-line-sub">Class</span>
                  <span className="order-line-title">{payment.subject}</span>
                </div>
                <div className="order-line">
                  <span className="order-line-sub">Amount Paid</span>
                  <span className="order-line-title" style={{ color: 'var(--color-primary)' }}>
                    {formatCurrency(payment.amount)}
                  </span>
                </div>
                {payment.receiptNumber && (
                  <div className="order-line">
                    <span className="order-line-sub">Receipt No.</span>
                    <span className="order-line-title">{payment.receiptNumber}</span>
                  </div>
                )}
              </div>

              <Link to="/payments/history" className="btn btn-primary btn-block">
                View Payment History
              </Link>
            </>
          )}

          {/* failed or cancelled - nothing was charged */}
          {!stillWaiting && (status === 'FAILED' || wasCancelled) && (
            <>
              <div
                className="auth-result-icon"
                style={{ background: 'var(--color-danger-bg)', color: 'var(--color-danger)' }}
              >
                <Icon name="xCircle" size={30} />
              </div>
              <h1>{wasCancelled ? 'Payment Cancelled' : 'Payment Failed'}</h1>
              <p className="muted">
                {wasCancelled
                  ? 'You cancelled the payment, so nothing was charged.'
                  : 'Your payment was not completed and nothing was charged. Please try again, or use Bank Transfer.'}
              </p>
              <Link to="/payments" className="btn btn-primary btn-block">
                Back to Fees &amp; Payments
              </Link>
            </>
          )}

          {/* still pending - the bank has not confirmed yet */}
          {!stillWaiting && status === 'PENDING' && !wasCancelled && (
            <>
              <div
                className="auth-result-icon"
                style={{ background: 'var(--color-warning-bg)', color: 'var(--color-warning)' }}
              >
                <Icon name="clock" size={30} />
              </div>
              <h1>Payment Processing</h1>
              <p className="muted">
                Your bank hasn&apos;t confirmed this payment yet. It will appear in your payment
                history as soon as it clears - you don&apos;t need to pay again.
              </p>
              <Link to="/payments/history" className="btn btn-primary btn-block">
                View Payment History
              </Link>
            </>
          )}

          {/* back to the dashboard link */}
          <p className="auth-footer-note">
            <Link to="/">Back to Dashboard</Link>
          </p>
        </div>
      </div>
    </PortalShell>
  );
}

export default PaymentReturnPage;
