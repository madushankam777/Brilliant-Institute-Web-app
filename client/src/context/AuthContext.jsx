// Keeps track of who is logged in for the whole app.
// The session itself lives in an httpOnly cookie (JavaScript can't read
// it), so this only stores the safe profile fields the server sends back.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as authApi from '../api/authApi';
import { setSessionExpiredHandler } from '../../../shared/client/src/api/httpClient';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);

  useEffect(() => {
    let isMounted = true;

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

  const login = useCallback(async (credentials) => {
    const loggedInUser = await authApi.login(credentials);
    setUser(loggedInUser);
    return loggedInUser;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      setUser(null);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    const latestUser = await authApi.fetchMyProfile();
    setUser(latestUser);
    return latestUser;
  }, []);

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
