import type { Request, Response } from "express";
import { z } from "zod";
import { idParam } from "../../utils/pagination.js";
import { ctxOf } from "../../utils/requestContext.js";
import { usersRepository } from "./users.repository.js";
import { usersService } from "./users.service.js";

const staffLoginBody = z.object({
  staff_id: z.number().int().positive(),
  username: z
    .string()
    .trim()
    .min(3)
    .max(50)
    .regex(/^[A-Za-z0-9._-]+$/, "Use letters, digits, dot, dash or underscore"),
  role: z.enum(["admin", "staff"]),
});

// What a caller may do here is decided by the database: only admin_role can
// read or change the users table, so other tiers get a 403.
export const usersController = {
  async list(req: Request, res: Response) {
    res.json(await usersRepository.list(ctxOf(req)));
  },

  async createStaffLogin(req: Request, res: Response) {
    const result = await usersService.createStaffLogin(ctxOf(req), staffLoginBody.parse(req.body));
    res.status(201).json(result);
  },

  async resetPassword(req: Request, res: Response) {
    res.json(await usersService.resetPassword(ctxOf(req), idParam.parse(req.params.id)));
  },
};
