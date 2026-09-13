import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Icon from '../../../../shared/client/src/components/common/Icon';
import Footer from '../../../../shared/client/src/components/layout/Footer';
import PortalShell from '../../../../shared/client/src/components/layout/PortalShell';
import { getNavItems } from '../../../../shared/client/src/components/layout/navItems';
import heroMediaImg from '../../../../shared/client/src/assets/hero-media.png';

const FEATURES = [
  {
    icon: 'chat',
    title: 'Submit Feedback Instantly',
    description: 'Students and tutors can raise a complaint or question in seconds, with a priority level attached.',
  },
  {
    icon: 'clock',
    title: 'Track Every Ticket',
    description: 'Follow a ticket from submission through to resolution, with a full reply history.',
  },
  {
    icon: 'checkCircle',
    title: 'Fast Staff Response',
    description: 'Tutors and admins see every open ticket in one triage queue, sorted by priority.',
  },
];

function HomePage() {
  const { user, isLoggedIn } = useAuth();

  if (!isLoggedIn) {
    return (
      <>
        <section className="container hero">
          <div className="hero-copy">
            <span className="eyebrow">Feedback & Complaint</span>
            <h1>
              Your Voice,
              <br />
              Heard and Resolved
            </h1>
            <p>
              A dedicated channel for students, parents, and tutors to raise issues and track them to
              resolution - no more messages lost over the phone.
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

        <section id="about" className="section section-bg-soft">
          <div className="container">
            <div className="section-heading">
              <span className="eyebrow">Feedback & Complaint</span>
              <h2>A proper channel for every concern</h2>
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
              links: [{ label: 'Submit feedback', to: '/login' }],
            },
          ]}
        />
      </>
    );
  }

  const isStaff = user.role === 'TUTOR' || user.role === 'ADMIN';
  const NAV_ITEMS = getNavItems(user.role);

  return (
    <PortalShell navItems={NAV_ITEMS}>
      <div className="page">
        <div className="page-header">
          <h1>Welcome back, {user.fullName.split(' ')[0]}!</h1>
          <p className="muted">
            {isStaff ? 'Review and respond to open feedback tickets.' : 'Submit feedback or check on a ticket you raised.'}
          </p>
        </div>

        <div className="summary-grid">
          <Link to={isStaff ? '/admin/feedback' : '/feedback'} className="card link-card">
            <div className="feature-icon-box">
              <Icon name="chat" size={22} />
            </div>
            <h2>{isStaff ? 'Manage Tickets' : 'Feedback & Support'}</h2>
            <p className="muted">
              {isStaff ? 'View every open ticket and reply.' : 'Submit new feedback or track existing tickets.'}
            </p>
          </Link>
        </div>
      </div>
    </PortalShell>
  );
}

export default HomePage;
