
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as authApi from '../api/authApi';
import { setSessionExpiredHandler } from '../../../../shared/client/src/api/httpClient';


const AuthContext = createContext(null);

// gives every page the logged-in user and the login, logout and refresh functions
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);

  // Check whether a user already has an active session.
  useEffect(() => {
    let isMounted = true;

    // Load the current user when the app starts.
    async function loadSession() {
      try {
        const currentUser = await authApi.fetchCurrentSession();
        if (isMounted) setUser(currentUser);
      } catch (error) {
        // Keep the user logged out if there is no active session.
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

  // Clear the user when the session expires.
  useEffect(() => {
    setSessionExpiredHandler(() => setUser(null));
  }, []);

  // Sign in with the submitted credentials.
  const login = useCallback(async (credentials) => {
    const loggedInUser = await authApi.login(credentials);
    setUser(loggedInUser);
    return loggedInUser;
  }, []);

  // Sign out and clear the current user.
  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      setUser(null);
    }
  }, []);

  // Load the latest profile details for the current user.
  const refreshProfile = useCallback(async () => {
    const latestUser = await authApi.fetchMyProfile();
    setUser(latestUser);
    return latestUser;
  }, []);

  // Share the user and authentication functions with app pages.
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

// hook to access the auth context
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside an <AuthProvider>.');
  }
  return context;
}
