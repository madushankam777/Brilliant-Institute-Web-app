import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as sessionApi from '../api/sessionApi';
import { setSessionExpiredHandler } from '../../../../shared/client/src/api/httpClient';

// shared login state - who is logged in
const AuthContext = createContext(null);

// gives every page the logged-in user and the login, logout and refresh functions
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);

  // when the website opens, ask the server if the session is still valid
  useEffect(() => {
    let isMounted = true;

    async function loadSession() {
      try {
        const currentUser = await sessionApi.fetchCurrentSession();
        if (isMounted) setUser(currentUser);
      } catch (error) {
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

  useEffect(() => {
    setSessionExpiredHandler(() => setUser(null));
  }, []);

  const login = useCallback(async (credentials) => {
    const loggedInUser = await sessionApi.login(credentials);
    setUser(loggedInUser);
    return loggedInUser;
  }, []);

  const register = useCallback(async (details) => {
    const newUser = await sessionApi.register(details);
    setUser(newUser);
    return newUser;
  }, []);

  const logout = useCallback(async () => {
    try {
      await sessionApi.logout();
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({ user, isLoggedIn: Boolean(user), isCheckingSession, login, register, logout }),
    [user, isCheckingSession, login, register, logout]
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
