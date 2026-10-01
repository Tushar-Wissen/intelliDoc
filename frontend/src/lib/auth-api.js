import axios from 'axios';

import { AUTH_ERROR_CODES, AuthError, writeSession } from '@/lib/mock-auth';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
const TOKEN_KEY = 'intellidoc-auth-token';

function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore write failures (private browsing, storage full, etc.)
  }
}

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function toAppUser(apiUser, email) {
  return {
    id: apiUser.id,
    email,
    fullName: apiUser.displayName,
    role: apiUser.role,
  };
}

export const authApi = {
  async login({ email, password }) {
    try {
      const { data } = await axios.post(`${API_BASE_URL}/auth/login`, { email, password });
      const user = toAppUser(data.user, email.trim().toLowerCase());
      setToken(data.token);
      writeSession(user);
      return { user, error: null };
    } catch (err) {
      const status = err.response?.status;
      const code =
        status === 401 || status === 400 ? AUTH_ERROR_CODES.INVALID_CREDENTIALS : AUTH_ERROR_CODES.UNEXPECTED;
      return { user: null, error: new AuthError(code) };
    }
  },

  async signup({ email, password, fullName }) {
    const normalizedEmail = email.trim().toLowerCase();
    try {
      const { data } = await axios.post(`${API_BASE_URL}/auth/signup`, {
        email: normalizedEmail,
        password,
        displayName: fullName.trim(),
      });
      const user = toAppUser(data.user, normalizedEmail);
      setToken(data.token);
      writeSession(user);
      return { user, error: null };
    } catch (err) {
      const code =
        err.response?.status === 409 ? AUTH_ERROR_CODES.EMAIL_IN_USE : AUTH_ERROR_CODES.UNEXPECTED;
      return { user: null, error: new AuthError(code) };
    }
  },

  signOut() {
    setToken(null);
  },

  async updateProfile(updates) {
    const displayName = updates.displayName || updates.fullName;
    try {
      const token = getToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const { data } = await axios.put(
        `${API_BASE_URL}/auth/me`,
        { displayName },
        { headers }
      );
      const user = data.user ? toAppUser(data.user, updates.email) : null;
      return { user, error: null };
    } catch (err) {
      const message = err.response?.data?.message || err.response?.data?.error?.message || 'Failed to update profile';
      return { user: null, error: new Error(message) };
    }
  },

  async changePassword({ oldPassword, newPassword, confirmNewPassword }) {
    try {
      const token = getToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const { data } = await axios.post(
        `${API_BASE_URL}/auth/change-password`,
        { oldPassword, newPassword, confirmNewPassword },
        { headers }
      );
      return { data, error: null };
    } catch (err) {
      const message = err.response?.data?.message || err.response?.data?.error?.message || 'Failed to change password';
      return { data: null, error: new Error(message) };
    }
  },

  async forgotPassword({ email, newPassword, confirmNewPassword }) {
    try {
      const token = getToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const { data } = await axios.post(`${API_BASE_URL}/auth/forgot-password`, {
        email,
        newPassword,
        confirmNewPassword,
      }, { headers });
      return { data, error: null };
    } catch (err) {
      const message = err.response?.data?.message || err.response?.data?.error?.message || 'Failed to reset password';
      return { data: null, error: new Error(message) };
    }
  },
};
