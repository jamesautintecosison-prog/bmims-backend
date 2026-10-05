import { z } from "zod";
import type { CrudConfig } from "./crud.js";

const id = z.number().int().positive();

export const enrollments: CrudConfig = {
  model: "resident_program_enrollment",
  idField: "enrollment_id",
  createSchema: z.object({
    resident_id: id,
    program_id: id,
    enrollment_date: z.coerce.date().optional(),
    status: z.enum(["Enrolled", "Completed", "Dropped"]).optional(),
  }),
};

export const staffAssignments: CrudConfig = {
  model: "staff_committee_assignments",
  idField: "assignment_id",
  createSchema: z.object({
    staff_id: id,
    committee_id: id,
    role: z.enum(["Chairperson", "Secretary", "Member"]).optional(),
    assigned_date: z.coerce.date().optional(),
    hours_logged: z.number().min(0).max(100000).optional(),
  }),
};
