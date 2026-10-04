// home page - the public landing page, or the student or tutor dashboard when logged in
import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { fetchMyAttendanceHistory } from '../api/attendanceApi';
import { fetchMyBalances, fetchMyBankDetails } from '../api/paymentApi';
import { fetchMyTimetable } from '../api/courseApi';
import { fetchMyStudents, fetchMyReminders } from '../api/adminApi';
import { useUpcomingHolidays } from '../hooks/useHolidays';
import { useUpcomingClassEvents } from '../hooks/useClassEvents';
import Icon from '../../../shared/client/src/components/common/Icon';
import StatCard from '../../../shared/client/src/components/common/StatCard';
import LoadingSpinner from '../../../shared/client/src/components/common/LoadingSpinner';
import WeeklyTimetable from '../../../shared/client/src/components/common/WeeklyTimetable';
import Footer from '../../../shared/client/src/components/layout/Footer';
import PortalShell from '../../../shared/client/src/components/layout/PortalShell';
import { getNavItems } from '../../../shared/client/src/components/layout/navItems';
import {
  describeNextClass,
  findNextClass,
  occurrencesOn,
  todayKey,
} from '../../../shared/client/src/utils/schedule';
import heroMediaImg from '../../../shared/client/src/assets/hero-media.webp';
import ModalClose from '../../../shared/client/src/components/common/ModalClose';

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

// a number as LKR money
function formatCurrency(amount) {
  return new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' }).format(amount);
}

// "Next class" stat card, shared by the student and tutor dashboards
function NextClassCard({ classes, holidays, events }) {
  const next = findNextClass(classes, new Date(), holidays, events);
  return (
    <StatCard
      icon="clock"
      label="Next Class"
      value={next ? describeNextClass(next) : '-'}
      sub={next ? next.classItem.subject : 'Nothing in the next two weeks'}
      tone={next && next.isToday ? 'warning' : 'default'}
      small
    />
  );
}

// student dashboard - attendance rate, fee balance, next class, timetable and shortcuts
function StudentDashboard({ user }) {
  const [summaryByClass, setSummaryByClass] = useState([]);
  const [balances, setBalances] = useState([]);
  const [classes, setClasses] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const holidays = useUpcomingHolidays();
  const events = useUpcomingClassEvents();

  // load attendance, fees and the timetable together (one failing does not blank the page)
  useEffect(() => {
    let isMounted = true;
    // loaded independently - one failure doesn't blank the whole dashboard
    Promise.allSettled([fetchMyAttendanceHistory(), fetchMyBalances(), fetchMyTimetable()]).then(
      ([attendance, balanceList, timetable]) => {
        if (!isMounted) return;
        if (attendance.status === 'fulfilled') setSummaryByClass(attendance.value.summaryByClass || []);
        if (balanceList.status === 'fulfilled') setBalances(balanceList.value || []);
        if (timetable.status === 'fulfilled') setClasses(timetable.value.classes || []);
        setIsLoading(false);
      }
    );
    return () => {
      isMounted = false;
    };
  }, []);

  // attendance rate over all classes, and the fees still owed
  const totalAttended = summaryByClass.reduce((sum, s) => sum + s.attendedSessions, 0);
  const totalSessions = summaryByClass.reduce((sum, s) => sum + s.totalSessions, 0);
  const overallRate = totalSessions > 0 ? Math.round((totalAttended / totalSessions) * 100) : null;
  const pendingFees = balances.reduce((sum, b) => sum + Number(b.balance), 0);

  // the dashboard - welcome, stat cards, the timetable and shortcut cards
  return (
    <div className="page">
      <div className="page-header">
        <h1>Welcome back, {user.fullName.split(' ')[0]}!</h1>
        <p className="muted">
          Here&apos;s a snapshot of your classes, attendance and fees.
          {user.studentCode && (
            <>
              {' '}Registration number: <span className="reg-no">{user.studentCode}</span>
            </>
          )}
        </p>
      </div>

      {isLoading ? (
        <LoadingSpinner label="Loading your dashboard..." />
      ) : (
        <>
          {/* stat cards - attendance, fees and next class */}
          <div className="stat-grid">
            <StatCard
              icon="book"
              label="Enrolled Classes"
              value={classes.length || balances.length}
              to="/courses/my-courses"
            />
            <StatCard
              icon="calendar"
              label="Attendance Rate"
              value={overallRate === null ? '-' : `${overallRate}%`}
              sub={overallRate === null ? 'No sessions yet' : overallRate >= 80 ? 'On track' : 'Needs attention'}
              tone={overallRate !== null && overallRate < 80 ? 'warning' : 'success'}
              to="/attendance/history"
            />
            <StatCard
              icon="wallet"
              label="Pending Fees"
              value={formatCurrency(pendingFees)}
              tone={pendingFees > 0 ? 'warning' : 'success'}
              to="/payments"
            />
            <NextClassCard classes={classes} holidays={holidays} events={events} />
          </div>

          {/* weekly timetable */}
          <div className="card">
            <div className="flex-between" style={{ marginBottom: '12px' }}>
              <h2 style={{ margin: 0 }}>My Weekly Timetable</h2>
              <Link to="/calendar" className="btn btn-secondary btn-sm">
                Open Calendar
              </Link>
            </div>
            <WeeklyTimetable
              classes={classes}
              holidays={holidays}
              events={events}
              showTutor
              emptyMessage="You're not enrolled in any classes yet - browse classes to get started."
            />
          </div>
        </>
      )}

      <div className="summary-grid quick-links">
        <Link to="/courses/classes" className="card link-card">
          <div className="feature-icon-box">
            <Icon name="search" size={22} />
          </div>
          <h2>Browse Classes</h2>
          <p className="muted">Find and enrol in classes taught by our tutors.</p>
        </Link>
        <Link to="/courses/my-courses" className="card link-card">
          <div className="feature-icon-box">
            <Icon name="book" size={22} />
          </div>
          <h2>My Courses</h2>
          <p className="muted">See the classes you&apos;re currently enrolled in.</p>
        </Link>
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
        <Link to="/feedback" className="card link-card">
          <div className="feature-icon-box">
            <Icon name="chat" size={22} />
          </div>
          <h2>Feedback</h2>
          <p className="muted">Raise a complaint or share feedback with staff.</p>
        </Link>
        <Link to="/profile" className="card link-card">
          <div className="feature-icon-box">
            <Icon name="user" size={22} />
          </div>
          <h2>My Profile</h2>
          <p className="muted">Update your details or change your password.</p>
        </Link>
      </div>
    </div>
  );
}

