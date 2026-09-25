// forgot password page - step 1
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { requestPasswordReset } from '../../api/authApi';
import FormField from '../../../../shared/client/src/components/common/FormField';
import Alert from '../../../../shared/client/src/components/common/Alert';
import Icon from '../../../../shared/client/src/components/common/Icon';
import AuthLayout from '../../../../shared/client/src/components/layout/AuthLayout';

function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [fieldError, setFieldError] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setErrorMessage('');

    if (!email.trim()) {
      setFieldError('Please enter your email.');
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setFieldError('Please enter a valid email address.');
      return;
    }
    setFieldError('');

    setIsSubmitting(true);
    try {
      await requestPasswordReset(email);
      setSubmitted(true);
    } catch (error) {
      const details = Array.isArray(error.details) ? error.details : [];
      const emailDetail = details.find((d) => d.field === 'email');
      if (emailDetail) { setFieldError(emailDetail.message); setErrorMessage(''); }
      else setErrorMessage(error.message);
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
            If an account exists for that email, we&apos;ve sent it a password reset link. It works
            once and expires in 30 minutes. No email? Contact the office and they can give you a
            reset link in person.
          </p>

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

      <form onSubmit={handleSubmit} noValidate>
        <FormField
          id="email"
          label="Email Address"
          type="email"
          icon="mail"
          placeholder="Please enter your registered email..."
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldError}
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
