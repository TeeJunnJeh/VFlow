import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LanguageProvider } from './context/LanguageContext';
import LoginPage from './pages/Login';
import LandingPage from './pages/Landing';
import Workbench from './pages/Workbench'; // Import the new component

// --- Protected Route Wrapper ---
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <div className="min-h-screen bg-[#050505] flex items-center justify-center text-orange-500">Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

function App() {
  return (
    <AuthProvider>
      <LanguageProvider>
        <BrowserRouter>
          <Routes>
            {/* Public Routes */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            
            {/* Protected Workbench */}
            <Route 
              path="/app/*" 
              element={
                <ProtectedRoute>
                  <Workbench />
                </ProtectedRoute>
              } 
            />
          </Routes>
        </BrowserRouter>
      </LanguageProvider>
    </AuthProvider>
  );
}

export default App;