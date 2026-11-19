import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import * as apiClient from '../services/api';
import { useAuth } from './AuthContext';
import type { MenuAccessKey, MenuAccessPolicy } from '../types';

type MenuAccessContextValue = {
  policies: MenuAccessPolicy[];
  isLoading: boolean;
  error: string | null;
  canView: (menuKey: MenuAccessKey) => boolean;
  canEdit: (menuKey: MenuAccessKey) => boolean;
  showNoAuth: () => void;
  reload: () => Promise<void>;
};

const MenuAccessContext = createContext<MenuAccessContextValue | null>(null);

function NoAuthDialog({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-labelledby="no-auth-title"
        aria-modal="true"
        className="w-full max-w-md rounded-2xl border border-surface-700 bg-surface-900 p-6 text-slate-100 shadow-2xl"
        role="dialog"
      >
        <h2 className="text-lg font-semibold" id="no-auth-title">No Auth</h2>
        <p className="mt-2 text-sm text-slate-300">
          Anda tidak memiliki izin View untuk menu ini. Hubungi God User untuk meminta akses.
        </p>
        <div className="mt-5 flex justify-end">
          <button autoFocus className="btn-primary" onClick={onClose} type="button">
            Tutup
          </button>
        </div>
      </section>
    </div>
  );
}

export function MenuAccessProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [policies, setPolicies] = useState<MenuAccessPolicy[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isNoAuthOpen, setIsNoAuthOpen] = useState(false);
  const showNoAuth = useCallback(() => setIsNoAuthOpen(true), []);

  const reload = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setPolicies(await apiClient.getMenuAccessSettings());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const level = user?.auth_level ?? 0;
  const canView = useCallback((menuKey: MenuAccessKey) => {
    if (level >= 4) return true;
    const policy = policies.find((item) => item.menu_key === menuKey);
    return policy !== undefined && level >= policy.view_level;
  }, [level, policies]);
  const canEdit = useCallback((menuKey: MenuAccessKey) => {
    if (level >= 4) return true;
    const policy = policies.find((item) => item.menu_key === menuKey);
    return policy !== undefined && level >= policy.edit_level;
  }, [level, policies]);
  const value = useMemo<MenuAccessContextValue>(() => ({
    policies,
    isLoading,
    error,
    canView,
    canEdit,
    showNoAuth,
    reload,
  }), [policies, isLoading, error, canView, canEdit, showNoAuth, reload]);

  return (
    <MenuAccessContext.Provider value={value}>
      {children}
      {isNoAuthOpen && <NoAuthDialog onClose={() => setIsNoAuthOpen(false)} />}
    </MenuAccessContext.Provider>
  );
}

export function useMenuAccess(): MenuAccessContextValue {
  const context = useContext(MenuAccessContext);
  if (!context) throw new Error('useMenuAccess must be used inside MenuAccessProvider.');
  return context;
}
