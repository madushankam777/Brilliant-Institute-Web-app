// thin loading bar at the top while data is loading
import { useEffect, useRef, useState } from 'react';
import { onRequestActivity } from '../../api/httpClient';

// only show it for requests slower than this, so fast pages don't flicker
const SHOW_AFTER_MS = 150;

// the loading bar - waits 150 ms, shows while requests run, then fades
function TopProgressBar() {
  const [state, setState] = useState('idle'); // idle | loading | done
  const timer = useRef(null);

  // listen to request activity and show or hide the bar
  useEffect(
    () =>
      onRequestActivity((active) => {
        clearTimeout(timer.current);
        if (active > 0) {
          timer.current = setTimeout(() => setState('loading'), SHOW_AFTER_MS);
        } else {
          setState((current) => (current === 'loading' ? 'done' : 'idle'));
          timer.current = setTimeout(() => setState('idle'), 300);
        }
      }),
    []
  );

  if (state === 'idle') return null;
  return <div className={`top-progress ${state}`} role="progressbar" aria-label="Loading" />;
}

export default TopProgressBar;
