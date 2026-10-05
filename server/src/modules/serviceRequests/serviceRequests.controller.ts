import type { Request, Response } from "express";
import { z } from "zod";
import { HttpError } from "../../utils/httpError.js";
import { idParam, pageQuery } from "../../utils/pagination.js";
import { ctxOf } from "../../utils/requestContext.js";
import { serviceRequestsRepository as repo } from "./serviceRequests.repository.js";

const createBody = z.object({
  doc_type_id: z.number().int().positive(),
  committee_id: z.number().int().positive(),
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
    });
    res.status(201).json(row);
  },

  async updateStatus(req: Request, res: Response) {
    const { status } = statusBody.parse(req.body);
    res.json(await repo.updateStatus(ctxOf(req), idParam.parse(req.params.id), status));
  },

  async issue(req: Request, res: Response) {
    const ctx = ctxOf(req);
    const id = idParam.parse(req.params.id);
    const referenceNumber = await repo.issueCertificate(ctx, id);
    res.json({ request_id: id, reference_number: referenceNumber });
  },
};
