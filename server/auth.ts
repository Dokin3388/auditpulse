import { betterAuth } from 'better-auth';
import { PostgresDialect } from 'kysely';
import { pool } from './db.ts';

// Better Auth's Kysely adapter accepts the dialect directly. Passing a Kysely
// instance here is not supported by the adapter and crashes the serverless
// function before any route can respond.
const authDatabase = new PostgresDialect({ pool });

const appOrigin = process.env.BETTER_AUTH_URL || 'http://localhost:5173';
const authSecret = process.env.BETTER_AUTH_SECRET;

if (process.env.NODE_ENV === 'production' && !authSecret) {
  throw new Error('BETTER_AUTH_SECRET bắt buộc phải được cấu hình ở production.');
}

export const auth = betterAuth({
  database: authDatabase,
  secret: authSecret || 'auditpulse-local-development-secret-change-me',
  baseURL: appOrigin,
  trustedOrigins: [appOrigin],
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 14,
    updateAge: 60 * 60 * 24,
  },
});
