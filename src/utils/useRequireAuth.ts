import { useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Hook for guest mode: provides a function to check auth status
 * and redirect to login if not authenticated.
 *
 * Usage:
 *   const { isAuthenticated, requireAuth } = useRequireAuth();
 *   const handleGenerate = () => {
 *     if (!requireAuth()) return;  // redirects to login if guest
 *     // ... proceed with generation
 *   };
 */
export function useRequireAuth() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isAuthenticated = !!user;

  const requireAuth = useCallback((): boolean => {
    if (user) return true;
    const returnUrl = location.pathname + location.search;
    navigate(`/login?returnUrl=${encodeURIComponent(returnUrl)}`);
    return false;
  }, [user, navigate, location.pathname, location.search]);

  return { isAuthenticated, requireAuth };
}
