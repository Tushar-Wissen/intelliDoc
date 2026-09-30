import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '@/context/auth-context';
import { useAuthFormState } from '@/hooks/use-auth-form-state';
import { AUTH_ERROR_CODES } from '@/lib/mock-auth';
import { authErrorMessage, validateSignIn } from '@/lib/auth-validation';

export function useSignInForm({ email, onEmailChange }) {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const { submitting, setSubmitting, formError, setFormError, fieldErrors, setFieldErrors, fieldHandler } =
    useAuthFormState();

  const [password, setPassword] = useState('');

  const handleEmailChange = fieldHandler('email', onEmailChange);
  const handlePasswordChange = fieldHandler('password', setPassword);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    const errors = validateSignIn({ email, password });
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});

    setSubmitting(true);
    try {
      const { error } = await signIn({ email, password });
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
    password,
    handlePasswordChange,
    handleEmailChange,
    submitting,
    formError,
    fieldErrors,
    handleSubmit,
  };
}
