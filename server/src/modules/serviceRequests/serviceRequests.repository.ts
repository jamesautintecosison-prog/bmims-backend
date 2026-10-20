import type { Prisma } from "../../../generated/prisma/client.js";
import { withRequestContext, type RequestContext } from "../../db/withRequestContext.js";
import { HttpError } from "../../utils/httpError.js";

export const serviceRequestsRepository = {
  list(ctx: RequestContext, limit: number, offset: number) {
    return withRequestContext(ctx, (tx) =>
      tx.service_requests.findMany({
        orderBy: { request_id: "desc" },
        take: limit,
        skip: offset,
        include: {
          service_request_payments: {
            orderBy: { created_at: "desc" },
            include: { service_request_payment_events: { orderBy: { created_at: "asc" } } },
          },
        },
      }),
    );
  },

  getById(ctx: RequestContext, id: number) {
    return withRequestContext(ctx, (tx) =>
      tx.service_requests.findUnique({
        where: { request_id: id },
        include: {
          service_request_payments: {
            orderBy: { created_at: "desc" },
            include: { service_request_payment_events: { orderBy: { created_at: "asc" } } },
          },
        },
      }),
    );
  },

  create(
    ctx: RequestContext,
    data: Prisma.service_requestsUncheckedCreateInput,
    paymentMethod: "online" | "face_to_face",
  ) {
    return withRequestContext(ctx, async (tx) => {
      const documentType = await tx.document_types.findUnique({
        where: { doc_type_id: data.doc_type_id },
        select: { name: true, fee_amount: true },
      });
      if (!documentType) throw new HttpError(404, "Document type not found");
      const amount = Number(documentType.fee_amount);
      if (paymentMethod === "online" && amount > 0 && amount < 1) {
        throw new HttpError(400, "Online payments must be at least PHP 1.00; choose face-to-face payment");
      }
      const paymentStatus = amount === 0 ? "Paid" : "Pending Payment";

      const request = await tx.service_requests.create({ data });
      const inserted = await tx.service_request_payments.createMany({
        data: [{
          request_id: request.request_id,
          payment_method: paymentMethod,
          amount,
          payment_status: paymentStatus,
          created_by_user_id: ctx.userId,
          paid_at: paymentStatus === "Paid" ? new Date() : undefined,
        }],
      });
      if (inserted.count !== 1) throw new HttpError(500, "Could not create the service request payment record");
      const payment = await tx.service_request_payments.findFirstOrThrow({
        where: { request_id: request.request_id },
        orderBy: { created_at: "desc" },
      });
      await tx.service_request_payment_events.createMany({
        data: [{
          payment_record_id: payment.payment_record_id,
          event_type: paymentStatus === "Paid" ? "no_payment_required" : "payment_method_selected",
          payment_status: paymentStatus,
          notes: paymentStatus === "Paid" ? "No fee is required for this document type." : null,
          actor_user_id: ctx.userId,
        }],
      });
      return tx.service_requests.findUniqueOrThrow({
        where: { request_id: request.request_id },
        include: {
          service_request_payments: {
            include: { service_request_payment_events: { orderBy: { created_at: "asc" } } },
          },
        },
      });
    });
  },

  updateStatus(ctx: RequestContext, id: number, status: string) {
    return withRequestContext(ctx, async (tx) => {
      const changed = await tx.service_requests.updateMany({
        where: {
          request_id: id,
          status: { in: ["Pending", "Processing", "Approved"] },
        },
        data: { status },
      });
      if (!changed.count) {
        throw new HttpError(409, "This request is no longer open and its status cannot be changed.");
      }
      return tx.service_requests.findUniqueOrThrow({ where: { request_id: id } });
    });
  },

  async cancel(ctx: RequestContext, id: number) {
    if (ctx.tier !== "resident" || !ctx.residentId) {
      throw new HttpError(403, "Only residents can cancel their own service requests");
    }
    const scopedRequest = await this.getById(ctx, id);
    if (!scopedRequest) throw new HttpError(404, "Service request not found");
    if (scopedRequest.resident_id !== ctx.residentId) {
      throw new HttpError(403, "You can only cancel your own service requests");
    }
    if (scopedRequest.status !== "Pending") {
      if (["Processing", "Approved"].includes(scopedRequest.status)) {
        throw new HttpError(409, "This request is already being processed. Contact the barangay office to cancel it.");
      }
      throw new HttpError(409, `This request cannot be cancelled because it is ${scopedRequest.status}.`);
    }

    return withRequestContext({ ...ctx, tier: "admin" }, async (tx) => {
      await tx.$queryRaw<{ locked: boolean }[]>`
        SELECT pg_advisory_xact_lock(71234, ${id}) IS NULL AS locked`;
      const now = new Date();
      const changed = await tx.service_requests.updateMany({
        where: {
          request_id: id,
          resident_id: ctx.residentId,
          status: "Pending",
        },
        data: { status: "Cancelled", cancelled_at: now },
      });
      if (!changed.count) {
        throw new HttpError(409, "This request can no longer be cancelled. Refresh the page and try again.");
      }
      return tx.service_requests.findUniqueOrThrow({
        where: { request_id: id },
        include: {
          service_request_payments: {
            orderBy: { created_at: "desc" },
            include: { service_request_payment_events: { orderBy: { created_at: "asc" } } },
          },
        },
      });
    });
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
