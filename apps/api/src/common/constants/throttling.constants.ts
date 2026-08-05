export const THROTTLING_POLICIES = {
  register: {
    limit: 3,
    ttl: 60_000,
  },
  login: {
    limit: 5,
    ttl: 60_000,
  },
  refresh: {
    limit: 20,
    ttl: 60_000,
  },
  logout: {
    limit: 20,
    ttl: 60_000,
  },
  verifyEmail: {
    limit: 10,
    ttl: 60_000,
  },
  resendVerification: {
    limit: 2,
    ttl: 300_000,
  },
  forgotPassword: {
    limit: 2,
    ttl: 300_000,
  },
  resetPassword: {
    limit: 5,
    ttl: 300_000,
  },
} as const;
