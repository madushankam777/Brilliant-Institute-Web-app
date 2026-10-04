// login state - who is logged in, shared with every page
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

    // ask the server whether the session is still valid
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

  // log out by itself when the session expires
  useEffect(() => {
    setSessionExpiredHandler(() => setUser(null));
  }, []);

  // login - save the logged-in user
  const login = useCallback(async (credentials) => {
    const loggedInUser = await sessionApi.login(credentials);
    setUser(loggedInUser);
    return loggedInUser;
  }, []);

  // register - save the new account as the logged-in user
  const register = useCallback(async (details) => {
    const newUser = await sessionApi.register(details);
    setUser(newUser);
    return newUser;
  }, []);

  // logout - end the session, then forget the user
  const logout = useCallback(async () => {
    try {
      await sessionApi.logout();
    } finally {
      setUser(null);
    }
  }, []);

  // what every page can read from the login state
  const value = useMemo(
    () => ({ user, isLoggedIn: Boolean(user), isCheckingSession, login, register, logout }),
    [user, isCheckingSession, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// useAuth hook - the logged-in user, login and logout
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside an <AuthProvider>.');
  }
  return context;
}
