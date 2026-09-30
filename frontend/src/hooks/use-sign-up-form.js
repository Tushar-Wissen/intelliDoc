import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '@/context/auth-context';
import { useAuthFormState } from '@/hooks/use-auth-form-state';
import { AUTH_ERROR_CODES } from '@/lib/mock-auth';
import { authErrorMessage, validateSignUp } from '@/lib/auth-validation';

export function useSignUpForm({ email, onEmailChange }) {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const { submitting, setSubmitting, formError, setFormError, fieldErrors, setFieldErrors, fieldHandler } =
    useAuthFormState();

  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleFullNameChange = fieldHandler('fullName', setFullName);
  const handleEmailChange = fieldHandler('email', onEmailChange);
  const handlePasswordChange = fieldHandler('password', setPassword);
  const handleConfirmPasswordChange = fieldHandler('confirmPassword', setConfirmPassword);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    const errors = validateSignUp({ fullName, email, password, confirmPassword });
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});

    setSubmitting(true);
    try {
      const { error } = await signUp({ email, password, fullName });
      if (error) {
        setFormError(error.message);
        return;
      }
      navigate('/', { replace: true });
    } catch {
      setFormError(authErrorMessage(AUTH_ERROR_CODES.UNEXPECTED));
    } finally {
      setSubmitting(false);
    }
  };

  return {
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
  };
}
