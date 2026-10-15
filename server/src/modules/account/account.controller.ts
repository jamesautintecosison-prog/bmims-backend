import type { Request, Response } from "express";
import { z } from "zod";
import { HttpError } from "../../utils/httpError.js";
import { ctxOf } from "../../utils/requestContext.js";
import { accountService } from "./account.service.js";

const passwordBody = z.object({
  current_password: z.string().min(1).max(200),
  new_password: z.string().min(12, "Use at least 12 characters").max(200),
});

export const accountController = {
  async changePassword(req: Request, res: Response) {
    const ctx = ctxOf(req);
    if (!req.userId) throw new HttpError(401, "Not authenticated");
    const { current_password, new_password } = passwordBody.parse(req.body);
    await accountService.changePassword(ctx, req.userId, current_password, new_password);
    res.status(204).send();
  },
};
