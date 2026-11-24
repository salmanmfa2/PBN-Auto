import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as apiClient from '../services/api';
import type { AuthUser } from '../types';

type AuthMode = 'guest' | 'user' | null;

type AuthContextValue = {
  mode: AuthMode;
  user: AuthUser | null;
  isLoading: boolean;
  initializationError: string | null;
  sessionExpired: boolean;
  logoutError: string | null;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, name: string, password: string) => Promise<void>;
  continueAsGuest: () => void;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<AuthMode>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [initializationError, setInitializationError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  useEffect(() => {
    const handleSessionExpired = () => {
      window.localStorage.removeItem(apiClient.AUTH_TOKEN_STORAGE_KEY);
      window.localStorage.removeItem(apiClient.AUTH_SESSION_EXPIRATION_STORAGE_KEY);
      window.localStorage.removeItem(apiClient.AUTH_GUEST_STORAGE_KEY);
      setUser(null);
      setMode(null);
      setSessionExpired(true);
    };

    window.addEventListener(apiClient.AUTH_SESSION_EXPIRED_EVENT, handleSessionExpired);
    return () => {
      window.removeEventListener(apiClient.AUTH_SESSION_EXPIRED_EVENT, handleSessionExpired);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const token = window.localStorage.getItem(apiClient.AUTH_TOKEN_STORAGE_KEY);
    if (!token) {
      setMode(window.localStorage.getItem(apiClient.AUTH_GUEST_STORAGE_KEY) === 'true' ? 'guest' : null);
      setIsLoading(false);
      return () => {
        active = false;
      };
    }

    Promise.all([
      apiClient.getCurrentUser(),
      apiClient.getSessionStatus(),
    ])
      .then(([authenticatedUser, sessionStatus]) => {
        if (!active) return;
        setUser(authenticatedUser);
        setMode('user');
        window.localStorage.setItem(
          apiClient.AUTH_SESSION_EXPIRATION_STORAGE_KEY,
          sessionStatus.expires_at,
        );
      })
      .catch((error: unknown) => {
        if (!active) return;
        setInitializationError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const login = async (username: string, password: string) => {
    setInitializationError(null);
    setSessionExpired(false);
    const session = await apiClient.login(username, password);
    window.localStorage.setItem(apiClient.AUTH_TOKEN_STORAGE_KEY, session.token);
    window.localStorage.setItem(
      apiClient.AUTH_SESSION_EXPIRATION_STORAGE_KEY,
      session.expires_at,
    );
    window.localStorage.removeItem(apiClient.AUTH_GUEST_STORAGE_KEY);
    setUser(session.user);
    setMode('user');
  };

  const register = async (username: string, name: string, password: string) => {
    await apiClient.register({ user: username, name, password });
    await login(username, password);
  };

  const continueAsGuest = () => {
    window.localStorage.removeItem(apiClient.AUTH_TOKEN_STORAGE_KEY);
    window.localStorage.removeItem(apiClient.AUTH_SESSION_EXPIRATION_STORAGE_KEY);
    window.localStorage.setItem(apiClient.AUTH_GUEST_STORAGE_KEY, 'true');
    setUser(null);
    setInitializationError(null);
    setSessionExpired(false);
    setMode('guest');
  };

  const logout = async () => {
    setLogoutError(null);
    try {
      if (window.localStorage.getItem(apiClient.AUTH_TOKEN_STORAGE_KEY)) {
        await apiClient.logout();
      }
    } catch (error) {
      setLogoutError(error instanceof Error ? error.message : String(error));
    } finally {
      window.localStorage.removeItem(apiClient.AUTH_TOKEN_STORAGE_KEY);
      window.localStorage.removeItem(apiClient.AUTH_SESSION_EXPIRATION_STORAGE_KEY);
      window.localStorage.removeItem(apiClient.AUTH_GUEST_STORAGE_KEY);
      setUser(null);
      setMode(null);
    }
  };

  const value = useMemo<AuthContextValue>(() => ({
    mode,
    user,
    isLoading,
    initializationError,
    sessionExpired,
    logoutError,
    login,
    register,
    continueAsGuest,
    logout,
  }), [mode, user, isLoading, initializationError, sessionExpired, logoutError]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider.');
  return context;
}
