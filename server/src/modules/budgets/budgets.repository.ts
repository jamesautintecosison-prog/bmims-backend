import { withRequestContext, type RequestContext } from "../../db/withRequestContext.js";

export const budgetsRepository = {
  list(ctx: RequestContext, limit: number, offset: number) {
    return withRequestContext(ctx, (tx) =>
      tx.committee_budgets.findMany({ orderBy: { budget_id: "asc" }, take: limit, skip: offset }),
    );
  },

  getById(ctx: RequestContext, id: number) {
    return withRequestContext(ctx, (tx) => tx.committee_budgets.findUnique({ where: { budget_id: id } }));
  },

  // A new budget starts with its full allocation remaining;
  // after that only the expense trigger changes remaining_amount.
  create(ctx: RequestContext, data: { committee_id: number; fiscal_year: string; allocated_amount: number }) {
    return withRequestContext(ctx, (tx) =>
      tx.committee_budgets.create({ data: { ...data, remaining_amount: data.allocated_amount } }),
    );
  },
};
