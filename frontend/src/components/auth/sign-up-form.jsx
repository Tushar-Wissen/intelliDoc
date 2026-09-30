import React from 'react';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AuthFormField } from '@/components/auth/auth-form-field';
import { AuthAlert } from '@/components/auth/auth-alert';
import { PasswordInput } from '@/components/auth/password-input';
import { useSignUpForm } from '@/hooks/use-sign-up-form';
import { LOGIN_MODES } from '@/lib/auth-validation';

export function SignUpForm({ email, onEmailChange, onSwitchMode }) {
  const {
    fullName,
    handleFullNameChange,
    handleEmailChange,
    password,
    handlePasswordChange,
    confirmPassword,
    handleConfirmPasswordChange,
    submitting,
    formError,
    fieldErrors,
    handleSubmit,
  } = useSignUpForm({ email, onEmailChange });

  return (
    <>
      <CardHeader className="px-7 pt-8 pb-1 text-center sm:text-left">
        <CardTitle id="login-title" className="font-display text-3xl font-extrabold tracking-tight">
          Create your account
        </CardTitle>
        <CardDescription className="text-base">Start analyzing documents with AI</CardDescription>
      </CardHeader>
      <CardContent className="px-7 pb-8 pt-4">
        <form id="signup-form" className="flex flex-col gap-3" onSubmit={handleSubmit} noValidate>
          <AuthFormField id="full-name-input" label="Full name" error={fieldErrors.fullName}>
            <Input
              id="full-name-input"
              name="fullName"
              type="text"
              autoComplete="name"
              placeholder="Jane Doe"
              disabled={submitting}
              aria-invalid={Boolean(fieldErrors.fullName)}
              aria-describedby={fieldErrors.fullName ? 'full-name-input-error' : undefined}
              className="h-12 bg-card text-base focus-visible:ring-wissen-navy"
              value={fullName}
              onChange={handleFullNameChange}
            />
          </AuthFormField>

          <AuthFormField id="signup-email-input" label="Email" error={fieldErrors.email}>
            <Input
              id="signup-email-input"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              disabled={submitting}
              aria-invalid={Boolean(fieldErrors.email)}
              aria-describedby={fieldErrors.email ? 'signup-email-input-error' : undefined}
              className="h-12 bg-card text-base focus-visible:ring-wissen-navy"
              value={email}
              onChange={handleEmailChange}
            />
          </AuthFormField>

          <AuthFormField id="signup-password-input" label="Password" error={fieldErrors.password}>
            <PasswordInput
              id="signup-password-input"
              name="password"
              autoComplete="new-password"
              placeholder="At least 6 characters"
              disabled={submitting}
              error={fieldErrors.password}
              className="bg-card focus-visible:ring-wissen-navy"
              value={password}
              onChange={handlePasswordChange}
            />
          </AuthFormField>

          <AuthFormField id="confirm-password-input" label="Confirm password" error={fieldErrors.confirmPassword}>
            <PasswordInput
              id="confirm-password-input"
              name="confirmPassword"
              autoComplete="new-password"
              placeholder="Re-enter your password"
              disabled={submitting}
              error={fieldErrors.confirmPassword}
              className="bg-card focus-visible:ring-wissen-navy"
              value={confirmPassword}
              onChange={handleConfirmPasswordChange}
            />
          </AuthFormField>

          <AuthAlert id="signup-error-message" message={formError} />

          <Button
            id="signup-submit-button"
            type="submit"
            className="mt-1 h-12 gap-2 bg-wissen-navy text-base font-semibold text-white hover:bg-wissen-navy/90"
            disabled={submitting}
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitting ? 'Creating account…' : 'Create account'}
          </Button>
        </form>

        <p className="mt-5 text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Button
            id="switch-to-signin-link"
            type="button"
            variant="link"
            className="h-auto p-0 text-sm font-medium text-wissen-navy hover:text-wissen-navy/80 dark:text-wissen-navy-light dark:hover:text-wissen-navy-light/80"
            onClick={() => onSwitchMode(LOGIN_MODES.SIGN_IN)}
          >
            Sign in
          </Button>
        </p>
      </CardContent>
    </>
  );
}
