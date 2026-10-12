
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Icon from '../../../../shared/client/src/components/common/Icon';
import Footer from '../../../../shared/client/src/components/layout/Footer';
import heroMediaImg from '../../../../shared/client/src/assets/hero-media.png';


const FEATURES = [
  {
    icon: 'user',
    title: 'One Account, Every Role',
    description:
      'Register once as a Student/Parent and sign in from any device - your profile, session and role travel with you.',
  },
  {
    icon: 'lock',
    title: 'Secure by Default',
    description:
      'Passwords are hashed, sessions live in httpOnly cookies, and every reset link expires - no plaintext credentials, ever.',
  },
  {
    icon: 'mail',
    title: 'Self-Service Password Recovery',
    description:
      'Forgot your password? Request a reset link by email and get back into your account in two quick steps.',
  },
];


const TESTIMONIALS = [
  {
    quote:
      'Creating my account took less than a minute, and I never have to remember which portal to log into - one login for everything.',
    name: 'Dinuka Rathnayake',
    role: 'Grade 11 Mathematics Student',
  },
  {
    quote:
      "Password resets used to mean emailing the office. Now it's self-service, and my son's account has never been more secure.",
    name: 'Kamala Sivakumar',
    role: 'Parent',
  },
];


function HomePage() {
  const { user, isLoggedIn } = useAuth();

  if (isLoggedIn) {
    
    return (
      <div className="page">
        <div className="page-header">
          <h1>Welcome back, {user.fullName.split(' ')[0]}</h1>
          <p className="muted">Manage your account details from here.</p>
        </div>

        <div className="summary-grid">
          <Link to="/profile" className="card link-card">
            <div className="feature-icon-box">
              <Icon name="user" size={22} />
            </div>
            <h2>My Profile</h2>
            <p className="muted">Update your details, phone number, or change your password.</p>
          </Link>
        </div>
      </div>
    );
  }

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
          <img src={heroMediaImg} alt="Students collaborating in a Brilliant Institute classroom" />
        </div>
      </section>

      <section id="about" className="section section-bg-soft">
        <div className="container">
          <div className="section-heading">
            <span className="eyebrow">Account &amp; Security</span>
            <h2>Everything you need to get started</h2>
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

      <Footer
        linkGroups={[
          {
            heading: 'Account',
            links: [
              { label: 'Log in', to: '/login' },
              { label: 'Register', to: '/register' },
              { label: 'Forgot password', to: '/forgot-password' },
            ],
          },
        ]}
      />
    </>
  );
}

export default HomePage;
