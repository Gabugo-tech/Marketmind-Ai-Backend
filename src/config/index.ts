import dotenv from 'dotenv';
dotenv.config();

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '5000', 10),
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',

  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-in-prod',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  },

  // Separate secret for admin JWTs — must be set in production
  adminJwt: {
    secret: process.env.ADMIN_JWT_SECRET || 'dev-admin-secret-change-in-prod',
    expiresIn: process.env.ADMIN_JWT_EXPIRES_IN || '2h',
  },

  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  },

  // Admin login brute-force settings
  adminBruteForce: {
    // Max failed attempts per IP within window before lockout
    maxAttempts: parseInt(process.env.ADMIN_MAX_LOGIN_ATTEMPTS || '5', 10),
    // Window in ms (default 15 min)
    windowMs: parseInt(process.env.ADMIN_LOGIN_WINDOW_MS || '900000', 10),
    // Lockout duration in ms (default 30 min)
    lockoutMs: parseInt(process.env.ADMIN_LOCKOUT_MS || '1800000', 10),
  },

  upload: {
    maxSizeMb: parseInt(process.env.MAX_FILE_SIZE_MB || '5', 10),
    uploadDir: process.env.UPLOAD_DIR || './uploads',
  },
};
