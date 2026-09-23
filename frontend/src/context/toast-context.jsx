import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

import { ToastNotification } from '@/components/ui/toast-notification';

const ToastContext = createContext(undefined);

// App-wide toast host. Components anywhere in the tree (dialogs, header menus) can call
// `toast.success(...)` / `toast.error(...)` without owning any toast state or markup.
export function ToastProvider({ children }) {
  const [current, setCurrent] = useState(null);

  const close = useCallback(() => setCurrent(null), []);

  // A new toast replaces the current one; `key` restarts the auto-dismiss timer.
  const show = useCallback((variant, { title, message }) => {
    setCurrent({ key: Date.now(), variant, title, message });
  }, []);

  const api = useMemo(
    () => ({
      success: (title, message) => show('success', { title, message }),
      warning: (title, message) => show('warning', { title, message }),
      error: (title, message) => show('error', { title, message }),
    }),
    [show]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastNotification
        key={current?.key}
        open={Boolean(current)}
        onClose={close}
        variant={current?.variant}
        title={current?.title}
        message={current?.message}
        testId={current ? `toast-${current.variant}` : undefined}
      />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
