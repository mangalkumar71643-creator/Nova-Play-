// Vercel serverless entrypoint. vercel.json rewrites every request here;
// Express's own router still sees the original path (e.g. /auth/login).
import { app } from "../src/app";

export default app;
