// Admin: one-time password reset link
import { useState } from 'react';
import { createPasswordResetLink } from '../../api/adminApi';
import Alert from '../../../../shared/client/src/components/common/Alert';
import Icon from '../../../../shared/client/src/components/common/Icon';

// password reset card - make a one-time link for a user who forgot their password
function ResetLinkCard({ user }) {
  // the link and the page state
  const [link, setLink] = useState(null);
  const [error, setError] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  // create reset link btn - make a one-time link (older links stop working)
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

  // copy btn - copy the link
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  // the card - an explanation, then the link box or the create btn
  return (
    <div className="card">
      <h2>Password reset</h2>
      <p className="muted">
        If {user.fullName} forgot their password, make a one-time link and give it to them in person or by phone.
        It works once, expires after a short time, and any older link stops working.
      </p>
      <Alert type="error" message={error} />

      {/* the link with a copy btn, or the create btn */}
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
