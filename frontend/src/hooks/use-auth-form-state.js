import { useState } from 'react';

/**
 * Shared submitting/error/field-error state plumbing used by every
 * auth form hook (sign in, sign up, reset password).
 */
export function useAuthFormState() {
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  const fieldHandler = (field, setter) => (e) => {
    setFormError('');
    setFieldErrors((prev) => (prev[field] ? { ...prev, [field]: '' } : prev));
    setter(e.target.value);
  };

  return {
    submitting,
    setSubmitting,
    formError,
    setFormError,
    fieldErrors,
    setFieldErrors,
    fieldHandler,
  };
}
