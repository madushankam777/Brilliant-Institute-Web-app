import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Alert from '../../../../shared/client/src/components/common/Alert';
import FormField from '../../../../shared/client/src/components/common/FormField';
import AuthLayout from '../../../../shared/client/src/components/layout/AuthLayout';

function PlaceholderLoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      await login({ email, password });
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message || 'Login failed. Please check your details.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthLayout
      quote={{
        text: 'Having every user, class, and complaint in one dashboard has cut our admin workload dramatically.',
        author: 'Admin Vance',
        role: 'System Owner',
      }}
    >
      <h1>Welcome Back</h1>
      <p className="muted">
        Placeholder sign-in for this module - use a demo account created by <code>npm run db:seed</code>.
      </p>

      {error && <Alert type="error" message={error} />}

      <form onSubmit={handleSubmit} noValidate>
        <FormField
          id="email"
          label="Email"
          type="email"
          icon="mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
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
          required
        />
        <button type="submit" className="btn btn-primary btn-block" disabled={isSubmitting}>
          {isSubmitting ? 'Logging in...' : 'Login'}
        </button>
      </form>
    </AuthLayout>
  );
}

export default PlaceholderLoginPage;
