import type { Prisma } from "../../../generated/prisma/client.js";
import type { RequestContext } from "../../db/withRequestContext.js";
import { withRequestContext } from "../../db/withRequestContext.js";
import { HttpError } from "../../utils/httpError.js";
import { paymongo } from "./paymongo.js";
import { serviceRequestsRepository as requests } from "./serviceRequests.repository.js";

const adminContext = (ctx: RequestContext): RequestContext => ({ ...ctx, tier: "admin" });

function assertStaff(ctx: RequestContext) {
  if (ctx.tier === "resident") throw new HttpError(403, "Only authorized staff can manage payments");
}

function amountInCents(amount: Prisma.Decimal | number | string): number {
  const value = Math.round(Number(amount) * 100);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new HttpError(409, "The service request has an invalid payment amount");
  }
  return value;
}

async function addPaymentEvent(
  tx: Prisma.TransactionClient,
  paymentRecordId: number,
  eventType: string,
  paymentStatus: string,
  actorUserId?: number,
  reference?: string | null,
  notes?: string | null,
) {
  await tx.service_request_payment_events.createMany({
    data: {
      payment_record_id: paymentRecordId,
      event_type: eventType,
      payment_status: paymentStatus,
      actor_user_id: actorUserId,
      reference: reference ?? null,
      notes: notes ?? null,
    },
    skipDuplicates: true,
  });
}

