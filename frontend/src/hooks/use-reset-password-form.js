import { useState } from 'react';

import { useAuth } from '@/context/auth-context';
import { useAuthFormState } from '@/hooks/use-auth-form-state';
import { AUTH_ERROR_CODES } from '@/lib/mock-auth';
import { authErrorMessage, validateResetPassword } from '@/lib/auth-validation';

export function useResetPasswordForm({ email, onEmailChange }) {
  const { resetPassword } = useAuth();
  const {
    submitting,
    setSubmitting,
    formError,
    setFormError,
    fieldErrors,
    setFieldErrors,
    fieldHandler,
  } = useAuthFormState();

  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [infoMessage, setInfoMessage] = useState('');

  const handleEmailChange = fieldHandler('email', onEmailChange);
  const handleNewPasswordChange = fieldHandler('newPassword', setNewPassword);
  const handleConfirmNewPasswordChange = fieldHandler('confirmNewPassword', setConfirmNewPassword);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    setInfoMessage('');

    const errors = validateResetPassword({ email, newPassword, confirmNewPassword });
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});

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
      setFormError(authErrorMessage(AUTH_ERROR_CODES.UNEXPECTED));
    } finally {
      setSubmitting(false);
    }
  };

  return {
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
  };
}
