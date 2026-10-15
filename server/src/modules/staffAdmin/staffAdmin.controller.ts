import type { Request, Response } from "express";
import { idParam } from "../../utils/pagination.js";
import { ctxOf } from "../../utils/requestContext.js";
import { staffAdminRepository as repo } from "./staffAdmin.repository.js";

export const staffAdminController = {
  async remove(req: Request, res: Response) {
    const staffId = idParam.parse(req.params.id);
    const result = await repo.remove(ctxOf(req), staffId);
    res.json({ staff_id: staffId, result });
  },
};
