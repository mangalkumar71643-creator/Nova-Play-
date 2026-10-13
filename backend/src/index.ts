import { app } from "./app";
import { env } from "./config/env";

// Local dev / traditional hosting entrypoint. On Vercel, api/index.ts
// imports `app` directly and exports it as a serverless function instead —
// app.listen() is never called there.
app.listen(env.port, () => {
  console.log(`NovaPlay backend listening on port ${env.port}`);
});
