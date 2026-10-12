
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { requestPasswordReset } from '../../api/authApi';
import FormField from '../../../../../shared/client/src/components/common/FormField';
import Alert from '../../../../../shared/client/src/components/common/Alert';
import Icon from '../../../../../shared/client/src/components/common/Icon';
import AuthLayout from '../../../../../shared/client/src/components/layout/AuthLayout';

// forgot password 
function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [devOnlyResetToken, setDevOnlyResetToken] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // send btn 
  async function handleSubmit(event) {
    event.preventDefault();
    setErrorMessage('');
    setIsSubmitting(true);

    try {
      const result = await requestPasswordReset(email);
      setSubmitted(true);
      if (result.data && result.data.devOnlyResetToken) {

        setDevOnlyResetToken(result.data.devOnlyResetToken);
      }
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <AuthLayout backTo="/login" backLabel="Back to Login">
        <div className="auth-result">
          <div className="auth-result-icon">
            <Icon name="checkCircle" size={32} />
          </div>
          <h1>Check Your Email</h1>
          <p className="muted">
            We&apos;ve sent a password reset link to your email address. Please check your inbox
            and follow the instructions.
          </p>

          {devOnlyResetToken && (
            <div className="alert alert-info" style={{ textAlign: 'left' }}>
              <span>
                <strong>Development mode only:</strong> no email gateway is configured yet, so here
                is your reset token directly -{' '}
                <Link to={`/reset-password?token=${devOnlyResetToken}`}>reset your password</Link>.
              </span>
            </div>
          )}

          <Link to="/login" className="btn btn-primary btn-block" style={{ marginTop: '18px' }}>
            Back to Login
          </Link>
          <p className="auth-footer-note">
            Didn&apos;t receive the email?{' '}
            <button
              type="button"
              onClick={() => setSubmitted(false)}
              style={{ background: 'none', border: 'none', color: 'var(--color-primary)', fontWeight: 600, cursor: 'pointer', padding: 0 }}
            >
              Resend Link
            </button>
          </p>
        </div>
      </AuthLayout>
    );
  }

  
  return (
    <AuthLayout backTo="/login" backLabel="Back to Login">
      <h1>Forgot Password?</h1>
      <p className="muted">
        Enter your registered email address and we&apos;ll send you a link to reset your password.
      </p>

      <Alert type="error" message={errorMessage} />

      {/* login form - email, password and the forgot password link */}
      <form onSubmit={handleSubmit} noValidate>
        <FormField
          id="email"
          label="Email Address"
          type="email"
          icon="mail"
          placeholder="Please enter your registered email..."
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
        <button type="submit" className="btn btn-primary btn-block" disabled={isSubmitting}>
          {isSubmitting ? 'Sending...' : 'Send Reset Link'}
        </button>
      </form>

      <p className="auth-footer-note">
        Remember your password? <Link to="/login">Login here</Link>
      </p>
    </AuthLayout>
  );
}

export default ForgotPasswordPage;
