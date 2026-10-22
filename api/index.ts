// Vercel rewrites every /api/** request to this single Express Function (see
// vercel.json). Express still sees the original URL, so its routes match as-is.
// The explicit TypeScript extension preserves Node ESM resolution once the
// backend sources are included in this function's deployment bundle.
import app from '../server/index.ts';

export default app;
