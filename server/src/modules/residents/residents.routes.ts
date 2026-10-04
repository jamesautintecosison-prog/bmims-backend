import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { residentsController as c } from "./residents.controller.js";

export const residentsRouter = Router();

residentsRouter.get("/", asyncHandler(c.list));
residentsRouter.get("/:id", asyncHandler(c.get));
residentsRouter.post("/", asyncHandler(c.create));
residentsRouter.patch("/:id", asyncHandler(c.update));
residentsRouter.delete("/:id", asyncHandler(c.remove));
