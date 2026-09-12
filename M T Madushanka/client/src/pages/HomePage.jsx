import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { fetchMyAttendanceHistory } from '../api/attendanceApi';
import { fetchMyBalances } from '../api/paymentApi';
import Icon from '../../../../shared/client/src/components/common/Icon';
import StatCard from '../../../../shared/client/src/components/common/StatCard';
import Footer from '../../../../shared/client/src/components/layout/Footer';
import PortalShell from '../../../../shared/client/src/components/layout/PortalShell';
import heroMediaImg from '../../../../shared/client/src/assets/hero-media.png';

const FEATURES = [
  {
    icon: 'calendar',
    title: 'Easy Class Management',
    description:
      'Schedule, reschedule, and organize multi-subject sessions seamlessly. Avoid resource conflicts with tutor-clash alerts.',
  },
  {
    icon: 'card',
    title: 'Track Attendance & Fees',
    description:
      'Automate billing with visual invoices. Generate overdue flags, issue automated warning receipts, and take digital check-ins.',
  },
  {
    icon: 'bell',
    title: 'Real-time Notifications',
    description:
      'Keep parents and students aligned. Instantly broadcast timetable revisions, mock exam results, and security alerts.',
  },
];

const STUDENT_NAV = [
  { to: '/', label: 'Dashboard', icon: 'home', end: true },
  { to: '/attendance/history', label: 'Attendance', icon: 'calendar' },
  { to: '/payments', label: 'Fees', icon: 'card' },
  { to: '/payments/history', label: 'History', icon: 'receipt' },
];

const TUTOR_NAV = [
  { to: '/', label: 'Dashboard', icon: 'home', end: true },
  { to: '/attendance/classes', label: 'Mark Attendance', icon: 'calendar' },
];

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' }).format(amount);
}

function StudentDashboard({ user }) {
  const [summaryByClass, setSummaryByClass] = useState([]);
  const [balances, setBalances] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    Promise.all([fetchMyAttendanceHistory(), fetchMyBalances()])
      .then(([attendance, balanceList]) => {
        if (!isMounted) return;
        setSummaryByClass(attendance.summaryByClass || []);
        setBalances(balanceList || []);
      })
      .catch(() => {
        /* Dashboard degrades gracefully - the dedicated pages surface the real error. */
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const totalAttended = summaryByClass.reduce((sum, s) => sum + s.attendedSessions, 0);
  const totalSessions = summaryByClass.reduce((sum, s) => sum + s.totalSessions, 0);
  const overallRate = totalSessions > 0 ? Math.round((totalAttended / totalSessions) * 100) : null;
  const pendingFees = balances.reduce((sum, b) => sum + Number(b.balance), 0);

  return (
    <div className="page">
      <div className="page-header">
        <h1>Welcome back, {user.fullName.split(' ')[0]}!</h1>
        <p className="muted">Here&apos;s a snapshot of your classes, attendance and fees.</p>
      </div>

      {!isLoading && (
        <div className="stat-grid">
          <StatCard icon="book" label="Enrolled Classes" value={balances.length || summaryByClass.length} />
          <StatCard
            icon="calendar"
            label="Attendance Rate"
            value={overallRate === null ? '-' : `${overallRate}%`}
            sub={overallRate === null ? 'No sessions yet' : overallRate >= 80 ? 'On track' : 'Needs attention'}
            tone={overallRate !== null && overallRate < 80 ? 'warning' : 'success'}
          />
          <StatCard
            icon="wallet"
            label="Pending Fees"
            value={formatCurrency(pendingFees)}
            tone={pendingFees > 0 ? 'warning' : 'success'}
          />
        </div>
      )}

      <div className="summary-grid">
        <Link to="/attendance/history" className="card link-card">
          <div className="feature-icon-box">
            <Icon name="calendar" size={22} />
          </div>
          <h2>My Attendance</h2>
          <p className="muted">Check your attendance history and rate by class.</p>
        </Link>
        <Link to="/payments" className="card link-card">
          <div className="feature-icon-box">
            <Icon name="wallet" size={22} />
          </div>
          <h2>Fee Balance</h2>
          <p className="muted">View outstanding fees and pay online.</p>
        </Link>
        <Link to="/payments/history" className="card link-card">
          <div className="feature-icon-box">
            <Icon name="receipt" size={22} />
          </div>
          <h2>Payment History</h2>
          <p className="muted">Review past payments and download receipts.</p>
        </Link>
      </div>
    </div>
  );
}

function TutorDashboard({ user }) {
  return (
    <div className="page">
      <div className="page-header">
        <h1>Good day, {user.fullName.split(' ')[0]}!</h1>
        <p className="muted">Open a class to take attendance for today&apos;s session.</p>
      </div>

      <div className="summary-grid">
        <Link to="/attendance/classes" className="card link-card">
          <div className="feature-icon-box">
            <Icon name="calendar" size={22} />
          </div>
          <h2>Mark Attendance</h2>
          <p className="muted">Open a class session and record who attended.</p>
        </Link>
      </div>
    </div>
  );
}

function HomePage() {
  const { user, isLoggedIn } = useAuth();

  if (!isLoggedIn) {
    return (
      <>
        <section className="container hero">
          <div className="hero-copy">
            <span className="eyebrow">Revolutionizing EdTech Operations</span>
            <h1>
              Empowering Education,
              <br />
              One Class at a Time
            </h1>
            <p>
              Streamline class schedules, automate fee collections, track attendance, and build
              real-time communication bridges between tutors, students, and admins.
            </p>
            <div className="hero-actions">
              <Link to="/login" className="btn btn-primary">
                Log in to Portal
              </Link>
            </div>
          </div>
          <div className="hero-media">
            <img src={heroMediaImg} alt="Students collaborating in a Brilliant Institute classroom" />
          </div>
        </section>

        <section className="section section-bg-soft">
          <div className="container">
            <div className="section-heading">
              <span className="eyebrow">Tailored for Tuitions</span>
              <h2>Everything you need to scale operations</h2>
            </div>
            <div className="feature-grid">
              {FEATURES.map((feature) => (
                <div key={feature.title} className="feature-card">
                  <div className="feature-icon-box">
                    <Icon name={feature.icon} size={22} />
                  </div>
                  <h3>{feature.title}</h3>
                  <p>{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <Footer
          linkGroups={[
            {
              heading: 'Platform',
              links: [
                { label: 'Attendance', to: '/login' },
                { label: 'Fee Tracking', to: '/login' },
              ],
            },
            {
              heading: 'Institute',
              links: [{ label: 'Registration & Login module', to: null }],
            },
          ]}
        />
      </>
    );
  }

  const isTutorOrAdmin = user.role === 'TUTOR' || user.role === 'ADMIN';

  return (
    <PortalShell navItems={isTutorOrAdmin ? TUTOR_NAV : STUDENT_NAV}>
      {isTutorOrAdmin ? <TutorDashboard user={user} /> : <StudentDashboard user={user} />}
    </PortalShell>
  );
}

export default HomePage;