export const paymentsService = {
  async startCheckout(ctx: RequestContext, requestId: number) {
    const scopedRequest = await requests.getById(ctx, requestId);
    if (!scopedRequest) throw new HttpError(404, "Service request not found");

    let failure: unknown;
    const result = await withRequestContext(adminContext(ctx), async (tx) => {
      await tx.$queryRaw<{ locked: boolean }[]>`
        SELECT pg_advisory_xact_lock(71234, ${requestId}) IS NULL AS locked`;
      const request = await tx.service_requests.findUnique({
        where: { request_id: requestId },
        include: { document_types: true },
      });
      const payment = await tx.service_request_payments.findFirst({
        where: { request_id: requestId },
        orderBy: { created_at: "desc" },
      });
      if (!request || !payment) throw new HttpError(404, "Payment record not found");
      if (["Rejected", "Cancelled"].includes(request.status)) {
        throw new HttpError(409, "Closed requests cannot be paid");
      }
      if (payment.payment_method !== "online") {
        throw new HttpError(409, "This service request uses face-to-face payment");
      }
      if (payment.payment_status === "Paid" || payment.payment_status === "Refund Pending" || payment.payment_status === "Refunded") {
        throw new HttpError(409, "This service request does not have an outstanding payment");
      }
      if (payment.checkout_url && payment.payment_status === "Pending Payment") {
        return { checkout_url: payment.checkout_url };
      }

      const cents = amountInCents(payment.amount);
      if (cents < 100) throw new HttpError(400, "Online payments must be at least PHP 1.00");
      await tx.service_request_payments.update({
        where: { payment_record_id: payment.payment_record_id },
        data: { payment_status: "Pending Payment", refund_status: "Not Requested" },
      });
      try {
        const priorCheckouts = await tx.service_request_payment_events.count({
          where: {
            payment_record_id: payment.payment_record_id,
            event_type: "checkout_created",
          },
        });
        const checkout = await paymongo.createCheckout(
          requestId,
          cents,
          request.document_types.name,
          priorCheckouts + 1,
        );
        await tx.service_request_payments.update({
          where: { payment_record_id: payment.payment_record_id },
          data: { checkout_session_id: checkout.id, checkout_url: checkout.url, updated_at: new Date() },
        });
        await addPaymentEvent(
          tx,
          payment.payment_record_id,
          "checkout_created",
          "Pending Payment",
          ctx.userId,
          checkout.id,
        );
        return { checkout_url: checkout.url };
      } catch (error) {
        failure = error;
        await tx.service_request_payments.update({
          where: { payment_record_id: payment.payment_record_id },
          data: { payment_status: "Payment Failed", checkout_url: null, updated_at: new Date() },
        });
        await addPaymentEvent(
          tx,
          payment.payment_record_id,
          "checkout_failed",
          "Payment Failed",
          ctx.userId,
          payment.checkout_session_id,
          error instanceof Error ? error.message : "PayMongo checkout initialization failed",
        );
        return null;
      }
    });

    if (failure) {
      console.error("PayMongo checkout initialization failed", failure);
      if (failure instanceof HttpError) throw failure;
      throw new HttpError(502, "Unable to start PayMongo checkout. Please retry.");
    }
    if (!result) throw new HttpError(502, "Unable to start PayMongo checkout. Please retry.");
    return result;
  },

  async confirmFaceToFace(ctx: RequestContext, requestId: number) {
    assertStaff(ctx);
    const request = await requests.getById(ctx, requestId);
    if (!request) throw new HttpError(404, "Service request not found");
    if (request.status === "Rejected") throw new HttpError(409, "Rejected requests cannot be marked as paid");

    return withRequestContext(adminContext(ctx), async (tx) => {
      const payment = await tx.service_request_payments.findFirst({
        where: { request_id: requestId },
        orderBy: { created_at: "desc" },
      });
      if (!payment || payment.payment_method !== "face_to_face") {
        throw new HttpError(409, "This request is not awaiting face-to-face payment");
      }
      if (payment.payment_status !== "Pending Payment") {
        throw new HttpError(409, "This payment is no longer pending");
      }
      const changed = await tx.service_request_payments.updateMany({
        where: { payment_record_id: payment.payment_record_id, payment_status: "Pending Payment" },
        data: {
          payment_status: "Paid",
          confirmed_by_user_id: ctx.userId,
          paid_at: new Date(),
          updated_at: new Date(),
        },
      });
      if (!changed.count) throw new HttpError(409, "This payment is no longer pending");
      await addPaymentEvent(tx, payment.payment_record_id, "cash_payment_confirmed", "Paid", ctx.userId);
      return tx.service_request_payments.findUniqueOrThrow({
        where: { payment_record_id: payment.payment_record_id },
      });
    });
  },

  async confirmManualRefund(
    ctx: RequestContext,
    requestId: number,
    externalReference: string | undefined,
    notes: string | undefined,
  ) {
    assertStaff(ctx);
    const request = await requests.getById(ctx, requestId);
    if (!request) throw new HttpError(404, "Service request not found");
    if (!["Rejected", "Cancelled"].includes(request.status)) {
      throw new HttpError(409, "Only rejected or cancelled requests can be refunded");
    }

    return withRequestContext(adminContext(ctx), async (tx) => {
      const payment = await tx.service_request_payments.findFirst({
        where: { request_id: requestId },
        orderBy: { created_at: "desc" },
      });
      if (!payment || payment.payment_method !== "face_to_face" || payment.payment_status !== "Refund Pending") {
        throw new HttpError(409, "There is no pending manual refund to confirm");
      }
      const changed = await tx.service_request_payments.updateMany({
        where: { payment_record_id: payment.payment_record_id, payment_status: "Refund Pending" },
        data: {
          payment_status: "Refunded",
          refund_status: "Succeeded",
          refund_external_reference: externalReference ?? payment.refund_external_reference,
          refund_confirmed_by_user_id: ctx.userId,
          refunded_at: new Date(),
          updated_at: new Date(),
        },
      });
      if (!changed.count) throw new HttpError(409, "This refund is no longer pending");
      await addPaymentEvent(
        tx,
        payment.payment_record_id,
        "manual_refund_confirmed",
        "Refunded",
        ctx.userId,
        externalReference ?? payment.refund_external_reference,
        notes ?? "Staff confirmed that the money was returned to the resident.",
      );
      return tx.service_request_payments.findUniqueOrThrow({
        where: { payment_record_id: payment.payment_record_id },
      });
    });
  },

  async handleRequestRejected(ctx: RequestContext, requestId: number) {
    const request = await requests.getById(ctx, requestId);
    if (!request) throw new HttpError(404, "Service request not found");
    if (request.status !== "Rejected") return;

    const payment = request.service_request_payments[0];
    if (!payment || payment.payment_status !== "Paid" || Number(payment.amount) === 0) return;
    if (payment.payment_method === "face_to_face") {
      await withRequestContext(adminContext(ctx), async (tx) => {
        const changed = await tx.service_request_payments.updateMany({
          where: { payment_record_id: payment.payment_record_id, payment_status: "Paid" },
          data: { payment_status: "Refund Pending", refund_status: "Pending", updated_at: new Date() },
        });
        if (changed.count) {
          await addPaymentEvent(
            tx,
            payment.payment_record_id,
            "manual_refund_required",
            "Refund Pending",
            ctx.userId,
            null,
            "Request rejected. Staff must return the payment and then confirm the refund.",
          );
        }
      });
      return;
    }
    await this.initiateOnlineRefund(ctx, requestId, payment.payment_record_id, true);
  },

  async handleRequestCancelled(ctx: RequestContext, requestId: number) {
    const request = await requests.getById(ctx, requestId);
    if (!request) throw new HttpError(404, "Service request not found");
    if (request.status !== "Cancelled") return;
    const payment = request.service_request_payments[0];
    if (!payment || payment.payment_status !== "Paid" || Number(payment.amount) === 0) return;

    if (payment.payment_method === "face_to_face") {
      await withRequestContext(adminContext(ctx), async (tx) => {
        const changed = await tx.service_request_payments.updateMany({
          where: { payment_record_id: payment.payment_record_id, payment_status: "Paid" },
          data: { payment_status: "Refund Pending", refund_status: "Pending", updated_at: new Date() },
        });
        if (changed.count) {
          await addPaymentEvent(
            tx,
            payment.payment_record_id,
            "manual_refund_required",
            "Refund Pending",
            ctx.userId,
            null,
            "Request cancelled by resident. Staff must return the payment and then confirm the refund.",
          );
        }
      });
      return;
    }

    try {
      await this.initiateOnlineRefund(ctx, requestId, payment.payment_record_id, true);
    } catch (error) {
      console.error("Online refund could not be started after request cancellation", error);
    }
  },

  async initiateOnlineRefund(
    ctx: RequestContext,
    requestId: number,
    paymentRecordId?: number,
    automatic = false,
  ) {
    if (!automatic) assertStaff(ctx);
    const request = await requests.getById(ctx, requestId);
    if (!request) throw new HttpError(404, "Service request not found");
    if (!["Rejected", "Cancelled"].includes(request.status)) {
      throw new HttpError(409, "Only rejected or cancelled requests can be refunded");
    }

    const payment = await withRequestContext(adminContext(ctx), async (tx) => {
      const current = await tx.service_request_payments.findFirst({
        where: {
          request_id: requestId,
          ...(paymentRecordId ? { payment_record_id: paymentRecordId } : {}),
        },
        orderBy: { created_at: "desc" },
      });
      if (!current || current.payment_method !== "online") {
        throw new HttpError(409, "No online payment is eligible for a refund");
      }
      if (current.payment_status === "Refund Pending" || current.payment_status === "Refunded") return null;
      if (current.payment_status !== "Paid" || !current.payment_reference) {
        throw new HttpError(409, "The online payment has no confirmed PayMongo transaction to refund");
      }
      const changed = await tx.service_request_payments.updateMany({
        where: {
          payment_record_id: current.payment_record_id,
          payment_status: "Paid",
          refund_status: { in: ["Not Requested", "Failed"] },
        },
        data: {
          payment_status: "Refund Pending",
          refund_status: "Pending",
          refund_reference: null,
          updated_at: new Date(),
        },
      });
      if (!changed.count) return null;
      await addPaymentEvent(
        tx,
        current.payment_record_id,
        "online_refund_started",
        "Refund Pending",
        ctx.userId,
        current.payment_reference,
      );
      return current;
    });
    if (!payment) return;

    let refund: Awaited<ReturnType<typeof paymongo.createRefund>>;
    try {
      refund = await paymongo.createRefund(
        payment.payment_reference!,
        amountInCents(payment.amount),
        payment.payment_record_id,
      );
    } catch (error) {
      console.error("PayMongo refund initiation failed", error);
      const reset = await withRequestContext(adminContext(ctx), async (tx) => {
        const changed = await tx.service_request_payments.updateMany({
          where: {
            payment_record_id: payment.payment_record_id,
            payment_status: "Refund Pending",
            refund_reference: null,
          },
          data: { payment_status: "Paid", refund_status: "Failed", updated_at: new Date() },
        });
        if (changed.count) {
          await addPaymentEvent(
            tx,
            payment.payment_record_id,
            "online_refund_failed",
            "Paid",
            ctx.userId,
            payment.payment_reference,
            error instanceof Error ? error.message : "PayMongo refund request failed",
          );
        }
        return changed.count > 0;
      });
      if (!reset) {
        const latest = await withRequestContext(adminContext(ctx), (tx) =>
          tx.service_request_payments.findUnique({
            where: { payment_record_id: payment.payment_record_id },
          }),
        );
        if (latest?.payment_status === "Refund Pending" || latest?.payment_status === "Refunded") return;
      }
      if (error instanceof HttpError) throw error;
      throw new HttpError(502, "The request was rejected, but the PayMongo refund could not be started. Staff can retry it.");
    }
    await withRequestContext(adminContext(ctx), async (tx) => {
      const status =
        refund.status === "Succeeded"
          ? "Refunded"
          : refund.status === "Failed"
            ? "Paid"
            : "Refund Pending";
      const changed = await tx.service_request_payments.updateMany({
        where: { payment_record_id: payment.payment_record_id, payment_status: "Refund Pending" },
        data: {
          payment_status: status,
          refund_status: refund.status,
          refund_reference: refund.id,
          refunded_at: status === "Refunded" ? new Date() : undefined,
          updated_at: new Date(),
        },
      });
      if (changed.count) {
        await addPaymentEvent(
          tx,
          payment.payment_record_id,
          "online_refund_response",
          status,
          ctx.userId,
          refund.id,
        );
      }
    });
  },

  async handlePaymongoWebhook(payload: unknown) {
    if (!payload || typeof payload !== "object") throw new HttpError(400, "Invalid PayMongo webhook payload");
    const root = payload as Record<string, unknown>;
    const eventData = root.data as Record<string, unknown> | undefined;
    const eventAttributes = eventData?.attributes as Record<string, unknown> | undefined;
    const eventType = eventAttributes?.type;
    const resource = eventAttributes?.data as Record<string, unknown> | undefined;
    const resourceAttributes = resource?.attributes as Record<string, unknown> | undefined;
    const eventContext: RequestContext = { tier: "admin" };
    if (typeof eventType !== "string" || !resource || typeof resource.id !== "string") {
      throw new HttpError(400, "Invalid PayMongo event");
    }
    const resourceId = resource.id;

    if (eventType.startsWith("checkout_session.payment.")) {
      const checkoutId = resourceId;
      const payments = Array.isArray(resourceAttributes?.payments) ? resourceAttributes.payments : [];
      const paymentResource = payments.find(
        (item): item is Record<string, unknown> => !!item && typeof item === "object",
      );
      const paymentAttributes = paymentResource?.attributes as Record<string, unknown> | undefined;
      let paymentId = typeof paymentResource?.id === "string" ? paymentResource.id : undefined;
      let paidAmount = typeof paymentAttributes?.amount === "number" ? paymentAttributes.amount : undefined;
      let currency = typeof paymentAttributes?.currency === "string" ? paymentAttributes.currency : undefined;
      if (eventType === "checkout_session.payment.paid" && !paymentId) {
        const checkoutPayment = await paymongo.getCheckoutPayment(checkoutId);
        paymentId = checkoutPayment?.id;
        paidAmount ??= checkoutPayment?.amount;
        currency ??= checkoutPayment?.currency;
      }
      if (eventType === "checkout_session.payment.paid" && !paymentId) {
        throw new HttpError(502, "PayMongo has not provided the payment transaction reference yet");
      }

      const result = await withRequestContext(eventContext, async (tx) => {
        const payment = await tx.service_request_payments.findFirst({
          where: { checkout_session_id: checkoutId },
        });
        if (!payment) return null;
        if (paidAmount !== undefined && paidAmount !== amountInCents(payment.amount)) {
          throw new HttpError(400, "PayMongo payment amount does not match the service request");
        }
        if (currency !== undefined && currency !== payment.currency) {
          throw new HttpError(400, "PayMongo payment currency does not match the service request");
        }

        if (eventType === "checkout_session.payment.paid") {
          if (payment.payment_status === "Paid" || payment.payment_status === "Refund Pending" || payment.payment_status === "Refunded") {
            return { requestId: payment.request_id, changed: false };
          }
          const changed = await tx.service_request_payments.updateMany({
            where: {
              payment_record_id: payment.payment_record_id,
              payment_status: { in: ["Pending Payment", "Payment Failed"] },
            },
            data: {
              payment_status: "Paid",
              payment_reference: paymentId ?? payment.payment_reference,
              paid_at: new Date(),
              updated_at: new Date(),
            },
          });
          if (changed.count) {
            await addPaymentEvent(
              tx,
              payment.payment_record_id,
              "online_payment_confirmed",
              "Paid",
              undefined,
              paymentId ?? checkoutId,
            );
          }
          return { requestId: payment.request_id, changed: changed.count > 0 };
        }

        if (eventType === "checkout_session.payment.failed" && payment.payment_status === "Pending Payment") {
          const changed = await tx.service_request_payments.updateMany({
            where: { payment_record_id: payment.payment_record_id, payment_status: "Pending Payment" },
            data: { payment_status: "Payment Failed", updated_at: new Date() },
          });
          if (changed.count) {
            await addPaymentEvent(
              tx,
              payment.payment_record_id,
              "online_payment_failed",
              "Payment Failed",
              undefined,
              paymentId ?? checkoutId,
            );
          }
        }
        return { requestId: payment.request_id, changed: false };
      });

      if (result) {
        const request = await requests.getById(eventContext, result.requestId);
        if (
          request &&
          ["Rejected", "Cancelled"].includes(request.status) &&
          request.service_request_payments[0]?.payment_status === "Paid"
        ) {
          await this.initiateOnlineRefund(
            eventContext,
            result.requestId,
            request.service_request_payments[0].payment_record_id,
            true,
          );
        }
      }
      return;
    }

    if (eventType.startsWith("refund.")) {
      const refundStatus = resourceAttributes?.status;
      const rawPaymentReference = resourceAttributes?.payment_id;
      const paymentReference = typeof rawPaymentReference === "string" ? rawPaymentReference : undefined;
      const expectedRefundStatus =
        refundStatus === "succeeded" || refundStatus === "refunded"
          ? "Succeeded"
          : refundStatus === "failed"
            ? "Failed"
            : "Pending";
      await withRequestContext(eventContext, async (tx) => {
        const payment = await tx.service_request_payments.findFirst({
          where: {
            OR: [
              { refund_reference: resourceId },
              ...(paymentReference ? [{ payment_reference: paymentReference }] : []),
            ],
          },
        });
        if (!payment || payment.refund_status === "Succeeded" || payment.refund_status === "Failed") return;
        const paymentStatus = expectedRefundStatus === "Succeeded"
          ? "Refunded"
          : expectedRefundStatus === "Failed"
            ? "Paid"
            : "Refund Pending";
        const changed = await tx.service_request_payments.updateMany({
          where: {
            payment_record_id: payment.payment_record_id,
            refund_status: { notIn: ["Succeeded", "Failed"] },
          },
          data: {
            refund_reference: resourceId,
            refund_status: expectedRefundStatus,
            payment_status: paymentStatus,
            refunded_at: expectedRefundStatus === "Succeeded" ? new Date() : undefined,
            updated_at: new Date(),
          },
        });
        if (changed.count) {
          await addPaymentEvent(
            tx,
            payment.payment_record_id,
            `online_refund_${expectedRefundStatus.toLowerCase()}`,
            paymentStatus,
            undefined,
            resourceId,
          );
        }
      });
    }
  },
};
