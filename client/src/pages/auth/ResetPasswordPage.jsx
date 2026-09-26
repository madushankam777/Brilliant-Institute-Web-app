// Step 2 of password reset
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { resetPassword } from '../../api/authApi';
import FormField from '../../../../shared/client/src/components/common/FormField';
import Alert from '../../../../shared/client/src/components/common/Alert';
import PasswordStrength from '../../../../shared/client/src/components/common/PasswordStrength';
import AuthLayout from '../../../../shared/client/src/components/layout/AuthLayout';

const PASSWORD_RULE_MESSAGE =
  'Password must be at least 8 characters long and include an uppercase letter, ' +
  'a lowercase letter, and a number.';

function isStrongPassword(password) {
  return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,72}$/.test(password);
}

function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const tokenFromLink = searchParams.get('token') || '';

  const [token, setToken] = useState(tokenFromLink);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setFormError('');

    const errors = {};
    if (!token.trim()) errors.token = 'The reset token is required.';
    if (!isStrongPassword(newPassword)) errors.newPassword = PASSWORD_RULE_MESSAGE;
    if (newPassword !== confirmPassword) errors.confirmPassword = 'Passwords do not match.';

    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setIsSubmitting(true);
    try {
      await resetPassword({ token, newPassword });
      navigate('/login', { replace: true, state: { justRegistered: false } });
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
    <AuthLayout backTo="/login" backLabel="Back to Login">
      <h1>Reset Your Password</h1>
      <p className="muted">Choose a new password for your account.</p>

      <Alert type="error" message={formError} />

      <form onSubmit={handleSubmit} noValidate>
        <FormField
          id="token"
          label="Reset Token"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          error={fieldErrors.token}
          required
        />
        <FormField
          id="newPassword"
          label="New Password"
          type="password"
          icon="lock"
          placeholder="Create a new password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          error={fieldErrors.newPassword}
          autoComplete="new-password"
          required
        />
        <PasswordStrength password={newPassword} />

        <FormField
          id="confirmPassword"
          label="Confirm New Password"
          type="password"
          icon="lock"
          placeholder="Re-enter new password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          error={fieldErrors.confirmPassword}
          autoComplete="new-password"
          required
        />

        <button type="submit" className="btn btn-primary btn-block" disabled={isSubmitting}>
          {isSubmitting ? 'Resetting...' : 'Reset Password'}
        </button>
      </form>

      <p className="auth-footer-note">
        <Link to="/login">Back to login</Link>
      </p>
    </AuthLayout>
  );
}

export default ResetPasswordPage;
