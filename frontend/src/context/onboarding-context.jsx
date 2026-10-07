import React, { createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';

import { useAuth } from '@/context/auth-context';

// The tour's code is only downloaded when it actually opens.
const OnboardingTour = lazy(() => import('@/components/onboarding/onboarding-tour'));

const STORAGE_PREFIX = 'documind:onboarding:v1:';

// Users whose tour ended this session, for browsers where localStorage is unavailable.
const endedThisSession = new Set();

function hasSeenTour(userKey) {
  if (endedThisSession.has(userKey)) return true;
  try {
    return window.localStorage.getItem(STORAGE_PREFIX + userKey) !== null;
  } catch {
    return false;
  }
}

function markTourSeen(userKey, outcome) {
  endedThisSession.add(userKey);
  try {
    window.localStorage.setItem(
      STORAGE_PREFIX + userKey,
      JSON.stringify({ outcome, at: new Date().toISOString() })
    );
  } catch {
    // Storage blocked (private mode, quota): the in-memory record still prevents a repeat this session.
  }
}

const OnboardingContext = createContext(null);

// Shows the product tour automatically on a user's first visit, and lets them replay it later.
// Completing, skipping or closing the tour all count as "seen", per user, across sessions.
export function OnboardingProvider({ children }) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);

  const userKey = user ? String(user.id ?? user.email ?? '') || null : null;
  const onAuthPage = pathname === '/login';

  useEffect(() => {
    if (userKey && !onAuthPage && !hasSeenTour(userKey)) setOpen(true);
  }, [userKey, onAuthPage]);

  // A signed-out user never sees the tour.
  useEffect(() => {
    if (!userKey) setOpen(false);
  }, [userKey]);

  const startTour = useCallback(() => setOpen(true), []);

  const endTour = useCallback(
    (outcome) => {
      if (userKey) markTourSeen(userKey, outcome);
      setOpen(false);
    },
    [userKey]
  );

  const value = useMemo(() => ({ startTour, isTourOpen: open }), [startTour, open]);

  return (
    <OnboardingContext.Provider value={value}>
      {children}
      {open && !onAuthPage && (
        <Suspense fallback={null}>
          <OnboardingTour onEnd={endTour} />
        </Suspense>
      )}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const context = useContext(OnboardingContext);
  if (!context) throw new Error('useOnboarding must be used within an OnboardingProvider');
  return context;
}
