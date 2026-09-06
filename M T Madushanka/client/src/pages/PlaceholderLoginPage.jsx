// Placeholder login (real auth module is N Danushika's)
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Alert from '../components/common/Alert';
import FormField from '../components/common/FormField';

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
    <div className="page form-page">
      <h1>Log in</h1>
      <p className="muted">
        Placeholder sign-in for this module. Use a demo account created by
        <code> npm run db:seed</code>.
      </p>
      {error && <Alert type="error" message={error} />}
      <form onSubmit={handleSubmit} className="form">
        <FormField
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <FormField
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
          {isSubmitting ? 'Logging in...' : 'Log in'}
        </button>
      </form>
    </div>
  );
}

export default PlaceholderLoginPage;
