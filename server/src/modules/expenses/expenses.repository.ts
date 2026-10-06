import type { Prisma } from "../../../generated/prisma/client.js";
import { withRequestContext, type RequestContext } from "../../db/withRequestContext.js";

export const expensesRepository = {
  list(ctx: RequestContext, limit: number, offset: number) {
    return withRequestContext(ctx, (tx) =>
      tx.expense_logs.findMany({ orderBy: { expense_id: "desc" }, take: limit, skip: offset }),
    );
  },

  getById(ctx: RequestContext, id: number) {
    return withRequestContext(ctx, (tx) => tx.expense_logs.findUnique({ where: { expense_id: id } }));
  },

  // Inserting fires trg_expense_budget: the budget is reduced, or the whole
  // insert is rejected if the balance is too low.
  create(ctx: RequestContext, data: Prisma.expense_logsUncheckedCreateInput) {
    return withRequestContext(ctx, (tx) => tx.expense_logs.create({ data }));
  },
};
