// Vercel detects this root entry point and deploys the existing Express API as
// one Node.js Function. Local development continues to use server/index.ts.
import app from './server/index';

export default app;
