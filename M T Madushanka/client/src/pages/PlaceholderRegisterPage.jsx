import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Alert from '../../../../shared/client/src/components/common/Alert';
import FormField from '../../../../shared/client/src/components/common/FormField';
import AuthLayout from '../../../../shared/client/src/components/layout/AuthLayout';
import { GRADES } from '../../../../shared/client/src/constants/grades';

function PlaceholderRegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', password: '', grade: '' });
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateField(field, value) {
    setForm((previous) => ({ ...previous, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
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

      {error && <Alert type="error" message={error} />}

      <form onSubmit={handleSubmit} noValidate>
        <FormField
          id="fullName"
          label="Full Name"
          icon="user"
          placeholder="John Doe"
          value={form.fullName}
          onChange={(e) => updateField('fullName', e.target.value)}
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
        />
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
        <div className="callout">
          <span>
            <strong>Registering as a Tutor?</strong> Contact the office first - an Administrator will
            verify you and generate a one-time enrollment key for you to use.
          </span>
        </div>

        <button type="submit" className="btn btn-primary btn-block" disabled={isSubmitting}>
          {isSubmitting ? 'Creating account...' : 'Create Account'}
        </button>
      </form>
    </AuthLayout>
  );
}

export default PlaceholderRegisterPage;
