import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { budgetsController as c } from "./budgets.controller.js";

export const budgetsRouter = Router();

budgetsRouter.get("/", asyncHandler(c.list));
budgetsRouter.get("/:id", asyncHandler(c.get));
budgetsRouter.post("/", asyncHandler(c.create));
