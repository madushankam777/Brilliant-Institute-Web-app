import { useEffect, useState } from 'react';

// where the choice is remembered in the browser
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

  // accept / decline btn - remember the choice and hide the banner
  function recordChoice(choice) {
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
