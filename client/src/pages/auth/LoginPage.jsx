// Login page: check the user's email/password
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import FormField from '../../../../shared/client/src/components/common/FormField';
import Alert from '../../../../shared/client/src/components/common/Alert';
import AuthLayout from '../../../../shared/client/src/components/layout/AuthLayout';

function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const justRegistered = Boolean(location.state && location.state.justRegistered);
  const redirectTo = location.state && location.state.from ? location.state.from.pathname : null;

  function validate() {
    const errors = {};
    if (!email.trim()) {
      errors.email = 'Please enter your email.';
    } else if (!/^\S+@\S+\.\S+$/.test(email)) {
      errors.email = 'Please enter a valid email address.';
    }
    if (!password) {
      errors.password = 'Please enter your password.';
    }
    return errors;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setFormError('');

    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setIsSubmitting(true);
    try {
      await login({ email, password });
      // Go back to the page the user came from, or the dashboard.
      navigate(redirectTo || '/', { replace: true });
    } catch (error) {
      const details = Array.isArray(error.details) ? error.details : [];
      if (details.length > 0) {
        const mapped = {};
        details.forEach((d) => { if (d.field && !mapped[d.field]) mapped[d.field] = d.message; });
        setFieldErrors(mapped);
        setFormError('');
      } else {
        setFormError(error.message);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthLayout
      imageSrc="/login-art.webp"
      quote={{
        text: 'We can view classes, get assignments, and check fee status instantly. It has completely transformed our learning.',
        author: 'Nimal Perera',
        role: 'Grade 11 Mathematics Student',
      }}
    >
      <h1>Welcome Back</h1>
      <p className="muted">Please enter your credentials to access your tuition dashboard</p>

      {justRegistered && (
        <Alert type="success" message="Account created successfully. Please log in." />
      )}
      <Alert type="error" message={formError} />

      <form onSubmit={handleSubmit} noValidate>
        <FormField
          id="email"
          label="Email Address"
          type="email"
          icon="mail"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldErrors.email}
          autoComplete="email"
          required
        />
        <FormField
          id="password"
          label="Password"
          type="password"
          icon="lock"
          placeholder="Enter your password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldErrors.password}
          autoComplete="current-password"
          required
        />

        <p className="center-text" style={{ textAlign: 'right', marginTop: '-8px' }}>
          <Link to="/forgot-password" style={{ fontSize: '0.85rem', fontWeight: 600 }}>
            Forgot Password?
          </Link>
        </p>

        <button type="submit" className="btn btn-primary btn-block" disabled={isSubmitting}>
          {isSubmitting ? 'Logging in...' : 'Login'}
        </button>
      </form>

      <div className="form-divider">Or</div>

      <p className="auth-footer-note">
        Don&apos;t have an account yet? <Link to="/register">Register here</Link>
      </p>
    </AuthLayout>
  );
}

export default LoginPage;
