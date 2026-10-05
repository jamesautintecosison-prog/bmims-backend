import { Router, type Request } from "express";
import { z, type ZodObject, type ZodRawShape } from "zod";
import { withRequestContext } from "../../db/withRequestContext.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { HttpError } from "../../utils/httpError.js";

// Reusable CRUD module for simple tables. Each table supplies:
//   model        the Prisma model name (same as the table name)
//   idField      the primary-key column
//   createSchema the Zod rules for incoming data (update = same, all optional)
// What a caller may actually do is decided by the DATABASE (role grants and
// row-level security), not here: a disallowed write comes back as a 403.
export interface CrudConfig {
  model: string;
  idField: string;
  createSchema: ZodObject<ZodRawShape>;
}

const idParam = z.coerce.number().int().positive();

const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

function ctxOf(req: Request) {
  if (!req.ctx) throw new HttpError(401, "Not authenticated");
  return req.ctx;
}

export function createCrudRouter(cfg: CrudConfig): Router {
  const updateSchema = cfg.createSchema.partial();
  // Picks this table's Prisma delegate from the transaction client
  const table = (tx: unknown) => (tx as Record<string, any>)[cfg.model];
  const router = Router();

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const { limit, offset } = listQuery.parse(req.query);
      const rows = await withRequestContext(ctxOf(req), (tx) =>
        table(tx).findMany({ orderBy: { [cfg.idField]: "asc" }, take: limit, skip: offset }),
      );
      res.json(rows);
    }),
  );

  router.get(
    "/:id",
    asyncHandler(async (req, res) => {
      const id = idParam.parse(req.params.id);
      const row = await withRequestContext(ctxOf(req), (tx) =>
        table(tx).findUnique({ where: { [cfg.idField]: id } }),
      );
      if (!row) throw new HttpError(404, "Record not found");
      res.json(row);
    }),
  );

  router.post(
    "/",
    asyncHandler(async (req, res) => {
      const data = cfg.createSchema.parse(req.body);
      const row = await withRequestContext(ctxOf(req), (tx) => table(tx).create({ data }));
      res.status(201).json(row);
    }),
  );

  router.patch(
    "/:id",
    asyncHandler(async (req, res) => {
      const id = idParam.parse(req.params.id);
      const data = updateSchema.parse(req.body);
      const row = await withRequestContext(ctxOf(req), (tx) =>
        table(tx).update({ where: { [cfg.idField]: id }, data }),
      );
      res.json(row);
    }),
  );

  router.delete(
    "/:id",
    asyncHandler(async (req, res) => {
      const id = idParam.parse(req.params.id);
      await withRequestContext(ctxOf(req), (tx) =>
        table(tx).delete({ where: { [cfg.idField]: id } }),
      );
      res.status(204).send();
    }),
  );

  return router;
}
