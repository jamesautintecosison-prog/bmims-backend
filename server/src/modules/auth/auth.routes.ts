import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { authController as c } from "./auth.controller.js";

export const authRouter = Router();

authRouter.post("/login", asyncHandler(c.login));
authRouter.get("/me", authenticate, c.me);
