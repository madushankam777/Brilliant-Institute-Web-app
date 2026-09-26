// Admin: operations dashboard
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchDashboardStats } from '../../api/adminApi';
import { fetchRecentPayments } from '../../api/paymentApi';
import LoadingSpinner from '../../../../shared/client/src/components/common/LoadingSpinner';
import Alert from '../../../../shared/client/src/components/common/Alert';
import Icon from '../../../../shared/client/src/components/common/Icon';
import StatCard from '../../../../shared/client/src/components/common/StatCard';
import PortalShell from '../../../../shared/client/src/components/layout/PortalShell';
import { getNavItems } from '../../../../shared/client/src/components/layout/navItems';
import RevenueCard from './RevenueCard';

const NAV_ITEMS = getNavItems('ADMIN');

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 0 }).format(amount);
}

function formatDateTime(value) {
  if (!value) return '-';
  return new Date(String(value).replace(' ', 'T')).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const ACTIVITY_LABELS = {
  USER_REGISTERED: 'New user registered',
  LOGIN_SUCCESS: 'Login',
  PAYMENT_SUCCESSFUL: 'Payment received',
  BANK_TRANSFER_SUBMITTED: 'Bank slip submitted',
  BANK_TRANSFER_APPROVED: 'Bank slip approved',
  BANK_TRANSFER_REJECTED: 'Bank slip rejected',
  CLASS_CREATED: 'Class created',
  CLASS_UPDATED: 'Class updated',
  CLASS_CANCELLED: 'Class cancelled',
  CLASS_ENROLLED: 'New enrolment',
  FEEDBACK_SUBMITTED: 'New feedback submitted',
  FEEDBACK_RESOLVED: 'Feedback resolved',
  ANNOUNCEMENT_PUBLISHED: 'Announcement published',
  USER_SUSPENDED: 'User suspended',
  USER_ACTIVATED: 'User reactivated',
  USER_CREATED_BY_ADMIN: 'Account created by admin',
  REMINDERS_SENT: 'Reminders sent',
  REMINDER_SCHEDULED: 'Reminder scheduled',
  TUTOR_PAID: 'Tutor paid',
  PAYOUT_SETTLED: 'Payout confirmed',
  REREGISTRATION_KEYS_ISSUED: 'Re-registration keys issued',
  REREGISTRATION_COMPLETED: 'Student re-registered',
};

function activityLabel(entry) {
  return ACTIVITY_LABELS[entry.action] || entry.action.replace(/_/g, ' ').toLowerCase();
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
  ONLINE: 'Online',
  CASH: 'Cash',
  BANK_DEPOSIT: 'Bank deposit slip',
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
      setStats(await fetchDashboardStats());
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
            <p className="muted">Brilliant Institute at a glance.</p>
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <Link to="/admin/users" className="btn btn-secondary">
              <Icon name="users" size={16} /> Add User
            </Link>
            <Link to="/courses/manage/new" className="btn btn-secondary">
              <Icon name="plus" size={16} /> New Class
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
                label="Revenue This Month"
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

            <RevenueCard />

            <div className="card">
              <div className="flex-between">
                <h2 style={{ margin: 0 }}>Recent Payments</h2>
                <Link to="/admin/payments/verify" className="btn btn-secondary btn-sm">
                  Verify Bank Slips
                </Link>
              </div>
              <Alert type="error" message={paymentsError} />
              {isLoadingPayments ? (
                <LoadingSpinner label="Loading recent payments..." />
              ) : recentPayments.length === 0 ? (
                <p className="muted" style={{ marginTop: '12px' }}>No payments recorded yet.</p>
              ) : (
                <div className="table-scroll" style={{ marginTop: '12px' }}>
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
                          <td>
                            {payment.studentName}
                            {payment.studentCode && <div className="order-line-sub">{payment.studentCode}</div>}
                          </td>
                          <td>{payment.subject}</td>
                          <td>{formatCurrency(payment.amount)}</td>
                          <td>{PAYMENT_METHOD_LABEL[payment.paymentMethod] || payment.paymentMethod}</td>
                          <td>
                            <span className={`badge ${PAYMENT_STATUS_BADGE[payment.status] || 'badge-neutral'}`}>
                              {payment.status}
                            </span>
                          </td>
                          <td>{formatDateTime(payment.paidAt || payment.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="card">
              <h2>Live Audit Activity</h2>
              {stats.recentActivity.length === 0 ? (
                <p className="muted">No activity recorded yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '420px', overflowY: 'auto', paddingRight: '4px' }}>
                  {stats.recentActivity.map((entry) => (
                    <div key={entry.id} style={{ borderBottom: '1px solid var(--color-border-soft)', paddingBottom: '10px' }}>
                      <div className="flex-between">
                        <span className="badge badge-neutral">{activityLabel(entry)}</span>
                        <span className="muted" style={{ fontSize: '0.78rem' }}>{formatDateTime(entry.createdAt)}</span>
                      </div>
                      <p style={{ margin: '4px 0 0', fontSize: '0.85rem' }}>By {entry.actorName}</p>
                    </div>
                  ))}
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
