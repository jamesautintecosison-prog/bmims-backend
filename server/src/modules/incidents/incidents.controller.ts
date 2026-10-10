import type { Request, Response } from "express";
import { z } from "zod";
import { HttpError } from "../../utils/httpError.js";
import { idParam, pageQuery } from "../../utils/pagination.js";
import { ctxOf } from "../../utils/requestContext.js";
import { incidentsRepository as repo } from "./incidents.repository.js";

const participant = z.object({
  resident_id: z.number().int().positive(),
  participant_role: z.enum(["complainant", "respondent", "witness"]),
  statement: z.string().trim().max(2000).nullable().optional(),
});

const fileBody = z.object({
  committee_id: z.number().int().positive(),
  location: z.string().trim().min(1).max(255),
  description: z.string().trim().min(1).max(5000),
  participants: z.array(participant).min(1).max(50),
});

const statusBody = z.object({
  status: z.enum(["Open", "Under Investigation", "Settled", "Escalated", "Closed"]),
});

export const incidentsController = {
  async list(req: Request, res: Response) {
    const { limit, offset } = pageQuery.parse(req.query);
    res.json(await repo.list(ctxOf(req), limit, offset));
  },

  async get(req: Request, res: Response) {
    const incident = await repo.getById(ctxOf(req), idParam.parse(req.params.id));
    if (!incident) throw new HttpError(404, "Incident not found");
    res.json(incident);
  },

  async file(req: Request, res: Response) {
    const ctx = ctxOf(req);
    const incidentId = await repo.file(ctx, fileBody.parse(req.body));
    res.status(201).json({ incident_id: incidentId });
  },

  async addParticipant(req: Request, res: Response) {
    const ctx = ctxOf(req);
    const incidentId = idParam.parse(req.params.id);
    const participantId = await repo.addParticipant(ctx, incidentId, participant.parse(req.body));
    res.status(201).json({ participant_id: participantId });
  },

  async updateStatus(req: Request, res: Response) {
    const { status } = statusBody.parse(req.body);
    res.json(await repo.updateStatus(ctxOf(req), idParam.parse(req.params.id), status));
  },
};
