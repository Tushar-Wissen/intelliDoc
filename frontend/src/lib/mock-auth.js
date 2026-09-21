const USERS_KEY = 'intellidoc-mock-users';
const SESSION_KEY = 'intellidoc-mock-session';
const NETWORK_DELAY_MS = 500;

// Seed account for local testing. Add more entries here — or call
// mockAuth.signUp(...) at runtime from the "Create account" form — to
// extend the list of credentials the login page accepts.
const DEFAULT_USERS = [
  {
    email: 'demo@intellidoc.com',
    password: 'Demo@123',
    fullName: 'Demo User',
    createdAt: '2024-03-01T09:00:00.000Z',
  },
];

// Signing in with this address always fails with an "unexpected error",
// so that failure path can be exercised on demand while testing.
const SIMULATED_SERVER_ERROR_EMAIL = 'error@intellidoc.com';

export const AUTH_ERROR_CODES = {
  EMAIL_REQUIRED: 'email_required',
  EMAIL_INVALID: 'email_invalid',
  PASSWORD_REQUIRED: 'password_required',
  FULL_NAME_REQUIRED: 'full_name_required',
  PASSWORD_TOO_SHORT: 'password_too_short',
  PASSWORD_MISMATCH: 'password_mismatch',
  INVALID_CREDENTIALS: 'invalid_credentials',
  EMAIL_IN_USE: 'email_in_use',
  USER_NOT_FOUND: 'user_not_found',
  UNEXPECTED: 'unexpected_error',
};

export const AUTH_ERROR_MESSAGES = {
  [AUTH_ERROR_CODES.EMAIL_REQUIRED]: 'Email is required.',
  [AUTH_ERROR_CODES.EMAIL_INVALID]: 'Enter a valid email address.',
  [AUTH_ERROR_CODES.PASSWORD_REQUIRED]: 'Password is required.',
  [AUTH_ERROR_CODES.FULL_NAME_REQUIRED]: 'Full name is required.',
  [AUTH_ERROR_CODES.PASSWORD_TOO_SHORT]: 'Password must be at least 6 characters.',
  [AUTH_ERROR_CODES.PASSWORD_MISMATCH]: 'Passwords do not match.',
  [AUTH_ERROR_CODES.INVALID_CREDENTIALS]: 'Invalid email or password.',
  [AUTH_ERROR_CODES.EMAIL_IN_USE]: 'An account with this email already exists.',
  [AUTH_ERROR_CODES.USER_NOT_FOUND]: 'No account found with that email.',
  [AUTH_ERROR_CODES.UNEXPECTED]: 'Something went wrong. Please try again.',
};

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class AuthError extends Error {
  constructor(code) {
    super(AUTH_ERROR_MESSAGES[code] || AUTH_ERROR_MESSAGES[AUTH_ERROR_CODES.UNEXPECTED]);
    this.code = code;
  }
}

function delay(ms = NETWORK_DELAY_MS) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readUsers() {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    if (!raw) {
      localStorage.setItem(USERS_KEY, JSON.stringify(DEFAULT_USERS));
      return [...DEFAULT_USERS];
    }
    return JSON.parse(raw);
  } catch {
    return [...DEFAULT_USERS];
  }
}

function writeUsers(users) {
  try {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  } catch {
    // ignore write failures (private browsing, storage full, etc.)
  }
}

function toPublicUser(user) {
  if (!user) return null;
  const { password, ...publicUser } = user;
  return publicUser;
}

function readSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeSession(user) {
  try {
    if (user) localStorage.setItem(SESSION_KEY, JSON.stringify(user));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore write failures
  }
}

async function guard(fn) {
  try {
    return await fn();
  } catch (err) {
    const authError = err instanceof AuthError ? err : new AuthError(AUTH_ERROR_CODES.UNEXPECTED);
    return { user: null, error: authError };
  }
}

export const mockAuth = {
  getSession() {
    return readSession();
  },

  signIn({ email, password }) {
    return guard(async () => {
      await delay();
      const normalizedEmail = email.trim().toLowerCase();

      if (normalizedEmail === SIMULATED_SERVER_ERROR_EMAIL) {
        throw new AuthError(AUTH_ERROR_CODES.UNEXPECTED);
      }

      const user = readUsers().find((u) => u.email.toLowerCase() === normalizedEmail);
      if (!user || user.password !== password) {
        throw new AuthError(AUTH_ERROR_CODES.INVALID_CREDENTIALS);
      }

      const publicUser = toPublicUser(user);
      writeSession(publicUser);
      return { user: publicUser, error: null };
    });
  },

  signUp({ email, password, fullName }) {
    return guard(async () => {
      await delay();
      const normalizedEmail = email.trim().toLowerCase();
      const users = readUsers();

      if (users.some((u) => u.email.toLowerCase() === normalizedEmail)) {
        throw new AuthError(AUTH_ERROR_CODES.EMAIL_IN_USE);
      }

      const newUser = {
        email: normalizedEmail,
        password,
        fullName: fullName.trim(),
        createdAt: new Date().toISOString(),
      };
      writeUsers([...users, newUser]);

      const publicUser = toPublicUser(newUser);
      writeSession(publicUser);
      return { user: publicUser, error: null };
    });
  },

  resetPassword({ email, newPassword }) {
    return guard(async () => {
      await delay();
      const normalizedEmail = email.trim().toLowerCase();
      const users = readUsers();
      const index = users.findIndex((u) => u.email.toLowerCase() === normalizedEmail);

      if (index === -1) {
        throw new AuthError(AUTH_ERROR_CODES.USER_NOT_FOUND);
      }

      users[index] = { ...users[index], password: newPassword };
      writeUsers(users);
      return { user: null, error: null };
    });
  },

  updateProfile({ email, fullName, password }) {
    return guard(async () => {
      await delay(300);
      const normalizedEmail = email.trim().toLowerCase();
      const users = readUsers();
      const index = users.findIndex((u) => u.email.toLowerCase() === normalizedEmail);

      if (index === -1) {
        throw new AuthError(AUTH_ERROR_CODES.USER_NOT_FOUND);
      }

      const updated = { ...users[index] };
      if (fullName !== undefined) updated.fullName = fullName;
      if (password) updated.password = password;
      users[index] = updated;
      writeUsers(users);

      const publicUser = toPublicUser(updated);
      writeSession(publicUser);
      return { user: publicUser, error: null };
    });
  },

  deleteAccount({ email }) {
    return guard(async () => {
      await delay(400);
      const normalizedEmail = email.trim().toLowerCase();
      const users = readUsers();
      const remaining = users.filter((u) => u.email.toLowerCase() !== normalizedEmail);

      if (remaining.length === users.length) {
        throw new AuthError(AUTH_ERROR_CODES.USER_NOT_FOUND);
      }

      writeUsers(remaining);
      writeSession(null);
      return { user: null, error: null };
    });
  },

  async signOut() {
    await delay(150);
    writeSession(null);
  },
};
