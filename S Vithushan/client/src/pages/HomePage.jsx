import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Icon from '../../../../shared/client/src/components/common/Icon';
import Footer from '../../../../shared/client/src/components/layout/Footer';
import PortalShell from '../../../../shared/client/src/components/layout/PortalShell';
import { getNavItems } from '../../../../shared/client/src/components/layout/navItems';

const FEATURES = [
  {
    icon: 'barChart',
    title: 'One Operations Dashboard',
    description: 'Users, active classes, monthly revenue, and open complaints - all in one view.',
  },
  {
    icon: 'users',
    title: 'Manage Every Account',
    description: 'Search, filter, create Tutor/Admin accounts, and suspend or reactivate any profile.',
  },
  {
    icon: 'megaphone',
    title: 'Reach Everyone Instantly',
    description: 'Broadcast announcements and send fee/attendance reminders to the right audience.',
  },
];

function HomePage() {
  const { user, isLoggedIn } = useAuth();

  if (!isLoggedIn) {
    return (
      <>
        <section className="container hero">
          <div className="hero-copy">
            <span className="eyebrow">Admin & Notifications</span>
            <h1>
              Run the Whole Institute
              <br />
              From One Screen
            </h1>
            <p>
              A single operations console for user management, announcements, and automated
              reminders.
            </p>
            <div className="hero-actions">
              <Link to="/login" className="btn btn-primary">
                Log in to Portal
              </Link>
            </div>
          </div>
          <div className="hero-media" />
        </section>

        <section className="section section-bg-soft">
          <div className="container">
            <div className="section-heading">
              <span className="eyebrow">Admin & Notifications</span>
              <h2>Everything an administrator needs</h2>
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
              links: [{ label: 'Admin dashboard', to: '/login' }],
            },
            {
              heading: 'Institute',
              links: [{ label: 'Admin & Notifications module', to: null }],
            },
          ]}
        />
      </>
    );
  }

  const NAV_ITEMS = getNavItems(user.role);

  return (
    <PortalShell navItems={NAV_ITEMS}>
      <div className="page">
        <div className="page-header">
          <h1>Hello, {user.fullName.split(' ')[0]}</h1>
          <p className="muted">Jump into the operations dashboard, manage users, or send an announcement.</p>
        </div>

        <div className="summary-grid">
          <Link to="/admin/dashboard" className="card link-card">
            <div className="feature-icon-box">
              <Icon name="barChart" size={22} />
            </div>
            <h2>Dashboard</h2>
            <p className="muted">Users, classes, revenue, and complaints at a glance.</p>
          </Link>
          <Link to="/admin/users" className="card link-card">
            <div className="feature-icon-box">
              <Icon name="users" size={22} />
            </div>
            <h2>Manage Users</h2>
            <p className="muted">Search, create, suspend, or reactivate accounts.</p>
          </Link>
          <Link to="/admin/announcements" className="card link-card">
            <div className="feature-icon-box">
              <Icon name="megaphone" size={22} />
            </div>
            <h2>Announcements</h2>
            <p className="muted">Broadcast a notice or send reminders.</p>
          </Link>
        </div>
      </div>
    </PortalShell>
  );
}

export default HomePage;
