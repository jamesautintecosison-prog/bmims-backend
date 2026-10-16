import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { usersController as c } from "./users.controller.js";

export const usersRouter = Router();

usersRouter.get("/", asyncHandler(c.list));
usersRouter.post("/staff-login", asyncHandler(c.createStaffLogin));
usersRouter.post("/:id/reset-password", asyncHandler(c.resetPassword));
