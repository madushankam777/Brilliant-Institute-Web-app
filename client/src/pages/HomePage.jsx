// home page - the public landing page, or the student or tutor dashboard when logged in
import { lazy, Suspense } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Icon from '../../../shared/client/src/components/common/Icon';
import LoadingSpinner from '../../../shared/client/src/components/common/LoadingSpinner';
import Footer from '../../../shared/client/src/components/layout/Footer';
import heroMediaImg from '../../../shared/client/src/assets/hero-media.webp';

// the dashboards load only after login, so visitors download less
const RoleDashboard = lazy(() => import('./RoleDashboard'));

// the four feature cards on the public page
const FEATURES = [
  {
    icon: 'user',
    title: 'One Account, Every Role',
    description:
      'Register once as a Student/Parent and sign in from any device - your profile, session and role travel with you across attendance and fees.',
  },
  {
    icon: 'calendar',
    title: 'Easy Class Management',
    description:
      'Tutors mark attendance in seconds; students see their history and rate the moment it is submitted.',
  },
  {
    icon: 'card',
    title: 'Track Attendance & Fees',
    description:
      'Automate billing with digital receipts. Pay outstanding fees online and pick up right where a failed payment left off.',
  },
  {
    icon: 'lock',
    title: 'Secure by Default',
    description:
      'Passwords are hashed, sessions live in httpOnly cookies, and every reset link expires - no plaintext credentials, ever.',
  },
];

// the two quotes on the public page
const TESTIMONIALS = [
  {
    quote:
      'Creating my account took less than a minute, and everything - my classes, attendance and fees - lives in one place now.',
    name: 'Dinuka Rathnayake',
    role: 'Grade 11 Mathematics Student',
  },
  {
    quote:
      'The real-time notification engine has saved countless frantic calls. When a tutor is sick, parents get notified instantly.',
    name: 'Kamala Sivakumar',
    role: 'Parent',
  },
];

// home page - admins go to their dashboard, students and tutors see theirs, visitors see the landing page
function HomePage() {
  const { user, isLoggedIn } = useAuth();

  if (isLoggedIn) {
    if (user.role === 'ADMIN') {
      return <Navigate to="/admin/dashboard" replace />;
    }
    return (
      <Suspense fallback={<LoadingSpinner label="Loading your dashboard..." />}>
        <RoleDashboard user={user} />
      </Suspense>
    );
  }

  // the public landing page - hero, features and testimonials
  return (
    <>
      {/* hero - headline and sign-up buttons */}
      <section className="container hero">
        <div className="hero-copy">
          <span className="eyebrow">Revolutionizing EdTech Operations</span>
          <h1>
            Empowering Education,
            <br />
            One Class at a Time
          </h1>
          <p>
            Create your Brilliant Institute account to track class schedules, attendance and fee
            payments - all from one secure login shared across the whole platform.
          </p>
          <div className="hero-actions">
            <Link to="/register" className="btn btn-primary">
              Get Started
            </Link>
            <Link to="/login" className="btn btn-secondary">
              Login to Platform
            </Link>
          </div>
        </div>
        <div className="hero-media">
          <img
            src={heroMediaImg}
            alt="Students collaborating in a Brilliant Institute classroom"
            width="640"
            height="440"
            decoding="async"
            fetchPriority="high"
          />
        </div>
      </section>

      {/* features */}
      <section id="features" className="section section-bg-soft">
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

      {/* testimonials */}
      <section className="section">
        <div className="container">
          <div className="section-heading">
            <span className="eyebrow">Endorsed by Experts</span>
            <h2>Trusted by hundreds of premium educators</h2>
          </div>
          <div className="testimonial-grid">
            {TESTIMONIALS.map((testimonial) => (
              <div key={testimonial.name} className="testimonial-card">
                <p className="testimonial-quote">&ldquo;{testimonial.quote}&rdquo;</p>
                <div className="testimonial-author">
                  <span className="testimonial-avatar">
                    {testimonial.name
                      .split(' ')
                      .map((part) => part[0])
                      .join('')}
                  </span>
                  <div>
                    <div className="testimonial-author-name">{testimonial.name}</div>
                    <div className="testimonial-author-role">{testimonial.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </>
  );
}

export default HomePage;
