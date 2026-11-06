import { useEffect, useState } from 'react';
import httpClient from '../../api/httpClient';

// the browser only remembers that a choice was made (so the banner stays hidden); the choice is saved in MySQL
const STORAGE_KEY = 'brilliant_cookie_consent';

// cookie consent popup - shown once until accepted or declined
function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);

  // show the banner only if no choice was saved
  useEffect(() => {
    try {
      const consent = window.localStorage.getItem(STORAGE_KEY);
      if (!consent) setVisible(true);
    } catch {
      setVisible(true);
    }
  }, []);

  // accept / decline btn - save the choice in MySQL and hide the banner
  function recordChoice(choice) {
    httpClient.post('/auth/cookie-consent', { choice }, { background: true }).catch(() => {
      // offline - the banner still hides
    });
    try {
      window.localStorage.setItem(STORAGE_KEY, choice);
    } catch {
      // ignore - storage may be unavailable
    }
    setVisible(false);
  }

  if (!visible) return null;

  // the banner - the text and the Decline and Accept btns
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
      {/* decline and accept btns */}
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
