// Holds the logged-in user; session lives in an httpOnly cookie
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as sessionApi from '../api/sessionApi';
import { setSessionExpiredHandler } from '../api/httpClient';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadSession() {
      try {
        const currentUser = await sessionApi.fetchCurrentSession();
        if (isMounted) setUser(currentUser);
      } catch (error) {
        // No valid session yet - this is a normal state for a fresh visit,
        // not something to show an error message for.
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

  // Whenever any API call comes back 401 (session expired), clear the
  // user everywhere in the app automatically.
  useEffect(() => {
    setSessionExpiredHandler(() => setUser(null));
  }, []);

  const login = useCallback(async (credentials) => {
    const loggedInUser = await sessionApi.login(credentials);
    setUser(loggedInUser);
    return loggedInUser;
  }, []);

  const logout = useCallback(async () => {
    try {
      await sessionApi.logout();
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({ user, isLoggedIn: Boolean(user), isCheckingSession, login, logout }),
    [user, isCheckingSession, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside an <AuthProvider>.');
  }
  return context;
}
