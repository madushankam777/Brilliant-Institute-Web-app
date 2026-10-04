// login state - who is logged in, shared with every page
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as authApi from '../api/authApi';
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

    // read the session - not logged in is normal on a fresh visit
    async function loadSession() {
      try {
        const currentUser = await authApi.fetchCurrentSession();
        if (isMounted) setUser(currentUser);
      } catch (error) {
        // Not logged in yet - that's normal on a fresh visit, no error needed.
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

  // If any API call comes back "session expired", log the user out here too.
  useEffect(() => {
    setSessionExpiredHandler(() => setUser(null));
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

// Hook components use to read the current user and call login/logout.
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside an <AuthProvider>.');
  }
  return context;
}
