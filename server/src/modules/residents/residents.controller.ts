import type { Request, Response } from "express";
import { z } from "zod";
import { HttpError } from "../../utils/httpError.js";
import { residentsRepository } from "./residents.repository.js";

const idParam = z.coerce.number().int().positive();

const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const createBody = z.object({
  household_id: z.number().int().positive().nullable().optional(),
  first_name: z.string().trim().min(1).max(60),
  last_name: z.string().trim().min(1).max(60),
  birth_date: z.coerce.date(),
  gender: z.enum(["Male", "Female", "Other"]),
  contact_number: z.string().trim().max(20).nullable().optional(),
  resident_status: z.enum(["Active", "Inactive", "Transferred", "Deceased"]).optional(),
});

const updateBody = createBody.partial();

function ctxOf(req: Request) {
  if (!req.ctx) throw new HttpError(401, "Not authenticated");
  return req.ctx;
}

// Controller layer: validates input, calls the repository, shapes the response.
export const residentsController = {
  async list(req: Request, res: Response) {
    const { limit, offset } = listQuery.parse(req.query);
    res.json(await residentsRepository.list(ctxOf(req), limit, offset));
  },

  async get(req: Request, res: Response) {
    const id = idParam.parse(req.params.id);
    const resident = await residentsRepository.getById(ctxOf(req), id);
    if (!resident) throw new HttpError(404, "Resident not found");
    res.json(resident);
  },

  async create(req: Request, res: Response) {
    const data = createBody.parse(req.body);
    res.status(201).json(await residentsRepository.create(ctxOf(req), data));
  },

  async update(req: Request, res: Response) {
    const id = idParam.parse(req.params.id);
    const data = updateBody.parse(req.body);
    res.json(await residentsRepository.update(ctxOf(req), id, data));
  },

  async remove(req: Request, res: Response) {
    const id = idParam.parse(req.params.id);
    await residentsRepository.remove(ctxOf(req), id);
    res.status(204).send();
  },
};
