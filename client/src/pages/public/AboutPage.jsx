// Public "About Us" page. The numbers come live from the database.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchInstituteOverview } from '../../api/contactApi';
import { useAuth } from '../../context/AuthContext';
import Icon from '../../../../shared/client/src/components/common/Icon';
import Footer from '../../../../shared/client/src/components/layout/Footer';
import heroMediaImg from '../../../../shared/client/src/assets/hero-media.png';

const VALUES = [
  {
    icon: 'target',
    title: 'Focused on results',
    text: 'Every class follows a fixed weekly timetable, so students build a steady study routine through the year.',
  },
  {
    icon: 'users',
    title: 'Parents stay informed',
    text: 'Attendance, fee balances and class changes show up straight away - no more guessing or phone calls.',
  },
  {
    icon: 'calendarDays',
    title: 'Clear, honest schedules',
    text: 'Public holidays, cancelled days and extra classes appear on every calendar the moment they are set.',
  },
  {
    icon: 'heart',
    title: 'Always reachable',
    text: 'Students and parents can message the office or their tutor any time, and follow every reply in one place.',
  },
];

const STEPS = [
  { title: 'Create an account', text: 'Register online as a student or parent in under a minute.' },
  { title: 'Choose your classes', text: 'Browse classes by subject, grade and day, then enrol.' },
  { title: 'Learn and track progress', text: 'Check in to class, see your attendance and pay fees online.' },
];

function StatBlock({ value, label }) {
  return (
    <div className="about-stat">
      <span className="about-stat-value">{value}</span>
      <span className="about-stat-label">{label}</span>
    </div>
  );
}

function AboutPage() {
  const { isLoggedIn } = useAuth();
  const [overview, setOverview] = useState(null);

  useEffect(() => {
    fetchInstituteOverview()
      .then(setOverview)
      .catch(() => setOverview(null));
  }, []);

  return (
    <>
      <section className="container hero">
        <div className="hero-copy">
          <span className="eyebrow">About Us</span>
          <h1>Helping every student reach their best</h1>
          <p>
            Brilliant Institute is a tuition institute in Colombo 13 offering classes from Grade 6 up to A/L. Our
            tutors run regular weekly classes, and our online portal keeps students, parents and tutors connected
            from the first class to the final exam.
          </p>
          <div className="hero-actions">
            <Link to={isLoggedIn ? '/courses/classes' : '/register'} className="btn btn-primary">
              {isLoggedIn ? 'Browse classes' : 'Join the institute'}
            </Link>
            <Link to="/contact" className="btn btn-secondary">
              Contact us
            </Link>
          </div>
        </div>
        <div className="hero-media">
          <img src={heroMediaImg} alt="Students learning together at Brilliant Institute" />
        </div>
      </section>

      {overview && (
        <section className="container">
          <div className="about-stats">
            <StatBlock value={overview.classCount} label="Weekly classes" />
            <StatBlock value={overview.tutorCount} label="Tutors" />
            <StatBlock value={overview.studentCount} label="Students & parents" />
            <StatBlock value={overview.subjects.length} label="Subject areas" />
          </div>
        </section>
      )}

      <section className="section">
        <div className="container about-split">
          <div>
            <span className="eyebrow">Our mission</span>
            <h2 className="about-title">Good teaching, made simple to follow</h2>
            <p className="muted">
              We believe students learn best when they have a steady routine, tutors who know them, and parents who
              can see how they are doing. That is why we pair classroom teaching with a portal where attendance, fees,
              timetables and messages are always up to date.
            </p>
            <p className="muted">
              Whether you are preparing for the O/L or A/L, or building strong basics in the middle grades, we are
              here to guide you one class at a time.
            </p>
          </div>

          <div className="card about-offer">
            <h3>What we teach</h3>
            {overview && overview.subjects.length > 0 ? (
              <div className="about-chips">
                {overview.subjects.map((subject) => (
                  <span key={subject} className="about-chip">
                    {subject}
                  </span>
                ))}
              </div>
            ) : (
              <p className="muted">Mathematics, Science and Languages for secondary students.</p>
            )}
            <h3>Grades</h3>
            {overview && overview.grades.length > 0 ? (
              <div className="about-chips">
                {overview.grades.map((grade) => (
                  <span key={grade} className="about-chip">
                    {grade}
                  </span>
                ))}
              </div>
            ) : (
              <p className="muted">Grade 6 to A/L.</p>
            )}
          </div>
        </div>
      </section>

      <section className="section section-bg-soft">
        <div className="container">
          <div className="section-heading">
            <span className="eyebrow">What we stand for</span>
            <h2>Why families choose us</h2>
          </div>
          <div className="feature-grid about-values">
            {VALUES.map((value) => (
              <div key={value.title} className="feature-card">
                <div className="feature-icon-box">
                  <Icon name={value.icon} size={22} />
                </div>
                <h3>{value.title}</h3>
                <p>{value.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-heading">
            <span className="eyebrow">Getting started</span>
            <h2>Join in three easy steps</h2>
          </div>
          <ol className="about-steps">
            {STEPS.map((step, index) => (
              <li key={step.title} className="about-step">
                <span className="about-step-number">{index + 1}</span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="container">
        <div className="about-cta">
          <div>
            <h2>Have a question before you join?</h2>
            <p>Our office is happy to help with classes, fees and timetables.</p>
          </div>
          <Link to="/contact" className="btn btn-primary">
            <Icon name="send" size={16} /> Get in touch
          </Link>
        </div>
      </section>

      <Footer />
    </>
  );
}

export default AboutPage;
