import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { incidentsController as c } from "./incidents.controller.js";

export const incidentsRouter = Router();

incidentsRouter.get("/", asyncHandler(c.list));
incidentsRouter.get("/:id", asyncHandler(c.get));
incidentsRouter.post("/", asyncHandler(c.file));
incidentsRouter.patch("/:id/status", asyncHandler(c.updateStatus));
