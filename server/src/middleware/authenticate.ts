import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "../config/env.js";
import type { RequestContext } from "../db/withRequestContext.js";
import { HttpError } from "../utils/httpError.js";

declare global {
  namespace Express {
    interface Request {
      ctx?: RequestContext;
      userId?: number;
    }
  }
}

const tokenPayload = z.object({
  sub: z.string(),
  tier: z.enum(["admin", "staff", "resident"]),
  staffId: z.number().int().positive().optional(),
  residentId: z.number().int().positive().optional(),
});

// Reads "Authorization: Bearer <token>", verifies the signature, and sets
// the request context (database tier + staff/resident id) from the token.
// The client can no longer claim a tier by typing a header.
export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.header("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) {
    throw new HttpError(401, "Missing bearer token");
  }

  let claims;
  try {
    claims = tokenPayload.parse(jwt.verify(token, env.jwtSecret));
  } catch {
    throw new HttpError(401, "Invalid or expired token");
  }

  req.userId = Number(claims.sub);
  req.ctx = {
    tier: claims.tier,
    staffId: claims.staffId,
    residentId: claims.residentId,
  };
  next();
}
