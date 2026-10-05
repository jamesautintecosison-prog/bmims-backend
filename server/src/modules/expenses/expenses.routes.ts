import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { expensesController as c } from "./expenses.controller.js";

export const expensesRouter = Router();

expensesRouter.get("/", asyncHandler(c.list));
expensesRouter.get("/:id", asyncHandler(c.get));
expensesRouter.post("/", asyncHandler(c.create));
