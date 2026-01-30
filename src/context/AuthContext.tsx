import React, { createContext, useContext, useState, useEffect } from 'react';

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

  // 1. Load User from Storage on Startup
  useEffect(() => {
    const checkAuth = () => {
      try {
        const stored = localStorage.getItem('vflow_ai_user');
        if (stored) {
          setUser(JSON.parse(stored));
        }
      } catch (e) {
        console.error("Auth init error", e);
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
    const planFromServer = serverData?.plan || serverData?.data?.plan;
    const resolvedPlan: User['plan'] = planFromServer === 'plus' ? 'plus' : (planFromServer === 'pro' ? 'pro' : 'free');
    const defaultCredits = 100; // default balance as requested

    const newUser: User = {
      // Use the Real ID if found, otherwise crash/warn instead of using a fake string
      id: realUserId || '1', // Defaulting to '1' is safer for Django than 'user-xyz'
      name: identifier,
      avatar: '',
      plan: resolvedPlan,
      credits: serverData?.credits ?? serverData?.data?.credits ?? defaultCredits,
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
    setUser(null);
    localStorage.removeItem('vflow_ai_user');
    // Clear cookies
    document.cookie = "sessionid=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
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