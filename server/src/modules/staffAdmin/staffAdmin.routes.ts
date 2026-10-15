import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { staffAdminController as c } from "./staffAdmin.controller.js";

export const staffAdminRouter = Router();

// Mounted before the generic staff CRUD router; other paths fall through to it
staffAdminRouter.post("/:id/remove", asyncHandler(c.remove));
