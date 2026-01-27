import React, { createContext, useContext, useState, useEffect } from 'react';

interface User {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  avatar: string;
  plan: 'free' | 'pro';
  token?: string; // Store the backend token
}

interface AuthContextType {
  user: User | null;
  // We allow login to take optional data (for the real API response)
  login: (identifier: string, userData?: any) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const storedUser = localStorage.getItem('vflow_ai_user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
    setIsLoading(false);
  }, []);

  // Update logic to accept real data from the Phone Login API
  const login = async (identifier: string, apiResponseData?: any) => {
    
    // If we have real data from the backend (Phone Login)
    if (apiResponseData) {
      const realUser: User = {
        id: apiResponseData.user?.id || 'server-user',
        name: apiResponseData.user?.username || identifier,
        phone: identifier,
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + identifier,
        plan: 'pro',
        token: apiResponseData.token // Save the token from your API
      };
      setUser(realUser);
      localStorage.setItem('vflow_ai_user', JSON.stringify(realUser));
    } 
    // Fallback to Mock (Email Login)
    else {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const mockUser: User = {
        id: '1',
        name: identifier.split('@')[0],
        email: identifier,
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + identifier,
        plan: 'pro'
      };
      setUser(mockUser);
      localStorage.setItem('vflow_ai_user', JSON.stringify(mockUser));
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('vflow_ai_user');
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