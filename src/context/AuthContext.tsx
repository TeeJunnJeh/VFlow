import React, { createContext, useContext, useState, useEffect } from 'react';
import { authApi } from '../services/auth';

interface User {
  id: string | number; // Allow number
  name: string;
  avatar: string;
  plan: 'free' | 'plus' | 'pro';
  credits?: number; // remaining generation credits (v点)
  token?: string; 
}

interface AuthContextType {
  user: User | null;
  login: (identifier: string, serverData?: any) => Promise<void>;
  updateUser: (patch: Partial<User>) => void;
  updateCredits: (delta: number) => void;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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
            if (backendUser.tier === 'PRO') plan = 'pro';
            else if (backendUser.tier === 'ENTERPRISE') plan = 'pro'; // Map enterprise to pro for now

            // Construct valid user object
            const verifiedUser: User = {
                id: backendUser.user_id,
                name: backendUser.username || backendUser.phone || 'User',
                avatar: '', // Backend doesn't return avatar yet
                plan: plan,
                credits: backendUser.balance,
                token: undefined // We rely on Cookie Session, no JWT token needed in state
            };

            console.log("✅ Session Verified:", verifiedUser);
            setUser(verifiedUser);
            
            // Update localStorage to keep it fresh (optional, but good for sync)
            localStorage.setItem('vflow_ai_user', JSON.stringify(verifiedUser));
        } else {
            throw new Error("Not logged in");
        }
      } catch (e) {
        console.warn("Auth check failed (Session expired or invalid):", e);
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
    
    console.log("🔍 Login Response Data:", serverData);

    // --- FIX: Find the correct User ID ---
    // Look in all common places API might return it
    const realUserId = 
      serverData?.user_id || 
      serverData?.id ||
      serverData?.data?.user_id || 
      serverData?.data?.id ||
      serverData?.user?.id;

    if (!realUserId) {
      console.warn("⚠️ No numeric User ID found. Backend calls might fail with 404.");
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
        const lowerPlan = planFromServer.toLowerCase();
        if (lowerPlan === 'pro' || lowerPlan === 'enterprise') resolvedPlan = 'pro';
        else if (lowerPlan === 'plus') resolvedPlan = 'plus';
    }

    const defaultCredits = 10; // default balance

    const newUser: User = {
      // Use the Real ID if found, otherwise crash/warn instead of using a fake string
      id: realUserId || '1', 
      name: identifier,
      avatar: '',
      plan: resolvedPlan,
      credits: serverData?.credits ?? serverData?.data?.balance ?? defaultCredits,
      token: token 
    };

    console.log("✅ User Saved:", newUser);

    // Save
    setUser(newUser);
    localStorage.setItem('vflow_ai_user', JSON.stringify(newUser));
    
    await new Promise(resolve => setTimeout(resolve, 500));
    setIsLoading(false);
  };

  const logout = () => {
    // Call backend logout to destroy session on server
    fetch('/api/auth/logout/', { method: 'POST', headers: {'X-Requested-With': 'XMLHttpRequest'} })
        .catch(console.error);

    setUser(null);
    localStorage.removeItem('vflow_ai_user');
    // Clear cookies explicitly if needed (though backend logout should handle it)
    document.cookie = "sessionid=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    
    // Use window.location to ensure full refresh and router reset
    window.location.href = '/login';
  };

  const updateUser = (patch: Partial<User>) => {
    setUser(prev => {
      const updated = { ...(prev as User || {}), ...patch } as User;
      try {
        localStorage.setItem('vflow_ai_user', JSON.stringify(updated));
      } catch (e) {
        console.error('Failed to persist user to localStorage', e);
      }
      return updated;
    });
  };

  const updateCredits = (delta: number) => {
    setUser(prev => {
      if (!prev) return prev;
      const newCredits = (prev.credits || 0) + delta;
      const updated = { ...prev, credits: newCredits } as User;
      try { localStorage.setItem('vflow_ai_user', JSON.stringify(updated)); } catch (e) { console.error(e); }
      return updated;
    });
  };

  return (
    <AuthContext.Provider value={{ user, login, updateUser, updateCredits, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};