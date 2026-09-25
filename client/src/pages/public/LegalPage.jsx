// Privacy Policy and Terms of Service - short, plain-language pages.
import { Link } from 'react-router-dom';
import Footer from '../../../../shared/client/src/components/layout/Footer';
import { INSTITUTE } from '../../../../shared/client/src/constants/institute';

const UPDATED = '25 September 2026';

const PAGES = {
  privacy: {
    title: 'Privacy Policy',
    intro: 'How Brilliant Institute collects, uses and protects your information when you use this website.',
    sections: [
      {
        heading: 'What we collect',
        points: [
          'Account details: name, email address, phone number, grade and an optional profile photo.',
          'Class records: the classes you join, attendance, fee balances, payments and bank slips you upload.',
          'Messages you send us through Feedback or the Contact Us form.',
          'Tutors also give bank details so the institute can pay them. Only administrators can see them, and every view is logged.',
        ],
      },
      {
        heading: 'How we use it',
        points: [
          'To run your classes: timetables, attendance, fees, receipts and reminders.',
          'To contact you about your classes, payments or messages you have sent us.',
          'We never sell your information or share it for advertising.',
        ],
      },
      {
        heading: 'Payments',
        points: [
          'Online card payments are handled by PayHere. Your card details go straight to PayHere and are never stored by us.',
          'We keep a record of each payment (amount, date and reference) for receipts and accounts.',
        ],
      },
      {
        heading: 'Cookies',
        points: [
          'We use one secure sign-in cookie to keep you logged in. It cannot be read by page scripts and ends when your session expires.',
          'Your browser also remembers your cookie choice and a few display settings. We do not use tracking or advertising cookies.',
        ],
      },
      {
        heading: 'Who can see your information',
        points: [
          'Students and parents see only their own records.',
          'Tutors see the students enrolled in their own classes.',
          'Institute administrators can see all records to run the institute, and important actions are logged.',
        ],
      },
      {
        heading: 'Keeping it safe',
        points: [
          'Passwords are stored in a scrambled (hashed) form, so nobody - including our staff - can read them.',
          'Password reset links expire, and repeated failed logins are slowed down.',
        ],
      },
      {
        heading: 'Your choices',
        points: [
          'You can update your details and photo on your profile page at any time.',
          'To correct or remove your information, contact the office using the details below.',
        ],
      },
    ],
  },
  terms: {
    title: 'Terms of Service',
    intro: 'The rules for using the Brilliant Institute website and portal. By creating an account you agree to them.',
    sections: [
      {
        heading: 'Your account',
        points: [
          'Give correct details when you register, and keep your password private.',
          'Each account is for one person. Parents may manage the account for their child.',
          'Tell the office straight away if you think someone else has used your account.',
        ],
      },
      {
        heading: 'Classes and timetables',
        points: [
          'Classes run on their weekly day and time. No classes are held on public holidays.',
          'A tutor or the office may cancel a class day or add an extra class. You will be notified in the portal.',
          'Students may need a re-registration key from the office to continue into the next academic year.',
        ],
      },
      {
        heading: 'Fees and payments',
        points: [
          'Class fees are shown on your Fees page. Please pay them on time.',
          'You can pay online by card or upload a bank slip. A slip is confirmed once the office has checked it.',
          'Ask the office about refunds - they are handled case by case.',
        ],
      },
      {
        heading: 'Using the portal',
        points: [
          'Be respectful in messages to tutors and staff.',
          'Only mark attendance for yourself, and only when you are at the class.',
          'Do not try to access other people\'s records or disrupt the website.',
        ],
      },
      {
        heading: 'Changes',
        points: [
          'We may update these terms. The date at the top shows the latest version.',
          'Accounts that break these rules may be suspended by the office.',
        ],
      },
    ],
  },
};

function LegalPage({ type }) {
  const page = PAGES[type];
  return (
    <>
      <article className="container legal-page">
        <h1>{page.title}</h1>
        <p className="muted">Last updated: {UPDATED}</p>
        <p className="legal-intro">{page.intro}</p>

        {page.sections.map((section) => (
          <section key={section.heading}>
            <h2>{section.heading}</h2>
            <ul>
              {section.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </section>
        ))}

        <section>
          <h2>Contact</h2>
          <p>
            Questions? Email <a href={`mailto:${INSTITUTE.email}`}>{INSTITUTE.email}</a>, call{' '}
            <a href={INSTITUTE.phoneHref}>{INSTITUTE.phone}</a> or use our <Link to="/contact">contact form</Link>.
          </p>
        </section>
      </article>
      <Footer />
    </>
  );
}

export default LegalPage;
