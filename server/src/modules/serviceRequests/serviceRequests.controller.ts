import type { Request, Response } from "express";
import { z } from "zod";
import { HttpError } from "../../utils/httpError.js";
import { idParam, pageQuery } from "../../utils/pagination.js";
import { ctxOf } from "../../utils/requestContext.js";
import { paymentsService } from "./payments.service.js";
import { isValidPaymongoSignature } from "./paymongo.js";
import { serviceRequestsRepository as repo } from "./serviceRequests.repository.js";

const createBody = z.object({
  doc_type_id: z.number().int().positive(),
  committee_id: z.number().int().positive(),
  payment_method: z.enum(["online", "face_to_face"]).default("face_to_face"),
  // only staff/admin send this; for residents it comes from the login token
  resident_id: z.number().int().positive().optional(),
});

// "Released" is deliberately missing: only sp_issue_certificate can set it
const statusBody = z.object({
  status: z.enum(["Processing", "Approved", "Rejected"]),
});

export const serviceRequestsController = {
  async list(req: Request, res: Response) {
    const { limit, offset } = pageQuery.parse(req.query);
    res.json(await repo.list(ctxOf(req), limit, offset));
  },

  async get(req: Request, res: Response) {
    const row = await repo.getById(ctxOf(req), idParam.parse(req.params.id));
    if (!row) throw new HttpError(404, "Service request not found");
    res.json(row);
  },

  async create(req: Request, res: Response) {
    const ctx = ctxOf(req);
    const body = createBody.parse(req.body);
    const residentId = ctx.tier === "resident" ? ctx.residentId : body.resident_id;
    if (!residentId) throw new HttpError(400, "resident_id is required");
    const row = await repo.create(ctx, {
      resident_id: residentId,
      doc_type_id: body.doc_type_id,
      committee_id: body.committee_id,
    }, body.payment_method);
    res.status(201).json(row);
  },

  async updateStatus(req: Request, res: Response) {
    const ctx = ctxOf(req);
    if (ctx.tier === "resident") throw new HttpError(403, "Only staff can update service request status");
    const { status } = statusBody.parse(req.body);
    const id = idParam.parse(req.params.id);
    const updated = await repo.updateStatus(ctx, id, status);
    if (status === "Rejected") await paymentsService.handleRequestRejected(ctx, id);
    res.json(updated);
  },

  async cancel(req: Request, res: Response) {
    const ctx = ctxOf(req);
    const id = idParam.parse(req.params.id);
    const updated = await repo.cancel(ctx, id);
    await paymentsService.handleRequestCancelled(ctx, id);
    res.json(updated);
  },

  async issue(req: Request, res: Response) {
    const ctx = ctxOf(req);
    const id = idParam.parse(req.params.id);
    const referenceNumber = await repo.issueCertificate(ctx, id);
    res.json({ request_id: id, reference_number: referenceNumber });
  },

  async startCheckout(req: Request, res: Response) {
    res.json(await paymentsService.startCheckout(ctxOf(req), idParam.parse(req.params.id)));
  },

  async confirmFaceToFace(req: Request, res: Response) {
    res.json(await paymentsService.confirmFaceToFace(ctxOf(req), idParam.parse(req.params.id)));
  },

  async confirmManualRefund(req: Request, res: Response) {
    const body = z.object({
      external_reference: z.string().trim().min(1).max(100).optional(),
      notes: z.string().trim().max(500).optional(),
    }).parse(req.body);
    res.json(
      await paymentsService.confirmManualRefund(
        ctxOf(req),
        idParam.parse(req.params.id),
        body.external_reference,
        body.notes,
      ),
    );
  },

  async retryOnlineRefund(req: Request, res: Response) {
    const ctx = ctxOf(req);
    if (ctx.tier === "resident") throw new HttpError(403, "Only staff can retry an online refund");
    const id = idParam.parse(req.params.id);
    await paymentsService.initiateOnlineRefund(ctx, id);
    res.json(await repo.getById(ctx, id));
  },

  async paymongoWebhook(req: Request, res: Response) {
    if (!Buffer.isBuffer(req.body) || !isValidPaymongoSignature(req.body, req.header("paymongo-signature"))) {
      throw new HttpError(401, "Invalid PayMongo webhook signature");
    }
    let payload: unknown;
    try {
      payload = JSON.parse(req.body.toString("utf8"));
    } catch {
      throw new HttpError(400, "Invalid PayMongo webhook payload");
    }
    await paymentsService.handlePaymongoWebhook(payload);
    res.sendStatus(200);
  },
};
