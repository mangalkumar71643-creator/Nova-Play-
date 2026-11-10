import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// Money requests turned down are worth a line in the logs (why a withdrawal never reached the admin).
const LOGGED_REFUSALS = ["/wallet/withdraw"];

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) {
    if (LOGGED_REFUSALS.includes(req.path) || LOGGED_REFUSALS.includes(req.originalUrl.split("?")[0].replace(/^\/api/, ""))) {
      console.log(`[refused] ${req.method} ${req.originalUrl} ${err.status}: ${err.message}`);
    }
    return res.status(err.status).json({ error: err.message });
  }
  if (err instanceof ZodError) {
    // Say what was wrong (the first problem), not just "Validation failed". A message the route wrote itself
    // ("New password must be at least 8 characters.") goes as it is; Zod's stock ones get the field name in front.
    const issue = err.issues[0];
    const field = issue?.path.filter((p) => typeof p === "string").join(".");
    const stock = /^(Expected|Required|Invalid|Number must|String must|Array must)/.test(issue?.message ?? "");
    const message = issue ? (field && stock ? `${field}: ${issue.message}` : issue.message) : "Validation failed";
    return res.status(400).json({ error: message, details: err.flatten() });
  }
  console.error(err);
  return res.status(500).json({ error: "Internal server error" });
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}
