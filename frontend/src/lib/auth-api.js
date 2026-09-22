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

  signOut() {
    setToken(null);
  },
};
