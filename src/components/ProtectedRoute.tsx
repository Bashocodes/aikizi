import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface ProtectedRouteProps {
  children: ReactNode;
  requireRole?: ('viewer' | 'pro' | 'publisher' | 'admin')[];
}

export function ProtectedRoute({ children, requireRole }: ProtectedRouteProps) {
  const { user, userRecord, authReady } = useAuth();
  const location = useLocation();

  if (location.pathname === '/auth/callback') {
    return <>{children}</>;
  }

  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 dark:border-white"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  if (requireRole && userRecord && !requireRole.includes(userRecord.role)) {
    return <Navigate to="/explore" replace />;
  }

  return <>{children}</>;
}
