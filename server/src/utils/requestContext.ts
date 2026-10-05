import type { Request } from "express";
import { HttpError } from "./httpError.js";

// The caller identity set by the authenticate middleware.
export function ctxOf(req: Request) {
  if (!req.ctx) throw new HttpError(401, "Not authenticated");
  return req.ctx;
}
