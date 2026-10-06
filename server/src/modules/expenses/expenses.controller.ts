import type { Request, Response } from "express";
import { z } from "zod";
import { HttpError } from "../../utils/httpError.js";
import { idParam, pageQuery } from "../../utils/pagination.js";
import { ctxOf } from "../../utils/requestContext.js";
import { expensesRepository as repo } from "./expenses.repository.js";

const createBody = z.object({
  budget_id: z.number().int().positive(),
  description: z.string().trim().min(1).max(2000),
  amount: z.number().positive().max(100000000),
  date_incurred: z.coerce.date().optional(),
});

export const expensesController = {
  async list(req: Request, res: Response) {
    const { limit, offset } = pageQuery.parse(req.query);
    res.json(await repo.list(ctxOf(req), limit, offset));
  },

  async get(req: Request, res: Response) {
    const row = await repo.getById(ctxOf(req), idParam.parse(req.params.id));
    if (!row) throw new HttpError(404, "Expense not found");
    res.json(row);
  },

  async create(req: Request, res: Response) {
    const ctx = ctxOf(req);
    // the approver is whoever is logged in, never a value the client sends
    if (!ctx.staffId) throw new HttpError(403, "Only staff can log expenses");
    const body = createBody.parse(req.body);
    const row = await repo.create(ctx, { ...body, approved_by_staff_id: ctx.staffId });
    res.status(201).json(row);
  },
};
