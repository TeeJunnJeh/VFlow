import React, { createContext, useContext, useState, useEffect } from 'react';

// Define what a User looks like
interface User {
  id: string;
  name: string;
  email: string;
  avatar: string;
  plan: 'free' | 'pro';
}

interface AuthContextType {
  user: User | null;
  login: (email: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check for existing session on load
  useEffect(() => {
    const storedUser = localStorage.getItem('ai_studio_user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
    setIsLoading(false);
  }, []);

  // Mock Login Function
  const login = async (email: string) => {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Create a mock user
    const mockUser: User = {
      id: '1',
      name: email.split('@')[0], // Use part of email as name
      email: email,
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + email, // Generates cool avatars
      plan: 'pro'
    };

    setUser(mockUser);
    localStorage.setItem('ai_studio_user', JSON.stringify(mockUser));
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('ai_studio_user');
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