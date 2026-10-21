// Vite deployments on Vercel route /api/** to this single Express Function.
// Keeping it thin lets the same application run locally and in production.
// Extensionless import lets Vercel trace and bundle the whole local backend
// into this function, instead of looking for an uncompiled .ts file at runtime.
import app from '../server/index';

export default app;
