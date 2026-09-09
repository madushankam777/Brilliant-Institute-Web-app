// Student/Parent: view balance, pay online
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { fetchMyBalances, makePayment } from '../../api/paymentApi';
import LoadingSpinner from '../../../../shared/client/src/components/common/LoadingSpinner';
import Alert from '../../../../shared/client/src/components/common/Alert';
import Icon from '../../../../shared/client/src/components/common/Icon';
import PortalShell from '../../../../shared/client/src/components/layout/PortalShell';
import { getNavItems } from '../../../../shared/client/src/components/layout/navItems';

const NAV_ITEMS = getNavItems("STUDENT_PARENT");

const PAYMENT_METHODS = [
  { value: 'CARD', label: 'Card' },
  { value: 'EZ_CASH', label: 'eZ Cash' },
  { value: 'MCASH', label: 'mCash' },
  { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
];

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' }).format(amount);
}

const emptyCardDetails = { cardholderName: '', cardNumber: '', expiryDate: '', cvv: '', saveCard: false };

function FeeBalancePage() {
  const navigate = useNavigate();
  const [balances, setBalances] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [activeEnrollment, setActiveEnrollment] = useState(null);
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('CARD');
  // Card fields are UI-only and never sent to the server or the API - see
  // the "never stored" note under the Pay button, and server/paymentGateway.js.
  const [cardDetails, setCardDetails] = useState(emptyCardDetails);
  const [isPaying, setIsPaying] = useState(false);
  const [payError, setPayError] = useState('');
  const [outcome, setOutcome] = useState(null); // { status: 'SUCCESSFUL' | 'FAILED' | 'PENDING', payment? }

  const loadBalances = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const data = await fetchMyBalances();
      setBalances(data);
    } catch (error) {
      setLoadError(error.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBalances();
  }, [loadBalances]);

  function startPayment(enrollment) {
    setActiveEnrollment(enrollment);
    setAmount(String(enrollment.balance));
    setPaymentMethod('CARD');
    setCardDetails(emptyCardDetails);
    setPayError('');
    setOutcome(null);
  }

  function updateCardField(field, value) {
    setCardDetails((previous) => ({ ...previous, [field]: value }));
  }

  async function handlePaySubmit(event) {
    event.preventDefault();
    setPayError('');
    setIsPaying(true);

    const parsedAmount = Number(amount);
    if (!(parsedAmount > 0)) {
      setPayError('Please enter a valid amount greater than zero.');
      setIsPaying(false);
      return;
    }

    try {
      const payment = await makePayment({
        enrollmentId: activeEnrollment.enrollmentId,
        amount: parsedAmount,
        paymentMethod,
      });
      setOutcome({ status: payment.status, payment });
      setActiveEnrollment(null);
      await loadBalances();
    } catch (error) {
      setOutcome({ status: 'FAILED', reason: error.message, enrollment: activeEnrollment });
      setActiveEnrollment(null);
    } finally {
      setIsPaying(false);
    }
  }

  const totalOutstanding = balances.reduce((sum, b) => sum + Number(b.balance), 0);
  const inCheckout = Boolean(activeEnrollment);

  return (
    <PortalShell navItems={NAV_ITEMS}>
      <div className="page">
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link to="/">Dashboard</Link>
          <span className="breadcrumb-sep">/</span>
          {inCheckout ? (
            <button type="button" onClick={() => setActiveEnrollment(null)}>
              Fees &amp; Payments
            </button>
          ) : (
            <span className="breadcrumb-current">Fees &amp; Payments</span>
          )}
          {inCheckout && (
            <>
              <span className="breadcrumb-sep">/</span>
              <span className="breadcrumb-current">Checkout</span>
            </>
          )}
        </nav>

        <div className="page-header">
          {inCheckout ? (
            <>
              <h1>Secure Checkout</h1>
              <p className="muted">Complete your transaction securely via integrated payment gateways.</p>
            </>
          ) : (
            <>
              <h1>Fees &amp; Payments</h1>
              <p className="muted">Keep track of active bills, due dates, and pay your outstanding balance online.</p>
            </>
          )}
        </div>

        <Alert type="error" message={loadError} />

        {isLoading ? (
          <LoadingSpinner label="Loading your fee balance..." />
        ) : (
          <>
            {!inCheckout && (
              <div
                className="card"
                style={{
                  background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-darker))',
                  color: '#fff',
                  border: 'none',
                }}
              >
                <div className="flex-between">
                  <div>
                    <p style={{ color: '#dbeafe', margin: 0, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>
                      Total Outstanding
                    </p>
                    <p style={{ fontSize: '2.1rem', fontWeight: 800, margin: '4px 0 0' }}>
                      {formatCurrency(totalOutstanding)}
                    </p>
                  </div>
                  {totalOutstanding > 0 && balances.length > 0 && (
                    <button
                      type="button"
                      className="btn btn-on-dark"
                      onClick={() => startPayment(balances.find((b) => b.balance > 0))}
                    >
                      Pay Bill Now
                    </button>
                  )}
                </div>
              </div>
            )}

            {outcome && outcome.status === 'SUCCESSFUL' && (
              <div className="card auth-result">
                <div className="auth-result-icon">
                  <Icon name="checkCircle" size={30} />
                </div>
                <h2>Payment Successful</h2>
                <p className="muted">Thank you for your fee payment!</p>
                <div className="card" style={{ background: 'var(--color-bg)', textAlign: 'left', boxShadow: 'none' }}>
                  <div className="order-line">
                    <span className="order-line-sub">Receipt No.</span>
                    <span className="order-line-title">{outcome.payment.receiptNumber}</span>
                  </div>
                  <div className="order-line">
                    <span className="order-line-sub">Amount Paid</span>
                    <span className="order-line-title" style={{ color: 'var(--color-primary)' }}>
                      {formatCurrency(outcome.payment.amount)}
                    </span>
                  </div>
                </div>
                <div className="result-actions">
                  <button type="button" className="btn btn-primary btn-block" onClick={() => navigate('/payments/history')}>
                    View Receipt
                  </button>
                  <button type="button" className="btn btn-link" onClick={() => navigate('/')}>
                    Back to Dashboard
                  </button>
                </div>
              </div>
            )}

            {outcome && outcome.status === 'FAILED' && (
              <div className="card auth-result">
                <div className="auth-result-icon" style={{ background: 'var(--color-danger-bg)', color: 'var(--color-danger)' }}>
                  <Icon name="xCircle" size={30} />
                </div>
                <h2>Payment Declined</h2>
                <p className="muted">{outcome.reason || 'Your payment could not be processed. Please check your details and try again.'}</p>
                <div className="result-actions">
                  <button
                    type="button"
                    className="btn btn-primary btn-block"
                    onClick={() => {
                      setOutcome(null);
                      if (outcome.enrollment) startPayment(outcome.enrollment);
                    }}
                  >
                    Try Again
                  </button>
                  <a href="mailto:support@brilliantinstitute.edu" className="btn btn-link">
                    Contact Support
                  </a>
                </div>
              </div>
            )}

            {outcome && outcome.status === 'PENDING' && (
              <Alert
                type="warning"
                message="The payment gateway did not respond in time. Your payment is pending - please retry it from your payment history shortly."
              />
            )}

            {!inCheckout && (balances.length === 0 ? (
              <p className="muted">You have no active enrollments yet.</p>
            ) : (
              <div className="card">
                <h2>Active Bills</h2>
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Class</th>
                        <th>Outstanding balance</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {balances.map((enrollment) => (
                        <tr key={enrollment.enrollmentId}>
                          <td>
                            <div className="order-line-title">{enrollment.subject}</div>
                            {enrollment.tutorName && <div className="order-line-sub">{enrollment.tutorName}</div>}
                          </td>
                          <td>{formatCurrency(enrollment.balance)}</td>
                          <td>
                            {enrollment.balance > 0 && (
                              <button
                                type="button"
                                className="btn btn-primary btn-sm"
                                onClick={() => startPayment(enrollment)}
                              >
                                Pay now
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}

            {activeEnrollment && (
              <div className="checkout-grid">
                <div className="card">
                  <div className="flex-between" style={{ marginBottom: '4px' }}>
                    <h3 style={{ fontSize: '0.95rem', margin: 0 }}>Order Summary</h3>
                    <span className="badge">1 Class</span>
                  </div>
                  <div className="order-line">
                    <div>
                      <div className="order-line-title">{activeEnrollment.subject}</div>
                      <div className="order-line-sub">{activeEnrollment.tutorName || 'Tuition fee'}</div>
                    </div>
                    <span className="order-line-amount">{formatCurrency(activeEnrollment.balance)}</span>
                  </div>
                  <div className="order-total">
                    <span>Total Amount</span>
                    <span className="order-total-amount">{formatCurrency(amount || 0)}</span>
                  </div>
                </div>

                <div className="card">
                  <h3 style={{ fontSize: '0.95rem', marginTop: 0 }}>Payment Details</h3>
                  <Alert type="error" message={payError} />
                  <form onSubmit={handlePaySubmit} noValidate>
                    <div className="payment-tabs">
                      {PAYMENT_METHODS.map((method) => (
                        <button
                          key={method.value}
                          type="button"
                          className={`payment-tab${paymentMethod === method.value ? ' active' : ''}`}
                          onClick={() => setPaymentMethod(method.value)}
                        >
                          {method.label}
                        </button>
                      ))}
                    </div>

                    {paymentMethod === 'CARD' && (
                      <>
                        <div className="form-field">
                          <label htmlFor="cardholderName">Cardholder Name</label>
                          <input
                            id="cardholderName"
                            type="text"
                            placeholder="e.g. Kavindu S. Perera"
                            value={cardDetails.cardholderName}
                            onChange={(e) => updateCardField('cardholderName', e.target.value)}
                          />
                        </div>
                        <div className="form-field">
                          <label htmlFor="cardNumber">Card Number</label>
                          <input
                            id="cardNumber"
                            type="text"
                            inputMode="numeric"
                            placeholder="0000 0000 0000 0000"
                            maxLength={19}
                            value={cardDetails.cardNumber}
                            onChange={(e) => updateCardField('cardNumber', e.target.value)}
                          />
                        </div>
                        <div className="card-field-row">
                          <div className="form-field">
                            <label htmlFor="expiryDate">Expiry Date</label>
                            <input
                              id="expiryDate"
                              type="text"
                              placeholder="MM/YY"
                              maxLength={5}
                              value={cardDetails.expiryDate}
                              onChange={(e) => updateCardField('expiryDate', e.target.value)}
                            />
                          </div>
                          <div className="form-field">
                            <label htmlFor="cvv">CVV</label>
                            <input
                              id="cvv"
                              type="text"
                              inputMode="numeric"
                              placeholder="123"
                              maxLength={4}
                              value={cardDetails.cvv}
                              onChange={(e) => updateCardField('cvv', e.target.value)}
                            />
                          </div>
                        </div>
                        <div className="form-field checkbox-field">
                          <label htmlFor="saveCard">
                            <input
                              id="saveCard"
                              type="checkbox"
                              checked={cardDetails.saveCard}
                              onChange={(e) => updateCardField('saveCard', e.target.checked)}
                            />
                            Save this card for future payments
                          </label>
                        </div>
                      </>
                    )}

                    {paymentMethod !== 'CARD' && (
                      <p className="muted" style={{ marginBottom: '18px' }}>
                        You will be redirected to {PAYMENT_METHODS.find((m) => m.value === paymentMethod).label} to
                        complete this payment.
                      </p>
                    )}

                    <div className="form-field">
                      <label htmlFor="amount">Amount (LKR)</label>
                      <input
                        id="amount"
                        type="number"
                        min="1"
                        max={activeEnrollment.balance}
                        step="0.01"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        required
                      />
                    </div>

                    <button type="submit" className="btn btn-primary btn-block" disabled={isPaying}>
                      {isPaying && <span className="btn-spinner" aria-hidden="true" />}
                      {isPaying ? 'Processing...' : `Pay ${formatCurrency(amount || 0)}`}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-block"
                      style={{ marginTop: '10px' }}
                      onClick={() => setActiveEnrollment(null)}
                    >
                      Cancel
                    </button>
                    <p className="secure-note">
                      Your card details are encrypted and never stored by Brilliant Institute.
                    </p>
                  </form>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </PortalShell>
  );
}

export default FeeBalancePage;
