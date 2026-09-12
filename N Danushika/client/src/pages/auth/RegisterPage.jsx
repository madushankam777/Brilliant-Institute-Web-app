import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { registerAccount } from '../../api/authApi';
import FormField from '../../../../../shared/client/src/components/common/FormField';
import Alert from '../../../../../shared/client/src/components/common/Alert';
import PasswordStrength from '../../../../../shared/client/src/components/common/PasswordStrength';
import AuthLayout from '../../../../../shared/client/src/components/layout/AuthLayout';
import { GRADES } from '../../../../../shared/client/src/constants/grades';

const PASSWORD_RULE_MESSAGE =
  'Password must be at least 8 characters long and include an uppercase letter, ' +
  'a lowercase letter, and a number.';

function isStrongPassword(password) {
  return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(password);
}

const initialFormState = {
  fullName: '',
  email: '',
  phone: '',
  password: '',
  confirmPassword: '',
  acceptedTerms: false,
  role: 'STUDENT_PARENT',
  enrollmentKey: '',
  grade: '',
};

function RegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState(initialFormState);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateField(field, value) {
    setForm((previous) => ({ ...previous, [field]: value }));
  }

  function validate() {
    const errors = {};
    if (form.fullName.trim().length < 2) {
      errors.fullName = 'Please enter your full name.';
    }
    if (!/^\S+@\S+\.\S+$/.test(form.email)) {
      errors.email = 'Please enter a valid email address.';
    }
    if (!isStrongPassword(form.password)) {
      errors.password = PASSWORD_RULE_MESSAGE;
    }
    if (form.password !== form.confirmPassword) {
      errors.confirmPassword = 'Passwords do not match.';
    }
    if (!form.acceptedTerms) {
      errors.acceptedTerms = 'You must accept the Terms of Service and Privacy Policy.';
    }
    if (form.role === 'TUTOR' && !form.enrollmentKey.trim()) {
      errors.enrollmentKey = 'Enter the enrollment key an Administrator gave you.';
    }
    if (form.role === 'STUDENT_PARENT' && !form.grade) {
      errors.grade = 'Please select your grade.';
    }
    return errors;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setFormError('');

    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }

    setIsSubmitting(true);
    try {
      await registerAccount(form);
      navigate('/login', { replace: true, state: { justRegistered: true } });
    } catch (error) {
      setFormError(error.message);
      if (error.details) {
        const mapped = {};
        error.details.forEach((detail) => {
          mapped[detail.field] = detail.message;
        });
        setFieldErrors(mapped);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthLayout
      quote={{
        text: 'Brilliant Institute organizes our schedules beautifully. Every student now has a clean path to progress.',
        author: 'Dr. Robert Chen',
        role: 'Senior Chemistry Head',
      }}
    >
      <h1>Create Your Account</h1>
      <p className="muted">Gain access to class schedules, tracking tools, and tutor resources</p>

      <label style={{ fontWeight: 600, fontSize: '0.88rem', marginBottom: '6px', display: 'block' }}>
        I am registering as a:
      </label>
      <div className="segmented">
        <button
          type="button"
          className={form.role === 'STUDENT_PARENT' ? 'active' : ''}
          onClick={() => updateField('role', 'STUDENT_PARENT')}
        >
          Student / Parent
        </button>
        <button
          type="button"
          className={form.role === 'TUTOR' ? 'active' : ''}
          onClick={() => updateField('role', 'TUTOR')}
        >
          Tutor / Instructor
        </button>
      </div>

      <Alert type="error" message={formError} />

      <form onSubmit={handleSubmit} noValidate>
        <FormField
          id="fullName"
          label="Full Name"
          icon="user"
          placeholder="John Doe"
          value={form.fullName}
          onChange={(e) => updateField('fullName', e.target.value)}
          error={fieldErrors.fullName}
          autoComplete="name"
          required
        />
        <FormField
          id="email"
          label="Email Address"
          type="email"
          icon="mail"
          placeholder="you@example.com"
          value={form.email}
          onChange={(e) => updateField('email', e.target.value)}
          error={fieldErrors.email}
          autoComplete="email"
          required
        />
        <FormField
          id="phone"
          label="Phone Number (optional)"
          type="tel"
          icon="user"
          placeholder="+94 123 456 789"
          value={form.phone}
          onChange={(e) => updateField('phone', e.target.value)}
          error={fieldErrors.phone}
          autoComplete="tel"
        />

        {form.role === 'STUDENT_PARENT' && (
          <div className="form-field">
            <label htmlFor="grade">
              Grade <span aria-hidden="true"> *</span>
            </label>
            <select
              id="grade"
              value={form.grade}
              onChange={(e) => updateField('grade', e.target.value)}
              className={fieldErrors.grade ? 'input-error' : ''}
              required
            >
              <option value="" disabled>
                Select your grade
              </option>
              {GRADES.map((grade) => (
                <option key={grade} value={grade}>
                  {grade}
                </option>
              ))}
            </select>
            {fieldErrors.grade ? (
              <p className="field-error">{fieldErrors.grade}</p>
            ) : (
              <p className="field-help">Used to match you with classes and announcements for your grade.</p>
            )}
          </div>
        )}

        {form.role === 'TUTOR' && (
          <>
            <FormField
              id="enrollmentKey"
              label="Enrollment Key"
              icon="lock"
              placeholder="TUT-XXXX-XXXX-XXXX"
              value={form.enrollmentKey}
              onChange={(e) => updateField('enrollmentKey', e.target.value)}
              error={fieldErrors.enrollmentKey}
              required
            />
            <div className="callout">
              <span>
                <strong>Need a key?</strong> Contact the office first - an Administrator will verify
                you and generate a one-time enrollment key for you to use here.
              </span>
            </div>
          </>
        )}

        <FormField
          id="password"
          label="Password"
          type="password"
          icon="lock"
          placeholder="Create a password"
          value={form.password}
          onChange={(e) => updateField('password', e.target.value)}
          error={fieldErrors.password}
          autoComplete="new-password"
          required
        />
        <PasswordStrength password={form.password} />

        <FormField
          id="confirmPassword"
          label="Confirm Password"
          type="password"
          icon="lock"
          placeholder="Re-enter password"
          value={form.confirmPassword}
          onChange={(e) => updateField('confirmPassword', e.target.value)}
          error={fieldErrors.confirmPassword}
          autoComplete="new-password"
          required
        />

        <div className="form-field checkbox-field">
          <label htmlFor="acceptedTerms">
            <input
              id="acceptedTerms"
              type="checkbox"
              checked={form.acceptedTerms}
              onChange={(e) => updateField('acceptedTerms', e.target.checked)}
            />
            I agree to the Terms of Service and Privacy Policy.
          </label>
          {fieldErrors.acceptedTerms && <p className="field-error">{fieldErrors.acceptedTerms}</p>}
        </div>

        <div className="callout">
          <span>
            <strong>Note:</strong> Students under 18 require parent or guardian consent to complete
            enrollment.
          </span>
        </div>

        <button type="submit" className="btn btn-primary btn-block" disabled={isSubmitting}>
          {isSubmitting ? 'Creating account...' : 'Create Account'}
        </button>
      </form>

      <p className="auth-footer-note">
        Already have an account? <Link to="/login">Login here</Link>
      </p>
    </AuthLayout>
  );
}

export default RegisterPage;
