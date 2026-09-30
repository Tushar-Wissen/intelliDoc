import { AUTH_ERROR_CODES, AUTH_ERROR_MESSAGES, EMAIL_REGEX } from '@/lib/mock-auth';

export const LOGIN_MODES = {
  SIGN_IN: 'sign_in',
  SIGN_UP: 'sign_up',
  FORGOT_PASSWORD: 'forgot_password',
};

export function authErrorMessage(code) {
  return AUTH_ERROR_MESSAGES[code];
}

export function validateSignIn({ email, password }) {
  const errors = {};
  if (!email.trim()) errors.email = authErrorMessage(AUTH_ERROR_CODES.EMAIL_REQUIRED);
  else if (!EMAIL_REGEX.test(email.trim())) errors.email = authErrorMessage(AUTH_ERROR_CODES.EMAIL_INVALID);
  if (!password) errors.password = authErrorMessage(AUTH_ERROR_CODES.PASSWORD_REQUIRED);
  return errors;
}

export function validateSignUp({ fullName, email, password, confirmPassword }) {
  const errors = {};
  if (!fullName.trim()) errors.fullName = authErrorMessage(AUTH_ERROR_CODES.FULL_NAME_REQUIRED);
  if (!email.trim()) errors.email = authErrorMessage(AUTH_ERROR_CODES.EMAIL_REQUIRED);
  else if (!EMAIL_REGEX.test(email.trim())) errors.email = authErrorMessage(AUTH_ERROR_CODES.EMAIL_INVALID);
  if (!password) errors.password = authErrorMessage(AUTH_ERROR_CODES.PASSWORD_REQUIRED);
  else if (password.length < 6) errors.password = authErrorMessage(AUTH_ERROR_CODES.PASSWORD_TOO_SHORT);
  if (!confirmPassword) errors.confirmPassword = authErrorMessage(AUTH_ERROR_CODES.PASSWORD_REQUIRED);
  else if (password && confirmPassword !== password)
    errors.confirmPassword = authErrorMessage(AUTH_ERROR_CODES.PASSWORD_MISMATCH);
  return errors;
}

export function validateResetPassword({ email, newPassword, confirmNewPassword }) {
  const errors = {};
  if (!email.trim()) errors.email = authErrorMessage(AUTH_ERROR_CODES.EMAIL_REQUIRED);
  else if (!EMAIL_REGEX.test(email.trim())) errors.email = authErrorMessage(AUTH_ERROR_CODES.EMAIL_INVALID);
  if (!newPassword) errors.newPassword = authErrorMessage(AUTH_ERROR_CODES.PASSWORD_REQUIRED);
  else if (newPassword.length < 6) errors.newPassword = authErrorMessage(AUTH_ERROR_CODES.PASSWORD_TOO_SHORT);
  if (!confirmNewPassword) errors.confirmNewPassword = authErrorMessage(AUTH_ERROR_CODES.PASSWORD_REQUIRED);
  else if (newPassword && confirmNewPassword !== newPassword)
    errors.confirmNewPassword = authErrorMessage(AUTH_ERROR_CODES.PASSWORD_MISMATCH);
  return errors;
}
