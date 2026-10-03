import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Alert from '../../../../shared/client/src/components/common/Alert';
import FormField from '../../../../shared/client/src/components/common/FormField';
import AuthLayout from '../../../../shared/client/src/components/layout/AuthLayout';
import { GRADES } from '../../../../shared/client/src/constants/grades';

const initialForm = {
  fullName: '',
  email: '',
  phone: '',
  password: '',
  grade: '',
  role: 'STUDENT_PARENT',
  enrollmentKey: '',
};

// Letters, spaces, apostrophes, periods, and hyphens only
const NAME_REGEX = /^[A-Za-z][A-Za-z .'-]*$/;
const NAME_ERROR = 'Full name can only contain letters, spaces, apostrophes, periods, and hyphens - no numbers or symbols.';

// Digits plus the punctuation real phone numbers are written with.
const PHONE_REGEX = /^[0-9+\-\s()]+$/;
const PHONE_ERROR = 'Phone number can only contain digits, spaces, and the symbols + - ( ).';

function PlaceholderRegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState(initialForm);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateField(field, value) {
    setForm((previous) => ({ ...previous, [field]: value }));
  }

  // check the form before sending it
  function validate() {
    const errors = {};
    if (form.fullName.trim().length < 2) {
      errors.fullName = 'Please enter your full name.';
    } else if (!NAME_REGEX.test(form.fullName.trim())) {
      errors.fullName = NAME_ERROR;
    }
    if (form.phone.trim() && !PHONE_REGEX.test(form.phone.trim())) {
      errors.phone = PHONE_ERROR;
    }
    return errors;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');

    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setIsSubmitting(true);
    try {
      await register(form);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message || 'Registration failed. Please check your details.');
    } finally {
      setIsSubmitting(false);
    }
  }

  // the page - role choice, then the form
  return (
    <AuthLayout
      quote={{
        text: 'Creating my account took less than a minute, and everything - my classes, attendance and fees - lives in one place now.',
        author: 'Dinuka Rathnayake',
        role: 'Grade 11 Mathematics Student',
      }}
    >
      <h1>Create Your Account</h1>
      <p className="muted">Gain access to class schedules, attendance, and fees</p>

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

      {error && <Alert type="error" message={error} />}

      {/* register form - name, email, phone, grade or key, password and terms */}
      <form onSubmit={handleSubmit} noValidate>
        <FormField
          id="fullName"
          label="Full Name"
          icon="user"
          placeholder="John Doe"
          value={form.fullName}
          onChange={(e) => updateField('fullName', e.target.value)}
          error={fieldErrors.fullName}
          required
        />
        <FormField
          id="email"
          label="Email"
          type="email"
          icon="mail"
          placeholder="you@example.com"
          value={form.email}
          onChange={(e) => updateField('email', e.target.value)}
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
        />

        {form.role === 'STUDENT_PARENT' && (
          <div className="form-field">
            <label htmlFor="grade">Grade</label>
            <select
              id="grade"
              value={form.grade}
              onChange={(e) => updateField('grade', e.target.value)}
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
          required
        />

        <button type="submit" className="btn btn-primary btn-block" disabled={isSubmitting}>
          {isSubmitting ? 'Creating account...' : 'Create Account'}
        </button>
      </form>
    </AuthLayout>
  );
}

export default PlaceholderRegisterPage;
