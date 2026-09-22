import React, { createContext, useContext, useMemo, useState } from 'react';

import { authApi } from '@/lib/auth-api';
import { mockAuth } from '@/lib/mock-auth';

const AuthContext = createContext(undefined);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => mockAuth.getSession());

  const value = useMemo(
    () => ({
      user,
      session: user ? { user } : null,
      loading: false,

      signIn: async (credentials) => {
        const { user: signedInUser, error } = await authApi.login(credentials);
        if (signedInUser) setUser(signedInUser);
        return { error };
      },

      signUp: async (details) => {
        const { user: newUser, error } = await mockAuth.signUp(details);
        if (newUser) setUser(newUser);
        return { error };
      },

      resetPassword: async (details) => mockAuth.resetPassword(details),

      updateProfile: async (updates) => {
        if (!user) return { error: new Error('Not signed in.') };
        const { user: updatedUser, error } = await mockAuth.updateProfile({ email: user.email, ...updates });
        if (updatedUser) setUser(updatedUser);
        return { error };
      },

      signOut: async () => {
        await mockAuth.signOut();
        authApi.signOut();
        setUser(null);
      },

      deleteAccount: async () => {
        if (!user) return { error: new Error('Not signed in.') };
        const { error } = await mockAuth.deleteAccount({ email: user.email });
        if (!error) setUser(null);
        return { error };
      },
    }),
    [user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
