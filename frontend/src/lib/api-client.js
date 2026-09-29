import { getToken } from '@/lib/auth-api';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export const API_ERROR_CODES = {
  NETWORK: 'network_error',
  UNAUTHORIZED: 'unauthorized',
  INVALID: 'invalid_request',
  CONFLICT: 'conflict',
  NOT_FOUND: 'not_found',
  TOO_LARGE: 'payload_too_large',
  SERVER: 'server_error',
  UNEXPECTED: 'unexpected_error',
};

const DEFAULT_ERROR_MESSAGES = {
  [API_ERROR_CODES.NETWORK]: 'Unable to reach the server. Check your connection and try again.',
  [API_ERROR_CODES.UNAUTHORIZED]: 'Your session has expired. Please sign in again.',
  [API_ERROR_CODES.INVALID]: 'The request was not valid. Please check your input.',
  [API_ERROR_CODES.CONFLICT]: 'This item already exists.',
  [API_ERROR_CODES.NOT_FOUND]: 'This item no longer exists.',
  [API_ERROR_CODES.TOO_LARGE]: 'The file is too large to upload.',
  [API_ERROR_CODES.SERVER]: 'The server ran into a problem. Please try again in a moment.',
  [API_ERROR_CODES.UNEXPECTED]: 'Something went wrong. Please try again.',
};

// Error thrown by the API service layer. `message` is always safe to show to the user.
export class ApiError extends Error {
  constructor(code, message) {
    super(message || DEFAULT_ERROR_MESSAGES[code] || DEFAULT_ERROR_MESSAGES[API_ERROR_CODES.UNEXPECTED]);
    this.code = code;
  }
}

// Translates an axios failure into an ApiError. `messages` lets a service override the
// wording per code (e.g. "A workspace with this name already exists."); for validation
// and conflict responses a message sent by the backend takes precedence over both.
// `preferServerMessage` extends that to every status, for actions where the backend's reason
// (e.g. why a delete was refused) is more useful than a generic one.
export function toApiError(err, messages = {}, { preferServerMessage = false } = {}) {
  if (!err.response) {
    // Request never got a response: offline, DNS/CORS failure, timeout, etc.
    return new ApiError(API_ERROR_CODES.NETWORK, messages[API_ERROR_CODES.NETWORK]);
  }

  const { status, data } = err.response;
  const serverMessage = typeof data?.message === 'string' ? data.message : undefined;
  const pick = (code, preferServer = false) =>
    new ApiError(code, ((preferServer || preferServerMessage) && serverMessage) || messages[code]);

  if (status === 401 || status === 403) return pick(API_ERROR_CODES.UNAUTHORIZED);
  if (status === 404) return pick(API_ERROR_CODES.NOT_FOUND);
  if (status === 413) return pick(API_ERROR_CODES.TOO_LARGE);
  if (status === 409) return pick(API_ERROR_CODES.CONFLICT, true);
  if (status === 400 || status === 415 || status === 422) return pick(API_ERROR_CODES.INVALID, true);
  if (status >= 500) return pick(API_ERROR_CODES.SERVER);
  return pick(API_ERROR_CODES.UNEXPECTED);
}

export function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
