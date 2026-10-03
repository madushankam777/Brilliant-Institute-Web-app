// sign-in page layout - the form on one side, a picture and a quote on the other
import { Link } from 'react-router-dom';
import Icon from '../common/Icon';
import Logo from '../common/Logo';
import authArtImg from '../../assets/auth-panel-art.webp';

// auth layout - wraps the login, register and reset pages
function AuthLayout({ children, quote, backTo = '/', backLabel = 'Back to Home', imageSrc }) {
  return (
    <div className="auth-shell">
      {/* the form side - back link, logo and the page's form */}
      <div className="auth-shell-form">
        <Link to={backTo} className="auth-back-link">
          <Icon name="chevronLeft" size={16} /> {backLabel}
        </Link>
        <div className="auth-form-inner">
          <Logo />
          {children}
        </div>
      </div>

      {/* the picture side - artwork and an optional quote */}
      <div className="auth-shell-panel">
        <div className="auth-shell-panel-art">
          <img src={imageSrc || authArtImg} alt="" aria-hidden="true" />
        </div>
        {/* quote */}
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
