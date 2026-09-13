import { useEffect, useState } from 'react';

const STORAGE_KEY = 'brilliant_cookie_consent';

// cookie consent popup - shown once until accepted or declined
function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const consent = window.localStorage.getItem(STORAGE_KEY);
      if (!consent) setVisible(true);
    } catch {
      setVisible(true);
    }
  }, []);

  function recordChoice(choice) {
    try {
      window.localStorage.setItem(STORAGE_KEY, choice);
    } catch {
      // ignore - storage may be unavailable
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="cookie-consent-banner" role="dialog" aria-label="Cookie notice">
      <p>
        We use only the cookies strictly necessary to keep you signed in securely - no
        advertising or tracking cookies. See our{' '}
        <a href="#" onClick={(e) => e.preventDefault()}>
          Privacy Policy
        </a>{' '}
        for details.
      </p>
      <div className="cookie-consent-actions">
        <button type="button" className="btn btn-on-dark btn-sm" onClick={() => recordChoice('declined')}>
          Decline
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => recordChoice('accepted')}>
          Accept
        </button>
      </div>
    </div>
  );
}

export default CookieConsentBanner;
