import React, { createContext, useContext, useState, useEffect } from 'react';
import { authApi } from '../services/auth'; // Import your auth api if needed

interface User {
  id: string;
  name: string;
  avatar: string;
  plan: 'pro';
}

interface AuthContextType {
  user: User | null;
  login: (identifier: string, serverData?: any) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check if we have user data in local storage (UI persistence)
    // We rely on the browser cookie for actual API access
    const stored = localStorage.getItem('vflow_ai_user');
    if (stored) {
      setUser(JSON.parse(stored));
    }
    setIsLoading(false);
  }, []);

  const login = async (identifier: string, serverData?: any) => {
    setIsLoading(true);
    
    // We DO NOT need to find a token anymore.
    // If we are here, the API call succeeded (200 OK), 
    // so the browser definitely has the Set-Cookie headers now.

    const newUser: User = {
      id: serverData?.user_id || 'user-1',
      name: identifier,
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${identifier}`,
      plan: 'pro',
    };

    setUser(newUser);
    localStorage.setItem('vflow_ai_user', JSON.stringify(newUser));
    
    setIsLoading(false);
  };

  const logout = async () => {
    // Optional: Call backend logout to clear cookie
    // await authApi.logout(); 
    setUser(null);
    localStorage.removeItem('vflow_ai_user');
    // Clear cookies document-side just in case
    document.cookie = "sessionid=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};