import React, { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { BrainCircuit, Eye, EyeOff, Loader2 } from 'lucide-react';

import { useAuth } from '@/context/auth-context';
import { AUTH_ERROR_CODES, AUTH_ERROR_MESSAGES, EMAIL_REGEX } from '@/lib/mock-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ThemeToggle } from '@/components/theme-toggle';

const MODES = {
  SIGN_IN: 'sign_in',
  SIGN_UP: 'sign_up',
  FORGOT_PASSWORD: 'forgot_password',
};

const msg = (code) => AUTH_ERROR_MESSAGES[code];

function FieldError({ id, message }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="text-xs text-destructive">
      {message}
    </p>
  );
}

export function LoginPage() {
  const { session, signIn, signUp, resetPassword } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState(MODES.SIGN_IN);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  if (session) {
    return <Navigate to="/" replace />;
  }

  const clearMessages = () => {
    setFormError('');
    setInfoMessage('');
    setFieldErrors({});
  };

  const switchMode = (nextMode) => {
    setMode(nextMode);
    clearMessages();
  };

  const withFieldClear = (field, setter) => (e) => {
    setFormError('');
    setInfoMessage('');
    setFieldErrors((prev) => (prev[field] ? { ...prev, [field]: '' } : prev));
    setter(e.target.value);
  };

  const handleSignIn = async (e) => {
    e.preventDefault();
    clearMessages();

    const errors = {};
    if (!email.trim()) errors.email = msg(AUTH_ERROR_CODES.EMAIL_REQUIRED);
    else if (!EMAIL_REGEX.test(email.trim())) errors.email = msg(AUTH_ERROR_CODES.EMAIL_INVALID);
    if (!password) errors.password = msg(AUTH_ERROR_CODES.PASSWORD_REQUIRED);

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await signIn({ email, password });
      if (error) {
        setFormError(error.message);
        return;
      }
      navigate('/', { replace: true });
    } catch {
      setFormError(msg(AUTH_ERROR_CODES.UNEXPECTED));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    clearMessages();

    const errors = {};
    if (!fullName.trim()) errors.fullName = msg(AUTH_ERROR_CODES.FULL_NAME_REQUIRED);
    if (!email.trim()) errors.email = msg(AUTH_ERROR_CODES.EMAIL_REQUIRED);
    else if (!EMAIL_REGEX.test(email.trim())) errors.email = msg(AUTH_ERROR_CODES.EMAIL_INVALID);
    if (!password) errors.password = msg(AUTH_ERROR_CODES.PASSWORD_REQUIRED);
    else if (password.length < 6) errors.password = msg(AUTH_ERROR_CODES.PASSWORD_TOO_SHORT);
    if (!confirmPassword) errors.confirmPassword = msg(AUTH_ERROR_CODES.PASSWORD_REQUIRED);
    else if (password && confirmPassword !== password) errors.confirmPassword = msg(AUTH_ERROR_CODES.PASSWORD_MISMATCH);

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await signUp({ email, password, fullName });
      if (error) {
        setFormError(error.message);
        return;
      }
      navigate('/', { replace: true });
    } catch {
      setFormError(msg(AUTH_ERROR_CODES.UNEXPECTED));
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    clearMessages();

    const errors = {};
    if (!email.trim()) errors.email = msg(AUTH_ERROR_CODES.EMAIL_REQUIRED);
    else if (!EMAIL_REGEX.test(email.trim())) errors.email = msg(AUTH_ERROR_CODES.EMAIL_INVALID);
    if (!newPassword) errors.newPassword = msg(AUTH_ERROR_CODES.PASSWORD_REQUIRED);
    else if (newPassword.length < 6) errors.newPassword = msg(AUTH_ERROR_CODES.PASSWORD_TOO_SHORT);
    if (!confirmNewPassword) errors.confirmNewPassword = msg(AUTH_ERROR_CODES.PASSWORD_REQUIRED);
    else if (newPassword && confirmNewPassword !== newPassword)
      errors.confirmNewPassword = msg(AUTH_ERROR_CODES.PASSWORD_MISMATCH);

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await resetPassword({ email, newPassword });
      if (error) {
        setFormError(error.message);
        return;
      }
      setInfoMessage('Password updated. You can sign in with your new password now.');
      setNewPassword('');
      setConfirmNewPassword('');
    } catch {
      setFormError(msg(AUTH_ERROR_CODES.UNEXPECTED));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative h-screen overflow-y-auto bg-background">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,hsl(var(--primary)/0.14),transparent)]"
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 bg-[linear-gradient(hsl(var(--foreground)/0.035)_1px,transparent_1px),linear-gradient(90deg,hsl(var(--foreground)/0.035)_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,black,transparent)]"
      />

      <div className="fixed right-4 top-4 z-10">
        <ThemeToggle />
      </div>

      <div className="relative flex min-h-full items-center justify-center px-4 py-3">
        <div className="relative w-full max-w-[26rem]">
          <Card id="login-card" className="overflow-hidden shadow-xl">
            <div className="flex flex-col items-center gap-1 bg-muted/40 px-6 py-3 text-center">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-violet-500 text-primary-foreground shadow-sm">
                <BrainCircuit className="h-4 w-4" />
              </div>
              <div>
                <p id="login-brand-title" className="text-sm font-semibold tracking-tight">
                  IntelliDoc
                </p>
                <p className="text-xs text-muted-foreground">AI Document Platform</p>
              </div>
            </div>

            {mode === MODES.SIGN_IN && (
              <>
                <CardHeader className="px-6 pt-3 pb-1 text-center sm:text-left">
                  <CardTitle id="login-title">Welcome back</CardTitle>
                  <CardDescription>Sign in to access your documents</CardDescription>
                </CardHeader>
                <CardContent className="px-6 pb-4 pt-2">
                  <form id="login-form" className="flex flex-col gap-2.5" onSubmit={handleSignIn} noValidate>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="email-input">Email</Label>
                      <Input
                        id="email-input"
                        name="email"
                        type="email"
                        autoComplete="email"
                        placeholder="you@company.com"
                        disabled={submitting}
                        aria-invalid={Boolean(fieldErrors.email)}
                        aria-describedby={fieldErrors.email ? 'email-input-error' : undefined}
                        value={email}
                        onChange={withFieldClear('email', setEmail)}
                      />
                      <FieldError id="email-input-error" message={fieldErrors.email} />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="password-input">Password</Label>
                        <button
                          id="forgot-password-link"
                          type="button"
                          className="text-xs font-medium text-primary hover:underline"
                          onClick={() => switchMode(MODES.FORGOT_PASSWORD)}
                        >
                          Forgot password?
                        </button>
                      </div>
                      <div className="relative">
                        <Input
                          id="password-input"
                          name="password"
                          type={showPassword ? 'text' : 'password'}
                          autoComplete="current-password"
                          placeholder="••••••••"
                          disabled={submitting}
                          aria-invalid={Boolean(fieldErrors.password)}
                          aria-describedby={fieldErrors.password ? 'password-input-error' : undefined}
                          className="pr-9"
                          value={password}
                          onChange={withFieldClear('password', setPassword)}
                        />
                        <button
                          id="toggle-password-visibility"
                          type="button"
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          onClick={() => setShowPassword((v) => !v)}
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      <FieldError id="password-input-error" message={fieldErrors.password} />
                    </div>

                    {formError && (
                      <p id="login-error-message" role="alert" className="text-sm text-destructive">
                        {formError}
                      </p>
                    )}

                    <Button id="login-submit-button" type="submit" className="mt-1 gap-2" disabled={submitting}>
                      {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                      {submitting ? 'Signing in…' : 'Sign in'}
                    </Button>
                  </form>

                  <p className="mt-2 text-center text-sm text-muted-foreground">
                    Don&apos;t have an account?{' '}
                    <button
                      id="switch-to-signup-link"
                      type="button"
                      className="font-medium text-primary hover:underline"
                      onClick={() => switchMode(MODES.SIGN_UP)}
                    >
                      Create one
                    </button>
                  </p>
                </CardContent>
              </>
            )}

            {mode === MODES.SIGN_UP && (
              <>
                <CardHeader className="px-6 pt-3 pb-1 text-center sm:text-left">
                  <CardTitle id="login-title">Create your account</CardTitle>
                  <CardDescription>Start analyzing documents with AI</CardDescription>
                </CardHeader>
                <CardContent className="px-6 pb-4 pt-2">
                  <form id="signup-form" className="flex flex-col gap-2.5" onSubmit={handleSignUp} noValidate>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="full-name-input">Full name</Label>
                      <Input
                        id="full-name-input"
                        name="fullName"
                        type="text"
                        autoComplete="name"
                        placeholder="Jane Doe"
                        disabled={submitting}
                        aria-invalid={Boolean(fieldErrors.fullName)}
                        aria-describedby={fieldErrors.fullName ? 'full-name-input-error' : undefined}
                        value={fullName}
                        onChange={withFieldClear('fullName', setFullName)}
                      />
                      <FieldError id="full-name-input-error" message={fieldErrors.fullName} />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="signup-email-input">Email</Label>
                      <Input
                        id="signup-email-input"
                        name="email"
                        type="email"
                        autoComplete="email"
                        placeholder="you@company.com"
                        disabled={submitting}
                        aria-invalid={Boolean(fieldErrors.email)}
                        aria-describedby={fieldErrors.email ? 'signup-email-input-error' : undefined}
                        value={email}
                        onChange={withFieldClear('email', setEmail)}
                      />
                      <FieldError id="signup-email-input-error" message={fieldErrors.email} />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="signup-password-input">Password</Label>
                      <Input
                        id="signup-password-input"
                        name="password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        placeholder="At least 6 characters"
                        disabled={submitting}
                        aria-invalid={Boolean(fieldErrors.password)}
                        aria-describedby={fieldErrors.password ? 'signup-password-input-error' : undefined}
                        value={password}
                        onChange={withFieldClear('password', setPassword)}
                      />
                      <FieldError id="signup-password-input-error" message={fieldErrors.password} />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="confirm-password-input">Confirm password</Label>
                      <Input
                        id="confirm-password-input"
                        name="confirmPassword"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        placeholder="Re-enter your password"
                        disabled={submitting}
                        aria-invalid={Boolean(fieldErrors.confirmPassword)}
                        aria-describedby={fieldErrors.confirmPassword ? 'confirm-password-input-error' : undefined}
                        value={confirmPassword}
                        onChange={withFieldClear('confirmPassword', setConfirmPassword)}
                      />
                      <FieldError id="confirm-password-input-error" message={fieldErrors.confirmPassword} />
                    </div>

                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <input
                        id="show-signup-password-checkbox"
                        type="checkbox"
                        className="h-3.5 w-3.5 rounded border-input"
                        checked={showPassword}
                        onChange={(e) => setShowPassword(e.target.checked)}
                      />
                      Show passwords
                    </label>

                    {formError && (
                      <p id="signup-error-message" role="alert" className="text-sm text-destructive">
                        {formError}
                      </p>
                    )}

                    <Button id="signup-submit-button" type="submit" className="mt-1 gap-2" disabled={submitting}>
                      {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                      {submitting ? 'Creating account…' : 'Create account'}
                    </Button>
                  </form>

                  <p className="mt-2 text-center text-sm text-muted-foreground">
                    Already have an account?{' '}
                    <button
                      id="switch-to-signin-link"
                      type="button"
                      className="font-medium text-primary hover:underline"
                      onClick={() => switchMode(MODES.SIGN_IN)}
                    >
                      Sign in
                    </button>
                  </p>
                </CardContent>
              </>
            )}

            {mode === MODES.FORGOT_PASSWORD && (
              <>
                <CardHeader className="px-6 pt-3 pb-1 text-center sm:text-left">
                  <CardTitle id="login-title">Reset your password</CardTitle>
                  <CardDescription>Enter your email and a new password</CardDescription>
                </CardHeader>
                <CardContent className="px-6 pb-4 pt-2">
                  <form
                    id="forgot-password-form"
                    className="flex flex-col gap-2.5"
                    onSubmit={handleResetPassword}
                    noValidate
                  >
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="reset-email-input">Email</Label>
                      <Input
                        id="reset-email-input"
                        name="email"
                        type="email"
                        autoComplete="email"
                        placeholder="you@company.com"
                        disabled={submitting}
                        aria-invalid={Boolean(fieldErrors.email)}
                        aria-describedby={fieldErrors.email ? 'reset-email-input-error' : undefined}
                        value={email}
                        onChange={withFieldClear('email', setEmail)}
                      />
                      <FieldError id="reset-email-input-error" message={fieldErrors.email} />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="reset-new-password-input">New password</Label>
                      <Input
                        id="reset-new-password-input"
                        name="newPassword"
                        type="password"
                        autoComplete="new-password"
                        placeholder="At least 6 characters"
                        disabled={submitting}
                        aria-invalid={Boolean(fieldErrors.newPassword)}
                        aria-describedby={fieldErrors.newPassword ? 'reset-new-password-input-error' : undefined}
                        value={newPassword}
                        onChange={withFieldClear('newPassword', setNewPassword)}
                      />
                      <FieldError id="reset-new-password-input-error" message={fieldErrors.newPassword} />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="reset-confirm-password-input">Confirm new password</Label>
                      <Input
                        id="reset-confirm-password-input"
                        name="confirmNewPassword"
                        type="password"
                        autoComplete="new-password"
                        placeholder="Re-enter your new password"
                        disabled={submitting}
                        aria-invalid={Boolean(fieldErrors.confirmNewPassword)}
                        aria-describedby={fieldErrors.confirmNewPassword ? 'reset-confirm-password-input-error' : undefined}
                        value={confirmNewPassword}
                        onChange={withFieldClear('confirmNewPassword', setConfirmNewPassword)}
                      />
                      <FieldError id="reset-confirm-password-input-error" message={fieldErrors.confirmNewPassword} />
                    </div>

                    {formError && (
                      <p id="forgot-password-error-message" role="alert" className="text-sm text-destructive">
                        {formError}
                      </p>
                    )}
                    {infoMessage && (
                      <p id="forgot-password-info-message" className="text-sm text-success">
                        {infoMessage}
                      </p>
                    )}

                    <Button id="reset-password-submit-button" type="submit" className="mt-1 gap-2" disabled={submitting}>
                      {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                      {submitting ? 'Updating…' : 'Update password'}
                    </Button>
                  </form>

                  <p className="mt-2 text-center text-sm text-muted-foreground">
                    <button
                      id="back-to-signin-link"
                      type="button"
                      className="font-medium text-primary hover:underline"
                      onClick={() => switchMode(MODES.SIGN_IN)}
                    >
                      Back to sign in
                    </button>
                  </p>
                </CardContent>
              </>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
