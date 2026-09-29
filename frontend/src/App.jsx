import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { ProtectedRoute } from '@/components/auth/protected-route';
import { LoginPage } from '@/pages/login';
import { ProfilePage } from '@/pages/profile';
import { DashboardPage } from '@/pages/dashboard';
import { WorkspacePage } from '@/pages/workspace';
import { OrphanedFilesPage } from '@/pages/orphaned-files';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <ProfilePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/workspace"
        element={
          <ProtectedRoute>
            <WorkspacePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/orphaned-files"
        element={
          <ProtectedRoute>
            <OrphanedFilesPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
