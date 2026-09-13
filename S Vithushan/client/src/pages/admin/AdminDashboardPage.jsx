// Admin: dashboard overview (ADM-01) - user/class/revenue/complaint
// counts, a revenue trend line, and a live feed of recent audit events.
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchDashboardStats } from '../../api/adminApi';
import { fetchRecentPayments } from '../../api/paymentApi';
import LoadingSpinner from '../../../../../shared/client/src/components/common/LoadingSpinner';
import Alert from '../../../../../shared/client/src/components/common/Alert';
import Icon from '../../../../../shared/client/src/components/common/Icon';
import StatCard from '../../../../../shared/client/src/components/common/StatCard';
import PortalShell from '../../../../../shared/client/src/components/layout/PortalShell';
import { getNavItems } from '../../../../../shared/client/src/components/layout/navItems';

const NAV_ITEMS = getNavItems('ADMIN');

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 0 }).format(amount);
}

function monthLabel(yyyyMm) {
  const [year, month] = yyyyMm.split('-');
  return new Date(Number(year), Number(month) - 1, 1).toLocaleString('en-US', { month: 'short' });
}

// Small dependency-free line chart - consistent with this codebase's
// approach of hand-rolled SVG (see Icon.jsx) instead of a charting library.
function RevenueTrendChart({ points }) {
  if (points.length === 0) {
    return <p className="muted">No revenue recorded yet.</p>;
  }
  const width = 600;
  const height = 180;
  const padding = 24;
  const maxValue = Math.max(...points.map((p) => p.total), 1);
  const stepX = (width - padding * 2) / Math.max(points.length - 1, 1);

  const coords = points.map((point, index) => ({
    x: padding + index * stepX,
    y: height - padding - (point.total / maxValue) * (height - padding * 2),
    ...point,
  }));
  const path = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x},${c.y}`).join(' ');

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img" aria-label="Revenue trend over the last 6 months">
      <path d={path} fill="none" stroke="var(--color-primary)" strokeWidth="2.5" />
      {coords.map((c) => (
        <circle key={c.month} cx={c.x} cy={c.y} r="4" fill="var(--color-primary)" />
      ))}
      {coords.map((c) => (
        <text key={`${c.month}-label`} x={c.x} y={height - 4} fontSize="11" textAnchor="middle" fill="var(--color-muted)">
          {monthLabel(c.month)}
        </text>
      ))}
    </svg>
  );
}

function activityLabel(entry) {
  const map = {
    USER_REGISTERED: 'New user registered',
    LOGIN_SUCCESS: 'Login',
    PAYMENT_SUCCESSFUL: 'Payment received',
    CLASS_CREATED: 'Class created',
    CLASS_ENROLLED: 'New enrolment',
    FEEDBACK_SUBMITTED: 'New feedback submitted',
    FEEDBACK_RESOLVED: 'Feedback resolved',
    ANNOUNCEMENT_PUBLISHED: 'Announcement published',
    USER_SUSPENDED: 'User suspended',
    USER_ACTIVATED: 'User reactivated',
    USER_CREATED_BY_ADMIN: 'Account created by admin',
    REMINDERS_SENT: 'Reminders sent',
  };
  return map[entry.action] || entry.action;
}

const PAYMENT_STATUS_BADGE = {
  SUCCESSFUL: 'badge-success',
  PENDING: 'badge-warning',
  FAILED: 'badge-danger',
};

const PAYMENT_METHOD_LABEL = {
  CARD: 'Card',
  EZ_CASH: 'eZ Cash',
  MCASH: 'mCash',
  BANK_TRANSFER: 'Bank Transfer',
};

function AdminDashboardPage() {
  const [stats, setStats] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  const [recentPayments, setRecentPayments] = useState([]);
  const [isLoadingPayments, setIsLoadingPayments] = useState(true);
  const [paymentsError, setPaymentsError] = useState('');

  const load = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const data = await fetchDashboardStats();
      setStats(data);
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let isMounted = true;
    fetchRecentPayments()
      .then((data) => {
        if (isMounted) setRecentPayments(data);
      })
      .catch((error) => {
        if (isMounted) setPaymentsError(error.message);
      })
      .finally(() => {
        if (isMounted) setIsLoadingPayments(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <PortalShell navItems={NAV_ITEMS}>
      <div className="page">
        <div className="flex-between page-header">
          <div>
            <h1>Operations Dashboard</h1>
            <p className="muted">Brilliant Institute overall system health.</p>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <Link to="/admin/users" className="btn btn-secondary">
              <Icon name="users" size={16} /> Add User
            </Link>
            <Link to="/admin/announcements" className="btn btn-primary">
              <Icon name="megaphone" size={16} /> Create Announcement
            </Link>
          </div>
        </div>

        <Alert type="error" message={errorMessage} />

        {isLoading || !stats ? (
          <LoadingSpinner label="Loading dashboard..." />
        ) : (
          <>
            <div className="stat-grid">
              <StatCard icon="users" label="Total Users" value={stats.totalUsers} to="/admin/users" />
              <StatCard icon="book" label="Active Classes" value={stats.activeClasses} to="/courses/manage" />
              <StatCard
                icon="wallet"
                label="Monthly Revenue"
                value={formatCurrency(stats.monthlyRevenue)}
                tone="success"
                to="/admin/payments/verify"
              />
              <StatCard
                icon="chat"
                label="Open Complaints"
                value={stats.openComplaints}
                tone={stats.openComplaints > 0 ? 'warning' : 'success'}
                to="/admin/feedback"
              />
            </div>

            <div className="checkout-grid">
              <div className="card">
                <h2>Revenue Trend (6 Months)</h2>
                <RevenueTrendChart points={stats.revenueTrend} />
              </div>

              <div className="card">
                <h2>Live Audit Activity</h2>
                {stats.recentActivity.length === 0 ? (
                  <p className="muted">No activity recorded yet.</p>
                ) : (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                      maxHeight: '520px',
                      overflowY: 'auto',
                      paddingRight: '4px',
                    }}
                  >
                    {stats.recentActivity.map((entry) => (
                      <div key={entry.id} style={{ borderBottom: '1px solid var(--color-border-soft)', paddingBottom: '10px' }}>
                        <div className="flex-between">
                          <span className="badge badge-neutral">{activityLabel(entry)}</span>
                          <span className="muted" style={{ fontSize: '0.78rem' }}>{entry.createdAt}</span>
                        </div>
                        <p style={{ margin: '4px 0 0', fontSize: '0.85rem' }}>By {entry.actorName}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="card">
              <div className="flex-between">
                <h2>Recent Payments</h2>
                <Link to="/admin/payments/verify" className="btn btn-secondary btn-sm">
                  Review Pending Bank Transfers
                </Link>
              </div>
              <p className="muted" style={{ marginTop: '-8px', fontSize: '0.85rem' }}>
                Every payment behind the Monthly Revenue figure above - card, eZ Cash, mCash, and bank
                transfer, whatever its outcome.
              </p>
              <Alert type="error" message={paymentsError} />
              {isLoadingPayments ? (
                <LoadingSpinner label="Loading recent payments..." />
              ) : recentPayments.length === 0 ? (
                <p className="muted">No payments recorded yet.</p>
              ) : (
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Student</th>
                        <th>Class</th>
                        <th>Amount</th>
                        <th>Method</th>
                        <th>Status</th>
                        <th>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentPayments.map((payment) => (
                        <tr key={payment.id}>
                          <td>{payment.studentName}</td>
                          <td>{payment.subject}</td>
                          <td>{formatCurrency(payment.amount)}</td>
                          <td>{PAYMENT_METHOD_LABEL[payment.paymentMethod] || payment.paymentMethod}</td>
                          <td>
                            <span className={`badge ${PAYMENT_STATUS_BADGE[payment.status] || 'badge-neutral'}`}>
                              {payment.status}
                            </span>
                          </td>
                          <td>{payment.paidAt || payment.createdAt}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </PortalShell>
  );
}

export default AdminDashboardPage;
