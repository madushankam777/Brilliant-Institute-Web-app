// Student/Parent: view balance, pay online
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  fetchMyBalances,
  makePayment,
  payByBankTransfer,
  fetchBankTransferAvailability,
  fetchPaymentSettings,
  startOnlineCheckout,
  startPayPalCheckout,
  redirectToGateway,
} from '../../api/paymentApi';
import LoadingSpinner from '../../../../shared/client/src/components/common/LoadingSpinner';
import Alert from '../../../../shared/client/src/components/common/Alert';
import Icon from '../../../../shared/client/src/components/common/Icon';
import PortalShell from '../../../../shared/client/src/components/layout/PortalShell';
import { getNavItems } from '../../../../shared/client/src/components/layout/navItems';
import { useAuth } from '../../context/AuthContext';
import NumberInput from '../../../../shared/client/src/components/common/NumberInput';
import { INSTITUTE } from '../../../../shared/client/src/constants/institute';

// the side menu for a student
const NAV_ITEMS = getNavItems("STUDENT_PARENT");

// checkout tab names - the admin chooses which ones show
const METHOD_LABELS = {
  ONLINE: 'Card / eZ Cash / mCash',
  CARD: 'Card',
  EZ_CASH: 'eZ Cash',
  MCASH: 'mCash',
  PAYPAL: 'PayPal',
  BANK_TRANSFER: 'Bank Transfer',
};
// the checkout tabs as value + label pairs
const PAYMENT_METHODS = ['CARD', 'EZ_CASH', 'MCASH'].map((value) => ({ value, label: METHOD_LABELS[value] }));

// wallet phone number format
const WALLET_PHONE_REGEX = /^(?:\+94|0)7\d{8}$/;

