import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { HttpError } from "../utils/httpError.js";

// Turns database and validation errors into clean JSON responses so a
// constraint violation never becomes an unhandled crash.
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({ error: "Validation failed", details: err.issues });
  }

  const code: string | undefined = err?.code;
  if (code === "P2025") return res.status(404).json({ error: "Record not found" });
  if (code === "P2002") return res.status(409).json({ error: "A record with this value already exists" });
  if (code === "P2003") {
    return res.status(409).json({ error: "Blocked: other records still depend on this one" });
  }
  if (typeof err?.message === "string" && /permission denied/i.test(err.message)) {
    return res.status(403).json({ error: "Your database role is not allowed to do this" });
  }

  console.error(err);
  return res.status(500).json({ error: "Internal server error" });
};
