// Vite deployments on Vercel route /api/** to this single Express Function.
// Keeping it thin lets the same application run locally and in production.
import app from '../server/index.ts';

export default app;
