// Login page: check the user's email/password
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import FormField from '../../../../shared/client/src/components/common/FormField';
import Alert from '../../../../shared/client/src/components/common/Alert';
import AuthLayout from '../../../../shared/client/src/components/layout/AuthLayout';

// login page - the email and password form
function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // form fields and their errors
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // show a success message when the user has just registered
  const justRegistered = Boolean(location.state && location.state.justRegistered);

  // check the form before sending it
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

  // login btn - validate, log in, then always open the user's own dashboard first
  async function handleSubmit(event) {
    event.preventDefault();
    setFormError('');

    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setIsSubmitting(true);
    try {
      const loggedIn = await login({ email, password });
      // every login starts on the dashboard for that role
      navigate(loggedIn && loggedIn.role === 'ADMIN' ? '/admin/dashboard' : '/', { replace: true });
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

  // the page - welcome text, the form and the register link
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

      {/* login form - email, password and the forgot password link */}
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

      {/* link to the register page */}
      <div className="form-divider">Or</div>

      <p className="auth-footer-note">
        Don&apos;t have an account yet? <Link to="/register">Register here</Link>
      </p>
    </AuthLayout>
  );
}

export default LoginPage;
