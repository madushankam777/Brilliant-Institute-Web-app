// About Us page
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchPublicTutors } from '../../api/contactApi';
import { useAuth } from '../../context/AuthContext';
import Avatar from '../../../../shared/client/src/components/common/Avatar';
import Icon from '../../../../shared/client/src/components/common/Icon';
import Footer from '../../../../shared/client/src/components/layout/Footer';

// image from shared/client/public
const ABOUT_IMAGE = '/about%20us.jpg';

const MISSION = [
  'Teach clear, syllabus-focused lessons with tutors who know their students.',
  'Keep a steady weekly routine, with timetables everyone can see.',
  'Keep parents informed about attendance, fees and class changes.',
  'Make joining, paying and asking for help simple and secure.',
];

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

const FAQS = [
  {
    q: 'How do I join a class?',
    a: 'Create an account as a student or parent, open Browse Classes, pick a class by subject, grade and day, and enrol. The fee then appears on your Fees page.',
  },
  {
    q: 'What is my registration number?',
    a: 'Every student gets a registration number (for example ST0000123) when they register. You can see it on your dashboard and profile page. Please write it on every bank slip.',
  },
  {
    q: 'How can I pay the class fees?',
    a: 'Upload a photo of your bank transfer slip on the Fees page, or pay at the office in cash or with a bank deposit slip. Every payment gets a receipt in your payment history.',
  },
  {
    q: 'Are classes held on public holidays?',
    a: 'No. Public holidays are marked on every calendar and timetable, and no classes run on those days.',
  },
  {
    q: 'What if a class is cancelled or an extra class is added?',
    a: 'The change shows on your calendar and timetable straight away, and you get a notification in the portal.',
  },
  {
    q: 'How is attendance recorded?',
    a: 'Tutors mark attendance in class, or show a short attendance key that students enter on their phone. Parents can see the full attendance history.',
  },
  {
    q: 'I forgot my password. What do I do?',
    a: 'Click "Forgot password" on the login page. We email you a 6-digit code - enter it with a new password and you are logged straight in.',
  },
  {
    q: 'Do students need to register again each year?',
    a: 'Yes. Near the end of the year the office gives each continuing student a re-registration key to confirm their place for the next grade.',
  },
];

function AboutPage() {
  const { isLoggedIn } = useAuth();
  const [tutors, setTutors] = useState([]);

  useEffect(() => {
    fetchPublicTutors()
      .then(setTutors)
      .catch(() => setTutors([]));
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
        <div className="hero-media about-hero-media">
          <img src={ABOUT_IMAGE} alt="A student exploring new ideas with digital learning" />
        </div>
      </section>

      {/* vision and mission */}
      <section className="section">
        <div className="container about-vm">
          <div className="about-vm-card">
            <div className="feature-icon-box">
              <Icon name="eye" size={22} />
            </div>
            <span className="eyebrow">Our vision</span>
            <h2>A place where every student can succeed</h2>
            <p>
              To be the tuition institute families trust most - where every student from Grade 6 to A/L gets the
              guidance, routine and confidence to reach their best.
            </p>
          </div>
          <div className="about-vm-card">
            <div className="feature-icon-box">
              <Icon name="target" size={22} />
            </div>
            <span className="eyebrow">Our mission</span>
            <h2>What we do every day</h2>
            <ul className="about-mission-list">
              {MISSION.map((item) => (
                <li key={item}>
                  <Icon name="checkCircle" size={18} />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
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

      {/* meet our tutors */}
      {tutors.length > 0 && (
        <section className="section">
          <div className="container">
            <div className="section-heading">
              <span className="eyebrow">Our team</span>
              <h2>Meet our tutors</h2>
              <p className="muted">Teachers who know the syllabus - and know their students.</p>
            </div>
            <div className="about-tutors">
              {tutors.map((tutor) => (
                <div key={tutor.id} className="about-tutor">
                  <Avatar name={tutor.fullName} pictureUrl={tutor.profilePictureUrl} size={72} />
                  <h3>{tutor.fullName}</h3>
                  {tutor.bio && <p className="muted">{tutor.bio}</p>}
                  <div className="about-tutor-subjects">
                    {tutor.subjects.map((subject) => (
                      <span key={subject}>{subject}</span>
                    ))}
                  </div>
                  <Link to={`/courses/tutors/${tutor.id}`} className="btn btn-ghost btn-sm">
                    View classes <Icon name="arrowRight" size={14} />
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="section section-bg-soft">
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

      {/* questions parents ask */}
      <section className="section">
        <div className="container about-faq-wrap">
          <div className="section-heading">
            <span className="eyebrow">FAQ</span>
            <h2>Questions parents and students ask</h2>
          </div>
          <div className="about-faq">
            {FAQS.map((item) => (
              <details key={item.q} className="about-faq-item">
                <summary>
                  {item.q}
                  <Icon name="chevronDown" size={18} />
                </summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
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
