// Vite deployments on Vercel route /api/** to this single Express Function.
// Keeping it thin lets the same application run locally and in production.
// The explicit TypeScript extension preserves Node ESM resolution once the
// backend sources are included in this function's deployment bundle.
import app from '../server/index.ts';

export default app;
