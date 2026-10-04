import type { NextFunction, Request, Response } from "express";
import type { RequestContext } from "../db/withRequestContext.js";
import { HttpError } from "../utils/httpError.js";

declare global {
  namespace Express {
    interface Request {
      ctx?: RequestContext;
    }
  }
}

function toId(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

// TEMPORARY, for local development only: identifies the caller from request
// headers so the CRUD and RLS behaviour can be tested before login exists.
// It is replaced by JWT authentication in the next step.
export function devContext(req: Request, _res: Response, next: NextFunction) {
  const tier = req.header("x-tier");
  if (tier !== "admin" && tier !== "staff" && tier !== "resident") {
    throw new HttpError(401, "Missing or invalid x-tier header (admin | staff | resident)");
  }
  req.ctx = {
    tier,
    staffId: toId(req.header("x-staff-id")),
    residentId: toId(req.header("x-resident-id")),
  };
  next();
}
