import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { auditLogsController as c } from "./auditLogs.controller.js";

export const auditLogsRouter = Router();

auditLogsRouter.get("/", asyncHandler(c.list));
