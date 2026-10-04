import type { Prisma } from "../../../generated/prisma/client.js";
import { withRequestContext, type RequestContext } from "../../db/withRequestContext.js";

// Repository layer: the only place that talks to the database.
// Prisma sends every value as a bound parameter (no string-built SQL).
export const residentsRepository = {
  list(ctx: RequestContext, limit: number, offset: number) {
    return withRequestContext(ctx, (tx) =>
      tx.residents.findMany({ orderBy: { resident_id: "asc" }, take: limit, skip: offset }),
    );
  },

  getById(ctx: RequestContext, id: number) {
    return withRequestContext(ctx, (tx) => tx.residents.findUnique({ where: { resident_id: id } }));
  },

  create(ctx: RequestContext, data: Prisma.residentsUncheckedCreateInput) {
    return withRequestContext(ctx, (tx) => tx.residents.create({ data }));
  },

  update(ctx: RequestContext, id: number, data: Prisma.residentsUncheckedUpdateInput) {
    return withRequestContext(ctx, (tx) => tx.residents.update({ where: { resident_id: id }, data }));
  },

  remove(ctx: RequestContext, id: number) {
    return withRequestContext(ctx, (tx) => tx.residents.delete({ where: { resident_id: id } }));
  },
};
