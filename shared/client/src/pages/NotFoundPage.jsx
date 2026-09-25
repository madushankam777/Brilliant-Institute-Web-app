import { Link } from 'react-router-dom';
import Icon from '../components/common/Icon';

function NotFoundPage() {
  return (
    <div className="not-found">
      <span className="not-found-code">404</span>
      <h1>Page not found</h1>
      <p className="muted">The page you are looking for doesn&apos;t exist or may have been moved.</p>
      <div className="hero-actions">
        <Link to="/" className="btn btn-primary">
          <Icon name="home" size={16} /> Go to home
        </Link>
        <Link to="/contact" className="btn btn-secondary">
          Contact us
        </Link>
      </div>
    </div>
  );
}

export default NotFoundPage;
