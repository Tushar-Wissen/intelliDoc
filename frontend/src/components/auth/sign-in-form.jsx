import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AuthFormField } from '@/components/auth/auth-form-field';
import { AuthAlert } from '@/components/auth/auth-alert';
import { GoogleIcon, MicrosoftIcon } from '@/components/auth/sso-icons';
import { PasswordInput } from '@/components/auth/password-input';
import { useSignInForm } from '@/hooks/use-sign-in-form';
import { LOGIN_MODES } from '@/lib/auth-validation';

const SSO_NOTICE = 'Single sign-on is coming soon. Please sign in with your email and password for now.';

export function SignInForm({ email, onEmailChange, onSwitchMode }) {
  const { password, handlePasswordChange, handleEmailChange, submitting, formError, fieldErrors, handleSubmit } =
    useSignInForm({ email, onEmailChange });
  const [ssoNotice, setSsoNotice] = useState(false);

  return (
    <>
      <CardHeader className="px-7 pt-8 pb-1 text-center sm:text-left">
        <CardTitle id="login-title" className="font-display text-3xl font-extrabold tracking-tight">
          Welcome back
        </CardTitle>
        <CardDescription className="text-base">Sign in to your workspace</CardDescription>
      </CardHeader>
      <CardContent className="px-7 pb-8 pt-4">
        <form id="login-form" className="flex flex-col gap-3" onSubmit={handleSubmit} noValidate>
          <AuthFormField id="email-input" label="Email" error={fieldErrors.email}>
            <Input
              id="email-input"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              disabled={submitting}
              aria-invalid={Boolean(fieldErrors.email)}
              aria-describedby={fieldErrors.email ? 'email-input-error' : undefined}
              className="h-12 bg-card text-base focus-visible:ring-wissen-navy"
              value={email}
              onChange={handleEmailChange}
            />
          </AuthFormField>

          <AuthFormField
            id="password-input"
            label="Password"
            error={fieldErrors.password}
            action={
              <Button
                id="forgot-password-link"
                type="button"
                variant="link"
                className="h-auto p-0 text-xs font-medium text-wissen-navy hover:text-wissen-navy/80 dark:text-wissen-navy-light dark:hover:text-wissen-navy-light/80"
                onClick={() => onSwitchMode(LOGIN_MODES.FORGOT_PASSWORD)}
              >
                Forgot password?
              </Button>
            }
          >
            <PasswordInput
              id="password-input"
              name="password"
              autoComplete="current-password"
              placeholder="••••••••"
              disabled={submitting}
              error={fieldErrors.password}
              className="bg-card focus-visible:ring-wissen-navy"
              value={password}
              onChange={handlePasswordChange}
            />
          </AuthFormField>

          <AuthAlert id="login-error-message" message={formError} />

          <Button
            id="login-submit-button"
            type="submit"
            className="mt-1 h-12 gap-2 bg-wissen-navy text-base font-semibold text-white hover:bg-wissen-navy/90"
            disabled={submitting}
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        <div className="relative my-5">
          <Separator />
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Or continue with
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Button
            id="sso-google-button"
            type="button"
            variant="outline"
            className="h-11 gap-2 bg-card"
            onClick={() => setSsoNotice(true)}
          >
            <GoogleIcon className="h-4 w-4" /> Google
          </Button>
          <Button
            id="sso-microsoft-button"
            type="button"
            variant="outline"
            className="h-11 gap-2 bg-card"
            onClick={() => setSsoNotice(true)}
          >
            <MicrosoftIcon className="h-4 w-4" /> Microsoft
          </Button>
        </div>

        <AuthAlert id="sso-notice-message" tone="info" message={ssoNotice ? SSO_NOTICE : null} />

        <p className="mt-5 text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{' '}
          <Button
            id="switch-to-signup-link"
            type="button"
            variant="link"
            className="h-auto p-0 text-sm font-medium text-wissen-navy hover:text-wissen-navy/80 dark:text-wissen-navy-light dark:hover:text-wissen-navy-light/80"
            onClick={() => onSwitchMode(LOGIN_MODES.SIGN_UP)}
          >
            Create one
          </Button>
        </p>
      </CardContent>
    </>
  );
}
