import { Link } from 'react-router-dom';
import Icon from '../common/Icon';
import Logo from '../common/Logo';

// Decorative right-hand panel graphic - a dependency-free stand-in for the
// illustration in the mockups (hand-drawn SVG, not a photo/asset file).
function AuthArt() {
  return (
    <svg width="230" height="230" viewBox="0 0 230 230" fill="none" aria-hidden="true">
      <circle cx="115" cy="115" r="95" stroke="rgba(201,169,97,0.35)" strokeWidth="1" strokeDasharray="3 6" />
      <circle cx="115" cy="115" r="60" stroke="rgba(148,163,184,0.35)" strokeWidth="1" />
      <g stroke="#c9a961" strokeWidth="1.6" strokeLinecap="round">
        <path d="M60 150c10-45 35-70 55-70s45 25 55 70" opacity="0.8" />
        <path d="M75 95c15-12 65-12 80 0" opacity="0.6" />
      </g>
      <g fill="#c9a961">
        <circle cx="60" cy="150" r="4" />
        <circle cx="170" cy="150" r="4" />
        <circle cx="115" cy="80" r="5" />
      </g>
      <g fill="#2563eb">
        <rect x="42" y="60" width="26" height="20" rx="4" opacity="0.85" />
        <rect x="160" y="66" width="26" height="20" rx="4" opacity="0.7" />
        <rect x="96" y="150" width="38" height="26" rx="4" opacity="0.8" />
      </g>
    </svg>
  );
}

function AuthLayout({ children, quote, backTo = '/', backLabel = 'Back to Home' }) {
  return (
    <div className="auth-shell">
      <div className="auth-shell-form">
        <Link to={backTo} className="auth-back-link">
          <Icon name="chevronLeft" size={16} /> {backLabel}
        </Link>
        <div className="auth-form-inner">
          <Logo />
          {children}
        </div>
      </div>

      <div className="auth-shell-panel">
        <div className="auth-shell-panel-art">
          <AuthArt />
        </div>
        {quote && (
          <div className="auth-shell-quote">
            <p>&ldquo;{quote.text}&rdquo;</p>
            <div className="quote-author">
              <strong>{quote.author}</strong>
              {quote.role}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default AuthLayout;
