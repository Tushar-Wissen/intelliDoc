import React from 'react';
import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

import { useAuth } from '@/context/auth-context';

export function ProtectedRoute({ children }) {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div id="auth-loading" className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
