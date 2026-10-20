import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { HttpError } from "../utils/httpError.js";

// Messages raised on purpose by the triggers and stored procedures
// (migrations 007, 008, 010 and 012). They are safe to show to the caller.
const BUSINESS_RULE = new RegExp(
  [
    "Insufficient budget: [^\"\\\\\\n]*",
    "Only staff can issue certificates",
    "Only staff can add participants",
    "Only admins can remove staff",
    "You cannot remove your own account",
    "Cannot remove the last admin account",
    "Invalid password hash",
    "Account not found",
    "Service request \\d+ does not exist",
    "Incident \\d+ does not exist",
    "Incident \\d+ is already [^\"\\\\\\n]*",
    "Staff \\d+ does not exist",
    "Staff \\d+ is not assigned [^\"\\\\\\n]*",
    "Request \\d+ cannot be issued[^\"\\\\\\n]*",
    "Resident is not eligible[^\"\\\\\\n]*",
    "Not authenticated",
    "Location and description are required",
    "At least one participant is required",
    "An incident needs at least one complainant",
    "A resident can only file an incident as a complainant",
  ].join("|"),
);

// Turns database and validation errors into clean JSON responses so a
// constraint violation never becomes an unhandled crash.
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({ error: "Validation failed", details: err.issues });
  }

  // A request body that is not valid JSON, or is too large, is the caller's mistake
  if (err?.type === "entity.parse.failed") {
    return res.status(400).json({ error: "The request body is not valid JSON" });
  }
  if (err?.type === "entity.too.large") {
    return res.status(413).json({ error: "The request body is too large" });
  }

  // Prisma wraps database errors; the real PostgreSQL text can sit in cause/meta
  let meta = "";
  try {
    meta = JSON.stringify(err?.meta ?? {});
  } catch {
    meta = "";
  }
  const text = [err?.message, err?.cause?.message, meta].filter(Boolean).join(" ");
  const code: string | undefined = err?.code;

  const rule = text.match(BUSINESS_RULE);
  if (rule) {
    const status = rule[0].startsWith("Insufficient budget") ? 409 : 422;
    return res.status(status).json({ error: rule[0] });
  }

  if (code === "P2025") return res.status(404).json({ error: "Record not found" });
  if (code === "P2002" || /duplicate key value violates unique constraint/i.test(text)) {
    return res.status(409).json({ error: "A record with this value already exists" });
  }
  if (code === "P2003" || /violates foreign key constraint/i.test(text)) {
    return res.status(409).json({ error: "A related record is missing, or other records still depend on this one" });
  }
  if (/permission denied/i.test(text) || code === "42501") {
    console.error("Database permission denied", {
      code: code ?? "42501",
      message: err?.message ?? "Database operation was denied",
    });
    return res.status(403).json({ error: "Your database role is not allowed to do this" });
  }
  if (/violates check constraint/i.test(text) || /violates not-null constraint/i.test(text)) {
    return res.status(400).json({ error: "A value was rejected by a database rule" });
  }
  if (err?.name === "PrismaClientValidationError") {
    return res.status(400).json({ error: "Invalid data for this record" });
  }

  console.error(err);
  return res.status(500).json({ error: "Internal server error" });
};
