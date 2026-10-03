import { Link } from 'react-router-dom';
import Icon from '../common/Icon';
import Logo from '../common/Logo';
import authArtImg from '../../assets/auth-panel-art.webp';

function AuthLayout({ children, quote, backTo = '/', backLabel = 'Back to Home', imageSrc }) {
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
          <img src={imageSrc || authArtImg} alt="" aria-hidden="true" />
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
