import type { Request, Response } from "express";
import { z } from "zod";
import { HttpError } from "../../utils/httpError.js";
import { authService } from "./auth.service.js";

const loginBody = z.object({
  username: z.string().trim().min(1).max(50),
  password: z.string().min(1).max(200),
});

export const authController = {
  async login(req: Request, res: Response) {
    const { username, password } = loginBody.parse(req.body);
    res.json(await authService.login(username, password));
  },

  me(req: Request, res: Response) {
    if (!req.ctx) throw new HttpError(401, "Not authenticated");
    res.json({ user_id: req.userId, ...req.ctx });
  },
};
