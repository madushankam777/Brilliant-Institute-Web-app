import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Icon from '../../../../shared/client/src/components/common/Icon';
import Footer from '../../../../shared/client/src/components/layout/Footer';
import PortalShell from '../../../../shared/client/src/components/layout/PortalShell';
import { getNavItems } from '../../../../shared/client/src/components/layout/navItems';
import heroMediaImg from '../../../../shared/client/src/assets/hero-media.png';

const FEATURES = [
  {
    icon: 'search',
    title: 'Browse & Filter Classes',
    description: 'Search by subject, level, or day of week to find the right class in seconds.',
  },
  {
    icon: 'book',
    title: 'One-Click Enrolment',
    description: 'Enrol or drop a class instantly - your fee balance updates automatically.',
  },
  {
    icon: 'calendar',
    title: 'Conflict-Free Scheduling',
    description: 'Tutors get warned the moment a new class clashes with their own timetable or a booked venue.',
  },
];

function HomePage() {
  const { user, isLoggedIn } = useAuth();

  if (!isLoggedIn) {
    return (
      <>
        <section className="container hero">
          <div className="hero-copy">
            <span className="eyebrow">Course & Class Management</span>
            <h1>
              Find Your Class,
              <br />
              Manage Your Timetable
            </h1>
            <p>
              Browse and enrol in classes as a student, or publish and manage your own timetable as a
              tutor - all from one place.
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
              <span className="eyebrow">Course Management</span>
              <h2>Everything you need to run a class</h2>
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
                { label: 'Browse classes', to: '/login' },
                { label: 'My courses', to: '/login' },
              ],
            },
            {
              heading: 'Institute',
              links: [{ label: 'Course Management module', to: null }],
            },
          ]}
        />
      </>
    );
  }

  const isTutorOrAdmin = user.role === 'TUTOR' || user.role === 'ADMIN';
  const NAV_ITEMS = getNavItems(user.role);

  return (
    <PortalShell navItems={NAV_ITEMS}>
      <div className="page">
        <div className="page-header">
          <h1>{isTutorOrAdmin ? 'Good day' : 'Welcome back'}, {user.fullName.split(' ')[0]}!</h1>
          <p className="muted">
            {isTutorOrAdmin
              ? 'Create a new class or manage the ones you already teach.'
              : 'Find a class to join, or check the ones you are already enrolled in.'}
          </p>
        </div>

        <div className="summary-grid">
          <Link to="/courses/classes" className="card link-card">
            <div className="feature-icon-box">
              <Icon name="search" size={22} />
            </div>
            <h2>Browse Classes</h2>
            <p className="muted">Search and filter every class currently open for enrolment.</p>
          </Link>

          {isTutorOrAdmin ? (
            <Link to="/courses/manage" className="card link-card">
              <div className="feature-icon-box">
                <Icon name="book" size={22} />
              </div>
              <h2>My Classes</h2>
              <p className="muted">Create, edit, or cancel the classes you teach.</p>
            </Link>
          ) : (
            <Link to="/courses/my-courses" className="card link-card">
              <div className="feature-icon-box">
                <Icon name="book" size={22} />
              </div>
              <h2>My Courses</h2>
              <p className="muted">View your enrolments and drop a class if needed.</p>
            </Link>
          )}
        </div>
      </div>
    </PortalShell>
  );
}

export default HomePage;
