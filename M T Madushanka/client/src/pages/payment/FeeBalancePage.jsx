// Student/Parent: view balance, pay online
import { useCallback, useEffect, useState } from 'react';
import { fetchMyBalances, makePayment } from '../../api/paymentApi';
import LoadingSpinner from '../../../../../shared/client/src/components/common/LoadingSpinner';
import Alert from '../../../../../shared/client/src/components/common/Alert';

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' }).format(amount);
}

function FeeBalancePage() {
  const [balances, setBalances] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [activeEnrollmentId, setActiveEnrollmentId] = useState(null);
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('CARD');
  const [isPaying, setIsPaying] = useState(false);
  const [payError, setPayError] = useState('');
  const [receipt, setReceipt] = useState(null);

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
    setActiveEnrollmentId(enrollment.enrollmentId);
    setAmount(String(enrollment.balance));
    setPaymentMethod('CARD');
    setPayError('');
    setReceipt(null);
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
        enrollmentId: activeEnrollmentId,
        amount: parsedAmount,
        paymentMethod,
      });
      setReceipt(payment);
      setActiveEnrollmentId(null);
      await loadBalances();
    } catch (error) {
      setPayError(error.message);
    } finally {
      setIsPaying(false);
    }
  }

  if (isLoading) return <LoadingSpinner label="Loading your fee balance..." />;

  return (
    <div className="page">
      <h1>Fee Balance</h1>
      <Alert type="error" message={loadError} />

      {receipt && (
        <div className="card receipt-card">
          <h2>Payment successful</h2>
          <p>
            Receipt <strong>{receipt.receiptNumber}</strong> for {formatCurrency(receipt.amount)}
          </p>
          <p className="muted">Reference: {receipt.gatewayTransactionId}</p>
        </div>
      )}

      {balances.length === 0 ? (
        <p className="muted">You have no active enrollments yet.</p>
      ) : (
        <div className="card">
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
                  <td>{enrollment.subject}</td>
                  <td>{formatCurrency(enrollment.balance)}</td>
                  <td>
                    {enrollment.balance > 0 && (
                      <button
                        type="button"
                        className="btn btn-primary"
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
      )}

      {activeEnrollmentId && (
        <div className="card">
          <h2>Make a payment</h2>
          <Alert type="error" message={payError} />
          <form onSubmit={handlePaySubmit} noValidate>
            <div className="form-field">
              <label htmlFor="amount">Amount (LKR)</label>
              <input
                id="amount"
                type="number"
                min="1"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
            <div className="form-field">
              <label htmlFor="paymentMethod">Payment method</label>
              <select
                id="paymentMethod"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
              >
                <option value="CARD">Card</option>
                <option value="BANK_TRANSFER">Bank transfer</option>
              </select>
            </div>
            <button type="submit" className="btn btn-primary" disabled={isPaying}>
              {isPaying ? 'Processing...' : 'Confirm payment'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setActiveEnrollmentId(null)}
            >
              Cancel
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

export default FeeBalancePage;
