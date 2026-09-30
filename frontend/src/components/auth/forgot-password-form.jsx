import React from 'react';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AuthFormField } from '@/components/auth/auth-form-field';
import { AuthAlert } from '@/components/auth/auth-alert';
import { PasswordInput } from '@/components/auth/password-input';
import { useResetPasswordForm } from '@/hooks/use-reset-password-form';
import { LOGIN_MODES } from '@/lib/auth-validation';

export function ForgotPasswordForm({ email, onEmailChange, onSwitchMode }) {
  const {
    newPassword,
    handleNewPasswordChange,
    confirmNewPassword,
    handleConfirmNewPasswordChange,
    handleEmailChange,
    submitting,
    formError,
    infoMessage,
    fieldErrors,
    handleSubmit,
  } = useResetPasswordForm({ email, onEmailChange });

  return (
    <>
      <CardHeader className="px-7 pt-8 pb-1 text-center sm:text-left">
        <CardTitle id="login-title" className="font-display text-3xl font-extrabold tracking-tight">
          Reset your password
        </CardTitle>
        <CardDescription className="text-base">Enter your email and a new password</CardDescription>
      </CardHeader>
      <CardContent className="px-7 pb-8 pt-4">
        <form id="forgot-password-form" className="flex flex-col gap-3" onSubmit={handleSubmit} noValidate>
          <AuthFormField id="reset-email-input" label="Email" error={fieldErrors.email}>
            <Input
              id="reset-email-input"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              disabled={submitting}
              aria-invalid={Boolean(fieldErrors.email)}
              aria-describedby={fieldErrors.email ? 'reset-email-input-error' : undefined}
              className="h-12 bg-card text-base focus-visible:ring-wissen-navy"
              value={email}
              onChange={handleEmailChange}
            />
          </AuthFormField>

          <AuthFormField id="reset-new-password-input" label="New password" error={fieldErrors.newPassword}>
            <PasswordInput
              id="reset-new-password-input"
              name="newPassword"
              autoComplete="new-password"
              placeholder="At least 6 characters"
              disabled={submitting}
              error={fieldErrors.newPassword}
              className="bg-card focus-visible:ring-wissen-navy"
              value={newPassword}
              onChange={handleNewPasswordChange}
            />
          </AuthFormField>

          <AuthFormField
            id="reset-confirm-password-input"
            label="Confirm new password"
            error={fieldErrors.confirmNewPassword}
          >
            <PasswordInput
              id="reset-confirm-password-input"
              name="confirmNewPassword"
              autoComplete="new-password"
              placeholder="Re-enter your new password"
              disabled={submitting}
              error={fieldErrors.confirmNewPassword}
              className="bg-card focus-visible:ring-wissen-navy"
              value={confirmNewPassword}
              onChange={handleConfirmNewPasswordChange}
            />
          </AuthFormField>

          <AuthAlert id="forgot-password-error-message" message={formError} />
          <AuthAlert id="forgot-password-info-message" message={infoMessage} tone="success" />

          <Button
            id="reset-password-submit-button"
            type="submit"
            className="mt-1 h-12 gap-2 bg-wissen-navy text-base font-semibold text-white hover:bg-wissen-navy/90"
            disabled={submitting}
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitting ? 'Updating…' : 'Update password'}
          </Button>
        </form>

        <p className="mt-5 text-center text-sm text-muted-foreground">
          <Button
            id="back-to-signin-link"
            type="button"
            variant="link"
            className="h-auto p-0 text-sm font-medium text-wissen-navy hover:text-wissen-navy/80 dark:text-wissen-navy-light dark:hover:text-wissen-navy-light/80"
            onClick={() => onSwitchMode(LOGIN_MODES.SIGN_IN)}
          >
            Back to sign in
          </Button>
        </p>
      </CardContent>
    </>
  );
}
