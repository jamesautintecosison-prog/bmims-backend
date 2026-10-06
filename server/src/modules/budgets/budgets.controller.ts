import type { Request, Response } from "express";
import { z } from "zod";
import { HttpError } from "../../utils/httpError.js";
import { idParam, pageQuery } from "../../utils/pagination.js";
import { ctxOf } from "../../utils/requestContext.js";
import { budgetsRepository as repo } from "./budgets.repository.js";

const createBody = z.object({
  committee_id: z.number().int().positive(),
  fiscal_year: z.string().regex(/^[0-9]{4}$/, "Use a 4-digit year"),
  allocated_amount: z.number().min(0).max(1000000000),
});

export const budgetsController = {
  async list(req: Request, res: Response) {
    const { limit, offset } = pageQuery.parse(req.query);
    res.json(await repo.list(ctxOf(req), limit, offset));
  },

  async get(req: Request, res: Response) {
    const row = await repo.getById(ctxOf(req), idParam.parse(req.params.id));
    if (!row) throw new HttpError(404, "Budget not found");
    res.json(row);
  },

  async create(req: Request, res: Response) {
    res.status(201).json(await repo.create(ctxOf(req), createBody.parse(req.body)));
  },
};
