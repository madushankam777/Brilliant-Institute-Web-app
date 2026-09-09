import { Link } from 'react-router-dom';
import Logo from '../common/Logo';

/**
 * Marketing footer shown at the bottom of each module's public landing
 * page. `linkGroups` lets each module list only the routes that actually
 * exist in its own app (no dead links to pages owned by other modules).
 */
function Footer({ linkGroups = [] }) {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-grid">
          <div className="footer-brand">
            <Logo dark />
            <p>
              Transforming tuition class management with intelligent tools built for
              forward-thinking administrators, tutors, and eager learners.
            </p>
          </div>

          {linkGroups.map((group) => (
            <div key={group.heading}>
              <h4 className="footer-heading">{group.heading}</h4>
              <ul className="footer-list">
                {group.links.map((link) => (
                  <li key={link.label}>
                    {link.to ? <Link to={link.to}>{link.label}</Link> : <span>{link.label}</span>}
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div>
            <h4 className="footer-heading">Contact</h4>
            <ul className="footer-list">
              <li>
                <a href="mailto:support@brilliantinstitute.edu">support@brilliantinstitute.edu</a>
              </li>
              <li>
                <a href="tel:0112347728">0112 347 728</a>
              </li>
              <li>
                <span>136, Sangamitha Mawatha, Colombo - 13</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="footer-bottom">
          <span>&copy; {new Date().getFullYear()} Brilliant Institute. All rights reserved.</span>
          <div className="footer-bottom-links">
            <span>Privacy Policy</span>
            <span>Terms of Service</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
