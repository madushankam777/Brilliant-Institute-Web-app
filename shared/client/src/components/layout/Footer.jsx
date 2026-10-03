// site footer - logo, links, contact details and the legal links
import { Link } from 'react-router-dom';
import Logo from '../common/Logo';
import { INSTITUTE } from '../../constants/institute';

// the link columns in the footer
const DEFAULT_LINK_GROUPS = [
  {
    heading: 'Institute',
    links: [
      { label: 'About Us', to: '/about' },
      { label: 'Contact Us', to: '/contact' },
      { label: 'Classes', to: '/courses/classes' },
    ],
  },
  {
    heading: 'Account',
    links: [
      { label: 'Log in', to: '/login' },
      { label: 'Register', to: '/register' },
      { label: 'Forgot password', to: '/forgot-password' },
    ],
  },
];

// footer - shown on the public pages
function Footer({ linkGroups = DEFAULT_LINK_GROUPS }) {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-grid">
          {/* logo and a short description */}
          <div className="footer-brand">
            <Logo dark />
            <p>
              Classes for Grade 6 to A/L in Colombo, with attendance, fees and timetables in one secure place for
              students, parents and tutors.
            </p>
          </div>

          {/* the link columns */}
          {linkGroups.map((group) => (
            <div key={group.heading}>
              <h4 className="footer-heading">{group.heading}</h4>
              <ul className="footer-list">
                {group.links.map((link) => (
                  <li key={link.label}>
                    <Link to={link.to}>{link.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* contact details - email, phone and address */}
          <div>
            <h4 className="footer-heading">Contact</h4>
            <ul className="footer-list">
              <li>
                <a href={`mailto:${INSTITUTE.email}`}>{INSTITUTE.email}</a>
              </li>
              <li>
                <a href={INSTITUTE.phoneHref}>{INSTITUTE.phone}</a>
              </li>
              <li>
                <span>{INSTITUTE.address}</span>
              </li>
            </ul>
          </div>
        </div>

        {/* copyright and the privacy and terms links */}
        <div className="footer-bottom">
          <span>&copy; {new Date().getFullYear()} Brilliant Institute. All rights reserved.</span>
          <div className="footer-bottom-links">
            <Link to="/privacy">Privacy Policy</Link>
            <Link to="/terms">Terms of Service</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
