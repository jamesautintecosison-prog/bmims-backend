import type { Prisma } from "../../../generated/prisma/client.js";
import { withRequestContext, type RequestContext } from "../../db/withRequestContext.js";

export const serviceRequestsRepository = {
  list(ctx: RequestContext, limit: number, offset: number) {
    return withRequestContext(ctx, (tx) =>
      tx.service_requests.findMany({ orderBy: { request_id: "desc" }, take: limit, skip: offset }),
    );
  },

  getById(ctx: RequestContext, id: number) {
    return withRequestContext(ctx, (tx) => tx.service_requests.findUnique({ where: { request_id: id } }));
  },

  // status, reference number and dates come from database defaults / procedures
  create(ctx: RequestContext, data: Prisma.service_requestsUncheckedCreateInput) {
    return withRequestContext(ctx, (tx) => tx.service_requests.create({ data }));
  },

  updateStatus(ctx: RequestContext, id: number, status: string) {
    return withRequestContext(ctx, (tx) =>
      tx.service_requests.update({ where: { request_id: id }, data: { status } }),
    );
  },

  // The whole issuing workflow lives in the database (migration 008)
  issueCertificate(ctx: RequestContext, id: number) {
    return withRequestContext(ctx, async (tx) => {
      const rows = await tx.$queryRaw<{ reference_number: string }[]>`
        SELECT sp_issue_certificate(${id}::int) AS reference_number`;
      return rows[0].reference_number;
    });
  },
};
