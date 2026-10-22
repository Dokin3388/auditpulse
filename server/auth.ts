import { betterAuth } from 'better-auth';
import { PostgresDialect, Kysely } from 'kysely';
import { pool } from './db.ts';

const authDatabase = new Kysely({
  dialect: new PostgresDialect({ pool }),
});

const appOrigin = process.env.BETTER_AUTH_URL || 'http://localhost:5173';
const authSecret = process.env.BETTER_AUTH_SECRET || 'auditpulse-local-development-secret-change-me';

export const auth = betterAuth({
  database: authDatabase,
  secret: authSecret,
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
