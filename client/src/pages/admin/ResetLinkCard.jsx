// Admin: make a one-time password reset link for a user who forgot their
// password. There is no email service, so the office hands it over in person.
import { useState } from 'react';
import { createPasswordResetLink } from '../../api/adminApi';
import Alert from '../../../../shared/client/src/components/common/Alert';
import Icon from '../../../../shared/client/src/components/common/Icon';

function ResetLinkCard({ user }) {
  const [link, setLink] = useState(null);
  const [error, setError] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function makeLink() {
    setIsBusy(true);
    setError('');
    setCopied(false);
    try {
      const data = await createPasswordResetLink(user.id);
      setLink({ url: `${window.location.origin}${data.resetPath}`, minutes: data.expiresInMinutes });
    } catch (linkError) {
      setError(linkError.message);
    } finally {
      setIsBusy(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="card">
      <h2>Password reset</h2>
      <p className="muted">
        If {user.fullName} forgot their password, make a one-time link and give it to them in person or by phone.
        It works once, expires after a short time, and any older link stops working.
      </p>
      <Alert type="error" message={error} />

      {link ? (
        <div className="reset-link-box">
          <input readOnly value={link.url} aria-label="Password reset link" onFocus={(e) => e.target.select()} />
          <button type="button" className="btn btn-secondary btn-sm" onClick={copyLink}>
            <Icon name={copied ? 'checkCircle' : 'copy'} size={14} /> {copied ? 'Copied' : 'Copy'}
          </button>
          <p className="field-help" style={{ margin: 0, flexBasis: '100%' }}>
            Expires in {link.minutes} minutes. Only share it with the account owner.
          </p>
        </div>
      ) : (
        <button type="button" className="btn btn-secondary btn-sm" onClick={makeLink} disabled={isBusy || user.status !== 'ACTIVE'}>
          <Icon name="lock" size={14} /> {isBusy ? 'Creating...' : 'Create reset link'}
        </button>
      )}
    </div>
  );
}

export default ResetLinkCard;
