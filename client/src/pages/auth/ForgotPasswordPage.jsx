// forgot password page - email a code, then type the code and a new password
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { requestPasswordReset, resetPasswordWithCode } from '../../api/authApi';
import { useAuth } from '../../context/AuthContext';
import FormField from '../../../../shared/client/src/components/common/FormField';
import Alert from '../../../../shared/client/src/components/common/Alert';
import PasswordStrength from '../../../../shared/client/src/components/common/PasswordStrength';
import AuthLayout from '../../../../shared/client/src/components/layout/AuthLayout';

// a simple email check
const EMAIL_REGEX = /^\S+@\S+\.\S+$/;
// 8-72 characters with upper case, lower case and a number
const STRONG_PASSWORD = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,72}$/;
// wait 60 seconds before asking for another code
const RESEND_SECONDS = 60;

// forgot password - step 1 asks for the email, step 2 takes the emailed 6-digit code and a new password
function ForgotPasswordPage() {
  const navigate = useNavigate();
  const { refreshProfile } = useAuth();
  // which step is shown - email or code
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [errorMessage, setErrorMessage] = useState('');
  const [notice, setNotice] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  // resend countdown
  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const timer = setTimeout(() => setResendIn((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  // show the server's field errors, or its message
  function showServerErrors(error) {
    const details = Array.isArray(error.details) ? error.details : [];
    const mapped = {};
    details.forEach((detail) => {
      mapped[detail.field] = detail.message;
    });
    setErrors(mapped);
    setErrorMessage(details.length > 0 ? '' : error.message);
  }

  // send code btn
  async function sendCode(event) {
    if (event) event.preventDefault();
    setErrorMessage('');
    setNotice('');
    if (!EMAIL_REGEX.test(email.trim())) {
      setErrors({ email: 'Please enter a valid email address.' });
      return;
    }
    setErrors({});
    setIsSubmitting(true);
    try {
      await requestPasswordReset(email.trim());
      setStep('code');
      setResendIn(RESEND_SECONDS);
      setNotice(`If an account exists for ${email.trim()}, we've emailed it a 6-digit code.`);
    } catch (error) {
      showServerErrors(error);
    } finally {
      setIsSubmitting(false);
    }
  }

  // reset password btn - checks the code, sets the password and logs in
  async function handleReset(event) {
    event.preventDefault();
    setErrorMessage('');
    const found = {};
    if (!/^\d{6}$/.test(code)) found.code = 'Enter the 6-digit code from the email.';
    if (!STRONG_PASSWORD.test(newPassword)) {
      found.newPassword = 'Use 8-72 characters with an uppercase letter, a lowercase letter and a number.';
    }
    if (confirmPassword !== newPassword) found.confirmPassword = 'The passwords do not match.';
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setIsSubmitting(true);
    try {
      await resetPasswordWithCode({ email: email.trim(), code, newPassword });
      await refreshProfile();
      navigate('/', { replace: true });
    } catch (error) {
      showServerErrors(error);
      setIsSubmitting(false);
    }
  }

  // step 2 - type the emailed code and a new password
  if (step === 'code') {
    return (
      <AuthLayout backTo="/login" backLabel="Back to Login">
        <h1>Enter your code</h1>
        <p className="muted">
          We sent a 6-digit code to <strong>{email.trim()}</strong>. It expires in 15 minutes. Check your spam folder
          if you can&apos;t see it.
        </p>

        <Alert type="success" message={notice} />
        <Alert type="error" message={errorMessage} />

        {/* reset form - code, new password and confirmation */}
        <form onSubmit={handleReset} noValidate>
          <div className="form-field">
            <label htmlFor="reset-code">6-digit code</label>
            <input
              id="reset-code"
              className={`code-input${errors.code ? ' input-error' : ''}`}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) => {
                setCode(e.target.value.replace(/\D/g, ''));
                setErrors((prev) => ({ ...prev, code: undefined }));
              }}
              autoFocus
            />
            {errors.code && <p className="field-error">{errors.code}</p>}
          </div>

          <FormField
            id="newPassword"
            label="New password"
            type="password"
            icon="lock"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            error={errors.newPassword}
            autoComplete="new-password"
            required
          />
          <PasswordStrength password={newPassword} />
          <FormField
            id="confirmPassword"
            label="Confirm new password"
            type="password"
            icon="lock"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            error={errors.confirmPassword}
            autoComplete="new-password"
            required
          />

          <button type="submit" className="btn btn-primary btn-block" disabled={isSubmitting}>
            {isSubmitting ? 'Checking...' : 'Reset password and log in'}
          </button>
        </form>

        <p className="auth-footer-note">
          No code?{' '}
          <button type="button" className="link-button" disabled={resendIn > 0 || isSubmitting} onClick={() => sendCode()}>
            {resendIn > 0 ? `Send again in ${resendIn}s` : 'Send a new code'}
          </button>
          {' · '}
          <button
            type="button"
            className="link-button"
            onClick={() => {
              setStep('email');
              setCode('');
              setErrors({});
              setErrorMessage('');
              setNotice('');
            }}
          >
            Use another email
          </button>
        </p>
      </AuthLayout>
    );
  }

  // step 1 - ask for the email address
  return (
    <AuthLayout backTo="/login" backLabel="Back to Login">
      <h1>Forgot Password?</h1>
      <p className="muted">Enter your registered email address and we&apos;ll email you a 6-digit code to reset your password.</p>

      <Alert type="error" message={errorMessage} />

      {/* email form */}
      <form onSubmit={sendCode} noValidate>
        <FormField
          id="email"
          label="Email Address"
          type="email"
          icon="mail"
          placeholder="Please enter your registered email..."
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
          autoComplete="email"
          required
        />
        <button type="submit" className="btn btn-primary btn-block" disabled={isSubmitting}>
          {isSubmitting ? 'Sending...' : 'Send code'}
        </button>
      </form>

      <p className="auth-footer-note">
        Remember your password? <Link to="/login">Login here</Link>
      </p>
    </AuthLayout>
  );
}

export default ForgotPasswordPage;
