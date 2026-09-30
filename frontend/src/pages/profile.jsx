import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound, Loader2, LogOut, Trash2, UserRound } from 'lucide-react';

import { useAuth } from '@/context/auth-context';
import { useHealthStatus } from '@/hooks/use-health-status';
import { AppShell } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatDate } from '@/lib/format';

function getInitials(user) {
  const name = user?.fullName?.trim();
  if (name) {
    const parts = name.split(/\s+/);
    return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
  }
  return (user?.email?.[0] || '?').toUpperCase();
}

function FieldError({ id, message }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="text-xs text-destructive">
      {message}
    </p>
  );
}

export function ProfilePage() {
  const { user, updateProfile, signOut, deleteAccount } = useAuth();
  const navigate = useNavigate();
  const healthStatus = useHealthStatus();

  const [fullName, setFullName] = useState(user?.fullName || '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');
  const [profileFieldErrors, setProfileFieldErrors] = useState({});

  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordFieldErrors, setPasswordFieldErrors] = useState({});

  const [signingOut, setSigningOut] = useState(false);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const trimmedFullName = fullName.trim();
  const isNameUnchanged = trimmedFullName === (user?.fullName || '').trim();

  const handleFullNameChange = (e) => {
    setProfileError('');
    setProfileSuccess('');
    setProfileFieldErrors((prev) => (prev.fullName ? { ...prev, fullName: '' } : prev));
    setFullName(e.target.value);
  };

  const handleResetFullName = () => {
    setFullName(user?.fullName || '');
    setProfileError('');
    setProfileFieldErrors({});
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setProfileError('');
    setProfileSuccess('');
    setProfileFieldErrors({});

    if (!trimmedFullName) {
      setProfileFieldErrors({ fullName: 'Full name is required.' });
      return;
    }

    setSavingProfile(true);
    try {
      const { error } = await updateProfile({ fullName: trimmedFullName });
      if (error) throw error;
      setProfileSuccess('Profile updated.');
    } catch (err) {
      setProfileError(err.message || 'Unable to update your profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  const withPasswordFieldClear = (field, setter) => (e) => {
    setPasswordError('');
    setPasswordSuccess('');
    setPasswordFieldErrors((prev) => (prev[field] ? { ...prev, [field]: '' } : prev));
    setter(e.target.value);
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    const errors = {};
    if (!newPassword) errors.newPassword = 'Password is required.';
    else if (newPassword.length < 6) errors.newPassword = 'Password must be at least 6 characters.';
    if (!confirmNewPassword) errors.confirmNewPassword = 'Please confirm your new password.';
    else if (newPassword && confirmNewPassword !== newPassword) errors.confirmNewPassword = 'Passwords do not match.';

    if (Object.keys(errors).length > 0) {
      setPasswordFieldErrors(errors);
      return;
    }

    setSavingPassword(true);
    try {
      const { error } = await updateProfile({ password: newPassword });
      if (error) throw error;
      setPasswordSuccess('Password updated.');
      setNewPassword('');
      setConfirmNewPassword('');
    } catch (err) {
      setPasswordError(err.message || 'Unable to update your password.');
    } finally {
      setSavingPassword(false);
    }
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    await signOut();
    navigate('/login', { replace: true });
  };

  const handleDeleteAccount = async () => {
    setDeleteError('');
    setDeletingAccount(true);
    try {
      const { error } = await deleteAccount();
      if (error) throw error;
      navigate('/login', { replace: true });
    } catch (err) {
      setDeleteError(err.message || 'Unable to remove your account.');
    } finally {
      setDeletingAccount(false);
    }
  };

  return (
    <AppShell
      title="Profile"
      subtitle="Manage your account settings"
      healthStatus={healthStatus}
      onUploadClick={() => navigate('/')}
      activeView={undefined}
      onNavigate={(view) => navigate('/', { state: { view } })}
    >
      <ScrollArea id="profile-page" className="-mx-1 min-h-0 flex-1">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-1 pb-10">
        <Card id="profile-info-card">
          <CardHeader className="flex-row items-center gap-4 border-b border-border bg-muted/30 py-5">
            <Avatar className="h-14 w-14 shrink-0">
              <AvatarFallback className="bg-gradient-to-br from-primary to-violet-500 text-base font-semibold text-primary-foreground">
                {getInitials(user)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <CardTitle id="profile-display-name" className="truncate">
                {user?.fullName || 'Your profile'}
              </CardTitle>
              <CardDescription className="truncate">{user?.email}</CardDescription>
              <p id="profile-member-since" className="mt-0.5 text-xs text-muted-foreground">
                Member since {formatDate(user?.createdAt)}
              </p>
            </div>
          </CardHeader>
          <CardContent className="pt-5">
            <div className="mb-4 flex items-center gap-2 text-sm font-medium">
              <UserRound className="h-4 w-4 text-muted-foreground" />
              Personal information
            </div>
            <form id="profile-form" className="flex flex-col gap-4" onSubmit={handleSaveProfile} noValidate>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="full-name-input">Full name</Label>
                <Input
                  id="full-name-input"
                  name="fullName"
                  type="text"
                  autoComplete="name"
                  placeholder="Your name"
                  disabled={savingProfile}
                  aria-invalid={Boolean(profileFieldErrors.fullName)}
                  aria-describedby={profileFieldErrors.fullName ? 'full-name-input-error' : undefined}
                  value={fullName}
                  onChange={handleFullNameChange}
                />
                <FieldError id="full-name-input-error" message={profileFieldErrors.fullName} />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="profile-email-input">Email</Label>
                <Input
                  id="profile-email-input"
                  type="email"
                  autoComplete="email"
                  value={user?.email || ''}
                  disabled
                  readOnly
                />
                <p className="text-xs text-muted-foreground">Your email is used to sign in and can&apos;t be changed.</p>
              </div>

              {profileError && (
                <p id="profile-error-message" role="alert" className="text-sm text-destructive">
                  {profileError}
                </p>
              )}
              {profileSuccess && (
                <p id="profile-success-message" className="text-sm text-success">
                  {profileSuccess}
                </p>
              )}

              <div className="flex items-center gap-3">
                <Button
                  id="save-profile-button"
                  type="submit"
                  className="gap-2"
                  disabled={savingProfile || !trimmedFullName || isNameUnchanged}
                >
                  {savingProfile && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save changes
                </Button>
                {!isNameUnchanged && (
                  <button
                    id="reset-profile-button"
                    type="button"
                    className="text-sm font-medium text-muted-foreground hover:text-foreground"
                    onClick={handleResetFullName}
                    disabled={savingProfile}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>

        <Card id="change-password-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-muted-foreground" />
              Change password
            </CardTitle>
            <CardDescription>Update the password used to sign in</CardDescription>
          </CardHeader>
          <CardContent>
            <form id="change-password-form" className="flex flex-col gap-4" onSubmit={handleChangePassword} noValidate>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="new-password-input">New password</Label>
                <Input
                  id="new-password-input"
                  name="newPassword"
                  type="password"
                  autoComplete="new-password"
                  placeholder="At least 6 characters"
                  disabled={savingPassword}
                  aria-invalid={Boolean(passwordFieldErrors.newPassword)}
                  aria-describedby={passwordFieldErrors.newPassword ? 'new-password-input-error' : undefined}
                  value={newPassword}
                  onChange={withPasswordFieldClear('newPassword', setNewPassword)}
                />
                <FieldError id="new-password-input-error" message={passwordFieldErrors.newPassword} />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="confirm-new-password-input">Confirm new password</Label>
                <Input
                  id="confirm-new-password-input"
                  name="confirmNewPassword"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Re-enter your new password"
                  disabled={savingPassword}
                  aria-invalid={Boolean(passwordFieldErrors.confirmNewPassword)}
                  aria-describedby={passwordFieldErrors.confirmNewPassword ? 'confirm-new-password-input-error' : undefined}
                  value={confirmNewPassword}
                  onChange={withPasswordFieldClear('confirmNewPassword', setConfirmNewPassword)}
                />
                <FieldError id="confirm-new-password-input-error" message={passwordFieldErrors.confirmNewPassword} />
              </div>

              {passwordError && (
                <p id="password-error-message" role="alert" className="text-sm text-destructive">
                  {passwordError}
                </p>
              )}
              {passwordSuccess && (
                <p id="password-success-message" className="text-sm text-success">
                  {passwordSuccess}
                </p>
              )}

              <div>
                <Button id="update-password-button" type="submit" className="gap-2" disabled={savingPassword}>
                  {savingPassword && <Loader2 className="h-4 w-4 animate-spin" />}
                  Update password
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card id="account-card">
          <CardHeader>
            <CardTitle>Account</CardTitle>
            <CardDescription>Sign out of IntelliDoc on this device</CardDescription>
          </CardHeader>
          <Separator />
          <CardFooter className="pt-6">
            <Button
              id="sign-out-button"
              type="button"
              variant="outline"
              className="gap-2"
              onClick={handleSignOut}
              disabled={signingOut}
            >
              {signingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
              Sign out
            </Button>
          </CardFooter>
        </Card>

        <Card id="danger-zone-card" className="border-destructive/30">
          <CardHeader>
            <CardTitle className="text-destructive">Remove account</CardTitle>
            <CardDescription>Permanently delete your IntelliDoc account and sign out everywhere</CardDescription>
          </CardHeader>
          <Separator className="bg-destructive/20" />
          <CardFooter className="pt-6">
            <Button
              id="remove-account-button"
              type="button"
              variant="destructive"
              className="gap-2"
              onClick={() => {
                setDeleteError('');
                setDeleteDialogOpen(true);
              }}
            >
              <Trash2 className="h-4 w-4" />
              Remove account
            </Button>
          </CardFooter>
        </Card>
      </div>
      </ScrollArea>

      <Dialog open={deleteDialogOpen} onOpenChange={(open) => !deletingAccount && setDeleteDialogOpen(open)}>
        <DialogContent id="remove-account-dialog">
          <DialogHeader>
            <DialogTitle>Remove your account?</DialogTitle>
            <DialogDescription>
              This permanently deletes your IntelliDoc account and everything tied to it. This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>

          {deleteError && (
            <p id="remove-account-error-message" role="alert" className="text-sm text-destructive">
              {deleteError}
            </p>
          )}

          <DialogFooter>
            <Button
              id="cancel-remove-account-button"
              type="button"
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={deletingAccount}
            >
              Cancel
            </Button>
            <Button
              id="confirm-remove-account-button"
              type="button"
              variant="destructive"
              className="gap-2"
              onClick={handleDeleteAccount}
              disabled={deletingAccount}
            >
              {deletingAccount && <Loader2 className="h-4 w-4 animate-spin" />}
              Remove account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
