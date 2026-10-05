import type { Request, Response } from "express";
import { z } from "zod";
import { pageQuery } from "../../utils/pagination.js";
import { ctxOf } from "../../utils/requestContext.js";
import { auditLogsRepository as repo } from "./auditLogs.repository.js";

const filterQuery = pageQuery.extend({
  table_name: z.string().trim().min(1).max(63).optional(),
  record_id: z.coerce.number().int().positive().optional(),
});

export const auditLogsController = {
  async list(req: Request, res: Response) {
    res.json(await repo.list(ctxOf(req), filterQuery.parse(req.query)));
  },
};
