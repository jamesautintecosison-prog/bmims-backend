import { z } from "zod";
import type { CrudConfig } from "./crud.js";

const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = z.string().trim().max(2000).nullable().optional();
const id = z.number().int().positive();

export const households: CrudConfig = {
  model: "households",
  idField: "household_id",
  createSchema: z.object({
    head_resident_id: id.nullable().optional(),
    address: text(255),
    date_registered: z.coerce.date().optional(),
  }),
};

export const staff: CrudConfig = {
  model: "staff",
  idField: "staff_id",
  createSchema: z.object({
    first_name: text(60),
    last_name: text(60),
    position: text(60),
    date_hired: z.coerce.date().optional(),
  }),
};

export const committees: CrudConfig = {
  model: "committees",
  idField: "committee_id",
  createSchema: z.object({
    committee_name: text(100),
    description: optionalText,
  }),
};

export const documentTypes: CrudConfig = {
  model: "document_types",
  idField: "doc_type_id",
  createSchema: z.object({
    name: text(100),
    description: optionalText,
    fee_amount: z.number().min(0).optional(),
  }),
};

export const healthPrograms: CrudConfig = {
  model: "health_programs",
  idField: "program_id",
  createSchema: z.object({
    committee_id: id,
    program_name: text(120),
    description: optionalText,
    start_date: z.coerce.date(),
    end_date: z.coerce.date().nullable().optional(),
  }),
};
