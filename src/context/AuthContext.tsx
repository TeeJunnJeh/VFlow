import React, { createContext, useContext, useState, useEffect } from 'react';
import { authApi } from '../services/auth';
import { videoApi } from '../services/video';
import { clearDebugModeEnabled } from '../services/debugMode';
import { debugLog, debugWarn, debugError } from '../services/debugMode';

interface User {
  account: string,
  id: string | number; // Allow number
  name: string;
  avatar: string;
  plan: 'free' | 'plus' | 'pro';
  credits?: number; // remaining generation credits (v点)
  theme?: 'light' | 'dark' | 'dim' | 'system';
  hasPassword?: boolean;
  token?: string;
  isFrozen?: boolean;
  frozenUntil?: string | null;
  frozenRemainingSeconds?: number;
}

interface AuthContextType {
  user: User | null;
  login: (identifier: string, serverData?: any) => Promise<void>;
  updateUser: (patch: Partial<User>) => void;
  updateCredits: (delta: number) => void;
  logout: () => void;
  isLoading: boolean;
  justLoggedIn: boolean;
  consumeJustLoggedIn: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const WORKBENCH_PROJECT_STORE_KEY_PREFIX = 'vflow_workbench_projects_v1';

const getWorkbenchProjectStoreKey = (userId?: string | number | null) => {
  const normalized = userId === null || userId === undefined || userId === '' ? 'guest' : String(userId);
  return `${WORKBENCH_PROJECT_STORE_KEY_PREFIX}_${normalized}`;
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // Distinguishes an explicit in-session login (true) from a session restore via /api/auth/me/ (false).
  // Consumers read this once to trigger post-login UX like the invite reward popup.
  const [justLoggedIn, setJustLoggedIn] = useState(false);

  const toDisplayUrl = (pathOrUrl: string | null | undefined): string => {
    if (!pathOrUrl) return '';
    const raw = String(pathOrUrl).trim();
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw) || raw.startsWith('data:') || raw.startsWith('blob:')) return raw;
    const normalized = raw.startsWith('/') ? raw : `/${raw}`;
    const mediaBaseUrl = (import.meta as any).env?.VITE_MEDIA_BASE_URL || '';
    if (mediaBaseUrl && normalized.startsWith('/media/')) return `${mediaBaseUrl}${normalized}`;
    return normalized;
  };

  const normalizeAvatar = (avatar: string | null | undefined): string => {
    const raw = String(avatar || '').trim();
    if (!raw) return '';
    if (raw.includes('avatars/default.png')) return '';
    return toDisplayUrl(raw);
  };

  // 1. Initialize Auth State (Modified)
  // Verify session with backend instead of trusting localStorage blindly
  useEffect(() => {
    const checkAuth = async () => {
      try {
        // Attempt to get user info using browser cookies
        const response = await authApi.getMe();

        if (response.is_logged_in && response.data) {
            const backendUser = response.data;
            
            // Map backend Tier to frontend Plan
            let plan: User['plan'] = 'free';
            if (backendUser.tier === 'PRO') plan = 'plus';
            else if (backendUser.tier === 'ENTERPRISE') plan = 'pro';

            // Construct valid user object
            const verifiedUser: User = {
                account: backendUser.account,
                id: backendUser.user_id,
                name: backendUser.nickname || backendUser.username || backendUser.phone || 'User',
                avatar: normalizeAvatar(backendUser.avatar),
                plan: plan,
                credits: backendUser.balance,
                theme: (backendUser.theme as 'light' | 'dark' | 'dim' | 'system') || 'system',
                hasPassword: backendUser.has_password === true,
                token: undefined, // We rely on Cookie Session, no JWT token needed in state
                isFrozen: backendUser.is_frozen === true,
                frozenUntil: backendUser.frozen_until || null,
                frozenRemainingSeconds: Number(backendUser.frozen_remaining_seconds || 0),
            };

            debugLog('Session verified:', verifiedUser);
            setUser(verifiedUser);
            
            // Update localStorage to keep it fresh (optional, but good for sync)
            localStorage.setItem('vflow_ai_user', JSON.stringify(verifiedUser));
        } else {
            throw new Error("Not logged in");
        }
      } catch (e) {
        debugWarn('Auth check failed (session expired or invalid):', e);
        // Clean up invalid state
        setUser(null);
        localStorage.removeItem('vflow_ai_user');
      } finally {
        setIsLoading(false);
      }
    };
    checkAuth();
  }, []);

  // 2. Login Function (UPDATED)
  const login = async (identifier: string, serverData?: any) => {
    setIsLoading(true);
    
    debugLog('Login response data:', serverData);

    // --- FIX: Find the correct User ID ---
    // Look in all common places API might return it
    const realUserId = 
      serverData?.user_id || 
      serverData?.id ||
      serverData?.data?.user_id || 
      serverData?.data?.id ||
      serverData?.user?.id;

    if (!realUserId) {
      debugWarn('No numeric User ID found. Backend calls might fail with 404.');
    }

    // Try to find token (for reference, though we use Cookies now)
    const token = 
      serverData?.token || 
      serverData?.access || 
      serverData?.data?.token;

    // Construct the User Object
    // Determine plan and starting credits
    const planFromServer = serverData?.plan || serverData?.data?.plan || serverData?.data?.tier;
    
    // Normalize plan string from server (handle PRO/FREE uppercase)
    let resolvedPlan: User['plan'] = 'free';
    if (planFromServer && typeof planFromServer === 'string') {
        const upperPlan = planFromServer.toUpperCase();
        if (upperPlan === 'ENTERPRISE') resolvedPlan = 'pro';
        else if (upperPlan === 'PRO') resolvedPlan = 'plus';
        else resolvedPlan = 'free';
    }

    const defaultCredits = 50; // default balance to 50 for Free

    const resolvedAccount =
      serverData?.account ||
      serverData?.data?.account ||
      serverData?.data?.username ||
      serverData?.username ||
      serverData?.data?.phone ||
      serverData?.phone ||
      identifier;

    const newUser: User = {
      // Use the Real ID if found, otherwise crash/warn instead of using a fake string
      account: resolvedAccount,
      id: realUserId || '1',
      name: serverData?.nickname || serverData?.data?.nickname || serverData?.data?.username || serverData?.username || identifier,
      avatar: normalizeAvatar(serverData?.avatar || serverData?.data?.avatar || ''),
      plan: resolvedPlan,
      credits: serverData?.credits ?? serverData?.data?.balance ?? defaultCredits,
      theme: serverData?.theme || serverData?.data?.theme || 'system',
      hasPassword: (serverData?.has_password ?? serverData?.data?.has_password) === true,
      token: token,
      isFrozen: (serverData?.is_frozen ?? serverData?.data?.is_frozen) === true,
      frozenUntil: serverData?.frozen_until ?? serverData?.data?.frozen_until ?? null,
      frozenRemainingSeconds: Number(serverData?.frozen_remaining_seconds ?? serverData?.data?.frozen_remaining_seconds ?? 0),
    };

    debugLog('User saved:', newUser);

    // Save
    setUser(newUser);
    setJustLoggedIn(true);
    localStorage.setItem('vflow_ai_user', JSON.stringify(newUser));

    await new Promise(resolve => setTimeout(resolve, 500));
    setIsLoading(false);
  };

  const consumeJustLoggedIn = () => setJustLoggedIn(false);

  const logout = () => {
    const currentUserId = user?.id ?? null;

    localStorage.removeItem(getWorkbenchProjectStoreKey(currentUserId));
    localStorage.removeItem(getWorkbenchProjectStoreKey(null));

    // Call backend logout to destroy session on server
    void videoApi.clearDraft({ keepalive: true }).catch((err) => {
      debugWarn('Failed to clear workbench draft on logout:', err);
    });
    fetch('/api/auth/logout/', {
      method: 'POST',
      headers: {'X-Requested-With': 'XMLHttpRequest'},
      credentials: 'include',
      keepalive: true,
    }).catch(console.error);

    setUser(null);
    setJustLoggedIn(false);
    localStorage.removeItem('vflow_ai_user');
    clearDebugModeEnabled();
    // Clear cookies explicitly if needed (though backend logout should handle it)
    document.cookie = "sessionid=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    
    // Use window.location to ensure full refresh and router reset
    window.location.href = '/login';
  };

  const updateUser = (patch: Partial<User>) => {
    setUser(prev => {
      const nextPatch: Partial<User> = { ...patch };
      if ('avatar' in nextPatch) {
        nextPatch.avatar = normalizeAvatar((nextPatch as any).avatar);
      }

      const updated = { ...(prev as User || {}), ...nextPatch } as User;
      try {
        localStorage.setItem('vflow_ai_user', JSON.stringify(updated));
      } catch (e) {
        debugError('Failed to persist user to localStorage', e);
      }
      return updated;
    });
  };

  const updateCredits = (delta: number) => {
    setUser(prev => {
      if (!prev) return prev;
      const newCredits = (prev.credits || 0) + delta;
      const updated = { ...prev, credits: newCredits } as User;
      try { localStorage.setItem('vflow_ai_user', JSON.stringify(updated)); } catch (e) { debugError(e); }
      return updated;
    });
  };

  return (
    <AuthContext.Provider value={{ user, login, updateUser, updateCredits, logout, isLoading, justLoggedIn, consumeJustLoggedIn }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
