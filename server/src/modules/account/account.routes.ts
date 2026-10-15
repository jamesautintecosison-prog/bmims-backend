import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { accountController as c } from "./account.controller.js";

export const accountRouter = Router();

accountRouter.post("/password", asyncHandler(c.changePassword));