// ask new tutors once for bank details
function useBankDetailsPrompt() {
  const [needsBankDetails, setNeedsBankDetails] = useState(false);

  // check once per visit whether the tutor has saved bank details
  useEffect(() => {
    let isMounted = true;
    const dismissKey = 'brilliant_bank_prompt_dismissed';
    let alreadyDismissed = false;
    try {
      alreadyDismissed = window.sessionStorage.getItem(dismissKey) === 'true';
    } catch {
      alreadyDismissed = false;
    }
    if (alreadyDismissed) return undefined;

    fetchMyBankDetails()
      .then((details) => {
        if (!isMounted) return;
        setNeedsBankDetails(!details || (!details.bankName && !details.accountNumber));
      })
      .catch(() => {
        /* non-critical - the Profile page surfaces any real error */
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // remember (for this visit) that the prompt was closed
  function dismiss() {
    try {
      window.sessionStorage.setItem('brilliant_bank_prompt_dismissed', 'true');
    } catch {
      /* storage may be unavailable */
    }
    setNeedsBankDetails(false);
  }

  return { needsBankDetails, dismiss };
}

// pop-up asking a new tutor to add their banking details
function BankDetailsPrompt({ onDismiss }) {
  return (
    <div className="modal-overlay" onClick={onDismiss}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <ModalClose onClose={onDismiss} />
        <h2>Add your banking details</h2>
        <p className="muted">
          The institute pays tutors by bank transfer, and we don&apos;t have an account on file for you
          yet. Add it on your profile so your payouts aren&apos;t held up.
        </p>
        <div className="flex-between" style={{ marginTop: '18px' }}>
          <button type="button" className="btn btn-secondary" onClick={onDismiss}>
            Later
          </button>
          <Link to="/profile" className="btn btn-primary" onClick={onDismiss}>
            Add banking details
          </Link>
        </div>
      </div>
    </div>
  );
}

// a reminder time as, for example, Mon 12 Oct, 3:30 PM
function formatReminderTime(sendAt) {
  return new Date(sendAt.replace(' ', 'T')).toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// tutor dashboard - classes today, students, reminders, timetable and shortcuts
function TutorDashboard({ user }) {
  const { needsBankDetails, dismiss } = useBankDetailsPrompt();
  const [classes, setClasses] = useState([]);
  const [studentCount, setStudentCount] = useState(0);
  const [reminders, setReminders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const holidays = useUpcomingHolidays();
  const events = useUpcomingClassEvents();

  // load the timetable, students and reminders together
  useEffect(() => {
    let isMounted = true;
    Promise.allSettled([fetchMyTimetable(), fetchMyStudents(), fetchMyReminders()]).then(
      ([timetable, students, reminderList]) => {
        if (!isMounted) return;
        if (timetable.status === 'fulfilled') setClasses(timetable.value.classes || []);
        if (students.status === 'fulfilled') setStudentCount((students.value || []).length);
        if (reminderList.status === 'fulfilled') {
          setReminders((reminderList.value || []).filter((item) => item.status === 'SCHEDULED'));
        }
        setIsLoading(false);
      }
    );
    return () => {
      isMounted = false;
    };
  }, []);

  // how many classes the tutor has today (none on a public holiday)
  const today = todayKey();
  const todayHoliday = holidays[today];
  const classesToday = todayHoliday
    ? 0
    : occurrencesOn(classes, events, today).filter((item) => item.kind !== 'cancelled').length;
  let classesTodayNote = classesToday > 0 ? 'Mark attendance when you start' : 'No classes today';
  if (todayHoliday) classesTodayNote = `Public holiday - ${todayHoliday}`;

  // the dashboard - greeting, stat cards, timetable, upcoming reminders and shortcut cards
  return (
    <div className="page">
      {needsBankDetails && <BankDetailsPrompt onDismiss={dismiss} />}
      <div className="page-header">
        <h1>Good day, {user.fullName.split(' ')[0]}!</h1>
        <p className="muted">Your week at a glance - open a class to take attendance for today&apos;s session.</p>
      </div>

      {isLoading ? (
        <LoadingSpinner label="Loading your dashboard..." />
      ) : (
        <>
          {/* stat cards - classes today, students and more */}
          <div className="stat-grid">
            <StatCard icon="book" label="My Classes" value={classes.length} to="/courses/manage" />
            <StatCard icon="users" label="My Students" value={studentCount} to="/students/mine" />
            <StatCard
              icon="calendar"
              label="Classes Today"
              value={classesToday}
              sub={classesTodayNote}
              tone={todayHoliday ? 'danger' : classesToday > 0 ? 'success' : 'default'}
              to="/attendance/classes"
            />
            <NextClassCard classes={classes} holidays={holidays} events={events} />
          </div>

          {/* weekly timetable */}
          <div className="card">
            <div className="flex-between" style={{ marginBottom: '12px' }}>
              <h2 style={{ margin: 0 }}>My Weekly Timetable</h2>
              <Link to="/calendar" className="btn btn-secondary btn-sm">
                Open Calendar
              </Link>
            </div>
            <WeeklyTimetable
              classes={classes}
              holidays={holidays}
              events={events}
              emptyMessage="No classes have been assigned to you yet." />
          </div>

          {/* upcoming reminders */}
          <div className="card">
            <div className="flex-between" style={{ marginBottom: '8px' }}>
              <h2 style={{ margin: 0 }}>Upcoming Reminders</h2>
              <Link to="/reminders" className="btn btn-primary btn-sm">
                <Icon name="plus" size={14} /> New reminder
              </Link>
            </div>
            {reminders.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                No reminders scheduled. Set one for yourself or your students for any date and time.
              </p>
            ) : (
              reminders.slice(0, 3).map((reminder) => (
                <div key={reminder.id} className="order-line">
                  <div>
                    <div className="order-line-title">{reminder.message}</div>
                    <div className="order-line-sub">
                      {reminder.isPersonal ? 'Only you' : `${reminder.recipientCount} student(s)`}
                    </div>
                  </div>
                  <span className="badge badge-warning">{formatReminderTime(reminder.sendAt)}</span>
                </div>
              ))
            )}
          </div>
        </>
      )}

      <div className="summary-grid quick-links">
        <Link to="/attendance/classes" className="card link-card">
          <div className="feature-icon-box">
            <Icon name="checkCircle" size={22} />
          </div>
          <h2>Mark Attendance</h2>
          <p className="muted">Open a class session and record who attended.</p>
        </Link>
        <Link to="/courses/manage" className="card link-card">
          <div className="feature-icon-box">
            <Icon name="book" size={22} />
          </div>
          <h2>My Classes</h2>
          <p className="muted">Manage the classes you teach and see who&apos;s enrolled.</p>
        </Link>
        <Link to="/students/mine" className="card link-card">
          <div className="feature-icon-box">
            <Icon name="users" size={22} />
          </div>
          <h2>My Students</h2>
          <p className="muted">See every student enrolled across your classes.</p>
        </Link>
        <Link to="/reminders" className="card link-card">
          <div className="feature-icon-box">
            <Icon name="clock" size={22} />
          </div>
          <h2>Reminders</h2>
          <p className="muted">Schedule a reminder for a date and time - for you or your students.</p>
        </Link>
        <Link to="/notify" className="card link-card">
          <div className="feature-icon-box">
            <Icon name="megaphone" size={22} />
          </div>
          <h2>Notify Students</h2>
          <p className="muted">Send a notice to your students, the office, or both.</p>
        </Link>
        <Link to="/admin/feedback" className="card link-card">
          <div className="feature-icon-box">
            <Icon name="chat" size={22} />
          </div>
          <h2>Feedback</h2>
          <p className="muted">Review and respond to student/parent feedback.</p>
        </Link>
        <Link to="/profile" className="card link-card">
          <div className="feature-icon-box">
            <Icon name="user" size={22} />
          </div>
          <h2>My Profile</h2>
          <p className="muted">Update your details or change your password.</p>
        </Link>
      </div>
    </div>
  );
}

// home page - admins go to their dashboard, students and tutors see theirs, visitors see the landing page
function HomePage() {
  const { user, isLoggedIn } = useAuth();

  if (isLoggedIn) {
    if (user.role === 'ADMIN') {
      return <Navigate to="/admin/dashboard" replace />;
    }
    return (
      <PortalShell navItems={getNavItems(user.role)}>
        {user.role === 'TUTOR' ? <TutorDashboard user={user} /> : <StudentDashboard user={user} />}
      </PortalShell>
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
