import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { serviceRequestsController as c } from "./serviceRequests.controller.js";

export const serviceRequestsRouter = Router();

serviceRequestsRouter.get("/", asyncHandler(c.list));
serviceRequestsRouter.get("/:id", asyncHandler(c.get));
serviceRequestsRouter.post("/", asyncHandler(c.create));
serviceRequestsRouter.patch("/:id/status", asyncHandler(c.updateStatus));
serviceRequestsRouter.post("/:id/issue", asyncHandler(c.issue));
serviceRequestsRouter.post("/:id/cancel", asyncHandler(c.cancel));
serviceRequestsRouter.post("/:id/payment-checkout", asyncHandler(c.startCheckout));
serviceRequestsRouter.post("/:id/payment-confirm", asyncHandler(c.confirmFaceToFace));
serviceRequestsRouter.post("/:id/refund/confirm", asyncHandler(c.confirmManualRefund));
serviceRequestsRouter.post("/:id/refund/retry", asyncHandler(c.retryOnlineRefund));