// Letters, spaces, apostrophes, and hyphens only
const NAME_REGEX = /^[A-Za-z][A-Za-z .'-]*$/;

// Letters, numbers, spaces, hyphens, and slashes
const BANK_REFERENCE_REGEX = /^[A-Za-z0-9 \-/]+$/;

// a pay-by time as "Fri 9 Oct, 3:30 PM"
function formatDue(value) {
  return new Date(String(value).replace(' ', 'T')).toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// a number as LKR money
function formatCurrency(amount) {
  return new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' }).format(amount);
}

// check card number is valid
function luhnCheck(digits) {
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let shouldDouble = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let digit = Number(digits[i]);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

// the card brand from the first digits
function detectCardBrand(digits) {
  if (/^4/.test(digits)) return 'Visa';
  if (/^(5[1-5]|2[2-7])/.test(digits)) return 'Mastercard';
  if (/^3[47]/.test(digits)) return 'Amex';
  if (/^6(?:011|5)/.test(digits)) return 'Discover';
  return 'Card';
}

// card number as 1234-5678-9012-3456
function formatCardNumber(raw) {
  const digits = String(raw).replace(/\D/g, '').slice(0, 19);
  return digits.replace(/(\d{4})(?=\d)/g, '$1-');
}

// auto-add "/" in expiry date input (MM/YY)
function formatExpiryInput(rawValue, previousFormatted) {
  const isDeleting = rawValue.length < previousFormatted.length;
  let digits = rawValue.replace(/\D/g, '').slice(0, 4);

  if (isDeleting && previousFormatted.endsWith('/') && digits.length === 2) {
    digits = digits.slice(0, 1);
  }

  if (digits.length >= 2) {
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }
  return digits;
}

// a blank card form
const emptyCardDetails = { cardholderName: '', cardNumber: '', expiryDate: '', cvv: '' };

// fees & payments - what I owe per class, and the checkout for card, wallet, bank transfer or online
function FeeBalancePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const autoStartedRef = useRef(false);
  // the balances and the page state
  const [balances, setBalances] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // the checkout - the class being paid and the payment form fields
  const [activeEnrollment, setActiveEnrollment] = useState(null);
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('BANK_TRANSFER');
  const [cardDetails, setCardDetails] = useState(emptyCardDetails);
  const [walletPhone, setWalletPhone] = useState('');
  const [bankReference, setBankReference] = useState('');
  const [receiptFile, setReceiptFile] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [isPaying, setIsPaying] = useState(false);
  const [payError, setPayError] = useState('');
  const [outcome, setOutcome] = useState(null); // { status: 'SUCCESSFUL' | 'FAILED' | 'PENDING' | 'AWAITING_VERIFICATION', payment? }

  // bank transfer open or closed, and the payment settings from the server
  const [bankTransferAvailable, setBankTransferAvailable] = useState(true);
  const [bankTransferClosedMessage, setBankTransferClosedMessage] = useState('');
  const [paymentSettings, setPaymentSettings] = useState(null);

  // gateway / simulator switches from the server
  const methodKey = ((paymentSettings && paymentSettings.checkoutMethods) || []).join(',');
  // the checkout tabs the admin switched on
  const methodTabs = useMemo(
    () => methodKey.split(',').filter(Boolean).map((value) => ({ value, label: METHOD_LABELS[value] || value })),
    [methodKey]
  );
  const defaultMethod = methodTabs.length > 0 ? methodTabs[0].value : '';
  const hasBankDetails = Boolean(paymentSettings && paymentSettings.bankAccountNumber);

  // load what I owe for each class
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

  // on open - load the balances, whether bank transfer is open, and the payment settings
  useEffect(() => {
    loadBalances();
    fetchBankTransferAvailability()
      .then(({ available, message }) => {
        setBankTransferAvailable(available);
        setBankTransferClosedMessage(message || '');
      })
      .catch(() => {
        // ignore - server still checks this on submit
      });
    fetchPaymentSettings()
      .then(setPaymentSettings)
      .catch(() => {
        // checkout still works without this - the callouts just stay hidden
      });
  }, [loadBalances]);

  // Settings arrive a moment after the balances do
  useEffect(() => {
    setPaymentMethod((current) => (methodTabs.some((tab) => tab.value === current) ? current : defaultMethod));
  }, [methodTabs, defaultMethod]);

  // pay btn - open the checkout for a class with a blank form
  function startPayment(enrollment) {
    setActiveEnrollment(enrollment);
    setAmount(String(enrollment.balance));
    setPaymentMethod(defaultMethod);
    setCardDetails(emptyCardDetails);
    setWalletPhone('');
    setBankReference('');
    setReceiptFile(null);
    setFieldErrors({});
    setPayError('');
    setOutcome(null);
  }

  // auto-open payment for the class just enrolled in
  useEffect(() => {
    const fromLink = Number(new URLSearchParams(location.search).get('enrollment')) || null;
    const targetEnrollmentId = (location.state && location.state.enrollmentId) || fromLink;
    if (!targetEnrollmentId || autoStartedRef.current || balances.length === 0) return;
    const target = balances.find((b) => b.enrollmentId === targetEnrollmentId && b.balance > 0);
    if (target) {
      autoStartedRef.current = true;
      startPayment(target);
    }
  }, [location.state, location.search, balances]);

  // change one card form field
  function updateCardField(field, value) {
    setCardDetails((previous) => ({ ...previous, [field]: value }));
  }

  // check the card, wallet or bank transfer fields before paying
  function validatePaymentFields() {
    const errors = {};

    if (paymentMethod === 'CARD') {
      if (cardDetails.cardholderName.trim().length < 2) {
        errors.cardholderName = 'Enter the name on the card.';
      } else if (!NAME_REGEX.test(cardDetails.cardholderName.trim())) {
        errors.cardholderName = 'Cardholder name can only contain letters, spaces, apostrophes, and hyphens - no numbers or symbols.';
      }
      const digits = cardDetails.cardNumber.replace(/\D/g, '');
      if (!luhnCheck(digits)) {
        errors.cardNumber = 'Enter a valid card number.';
      }
      if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(cardDetails.expiryDate)) {
        errors.expiryDate = 'Use MM/YY format.';
      } else {
        const [mm, yy] = cardDetails.expiryDate.split('/').map(Number);
        const firstDayAfterExpiry = new Date(2000 + yy, mm); // month is 0-indexed, so this is the 1st of the month AFTER expiry
        if (firstDayAfterExpiry <= new Date()) {
          errors.expiryDate = 'This card has expired.';
        }
      }
      if (!/^\d{3,4}$/.test(cardDetails.cvv)) {
        errors.cvv = 'Enter a valid CVV.';
      }
    } else if (paymentMethod === 'EZ_CASH' || paymentMethod === 'MCASH') {
      if (!WALLET_PHONE_REGEX.test(walletPhone.trim())) {
        errors.walletPhone = 'Enter a valid mobile number (e.g. 0771234567).';
      }
    } else if (paymentMethod === 'BANK_TRANSFER') {
      if (!bankTransferAvailable) {
        errors.bankReference = bankTransferClosedMessage;
      } else {
        if (bankReference.trim().length < 4) {
          errors.bankReference = 'Enter your bank account number or transfer reference.';
        } else if (!BANK_REFERENCE_REGEX.test(bankReference.trim())) {
          errors.bankReference = 'Reference can only contain letters, numbers, spaces, hyphens, and slashes - no other symbols.';
        }
        if (!receiptFile) {
          errors.receiptFile = 'Attach a photo or screenshot of your transfer receipt.';
        }
      }
    }

    return errors;
  }

  // the details sent to the server - only the last 4 card digits, never the full card
  function buildPaymentDetailsPayload() {
    if (paymentMethod === 'CARD') {
      const digits = cardDetails.cardNumber.replace(/\D/g, '');
      return {
        cardholderName: cardDetails.cardholderName.trim(),
        cardLast4: digits.slice(-4),
        cardBrand: detectCardBrand(digits),
      };
    }
    if (paymentMethod === 'EZ_CASH' || paymentMethod === 'MCASH') {
      return { walletPhone: walletPhone.trim() };
    }
    if (paymentMethod === 'BANK_TRANSFER') {
      return { bankReference: bankReference.trim() };
    }
    return {};
  }

  // pay btn - check the amount, then pay online, by card, wallet or bank transfer
  async function handlePaySubmit(event) {
    event.preventDefault();
    setPayError('');

    const parsedAmount = Number(amount);
    if (!(parsedAmount > 0)) {
      setPayError('Please enter a valid amount greater than zero.');
      return;
    }
    if (parsedAmount > Number(activeEnrollment.balance)) {
      setPayError(`The amount can't be more than your balance of ${formatCurrency(activeEnrollment.balance)}.`);
      return;
    }

    // Real gateway: reserve the payment
    if (paymentMethod === 'ONLINE') {
      setIsPaying(true);
      try {
        const checkout = await startOnlineCheckout({
          enrollmentId: activeEnrollment.enrollmentId,
          amount: parsedAmount,
        });
        redirectToGateway(checkout);
      } catch (error) {
        setPayError(error.message);
        setIsPaying(false);
      }
      return;
    }

    // PayPal - the student approves on PayPal, then comes straight back here
    if (paymentMethod === 'PAYPAL') {
      setIsPaying(true);
      try {
        const checkout = await startPayPalCheckout({
          enrollmentId: activeEnrollment.enrollmentId,
          amount: parsedAmount,
        });
        window.location.assign(checkout.approveUrl);
      } catch (error) {
        setPayError(error.message);
        setIsPaying(false);
      }
      return;
    }

    const errors = validatePaymentFields();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setPayError('Please fix the highlighted fields.');
      return;
    }

    setIsPaying(true);
    try {
      if (paymentMethod === 'BANK_TRANSFER') {
        const payment = await payByBankTransfer({
          enrollmentId: activeEnrollment.enrollmentId,
          amount: parsedAmount,
          bankReference: bankReference.trim(),
          receiptFile,
        });
        setOutcome({ status: 'AWAITING_VERIFICATION', payment });
      } else {
        const payment = await makePayment({
          enrollmentId: activeEnrollment.enrollmentId,
          amount: parsedAmount,
          paymentMethod,
          paymentDetails: buildPaymentDetailsPayload(),
        });
        setOutcome({ status: payment.status, payment });
      }
      setActiveEnrollment(null);
      await loadBalances();
    } catch (error) {
      setPayError(error.message);
      if (error.details) {
        const mapped = {};
        error.details.forEach((detail) => {
          // match server field name to form field name
          const key = detail.field.split('.').pop();
          mapped[key] = detail.message;
        });
        setFieldErrors(mapped);
      }
    } finally {
      setIsPaying(false);
    }
  }

  // the total I still owe
  // PayPal charges in another currency, so the student is shown what it becomes
  const paypalAmount =
    paymentSettings && paymentSettings.paypalCurrency && paymentSettings.paypalCurrency !== 'LKR'
      ? paymentSettings.paypalCurrency +
        ' ' +
        (Number(amount || 0) / (Number(paymentSettings.paypalLkrRate) || 300)).toFixed(2)
      : null;

  const totalOutstanding = balances.reduce((sum, b) => sum + Number(b.balance), 0);
  const inCheckout = Boolean(activeEnrollment);

  // the page - breadcrumb, title, balance card, payment result, bills table and checkout
  return (
    <PortalShell navItems={NAV_ITEMS}>
      <div className="page">
        {/* breadcrumb - Dashboard / Fees & Payments / Checkout */}
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

        {/* page title - changes while in the checkout */}
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

        {/* a spinner, or the page content */}
        {isLoading ? (
          <LoadingSpinner label="Loading your fee balance..." />
        ) : (
          <>
            {/* total outstanding card with the Pay Bill Now btn */}
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

            {/* payment result - successful */}
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

            {/* payment result - declined */}
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
                  <a href={`mailto:${INSTITUTE.email}`} className="btn btn-link">
                    Contact Support
                  </a>
                </div>
              </div>
            )}

            {/* payment result - the gateway did not answer in time */}
            {outcome && outcome.status === 'PENDING' && (
              <Alert
                type="warning"
                message="The payment gateway did not respond in time. Your payment is pending - please retry it from your payment history shortly."
              />
            )}

            {/* payment result - bank transfer waiting for the office to check the receipt */}
            {outcome && outcome.status === 'AWAITING_VERIFICATION' && (
              <div className="card auth-result">
                <div className="auth-result-icon" style={{ background: 'var(--color-warning-bg)', color: 'var(--color-warning)' }}>
                  <Icon name="clock" size={30} />
                </div>
                <h2>Awaiting Verification</h2>
                <p className="muted">
                  Your bank transfer receipt has been submitted. An Administrator will verify it against your
                  transfer, usually within one business day - your balance will update automatically once
                  approved. You can log in and use the site normally in the meantime.
                </p>
                <div className="result-actions">
                  <button type="button" className="btn btn-primary btn-block" onClick={() => navigate('/payments/history')}>
                    View Payment Status
                  </button>
                  <button type="button" className="btn btn-link" onClick={() => navigate('/')}>
                    Back to Dashboard
                  </button>
                </div>
              </div>
            )}

            {/* active bills - a message when there are none, else the bills table */}
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
                            <div className="order-line-title">
                              {/* green dot - this class is paid */}
                              {enrollment.isPaid && <span className="paid-dot" title="Paid" aria-label="Paid" />}
                              {enrollment.subject}
                            </div>
                            {enrollment.tutorName && <div className="order-line-sub">{enrollment.tutorName}</div>}
                            {/* unpaid with a pay-by time - the place is released after it */}
                            {enrollment.paymentDueAt && (
                              <div className="order-line-sub" style={{ color: 'var(--color-danger)', fontWeight: 600 }}>
                                Pay by {formatDue(enrollment.paymentDueAt)} to keep your place
                              </div>
                            )}
                          </td>
                          <td>
                            {enrollment.isPaid ? (
                              <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>Paid</span>
                            ) : (
                              formatCurrency(enrollment.balance)
                            )}
                          </td>
                          <td>
                            {/* pay btn - only while something is owed */}
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

            {/* checkout - order summary and the payment form */}
            {activeEnrollment && (
              <div className="checkout-grid">
                {/* order summary */}
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
                  {paymentMethod === 'PAYPAL' && paypalAmount && (
                    <p className="order-line-sub">PayPal charge: {paypalAmount}</p>
                  )}
                </div>

                {/* payment details - method tabs, the fields and the pay btn */}
                <div className="card">
                  <h3 style={{ fontSize: '0.95rem', marginTop: 0 }}>Payment Details</h3>
                  <Alert type="error" message={payError} />
                  {paymentSettings && methodTabs.length === 0 ? (
                    <div className="callout">
                      <span>
                        <strong>Online payment is not available right now.</strong> Please pay at the office in
                        cash or with a bank deposit slip - your balance is updated as soon as the office records it.
                      </span>
                    </div>
                  ) : (
                  <form onSubmit={handlePaySubmit} noValidate>
                    {/* method tabs - a closed method is disabled */}
                    <div className="payment-tabs">
                      {methodTabs.map((method) => {
                        const isDisabled = method.value === 'BANK_TRANSFER' && !bankTransferAvailable;
                        return (
                          <button
                            key={method.value}
                            type="button"
                            className={`payment-tab${paymentMethod === method.value ? ' active' : ''}`}
                            disabled={isDisabled}
                            title={isDisabled ? bankTransferClosedMessage : undefined}
                            onClick={() => {
                              setPaymentMethod(method.value);
                              setFieldErrors({});
                            }}
                          >
                            {method.label}
                            {isDisabled && ' (Closed)'}
                          </button>
                        );
                      })}
                    </div>

                    {/* online - the student finishes on the PayHere page */}
                    {paymentMethod === 'ONLINE' && (
                      <div className="callout" style={{ marginBottom: '16px' }}>
                        <span>
                          <strong>You&apos;ll finish this payment on PayHere.</strong> Tap Pay and
                          we&apos;ll hand you over to PayHere&apos;s secure page to choose your card,
                          eZ Cash or mCash and enter your details. Brilliant Institute never sees or
                          stores your card number. You&apos;ll come straight back here afterwards.
                        </span>
                      </div>
                    )}

                    {/* bank transfer is closed - show why */}
                    {paymentMethod === 'BANK_TRANSFER' && !bankTransferAvailable && (
                      <Alert type="warning" message={bankTransferClosedMessage} />
                    )}

                    {/* card fields - name, number, expiry and CVV */}
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
                            className={fieldErrors.cardholderName ? 'input-error' : ''}
                          />
                          {fieldErrors.cardholderName && <p className="field-error">{fieldErrors.cardholderName}</p>}
                        </div>
                        <div className="form-field">
                          <label htmlFor="cardNumber">Card Number</label>
                          <input
                            id="cardNumber"
                            type="text"
                            inputMode="numeric"
                            placeholder="0000-0000-0000-0000"
                            maxLength={23}
                            autoComplete="cc-number"
                            value={cardDetails.cardNumber}
                            onChange={(e) => updateCardField('cardNumber', formatCardNumber(e.target.value))}
                            className={fieldErrors.cardNumber ? 'input-error' : ''}
                          />
                          {fieldErrors.cardNumber && <p className="field-error">{fieldErrors.cardNumber}</p>}
                        </div>
                        <div className="card-field-row">
                          <div className="form-field">
                            <label htmlFor="expiryDate">Expiry Date (MM/YY)</label>
                            <input
                              id="expiryDate"
                              type="text"
                              inputMode="numeric"
                              placeholder="MM/YY"
                              maxLength={5}
                              value={cardDetails.expiryDate}
                              onChange={(e) =>
                                updateCardField(
                                  'expiryDate',
                                  formatExpiryInput(e.target.value, cardDetails.expiryDate)
                                )
                              }
                              className={fieldErrors.expiryDate ? 'input-error' : ''}
                            />
                            {fieldErrors.expiryDate && <p className="field-error">{fieldErrors.expiryDate}</p>}
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
                              onChange={(e) => updateCardField('cvv', e.target.value.replace(/\D/g, ''))}
                              className={fieldErrors.cvv ? 'input-error' : ''}
                            />
                            {fieldErrors.cvv && <p className="field-error">{fieldErrors.cvv}</p>}
                          </div>
                        </div>
                      </>
                    )}

                    {/* wallet fields - our number to send to and my mobile number */}
                    {(paymentMethod === 'EZ_CASH' || paymentMethod === 'MCASH') && (
                      <>
                        {(paymentMethod === 'EZ_CASH' ? paymentSettings?.ezCashNumber : paymentSettings?.mcashNumber) && (
                          <div className="callout" style={{ marginBottom: '16px' }}>
                            <span>
                              <strong>Send to our {PAYMENT_METHODS.find((m) => m.value === paymentMethod).label} number:</strong>{' '}
                              {paymentMethod === 'EZ_CASH' ? paymentSettings.ezCashNumber : paymentSettings.mcashNumber}
                            </span>
                          </div>
                        )}
                        <div className="form-field">
                          <label htmlFor="walletPhone">
                            {PAYMENT_METHODS.find((m) => m.value === paymentMethod).label} Mobile Number
                          </label>
                          <input
                            id="walletPhone"
                            type="tel"
                            placeholder="07XXXXXXXX"
                            value={walletPhone}
                            maxLength={12}
                            onChange={(e) => setWalletPhone(e.target.value.replace(/[^\d+]/g, '').replace(/(?!^)\+/g, ''))}
                            className={fieldErrors.walletPhone ? 'input-error' : ''}
                          />
                          {fieldErrors.walletPhone ? (
                            <p className="field-error">{fieldErrors.walletPhone}</p>
                          ) : (
                            <p className="field-help">
                              You&apos;ll get a {PAYMENT_METHODS.find((m) => m.value === paymentMethod).label} confirmation prompt on this number.
                            </p>
                          )}
                        </div>
                      </>
                    )}

                    {/* bank transfer - the institute's bank details, my reference and the receipt photo */}
                    {paymentMethod === 'BANK_TRANSFER' && (
                      <>
                        {/* slip note - name and registration number */}
                        <div className="slip-note" role="note">
                          <Icon name="alertTriangle" size={22} />
                          <div>
                            <strong>Write your full name and registration number clearly on the bank slip</strong>
                            {' '}(or in the transfer reference) so the office can match your payment.
                            <div className="slip-note-details">
                              <span>{user.fullName}</span>
                              <span>{user.studentCode || 'Registration number on your profile'}</span>
                            </div>
                          </div>
                        </div>
                        <div className="callout" style={{ marginBottom: '16px' }}>
                          {hasBankDetails ? (
                            <span>
                              <strong>Transfer to this account, then fill in the details below:</strong>
                              <br />
                              Bank: {paymentSettings.bankName || '-'}
                              <br />
                              Account Name: {paymentSettings.bankAccountName || '-'}
                              <br />
                              Account Number: <strong>{paymentSettings.bankAccountNumber}</strong>
                              <br />
                              Branch: {paymentSettings.bankBranch || '-'}
                              {paymentSettings.bankSwift && <> &middot; SWIFT: {paymentSettings.bankSwift}</>}
                            </span>
                          ) : (
                            <span>
                              <strong>The institute&apos;s bank details aren&apos;t available yet.</strong> Please contact
                              the office for the account number, or pay at the office.
                            </span>
                          )}
                        </div>
                        <div className="form-field">
                          <label htmlFor="bankReference">Your Bank Account Number / Reference</label>
                          <input
                            id="bankReference"
                            type="text"
                            placeholder="e.g. 8001234567"
                            value={bankReference}
                            onChange={(e) => setBankReference(e.target.value)}
                            className={fieldErrors.bankReference ? 'input-error' : ''}
                          />
                          {fieldErrors.bankReference ? (
                            <p className="field-error">{fieldErrors.bankReference}</p>
                          ) : (
                            <p className="field-help">Used to reconcile your transfer with this invoice.</p>
                          )}
                        </div>
                        <div className="form-field">
                          <label htmlFor="receiptFile">Transfer Receipt (photo or screenshot)</label>
                          <input
                            id="receiptFile"
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            onChange={(e) => setReceiptFile(e.target.files[0] || null)}
                            className={fieldErrors.receiptFile ? 'input-error' : ''}
                          />
                          {fieldErrors.receiptFile ? (
                            <p className="field-error">{fieldErrors.receiptFile}</p>
                          ) : (
                            <p className="field-help">
                              An Administrator verifies this against your bank transfer before your balance
                              updates - usually within one business day.
                            </p>
                          )}
                        </div>
                      </>
                    )}

                    {/* amount to pay */}
                    <div className="form-field">
                      <label htmlFor="amount">Amount (LKR)</label>
                      <NumberInput
                        id="amount"
                        decimals={2}
                        placeholder="0.00"
                        value={amount}
                        onChange={setAmount}
                      />
                      <p className="field-help">Up to {formatCurrency(activeEnrollment.balance)}.</p>
                    </div>

                    {/* pay btn - Submit for Verification for a bank transfer */}
                    <button type="submit" className="btn btn-primary btn-block" disabled={isPaying}>
                      {isPaying && <span className="btn-spinner" aria-hidden="true" />}
                      {isPaying
                        ? paymentMethod === 'ONLINE'
                          ? 'Redirecting to PayHere...'
                          : paymentMethod === 'PAYPAL'
                            ? 'Redirecting to PayPal...'
                            : 'Submitting...'
                        : paymentMethod === 'BANK_TRANSFER'
                          ? 'Submit for Verification'
                          : `Pay ${formatCurrency(amount || 0)}`}
                    </button>
                    {/* cancel btn - back to the bills */}
                    <button
                      type="button"
                      className="btn btn-secondary btn-block"
                      style={{ marginTop: '10px' }}
                      onClick={() => setActiveEnrollment(null)}
                    >
                      Cancel
                    </button>
                    {paymentMethod === 'BANK_TRANSFER' && (
                      <p className="secure-note">
                        Your receipt is only ever visible to you and to Administrators reviewing your transfer.
                      </p>
                    )}
                    {paymentMethod === 'CARD' && (
                      <p className="secure-note">
                        Your card details are validated in your browser and never stored by Brilliant Institute -
                        only the card brand and last 4 digits are kept on your receipt.
                      </p>
                    )}
                  </form>
                  )}
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
