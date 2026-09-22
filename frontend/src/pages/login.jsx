import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';

import { useAuth } from '@/context/auth-context';
import { ThemeToggle } from '@/components/theme-toggle';
import { AuthBrandHeader } from '@/components/auth/auth-brand-header';
import { AuthShowcasePanel } from '@/components/auth/auth-showcase-panel';
import { SignInForm } from '@/components/auth/sign-in-form';
import { SignUpForm } from '@/components/auth/sign-up-form';
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form';
import { LOGIN_MODES } from '@/lib/auth-validation';

const MODE_FORMS = {
  [LOGIN_MODES.SIGN_IN]: SignInForm,
  [LOGIN_MODES.SIGN_UP]: SignUpForm,
  [LOGIN_MODES.FORGOT_PASSWORD]: ForgotPasswordForm,
};

export function LoginPage() {
  const { session } = useAuth();
  const [mode, setMode] = useState(LOGIN_MODES.SIGN_IN);
  const [email, setEmail] = useState('');

  if (session) {
    return <Navigate to="/" replace />;
  }

  const ActiveForm = MODE_FORMS[mode];

  return (
    <div id="login-page" className="flex h-screen w-full overflow-hidden bg-background">
      <AuthShowcasePanel />

      <div className="relative flex h-full flex-1 flex-col overflow-y-auto bg-muted/30">
        <div className="fixed right-4 top-4 z-20">
          <ThemeToggle />
        </div>

        <div className="relative flex min-h-full flex-1 items-center justify-center px-4 py-10 sm:px-8">
          <div className="w-full max-w-[28rem]">
            <div className="mb-6 lg:hidden">
              <AuthBrandHeader />
            </div>

            <div id="login-card">
              <ActiveForm email={email} onEmailChange={setEmail} onSwitchMode={setMode} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
