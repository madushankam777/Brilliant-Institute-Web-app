// auth context - who is logged in
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as authApi from '../api/authApi';
import { setSessionExpiredHandler } from '../../../shared/client/src/api/httpClient';

// shared login state - who is logged in
const AuthContext = createContext(null);

// closing the browser ends the sign-in: these mark "a tab of this site is open"
const TAB_FLAG = 'bi_tab_open';
const LAST_ACTIVE = 'bi_last_active';
// a tab not heard from for this long counts as closed (covers browsers that restore old tabs)
const STALE_MS = 30 * 60 * 1000;
const CHANNEL = 'bi-session';
// this tab's own id, so it never answers its own question
const TAB_ID = Math.random().toString(36).slice(2);

// storage can be blocked (private mode) - never let that break the page
function readStore(store, key) {
  try {
    return window[store].getItem(key);
  } catch {
    return null;
  }
}
function writeStore(store, key, value) {
  try {
    window[store].setItem(key, value);
  } catch {
    // ignore - the check just becomes less strict
  }
}

// ask the other open tabs of this site whether they are there
function anotherTabIsOpen() {
  return new Promise((resolve) => {
    if (typeof BroadcastChannel === 'undefined') {
      resolve(false);
      return;
    }
    const channel = new BroadcastChannel(CHANNEL);
    const timer = setTimeout(() => {
      channel.close();
      resolve(false);
    }, 300);
    channel.onmessage = (event) => {
      if (event.data && event.data.type === 'here' && event.data.to === TAB_ID) {
        clearTimeout(timer);
        channel.close();
        resolve(true);
      }
    };
    channel.postMessage({ type: 'anyone', from: TAB_ID });
  });
}

// true when the browser was closed and opened again (no tab of the site survived)
async function isFreshBrowserSession() {
  const tabWasOpen = readStore('sessionStorage', TAB_FLAG) === '1';
  const lastActive = Number(readStore('localStorage', LAST_ACTIVE)) || 0;
  if (tabWasOpen && Date.now() - lastActive < STALE_MS) return false;
  if (await anotherTabIsOpen()) return false;
  return true;
}

// gives every page the logged-in user and the login, logout and refresh functions
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);

  // when the website opens, ask the server if the session is still valid
  useEffect(() => {
    let isMounted = true;

    // read the session - not logged in is normal on a fresh visit
    async function loadSession() {
      try {
        // the browser was closed since the last visit - that counts as logging out
        const freshStart = await isFreshBrowserSession();
        writeStore('sessionStorage', TAB_FLAG, '1');
        writeStore('localStorage', LAST_ACTIVE, String(Date.now()));

        const currentUser = await authApi.fetchCurrentSession();
        if (currentUser && freshStart) {
          await authApi.logout().catch(() => {});
          if (isMounted) setUser(null);
          return;
        }
        if (isMounted) setUser(currentUser);
      } catch (error) {
        // not logged in - normal on fresh visit
        if (isMounted) setUser(null);
      } finally {
        if (isMounted) setIsCheckingSession(false);
      }
    }

    loadSession();
    return () => {
      isMounted = false;
    };
  }, []);

  // auto logout on session expired
  useEffect(() => {
    setSessionExpiredHandler(() => setUser(null));
  }, []);

  // while this tab is open: answer other tabs and keep the "still open" time fresh
  useEffect(() => {
    const beat = () => writeStore('localStorage', LAST_ACTIVE, String(Date.now()));
    const timer = setInterval(beat, 20000);
    window.addEventListener('pagehide', beat);

    let channel = null;
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel(CHANNEL);
      channel.onmessage = (event) => {
        const message = event.data || {};
        if (message.type === 'anyone' && message.from !== TAB_ID) {
          channel.postMessage({ type: 'here', to: message.from });
        }
      };
    }
    return () => {
      clearInterval(timer);
      window.removeEventListener('pagehide', beat);
      if (channel) channel.close();
    };
  }, []);

  // login - save the logged-in user
  const login = useCallback(async (credentials) => {
    const loggedInUser = await authApi.login(credentials);
    setUser(loggedInUser);
    return loggedInUser;
  }, []);

  // logout - end the session, then forget the user
  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      setUser(null);
    }
  }, []);

  // reload my details after a profile change
  const refreshProfile = useCallback(async () => {
    const latestUser = await authApi.fetchMyProfile();
    setUser(latestUser);
    return latestUser;
  }, []);

  // what every page can read from the login state
  const value = useMemo(
    () => ({
      user,
      isLoggedIn: Boolean(user),
      isCheckingSession,
      login,
      logout,
      refreshProfile,
    }),
    [user, isCheckingSession, login, logout, refreshProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// useAuth hook - get current user / login / logout
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside an <AuthProvider>.');
  }
  return context;
}
