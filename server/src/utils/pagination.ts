import { z } from "zod";

export const idParam = z.coerce.number().int().positive();

export const pageQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
