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
    return res.status(400).json({ error: "Validation failed", details: err.flatten() });
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
